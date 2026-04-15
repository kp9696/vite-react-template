import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

export function meta() {
  return [{ title: "JWithKP HRMS - Reset Password" }];
}

type AlertState = { kind: "success" | "error"; message: string };
type ApiPayload = { success?: boolean; error?: string };

const OTP_EXPIRY_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function callApi(path: string, body: Record<string, string>): Promise<{ ok: boolean; payload: ApiPayload }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as ApiPayload)
    : { error: `Server error (${response.status}). Please retry.` };
  return { ok: response.ok, payload };
}

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);

  const [expirySeconds, setExpirySeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const expiryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (expiryRef.current) clearInterval(expiryRef.current);
    if (resendRef.current) clearInterval(resendRef.current);
  }

  function startTimers() {
    clearTimers();
    setExpirySeconds(OTP_EXPIRY_SECONDS);
    setResendSeconds(RESEND_COOLDOWN_SECONDS);

    expiryRef.current = setInterval(() => {
      setExpirySeconds((prev) => {
        if (prev <= 1) { clearInterval(expiryRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);

    resendRef.current = setInterval(() => {
      setResendSeconds((prev) => {
        if (prev <= 1) { clearInterval(resendRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => () => clearTimers(), []);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setAlert({ kind: "error", message: "Please enter your email address." });
      return;
    }
    setSending(true);
    try {
      const { ok, payload } = await callApi("/api/auth/forgot-password", { email: normalized });
      if (!ok) {
        setAlert({ kind: "error", message: payload.error ?? "Failed to send reset code." });
        return;
      }
      startTimers();
      setStep("reset");
      setAlert({ kind: "success", message: `Reset code sent to ${normalized}. Check your inbox.` });
    } catch {
      setAlert({ kind: "error", message: "Unable to reach the server. Check your network and try again." });
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (resendSeconds > 0 || sending) return;
    setOtp("");
    setAlert(null);
    setSending(true);
    try {
      const { ok, payload } = await callApi("/api/auth/forgot-password", { email: email.trim().toLowerCase() });
      if (!ok) {
        setAlert({ kind: "error", message: payload.error ?? "Failed to resend code." });
        return;
      }
      startTimers();
      setAlert({ kind: "success", message: "New reset code sent." });
    } catch {
      setAlert({ kind: "error", message: "Unable to reach the server." });
    } finally {
      setSending(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!otp.trim()) {
      setAlert({ kind: "error", message: "Enter the 6-digit code." });
      return;
    }
    if (password.length < 8) {
      setAlert({ kind: "error", message: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirmPassword) {
      setAlert({ kind: "error", message: "Passwords do not match." });
      return;
    }
    setSubmitting(true);
    try {
      const { ok, payload } = await callApi("/api/auth/reset-password", {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        password,
      });
      if (!ok) {
        setAlert({ kind: "error", message: payload.error ?? "Failed to reset password." });
        return;
      }
      clearTimers();
      setAlert({ kind: "success", message: "Password reset successfully. Redirecting to login…" });
      setTimeout(() => navigate("/login"), 1200);
    } catch {
      setAlert({ kind: "error", message: "Unable to reach the server." });
    } finally {
      setSubmitting(false);
    }
  }

  const otpExpired = step === "reset" && expirySeconds === 0;

  return (
    <div className="fp-root">
      <div className="fp-left">
        <div className="fp-left-inner">
          <div className="fp-brand">
            <div className="fp-logo">JK</div>
            <div>
              <div className="fp-brand-name">JWithKP</div>
              <div className="fp-brand-sub">HRMS Platform</div>
            </div>
          </div>
          <h1 className="fp-headline">
            Locked out?<br />
            <span className="fp-accent">We've got you.</span>
          </h1>
          <p className="fp-sub">
            Enter your registered email and we'll send a one-time code to reset your password securely.
          </p>
          <div className="fp-steps">
            {[
              { n: "1", title: "Enter your email", desc: "We'll send a 6-digit reset code" },
              { n: "2", title: "Verify the code", desc: "Enter the OTP from your inbox" },
              { n: "3", title: "Set new password", desc: "Choose a strong new password" },
            ].map((s) => (
              <div key={s.n} className="fp-step">
                <div className="fp-step-num">{s.n}</div>
                <div>
                  <div className="fp-step-title">{s.title}</div>
                  <div className="fp-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="fp-blob fp-blob-1" />
        <div className="fp-blob fp-blob-2" />
        <div className="fp-grid" />
      </div>

      <div className="fp-right">
        <div className="fp-form-wrap">
          <div className="fp-progress">
            <div className={`fp-prog-step ${step === "email" ? "active" : "done"}`}>
              <div className="fp-prog-dot">{step === "reset" ? "✓" : "1"}</div>
              <span>Verify Email</span>
            </div>
            <div className="fp-prog-line" />
            <div className={`fp-prog-step ${step === "reset" ? "active" : ""}`}>
              <div className="fp-prog-dot">2</div>
              <span>Reset Password</span>
            </div>
          </div>

          <div className="fp-form-header">
            <div className="fp-form-logo">JK</div>
            <h2>{step === "email" ? "Forgot password?" : "Reset your password"}</h2>
            <p>
              {step === "email"
                ? "Enter your registered email and we'll send a reset code."
                : `Enter the code sent to ${email.trim().toLowerCase()} and choose a new password.`}
            </p>
          </div>

          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="fp-form">
              <div className="fp-field">
                <label className="fp-label">Email address</label>
                <div className="fp-field-wrap">
                  <span className="fp-field-icon">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="fp-input"
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>

              {alert && (
                <div className={alert.kind === "error" ? "fp-error" : "fp-success"}>{alert.message}</div>
              )}

              <button type="submit" className="fp-btn-primary" disabled={sending}>
                {sending ? "Sending code…" : "Send Reset Code"}
              </button>
              <a href="/login" className="fp-btn-ghost">Back to login</a>
            </form>
          ) : (
            <form onSubmit={handleReset} className="fp-form">
              {!otpExpired && (
                <div className="fp-timer-row">
                  <span className="fp-timer-label">Code expires in</span>
                  <span className={`fp-timer-value ${expirySeconds <= 60 ? "fp-timer-warn" : ""}`}>
                    {formatTime(expirySeconds)}
                  </span>
                  <div className="fp-timer-track">
                    <div className="fp-timer-fill" style={{ width: `${(expirySeconds / OTP_EXPIRY_SECONDS) * 100}%` }} />
                  </div>
                </div>
              )}
              {otpExpired && (
                <div className="fp-expired">Code expired — request a new one below.</div>
              )}

              <div className="fp-field">
                <label className="fp-label">6-digit reset code</label>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="fp-input fp-input-otp"
                  maxLength={6}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={otpExpired}
                />
              </div>

              <div className="fp-field">
                <label className="fp-label">New password</label>
                <div className="fp-field-wrap">
                  <span className="fp-field-icon">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="fp-input"
                    autoComplete="new-password"
                    disabled={otpExpired}
                  />
                </div>
              </div>

              <div className="fp-field">
                <label className="fp-label">Confirm new password</label>
                <div className="fp-field-wrap">
                  <span className="fp-field-icon">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="fp-input"
                    autoComplete="new-password"
                    disabled={otpExpired}
                  />
                </div>
              </div>

              {alert && (
                <div className={alert.kind === "error" ? "fp-error" : "fp-success"}>{alert.message}</div>
              )}

              <button type="submit" className="fp-btn-primary" disabled={submitting || otpExpired}>
                {submitting ? "Resetting…" : "Reset Password"}
              </button>

              <div className="fp-resend-row">
                {resendSeconds > 0 ? (
                  <span className="fp-resend-wait">Resend in <strong>{resendSeconds}s</strong></span>
                ) : (
                  <button type="button" className="fp-resend-btn" onClick={handleResend} disabled={sending}>
                    {sending ? "Sending…" : "Resend code"}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .fp-root { display: flex; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

        .fp-left { flex: 1; background: #141929; position: relative; overflow: hidden; display: flex; align-items: center; padding: 64px; }
        .fp-left-inner { position: relative; z-index: 10; max-width: 460px; }
        .fp-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 48px; }
        .fp-logo { width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: grid; place-items: center; font-weight: 800; font-size: 13px; color: white; box-shadow: 0 6px 20px rgba(99,102,241,0.45); letter-spacing: -0.5px; }
        .fp-brand-name { font-size: 16px; font-weight: 700; color: white; letter-spacing: -0.3px; }
        .fp-brand-sub { font-size: 10px; color: rgba(255,255,255,0.35); font-weight: 500; letter-spacing: 0.7px; text-transform: uppercase; margin-top: 2px; }
        .fp-headline { font-size: clamp(32px, 3.5vw, 46px); font-weight: 800; color: white; line-height: 1.12; letter-spacing: -1.5px; margin-bottom: 18px; }
        .fp-accent { background: linear-gradient(90deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .fp-sub { font-size: 15px; color: rgba(255,255,255,0.5); line-height: 1.75; margin-bottom: 44px; }
        .fp-steps { display: flex; flex-direction: column; gap: 20px; }
        .fp-step { display: flex; align-items: flex-start; gap: 14px; }
        .fp-step-num { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.4); color: #a5b4fc; font-size: 13px; font-weight: 700; display: grid; place-items: center; }
        .fp-step-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); margin-bottom: 2px; }
        .fp-step-desc { font-size: 12.5px; color: rgba(255,255,255,0.38); }
        .fp-blob { position: absolute; border-radius: 50%; pointer-events: none; }
        .fp-blob-1 { width: 440px; height: 440px; background: radial-gradient(circle, rgba(99,102,241,0.17) 0%, transparent 70%); top: -140px; right: -140px; }
        .fp-blob-2 { width: 300px; height: 300px; background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%); bottom: -70px; left: -70px; }
        .fp-grid { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 44px 44px; }

        .fp-right { width: 500px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 48px 44px; background: #f1f5fd; }
        .fp-form-wrap { width: 100%; max-width: 390px; }

        .fp-progress { display: flex; align-items: center; margin-bottom: 32px; }
        .fp-prog-step { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: #94a3b8; }
        .fp-prog-step.active { color: #6366f1; }
        .fp-prog-step.done { color: #10b981; }
        .fp-prog-dot { width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; color: #94a3b8; font-size: 11px; font-weight: 700; display: grid; place-items: center; flex-shrink: 0; }
        .fp-prog-step.active .fp-prog-dot { background: #6366f1; color: white; box-shadow: 0 2px 10px rgba(99,102,241,0.4); }
        .fp-prog-step.done .fp-prog-dot { background: #10b981; color: white; }
        .fp-prog-line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 12px; }

        .fp-form-header { margin-bottom: 24px; }
        .fp-form-logo { width: 40px; height: 40px; border-radius: 11px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: grid; place-items: center; font-weight: 800; font-size: 13px; color: white; margin-bottom: 20px; box-shadow: 0 4px 14px rgba(99,102,241,0.35); letter-spacing: -0.5px; }
        .fp-form-header h2 { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 6px; }
        .fp-form-header p { font-size: 13.5px; color: #64748b; line-height: 1.55; }

        .fp-form { display: flex; flex-direction: column; gap: 0; }
        .fp-field { margin-bottom: 16px; }
        .fp-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .fp-field-wrap { position: relative; }
        .fp-field-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #94a3b8; display: flex; align-items: center; transition: color 0.15s; }
        .fp-input { width: 100%; padding: 11px 16px 11px 38px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 14px; font-family: 'Inter', sans-serif; color: #0f172a; background: white; outline: none; transition: all 0.18s; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .fp-field:has(.fp-input:not(.fp-input-otp)) .fp-input { padding-left: 38px; }
        .fp-input-otp { padding: 12px 14px; font-size: 26px; font-weight: 800; letter-spacing: 10px; text-align: center; color: #6366f1; }
        .fp-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.13); }
        .fp-input:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }
        .fp-field-wrap:focus-within .fp-field-icon { color: #6366f1; }

        .fp-timer-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .fp-timer-label { font-size: 12px; color: #64748b; font-weight: 500; }
        .fp-timer-value { font-size: 13px; font-weight: 700; color: #4f46e5; min-width: 38px; }
        .fp-timer-value.fp-timer-warn { color: #dc2626; }
        .fp-timer-track { flex: 1; height: 4px; background: #e2e8f0; border-radius: 99px; min-width: 80px; overflow: hidden; }
        .fp-timer-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 99px; transition: width 1s linear; }

        .fp-expired { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 11px 14px; color: #c2410c; font-size: 13px; font-weight: 500; margin-bottom: 16px; }

        .fp-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 13px; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-weight: 500; }
        .fp-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; color: #15803d; font-size: 13px; margin-bottom: 14px; font-weight: 500; line-height: 1.6; }

        .fp-btn-primary { width: 100%; padding: 13px; border: none; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; font-size: 14.5px; font-weight: 700; font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.18s; box-shadow: 0 4px 16px rgba(99,102,241,0.35); margin-bottom: 12px; }
        .fp-btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.45); }
        .fp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .fp-btn-ghost { display: block; width: 100%; padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 10px; background: white; color: #6366f1; font-size: 13.5px; font-weight: 600; font-family: 'Inter', sans-serif; text-align: center; text-decoration: none; transition: all 0.18s; }
        .fp-btn-ghost:hover { background: #eef2ff; border-color: #c7d2fe; }

        .fp-resend-row { display: flex; justify-content: center; margin-top: 6px; }
        .fp-resend-wait { font-size: 12.5px; color: #94a3b8; }
        .fp-resend-btn { border: none; background: none; padding: 0; color: #6366f1; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline; font-family: 'Inter', sans-serif; }
        .fp-resend-btn:hover:not(:disabled) { color: #4f46e5; }
        .fp-resend-btn:disabled { color: #94a3b8; cursor: not-allowed; text-decoration: none; }

        @media (max-width: 960px) { .fp-left { display: none; } .fp-right { width: 100%; } }
        @media (max-width: 480px) { .fp-right { padding: 32px 20px; } }
      `}</style>
    </div>
  );
}
