import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/register";
import { createSessionCookie } from "../lib/session.server";
import { registerOrganization } from "../lib/hrms.server";
import { isWorkEmail } from "../lib/hrms.shared";
import { createRegistrationOtp, verifyRegistrationOtp } from "../lib/registration-otp.server";
import { sendRegistrationOtpEmail } from "../lib/auth-email.server";

type ActionData = {
  error?: string;
  success?: string;
  step?: "request" | "verify";
  email?: string;
  organizationName?: string;
  adminName?: string;
  department?: string;
};

export function meta() {
  return [{ title: "JWithKP HRMS - Create Account" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return {
    email: url.searchParams.get("email") ?? "",
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const organizationName = String(formData.get("organizationName") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const department = String(formData.get("department") || "Founders").trim();

  if (intent === "request-otp") {
    if (!email || !organizationName || !adminName) {
      return { error: "Organization name, admin name, and email are required." } satisfies ActionData;
    }

    if (!isWorkEmail(email)) {
      return { error: "Please register with a Gmail or company email address." } satisfies ActionData;
    }

    try {
      const payload = { organizationName, adminName, email, department };
      const otpCode = await createRegistrationOtp(context.cloudflare.env.HRMS, payload);
      await sendRegistrationOtpEmail(context.cloudflare.env, payload, otpCode);

      return {
        success: `OTP sent to ${email}. Enter it below to verify your account.`,
        step: "verify",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to send OTP.",
        step: "request",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    }
  }

  if (intent === "verify-otp") {
    const otpCode = String(formData.get("otpCode") || "").trim();
    if (!email || !otpCode) {
      return {
        error: "Email and OTP are required.",
        step: "verify",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    }

    try {
      const payload = await verifyRegistrationOtp(context.cloudflare.env.HRMS, email, otpCode);
      await registerOrganization(context.cloudflare.env.HRMS, payload);

      return redirect("/hrms/users", {
        headers: {
          "Set-Cookie": await createSessionCookie(context.cloudflare.env.HRMS, email, request.url),
        },
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "OTP verification failed.",
        step: "verify",
        email,
        organizationName,
        adminName,
        department,
      } satisfies ActionData;
    }
  }

  return { error: "Unsupported registration action." } satisfies ActionData;
}

export default function Register({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const currentStep = actionData?.step ?? "request";

  return (
    <div className="reg-root">
      {/* ── Left Panel ── */}
      <div className="reg-left">
        <div className="reg-left-inner">
          <div className="reg-brand">
            <div className="reg-logo">JK</div>
            <div>
              <div className="reg-brand-name">JWithKP</div>
              <div className="reg-brand-sub">HRMS Platform</div>
            </div>
          </div>

          <h1 className="reg-headline">
            Set up your<br />
            <span className="reg-accent">workspace.</span>
          </h1>
          <p className="reg-sub">
            OTP-verified onboarding keeps your org secure from day one. Your admin account is created only after email verification.
          </p>

          <div className="reg-steps">
            {[
              { n: "1", title: "Fill in details", desc: "Org name, your name, and work email" },
              { n: "2", title: "Receive OTP", desc: "6-digit code sent to your email" },
              { n: "3", title: "Verify & launch", desc: "Admin dashboard opens immediately" },
            ].map((step) => (
              <div key={step.n} className="reg-step">
                <div className="reg-step-num">{step.n}</div>
                <div>
                  <div className="reg-step-title">{step.title}</div>
                  <div className="reg-step-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="reg-deco-blob reg-blob-1" />
        <div className="reg-deco-blob reg-blob-2" />
        <div className="reg-deco-grid" />
      </div>

      {/* ── Right Panel ── */}
      <div className="reg-right">
        <div className="reg-form-wrap">
          {/* Step progress */}
          <div className="reg-progress">
            <div className={`reg-progress-step ${currentStep === "request" ? "active" : "done"}`}>
              <div className="reg-prog-dot">{currentStep === "verify" ? "✓" : "1"}</div>
              <span>Details</span>
            </div>
            <div className="reg-progress-line" />
            <div className={`reg-progress-step ${currentStep === "verify" ? "active" : ""}`}>
              <div className="reg-prog-dot">2</div>
              <span>Verify OTP</span>
            </div>
          </div>

          <div className="reg-form-header">
            <h2>{currentStep === "request" ? "Create your workspace" : "Verify your email"}</h2>
            <p>
              {currentStep === "request"
                ? "Enter your organisation details to receive a verification OTP."
                : `Enter the 6-digit code sent to ${actionData?.email ?? "your email"}.`}
            </p>
          </div>

          <div className="reg-info-card">
            OTP is sent via Gmail. Sender defaults to <strong>jjk.mratunjay@gmail.com</strong> when <code>GMAIL_FROM_EMAIL</code> is not configured.
          </div>

          {currentStep === "request" ? (
            <Form method="post" className="reg-form">
              <input type="hidden" name="intent" value="request-otp" />

              <div className="reg-field">
                <label className="reg-label">Organisation Name</label>
                <input name="organizationName" defaultValue={actionData?.organizationName} placeholder="Acme Technologies" className="reg-input" />
              </div>
              <div className="reg-field">
                <label className="reg-label">Admin Name</label>
                <input name="adminName" defaultValue={actionData?.adminName} placeholder="Kiran Pandit" className="reg-input" />
              </div>
              <div className="reg-field">
                <label className="reg-label">Work Email</label>
                <input name="email" type="email" defaultValue={actionData?.email || loaderData.email} placeholder="admin@gmail.com or admin@company.com" className="reg-input" />
              </div>
              <div className="reg-field">
                <label className="reg-label">Department <span className="reg-label-hint">(optional)</span></label>
                <input name="department" defaultValue={actionData?.department || "Founders"} placeholder="Founders" className="reg-input" />
              </div>

              {actionData?.error ? <div className="reg-error">{actionData.error}</div> : null}

              <div className="reg-actions">
                <button type="submit" className="reg-btn-primary" disabled={submitting}>
                  {submitting ? "Sending OTP…" : "Send OTP →"}
                </button>
                <a href="/login" className="reg-btn-ghost">Back to login</a>
              </div>
            </Form>
          ) : (
            <Form method="post" className="reg-form">
              <input type="hidden" name="intent" value="verify-otp" />
              <input type="hidden" name="email" value={actionData?.email} />
              <input type="hidden" name="organizationName" value={actionData?.organizationName} />
              <input type="hidden" name="adminName" value={actionData?.adminName} />
              <input type="hidden" name="department" value={actionData?.department} />

              {actionData?.success ? (
                <div className="reg-success">{actionData.success}</div>
              ) : null}

              <div className="reg-field">
                <label className="reg-label">6-digit OTP</label>
                <input name="otpCode" placeholder="· · · · · ·" className="reg-input reg-input-otp" maxLength={6} autoFocus autoComplete="one-time-code" />
              </div>

              {actionData?.error ? <div className="reg-error">{actionData.error}</div> : null}

              <div className="reg-actions">
                <button type="submit" className="reg-btn-primary" disabled={submitting}>
                  {submitting ? "Verifying…" : "Verify & Create Account →"}
                </button>
              </div>
            </Form>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,300..800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .reg-root {
          display: flex; min-height: 100vh;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Left ── */
        .reg-left {
          flex: 1; background: #141929;
          position: relative; overflow: hidden;
          display: flex; align-items: center; padding: 64px;
        }
        .reg-left-inner { position: relative; z-index: 10; max-width: 460px; }

        .reg-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 48px; }
        .reg-logo {
          width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: grid; place-items: center;
          font-weight: 800; font-size: 13px; color: white;
          box-shadow: 0 6px 20px rgba(99,102,241,0.45);
          letter-spacing: -0.5px;
        }
        .reg-brand-name { font-size: 16px; font-weight: 700; color: white; letter-spacing: -0.3px; }
        .reg-brand-sub { font-size: 10px; color: rgba(255,255,255,0.35); font-weight: 500; letter-spacing: 0.7px; text-transform: uppercase; margin-top: 2px; }

        .reg-headline {
          font-size: clamp(32px, 3.5vw, 46px); font-weight: 800;
          color: white; line-height: 1.12; letter-spacing: -1.5px; margin-bottom: 18px;
        }
        .reg-accent {
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .reg-sub { font-size: 15px; color: rgba(255,255,255,0.5); line-height: 1.75; margin-bottom: 44px; }

        .reg-steps { display: flex; flex-direction: column; gap: 20px; }
        .reg-step { display: flex; align-items: flex-start; gap: 14px; }
        .reg-step-num {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.4);
          color: #a5b4fc; font-size: 13px; font-weight: 700;
          display: grid; place-items: center;
        }
        .reg-step-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); margin-bottom: 2px; }
        .reg-step-desc { font-size: 12.5px; color: rgba(255,255,255,0.38); }

        .reg-deco-blob { position: absolute; border-radius: 50%; pointer-events: none; }
        .reg-blob-1 { width: 440px; height: 440px; background: radial-gradient(circle, rgba(99,102,241,0.17) 0%, transparent 70%); top: -140px; right: -140px; }
        .reg-blob-2 { width: 300px; height: 300px; background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%); bottom: -70px; left: -70px; }
        .reg-deco-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 44px 44px;
        }

        /* ── Right ── */
        .reg-right {
          width: 520px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 48px; background: #f1f5fd;
        }
        .reg-form-wrap { width: 100%; max-width: 400px; }

        .reg-progress { display: flex; align-items: center; margin-bottom: 32px; }
        .reg-progress-step {
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; font-weight: 600; color: #94a3b8;
        }
        .reg-progress-step.active { color: #6366f1; }
        .reg-progress-step.done { color: #10b981; }
        .reg-prog-dot {
          width: 26px; height: 26px; border-radius: 50%;
          background: #e2e8f0; color: #94a3b8;
          font-size: 11px; font-weight: 700;
          display: grid; place-items: center; flex-shrink: 0;
        }
        .reg-progress-step.active .reg-prog-dot { background: #6366f1; color: white; box-shadow: 0 2px 10px rgba(99,102,241,0.4); }
        .reg-progress-step.done .reg-prog-dot { background: #10b981; color: white; }
        .reg-progress-line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 12px; }

        .reg-form-header { margin-bottom: 22px; }
        .reg-form-header h2 { font-size: 23px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 6px; }
        .reg-form-header p { font-size: 13.5px; color: #64748b; line-height: 1.55; }

        .reg-info-card {
          background: #eef2ff; border: 1px solid #c7d2fe;
          border-radius: 10px; padding: 12px 14px;
          color: #3730a3; font-size: 12.5px; line-height: 1.65; margin-bottom: 22px;
        }
        .reg-info-card code { background: #c7d2fe; padding: 1px 5px; border-radius: 4px; font-size: 11.5px; font-weight: 600; }

        .reg-form { display: flex; flex-direction: column; }
        .reg-field { margin-bottom: 15px; }
        .reg-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; letter-spacing: 0.1px; }
        .reg-label-hint { color: #94a3b8; font-weight: 400; }
        .reg-input {
          width: 100%; padding: 11px 14px;
          border: 1.5px solid #e2e8f0; border-radius: 10px;
          font-size: 14px; font-family: 'Inter', sans-serif;
          color: #0f172a; background: white; outline: none;
          transition: all 0.18s; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .reg-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.13); }
        .reg-input:hover:not(:focus) { border-color: #c7d2fe; }
        .reg-input-otp {
          font-size: 24px; font-weight: 800; letter-spacing: 8px;
          text-align: center; color: #6366f1; padding: 14px;
        }

        .reg-success {
          background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;
          padding: 12px 14px; color: #15803d; font-size: 13px;
          line-height: 1.6; margin-bottom: 18px; font-weight: 500;
        }
        .reg-error {
          background: #fef2f2; border: 1px solid #fecaca;
          color: #dc2626; font-size: 13px; padding: 10px 14px;
          border-radius: 10px; margin-top: 4px; margin-bottom: 8px; font-weight: 500;
        }

        .reg-actions { display: flex; gap: 10px; margin-top: 22px; }
        .reg-btn-primary {
          flex: 1; border: none; border-radius: 10px; padding: 13px 18px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white; font-weight: 700; font-size: 14px;
          font-family: 'Inter', sans-serif; cursor: pointer;
          transition: all 0.18s; box-shadow: 0 4px 16px rgba(99,102,241,0.35);
        }
        .reg-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.45); }
        .reg-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .reg-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .reg-btn-ghost {
          flex: 1; border: 1.5px solid #e2e8f0; border-radius: 10px;
          padding: 13px 18px; background: white;
          color: #6366f1; font-weight: 600; font-size: 13.5px;
          font-family: 'Inter', sans-serif;
          text-decoration: none; text-align: center;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.18s;
        }
        .reg-btn-ghost:hover { background: #eef2ff; border-color: #c7d2fe; }

        @media (max-width: 960px) { .reg-left { display: none; } .reg-right { width: 100%; } }
        @media (max-width: 480px) { .reg-right { padding: 32px 20px; } }
      `}</style>
    </div>
  );
}
