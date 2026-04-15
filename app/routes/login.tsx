import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { consumeInviteToken } from "../lib/invite-token.server";
import { activateInvitedUser, getUserById } from "../lib/hrms.server";
import { clearRefreshCookie, createAuthSessionCookie, destroyAuthSession } from "../lib/jwt-auth.server";

type ActionData = {
  error?: string;
};


export function meta() {
  return [{ title: "JWithKP HRMS - Login" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const inviteToken = url.searchParams.get("invite");

  if (!inviteToken) {
    return {};
  }

  try {
    const invite = await consumeInviteToken(context.cloudflare.env.HRMS, inviteToken);
    const existingUser = await getUserById(context.cloudflare.env.HRMS, invite.userId);

    if (!existingUser) {
      return { inviteError: "This invite is no longer attached to a valid user account." };
    }

    const user = existingUser.status === "Invited"
      ? await activateInvitedUser(context.cloudflare.env.HRMS, invite.userId)
      : existingUser;

    return redirect("/hrms", {
      headers: {
        "Set-Cookie": await createAuthSessionCookie(context.cloudflare.env, user.email, request),
      },
    });
  } catch (error) {
    return {
      inviteError: error instanceof Error ? error.message : "This invite link could not be processed.",
    };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  // ── Email / password login (OTP-verified accounts) ──
  if (intent === "email-login") {
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    if (!email || !password) {
      return { error: "Email and password are required." } satisfies ActionData;
    }

    const apiResponse = await fetch(new URL("/api/auth/login", request.url).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("User-Agent") || "",
        "CF-Connecting-IP": request.headers.get("CF-Connecting-IP") || "",
        "X-Forwarded-For": request.headers.get("X-Forwarded-For") || "",
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = (await apiResponse.json().catch(() => ({}))) as { error?: string };
    if (!apiResponse.ok) {
      return { error: payload.error || "Invalid email or password." } satisfies ActionData;
    }

    const setCookie = apiResponse.headers.get("Set-Cookie");
    if (!setCookie) {
      return { error: "Login session could not be established." } satisfies ActionData;
    }

    return redirect("/hrms", {
      headers: {
        "Set-Cookie": setCookie,
      },
    });
  }

  // ── Logout ──
  if (intent === "logout") {
    await destroyAuthSession(request, context.cloudflare.env);
    return redirect("/login", {
      headers: { "Set-Cookie": clearRefreshCookie(request.url) },
    });
  }

  return { error: "Unsupported login action." } satisfies ActionData;
}

export default function Login() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  return (
    <div className="login-root">
      {/* ── Left Panel ── */}
      <div className="login-left">
        <div className="left-inner">
          <div className="brand">
            <div className="brand-logo">JK</div>
            <div className="brand-text">
              <span className="brand-name">JWithKP</span>
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
          <div className="form-header">
            <div className="form-logo">JK</div>
            <h2>Welcome back</h2>
            <p>Sign in to your admin account.</p>
          </div>

          {loaderData.inviteError ? (
            <div className="error-msg" style={{ marginTop: 0, marginBottom: 16 }}>{loaderData.inviteError}</div>
          ) : null}

          <Form method="post">
            <input type="hidden" name="intent" value="email-login" />

              <div className="field-group">
                <label className="field-label">Email</label>
                <div className="field-wrap">
                  <span className="field-icon">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </span>
                  <input
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    className="field-input"
                    autoComplete="email"
                    autoFocus
                  />
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
                  <input
                    name="password"
                    type="password"
                    placeholder="Your password"
                    className="field-input"
                    autoComplete="current-password"
                  />
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

          <div className="security-note">
            New organisations get 10 invite seats. Existing admins can invite up to 5 additional users.
          </div>
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
        .field-input:hover:not(:focus) { border-color: #c7d2fe; }
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

