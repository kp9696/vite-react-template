import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { createSessionCookie } from "../lib/session.server";
import { DEMO_EMAIL, getUserByEmail } from "../lib/hrms.server";
import { isAdminRole, isWorkEmail } from "../lib/hrms.shared";

type ActionData = {
  error?: string;
};

export function meta() {
  return [{ title: "JWithKP HRMS - Login" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "demo-login") {
    const username = String(formData.get("username") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    if (username !== "demo" || password !== "demo") {
      return { error: "Use username Demo and password demo." } satisfies ActionData;
    }

    return redirect("/hrms", {
      headers: {
        "Set-Cookie": createSessionCookie(DEMO_EMAIL),
      },
    });
  }

  if (intent === "google-sso") {
    const email = String(formData.get("workEmail") || "").trim().toLowerCase();

    if (!email) {
      return { error: "Please enter your email address." } satisfies ActionData;
    }

    if (!isWorkEmail(email)) {
      return { error: "Please use a Gmail or company email address." } satisfies ActionData;
    }

    const user = await getUserByEmail(context.cloudflare.env.HRMS, email);

    if (user) {
      return redirect(isAdminRole(user.role) ? "/hrms/users" : "/hrms", {
        headers: {
          "Set-Cookie": createSessionCookie(email),
        },
      });
    }

    return redirect(`/register?email=${encodeURIComponent(email)}`);
  }

  return { error: "Unsupported login action." } satisfies ActionData;
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  return (
    <div className="login-root">
      <div className="login-left">
        <div className="left-inner">
          <div className="brand">
            <div className="brand-logo">
              <span className="brand-j">J</span>
              <span className="brand-k">K</span>
            </div>
            <div className="brand-text">
              <span className="brand-name">JWithKP</span>
              <span className="brand-tag">HRMS Platform</span>
            </div>
          </div>

          <div className="left-headline">
            <h1>People-first.<br /><span className="accent-text">HR simplified.</span></h1>
            <p className="left-sub">Existing users go straight into their dashboard. New companies and Gmail users can self-register and create an admin workspace with employee invite controls.</p>
          </div>

          <div className="feature-pills">
            {["Google SSO", "Invite Controls", "Admin Roles", "Employee Workspace", "Live D1 Data"].map((item) => (
              <span key={item} className="pill">{item}</span>
            ))}
          </div>

          <div className="testimonial">
            <div className="testimonial-quote">"Admins can onboard their team in minutes and keep role structure clean from day one."</div>
            <div className="testimonial-author">
              <div className="author-avatar">RK</div>
              <div>
                <div className="author-name">Rajesh Kumar</div>
                <div className="author-role">VP People, TechCorp India</div>
              </div>
            </div>
          </div>
        </div>

        <div className="deco-circle deco-1" />
        <div className="deco-circle deco-2" />
        <div className="deco-grid" />
      </div>

      <div className="login-right">
        <div className="form-wrapper">
          <div className="form-header">
            <h2>Sign in</h2>
            <p>Use your Gmail or company email, or use the demo account for walkthroughs.</p>
          </div>

          <Form method="post">
            <input type="hidden" name="intent" value="google-sso" />
            <div className="field-group">
              <label className="field-label">Email</label>
              <div className="field-wrap">
                <span className="field-icon">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input
                  name="workEmail"
                  type="email"
                  placeholder="you@gmail.com or you@company.com"
                  className="field-input"
                  autoComplete="email"
                />
              </div>
            </div>

            <button className="sso-btn" type="submit" disabled={submitting}>
              <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.4-.1-2.7-.4-4z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.3 4.5-17.7 11.7z"/>
                <path fill="#FBBC05" d="M24 45c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.6 36 26.9 37 24 37c-5.7 0-10.6-3.1-11.7-8.4l-7 5.4C8 40.5 15.4 45 24 45z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-1.1 3-3.4 5.4-6.3 7l6.7 5.5C40.6 37 44.5 31 44.5 24c0-1.4-.1-2.7-.5-4z"/>
              </svg>
              Continue with Google SSO
            </button>
          </Form>

          <div className="helper-card">
            Existing users:
            <br />
            Admins go directly to the user management dashboard.
            <br />
            Employees go to the HRMS dashboard.
            <br />
            New Gmail and company-email users are redirected to account registration with OTP verification.
          </div>

          <a href="/register" className="create-account-link">Create account</a>

          <div className="divider"><span>or use demo login</span></div>

          <Form method="post">
            <input type="hidden" name="intent" value="demo-login" />
            <div className="demo-card">
              <div className="demo-title">Demo Account</div>
              <div><strong>Username:</strong> Demo</div>
              <div><strong>Password:</strong> demo</div>
            </div>

            <div className="field-group">
              <label className="field-label">Username</label>
              <div className="field-wrap">
                <span className="field-icon">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                <input name="username" type="text" placeholder="Demo" className="field-input" autoComplete="username" />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Password</label>
              <div className="field-wrap">
                <span className="field-icon">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input name="password" type="password" placeholder="demo" className="field-input" autoComplete="current-password" />
              </div>
            </div>

            {actionData?.error && (
              <div className="error-msg">{actionData.error}</div>
            )}

            <button type="submit" className="submit-btn" disabled={submitting}>
              Enter Demo
            </button>
          </Form>

          <div className="security-note">
            Company registration starts with 10 employee invites. Existing admin organizations can invite up to 5 users.
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .login-root { display: flex; min-height: 100vh; font-family: 'DM Sans', sans-serif; background: #f8f7f4; }
        .login-left { flex: 1; background: #0d1117; position: relative; overflow: hidden; display: flex; align-items: center; padding: 60px; }
        .left-inner { position: relative; z-index: 10; max-width: 520px; }
        .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 56px; }
        .brand-logo { width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px; letter-spacing: -1px; color: white; box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
        .brand-k { color: #c4b5fd; }
        .brand-text { display: flex; flex-direction: column; }
        .brand-name { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px; color: white; letter-spacing: -0.5px; line-height: 1.1; }
        .brand-tag { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 400; letter-spacing: 0.5px; text-transform: uppercase; }
        .left-headline h1 { font-family: 'Syne', sans-serif; font-size: clamp(36px, 4vw, 52px); font-weight: 800; color: white; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px; }
        .accent-text { background: linear-gradient(90deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .left-sub { font-size: 15px; color: rgba(255,255,255,0.5); line-height: 1.7; max-width: 420px; margin-bottom: 36px; }
        .feature-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 48px; }
        .pill { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.65); padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 500; letter-spacing: 0.2px; }
        .testimonial { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; }
        .testimonial-quote { font-size: 14px; color: rgba(255,255,255,0.8); line-height: 1.6; font-style: italic; margin-bottom: 16px; }
        .testimonial-author { display: flex; align-items: center; gap: 10px; }
        .author-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: grid; place-items: center; font-size: 12px; font-weight: 700; color: white; flex-shrink: 0; }
        .author-name { font-size: 13px; font-weight: 600; color: white; }
        .author-role { font-size: 11px; color: rgba(255,255,255,0.4); }
        .deco-circle { position: absolute; border-radius: 50%; pointer-events: none; }
        .deco-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); top: -150px; right: -150px; }
        .deco-2 { width: 300px; height: 300px; background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%); bottom: -80px; left: -80px; }
        .deco-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 40px 40px; }
        .login-right { width: 480px; display: flex; align-items: center; justify-content: center; padding: 40px; background: #f8f7f4; }
        .form-wrapper { width: 100%; max-width: 380px; }
        .form-header { margin-bottom: 24px; }
        .form-header h2 { font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 800; color: #0d1117; letter-spacing: -0.5px; margin-bottom: 6px; }
        .form-header p { font-size: 14px; color: #6b7280; }
        .helper-card, .demo-card { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 14px 16px; color: #3730a3; font-size: 13px; line-height: 1.7; margin-top: 16px; }
        .demo-title { font-weight: 700; margin-bottom: 4px; }
        .sso-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px; border: 1.5px solid #e5e7eb; border-radius: 10px; background: white; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
        .divider { display: flex; align-items: center; gap: 12px; margin: 24px 0; color: #9ca3af; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
        .field-group { margin-bottom: 18px; }
        .field-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .field-wrap { position: relative; }
        .field-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #9ca3af; display: flex; align-items: center; }
        .field-input { width: 100%; padding: 11px 16px 11px 40px; border: 1.5px solid #e5e7eb; border-radius: 10px; font-size: 14px; font-family: 'DM Sans', sans-serif; color: #0d1117; background: white; outline: none; }
        .error-msg { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 13px; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; }
        .submit-btn { width: 100%; padding: 13px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; font-family: 'Syne', sans-serif; cursor: pointer; margin-top: 8px; }
        .security-note { margin-top: 18px; font-size: 12px; color: #6b7280; line-height: 1.6; }
        .create-account-link { display: inline-flex; margin-top: 14px; color: #4f46e5; font-weight: 700; text-decoration: none; font-size: 13px; }
        @media (max-width: 900px) { .login-left { display: none; } .login-right { width: 100%; } }
      `}</style>
    </div>
  );
}
