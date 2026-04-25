import bcrypt from "bcryptjs";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { peekInviteToken, consumeInviteToken } from "../lib/invite-token.server";
import { activateInvitedUser, getUserById } from "../lib/hrms.server";
import { clearRefreshCookie, createAuthSessionCookie, destroyAuthSession, loginWithPassword } from "../lib/jwt-auth.server";

type ActionData = { error?: string };

type LoginBranding = {
  companyName: string | null;
  companyLogoUrl: string | null;
};

function toInitials(name: string | null): string {
  if (!name) return "JK";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "JK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

async function resolveBrandingByTenantId(db: D1Database, tenantId: string): Promise<LoginBranding | null> {
  const companyRow = await db
    .prepare(
      `SELECT c.company_name AS company_name, ts.company_logo_url AS company_logo_url
       FROM companies c
       LEFT JOIN tenant_settings ts ON COALESCE(ts.company_id, ts.org_id) = c.id
       WHERE c.id = ?
       LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ company_name: string | null; company_logo_url: string | null }>();

  const orgRow = await db
    .prepare(
      `SELECT o.name AS company_name, ts.company_logo_url AS company_logo_url
       FROM organizations o
       LEFT JOIN tenant_settings ts ON COALESCE(ts.company_id, ts.org_id) = o.id
       WHERE o.id = ?
       LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ company_name: string | null; company_logo_url: string | null }>();

  const companyName = companyRow?.company_name ?? orgRow?.company_name ?? null;
  const companyLogoUrl = companyRow?.company_logo_url ?? orgRow?.company_logo_url ?? null;
  if (!companyName && !companyLogoUrl) return null;
  return { companyName, companyLogoUrl };
}

async function resolveBrandingByHost(db: D1Database, hostname: string): Promise<LoginBranding | null> {
  const host = hostname.trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return null;
  }

  const parts = host.split(".").filter(Boolean);
  const baseDomain = parts.length >= 2 ? parts.slice(-2).join(".") : host;
  const orgByDomain = await db
    .prepare(`SELECT id FROM organizations WHERE lower(domain) = ? OR lower(domain) = ? LIMIT 1`)
    .bind(host, baseDomain)
    .first<{ id: string }>();

  if (orgByDomain?.id) {
    return resolveBrandingByTenantId(db, orgByDomain.id);
  }

  // Future-ready subdomain mapping: acme.yourapp.com -> "acme" matches company/org name slug.
  const subdomain = parts.length >= 3 ? parts[0] : null;
  if (!subdomain) return null;

  const orgBySlug = await db
    .prepare(
      `SELECT id
       FROM organizations
       WHERE lower(replace(replace(name, ' ', '-'), '_', '-')) = ?
       LIMIT 1`,
    )
    .bind(subdomain)
    .first<{ id: string }>();

  if (orgBySlug?.id) {
    return resolveBrandingByTenantId(db, orgBySlug.id);
  }

  const companyBySlug = await db
    .prepare(
      `SELECT id
       FROM companies
       WHERE lower(replace(replace(company_name, ' ', '-'), '_', '-')) = ?
       LIMIT 1`,
    )
    .bind(subdomain)
    .first<{ id: string }>();

  if (companyBySlug?.id) {
    return resolveBrandingByTenantId(db, companyBySlug.id);
  }

  return null;
}

export function meta() {
  return [{ title: "JWithKP HRMS - Login" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const inviteToken = url.searchParams.get("invite");
  const hostBranding = await resolveBrandingByHost(context.cloudflare.env.HRMS, url.hostname);

  if (!inviteToken) return { branding: hostBranding };

  const tokenData = await peekInviteToken(context.cloudflare.env.HRMS, inviteToken);

  if (!tokenData) {
    return {
      branding: hostBranding,
      inviteError: "This invite link is invalid, has already been used, or has expired.",
    };
  }

  const user = await getUserById(context.cloudflare.env.HRMS, tokenData.userId);
  if (!user) {
    return {
      branding: hostBranding,
      inviteError: "This invite is no longer attached to a valid user account.",
    };
  }

  const tenantRow = await context.cloudflare.env.HRMS
    .prepare(`SELECT COALESCE(company_id, org_id) AS tenant_id FROM users WHERE id = ? LIMIT 1`)
    .bind(tokenData.userId)
    .first<{ tenant_id: string | null }>();

  const inviteBranding = tenantRow?.tenant_id
    ? await resolveBrandingByTenantId(context.cloudflare.env.HRMS, tenantRow.tenant_id)
    : null;

  // Show the account-setup form — do NOT consume the token yet
  return {
    branding: inviteBranding ?? hostBranding,
    inviteSetup: true as const,
    inviteToken,
    invitedName: user.name,
    invitedEmail: user.email,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const env = context.cloudflare.env;

  // ── Account setup from invite link ─────────────────────────────────────────
  if (intent === "setup-account") {
    const inviteToken    = String(formData.get("inviteToken") || "").trim();
    const password       = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (!inviteToken)                      return { error: "Missing invite token. Please use the original invite link." } satisfies ActionData;
    if (!password || password.length < 8)  return { error: "Password must be at least 8 characters." } satisfies ActionData;
    if (password !== confirmPassword)      return { error: "Passwords do not match." } satisfies ActionData;

    let invite;
    try {
      invite = await consumeInviteToken(env.HRMS, inviteToken);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid or expired invite link." } satisfies ActionData;
    }

    const user = await getUserById(env.HRMS, invite.userId);
    if (!user) return { error: "User account not found." } satisfies ActionData;

    // Hash password and upsert into auth_users
    const hashed = await bcrypt.hash(password, 12);
    await env.HRMS
      .prepare(
        `INSERT INTO auth_users (name, email, password, is_verified, created_at)
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(email) DO UPDATE SET
           password    = excluded.password,
           is_verified = 1,
           name        = excluded.name`,
      )
      .bind(user.name, user.email.trim().toLowerCase(), hashed)
      .run();

    // Activate the user record
    if (user.status === "Invited") {
      await activateInvitedUser(env.HRMS, invite.userId);
    }

    return redirect("/hrms", {
      headers: { "Set-Cookie": await createAuthSessionCookie(env, user.email, request) },
    });
  }

  // ── Email / password login ──────────────────────────────────────────────────
  if (intent === "email-login") {
    const email    = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    if (!email || !password) {
      return { error: "Email and password are required." } satisfies ActionData;
    }

    const result = await loginWithPassword(env, email, password, request);
    if (!result.ok) return { error: result.error } satisfies ActionData;

    return redirect("/hrms", { headers: { "Set-Cookie": result.setCookie } });
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  if (intent === "logout") {
    await destroyAuthSession(request, env);
    return redirect("/login", { headers: { "Set-Cookie": clearRefreshCookie(request.url) } });
  }

  return { error: "Unsupported login action." } satisfies ActionData;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

export default function Login() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const companyName = loaderData.branding?.companyName ?? "JWithKP";
  const companyLogoUrl = loaderData.branding?.companyLogoUrl ?? null;
  const companyInitials = toInitials(companyName);

  const isSetup = "inviteSetup" in loaderData && loaderData.inviteSetup === true;

  return (
    <div className="login-root">
      {/* ── Left Panel ── */}
      <div className="login-left">
        <div className="left-inner">
          <div className="brand">
            <div className="brand-logo">
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={`${companyName} logo`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                />
              ) : companyInitials}
            </div>
            <div className="brand-text">
              <span className="brand-name">{companyName}</span>
              <span className="brand-tag">HRMS Platform</span>
            </div>
          </div>

          <div className="left-headline">
            <h1>People-first.<br /><span className="accent-text">HR simplified.</span></h1>
            <p className="left-sub">Manage your entire workforce from a single, clean dashboard. OTP-verified onboarding. Role-based access. Real-time data.</p>
          </div>

          <div className="feature-pills">
            {["OTP Signup", "Invite Controls", "Admin Roles", "Employee Workspace", "Live D1 Data"].map((f) => (
              <span key={f} className="pill">{f}</span>
            ))}
          </div>

          <div className="testimonial">
            <div className="testimonial-quote">"Admins can onboard their team in minutes and keep role structure clean from day one."</div>
            <div className="testimonial-author">
              <div className="t-avatar">RK</div>
              <div>
                <div className="t-name">Rajesh Kumar</div>
                <div className="t-role">VP People, TechCorp India</div>
              </div>
            </div>
          </div>
        </div>

        <div className="deco-blob deco-1" />
        <div className="deco-blob deco-2" />
        <div className="deco-grid" />
      </div>

      {/* ── Right Panel ── */}
      <div className="login-right">
        <div className="form-wrapper">

          {/* ── Error from loader (bad/expired invite) ── */}
          {"inviteError" in loaderData && loaderData.inviteError ? (
            <>
              <div className="form-header">
                <div className="form-logo">
                  {companyLogoUrl ? (
                    <img
                      src={companyLogoUrl}
                      alt={`${companyName} logo`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  ) : companyInitials}
                </div>
                <h2>Invite Invalid</h2>
                <p>This invite link could not be processed.</p>
              </div>
              <div className="error-msg" style={{ marginTop: 0 }}>{loaderData.inviteError}</div>
              <div className="form-footer" style={{ marginTop: 20 }}>
                <a href="/login" className="form-link">← Back to login</a>
              </div>
            </>
          ) : isSetup ? (
            /* ── Account Setup Form ── */
            <>
              <div className="form-header">
                <div className="form-logo" style={{ background: companyLogoUrl ? undefined : "linear-gradient(135deg,#10b981,#059669)" }}>
                  {companyLogoUrl ? (
                    <img
                      src={companyLogoUrl}
                      alt={`${companyName} logo`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  ) : companyInitials}
                </div>
                <h2>Set Up Your Account</h2>
                <p>Create a password to complete your onboarding.</p>
              </div>

              <div className="invite-banner">
                <div className="invite-avatar">
                  {loaderData.invitedName?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <div className="invite-name">{loaderData.invitedName}</div>
                  <div className="invite-email">{loaderData.invitedEmail}</div>
                </div>
                <div className="invite-badge">Invited</div>
              </div>

              <Form method="post">
                <input type="hidden" name="intent" value="setup-account" />
                <input type="hidden" name="inviteToken" value={loaderData.inviteToken} />

                <div className="field-group">
                  <label className="field-label">Full Name</label>
                  <div className="field-wrap">
                    <span className="field-icon">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </span>
                    <input className="field-input field-readonly" value={loaderData.invitedName} readOnly />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Email Address</label>
                  <div className="field-wrap">
                    <span className="field-icon">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </span>
                    <input className="field-input field-readonly" value={loaderData.invitedEmail} readOnly />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Create Password</label>
                  <div className="field-wrap">
                    <span className="field-icon">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input name="password" type="password" placeholder="Min. 8 characters" className="field-input" autoFocus autoComplete="new-password" />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Confirm Password</label>
                  <div className="field-wrap">
                    <span className="field-icon">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input name="confirmPassword" type="password" placeholder="Repeat your password" className="field-input" autoComplete="new-password" />
                  </div>
                </div>

                {actionData?.error ? <div className="error-msg">{actionData.error}</div> : null}

                <button type="submit" className="submit-btn submit-green" disabled={submitting}>
                  {submitting ? "Creating account…" : "Create Account & Sign In →"}
                </button>
              </Form>

              <div className="security-note">Your password is hashed with bcrypt and never stored in plain text.</div>
            </>
          ) : (
            /* ── Normal Login Form ── */
            <>
              <div className="form-header">
                <div className="form-logo">
                  {companyLogoUrl ? (
                    <img
                      src={companyLogoUrl}
                      alt={`${companyName} logo`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  ) : companyInitials}
                </div>
                <h2>Welcome back</h2>
                <p>Sign in to your account.</p>
              </div>

              <Form method="post">
                <input type="hidden" name="intent" value="email-login" />

                <div className="field-group">
                  <label className="field-label">Email</label>
                  <div className="field-wrap">
                    <span className="field-icon">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </span>
                    <input name="email" type="email" placeholder="you@company.com" className="field-input" autoComplete="email" autoFocus />
                  </div>
                </div>

                <div className="field-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <label className="field-label" style={{ marginBottom: 0 }}>Password</label>
                    <a href="/forgot-password" className="form-link" style={{ fontSize: "12px" }}>Forgot password?</a>
                  </div>
                  <div className="field-wrap">
                    <span className="field-icon">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input name="password" type="password" placeholder="Your password" className="field-input" autoComplete="current-password" />
                  </div>
                </div>

                {actionData?.error ? <div className="error-msg">{actionData.error}</div> : null}

                <button type="submit" className="submit-btn" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign In"}
                </button>

                <div className="form-footer">
                  Don't have an account?{" "}
                  <a href="/register" className="form-link">Create one with OTP</a>
                </div>
              </Form>

              <div className="security-note">New organisations get 10 invite seats. Existing admins can invite up to 5 additional users.</div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,300..800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .login-root {
          display: flex; min-height: 100vh;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Left Panel ── */
        .login-left {
          flex: 1; background: #141929;
          position: relative; overflow: hidden;
          display: flex; align-items: center; padding: 64px;
        }
        .left-inner { position: relative; z-index: 10; max-width: 500px; animation: fadeInLeft 0.7s ease-out; }

        .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 52px; }
        .brand-logo {
          width: 46px; height: 46px; flex-shrink: 0;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 13px; display: grid; place-items: center;
          font-weight: 800; font-size: 14px; color: white;
          box-shadow: 0 8px 24px rgba(99,102,241,0.45); letter-spacing: -0.5px;
        }
        .brand-name { font-size: 18px; font-weight: 700; color: white; letter-spacing: -0.4px; display: block; }
        .brand-tag { font-size: 10px; color: rgba(255,255,255,0.38); font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; display: block; margin-top: 2px; }

        .left-headline h1 {
          font-size: clamp(34px, 3.8vw, 50px); font-weight: 800; color: white;
          line-height: 1.12; letter-spacing: -1.5px; margin-bottom: 20px;
        }
        .accent-text {
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .left-sub { font-size: 15px; color: rgba(255,255,255,0.52); line-height: 1.75; max-width: 400px; margin-bottom: 36px; }

        .feature-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 44px; }
        .pill {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6); padding: 6px 14px; border-radius: 99px;
          font-size: 12px; font-weight: 500; letter-spacing: 0.1px; transition: all 0.2s;
        }
        .pill:hover { background: rgba(99,102,241,0.18); border-color: rgba(99,102,241,0.4); color: #a5b4fc; }

        .testimonial {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 22px;
        }
        .testimonial-quote { font-size: 14px; color: rgba(255,255,255,0.78); line-height: 1.65; font-style: italic; margin-bottom: 14px; }
        .testimonial-author { display: flex; align-items: center; gap: 10px; }
        .t-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: grid; place-items: center; font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
        }
        .t-name { font-size: 13px; font-weight: 600; color: white; }
        .t-role { font-size: 11px; color: rgba(255,255,255,0.38); margin-top: 1px; }

        .deco-blob { position: absolute; border-radius: 50%; pointer-events: none; }
        .deco-1 { width: 480px; height: 480px; background: radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%); top: -160px; right: -160px; }
        .deco-2 { width: 320px; height: 320px; background: radial-gradient(circle, rgba(139,92,246,0.13) 0%, transparent 70%); bottom: -80px; left: -80px; }
        .deco-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 44px 44px;
        }

        /* ── Right Panel ── */
        .login-right {
          width: 500px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 48px 44px; background: #f1f5fd;
        }
        .form-wrapper { width: 100%; max-width: 390px; animation: fadeInRight 0.7s ease-out; }

        .form-header { margin-bottom: 24px; }
        .form-logo {
          width: 40px; height: 40px; border-radius: 11px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: grid; place-items: center;
          font-weight: 800; font-size: 13px; color: white;
          margin-bottom: 20px; box-shadow: 0 4px 14px rgba(99,102,241,0.35); letter-spacing: -0.5px;
        }
        .form-header h2 { font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 6px; }
        .form-header p { font-size: 14px; color: #64748b; line-height: 1.5; }

        /* ── Invite Banner ── */
        .invite-banner {
          display: flex; align-items: center; gap: 12px;
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          border: 1px solid #a7f3d0; border-radius: 12px;
          padding: 14px 16px; margin-bottom: 22px;
        }
        .invite-avatar {
          width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, #10b981, #059669);
          display: grid; place-items: center;
          font-size: 14px; font-weight: 800; color: white;
          box-shadow: 0 2px 8px rgba(16,185,129,0.35);
        }
        .invite-name { font-size: 14px; font-weight: 700; color: #065f46; }
        .invite-email { font-size: 12px; color: #047857; margin-top: 1px; }
        .invite-badge {
          margin-left: auto; background: #10b981; color: white;
          font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
          letter-spacing: 0.5px; text-transform: uppercase; flex-shrink: 0;
        }

        /* ── Fields ── */
        .field-group { margin-bottom: 18px; }
        .field-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; letter-spacing: 0.1px; }
        .field-wrap { position: relative; }
        .field-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #94a3b8; display: flex; align-items: center; transition: color 0.15s; }
        .field-input {
          width: 100%; padding: 11px 16px 11px 38px;
          border: 1.5px solid #e2e8f0; border-radius: 10px;
          font-size: 14px; font-family: 'Inter', sans-serif;
          color: #0f172a; background: white; outline: none;
          transition: all 0.18s; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .field-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.13); }
        .field-input:hover:not(:focus):not(.field-readonly) { border-color: #c7d2fe; }
        .field-readonly { background: #f8fafc !important; color: #64748b !important; cursor: default; }
        .field-wrap:focus-within .field-icon { color: #6366f1; }

        /* ── Buttons ── */
        .submit-btn {
          width: 100%; padding: 13px; margin-top: 4px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white; border: none; border-radius: 10px;
          font-size: 14.5px; font-weight: 700; font-family: 'Inter', sans-serif;
          cursor: pointer; transition: all 0.18s;
          box-shadow: 0 4px 16px rgba(99,102,241,0.35); letter-spacing: -0.1px;
        }
        .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.45); }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        .submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }
        .submit-green {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
          box-shadow: 0 4px 16px rgba(16,185,129,0.35) !important;
        }
        .submit-green:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(16,185,129,0.45) !important; }

        /* ── Error ── */
        .error-msg {
          background: #fef2f2; border: 1px solid #fecaca; color: #dc2626;
          font-size: 13px; padding: 10px 14px; border-radius: 10px;
          margin-bottom: 16px; font-weight: 500;
        }

        /* ── Footer ── */
        .form-footer { margin-top: 18px; font-size: 13px; color: #64748b; text-align: center; }
        .form-link { color: #6366f1; font-weight: 600; text-decoration: none; }
        .form-link:hover { text-decoration: underline; }
        .security-note { margin-top: 18px; font-size: 12px; color: #94a3b8; line-height: 1.65; text-align: center; }

        /* ── Animations ── */
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }

        @media (max-width: 960px) { .login-left { display: none; } .login-right { width: 100%; } }
        @media (max-width: 480px) { .login-right { padding: 32px 24px; } }
      `}</style>
    </div>
  );
}
