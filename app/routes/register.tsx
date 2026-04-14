import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

export function meta() {
  return [{ title: "JWithKP HRMS - Create Account" }];
}

type AlertState = {
  kind: "success" | "error";
  message: string;
};

type ApiPayload = {
  success?: boolean;
  error?: string;
};

const OTP_EXPIRY_SECONDS = 300; // must match OTP_TTL_SECONDS in workers/app.ts
const RESEND_COOLDOWN_SECONDS = 60; // must match RESEND_COOLDOWN_SECONDS in workers/app.ts

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function readApiPayload(response: Response): Promise<ApiPayload> {
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return (await response.json()) as ApiPayload;
  }

  const text = await response.text();
  if (text.includes("Oops!") || text.includes("unexpected error")) {
    return { error: `Server error (${response.status}). Please retry after deployment/restart.` };
  }

  return { error: text.trim().slice(0, 200) || `Request failed with status ${response.status}.` };
}

export default function Register() {
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);

  // Countdown timers
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
        if (prev <= 1) {
          clearInterval(expiryRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    resendRef.current = setInterval(() => {
      setResendSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(resendRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Clean up on unmount
  useEffect(() => () => clearTimers(), []);

  async function sendOtp(isResend = false): Promise<boolean> {
    setAlert(null);
    setSendingOtp(true);
    try {
      const response = await fetch("/api/send-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const payload = await readApiPayload(response);
      if (!response.ok || !payload.success) {
        setAlert({ kind: "error", message: payload.error ?? "Failed to send OTP." });
        return false;
      }

      startTimers();
      setOtpRequested(true);
      setAlert({
        kind: "success",
        message: isResend
          ? `New OTP sent to ${email.trim().toLowerCase()}.`
          : `OTP sent to ${email.trim().toLowerCase()}.`,
      });
      return true;
    } catch {
      setAlert({ kind: "error", message: "Unable to reach the server. Check network/deployment and try again." });
      return false;
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleSendOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyName.trim() || !name.trim() || !email.trim() || !password.trim()) {
      setAlert({ kind: "error", message: "Company name, admin name, email, and password are required." });
      return;
    }
    if (password.trim().length < 8) {
      setAlert({ kind: "error", message: "Password must be at least 8 characters." });
      return;
    }

    await sendOtp(false);
  }

  async function handleResendOtp() {
    if (resendSeconds > 0 || sendingOtp) return;
    setOtp("");
    await sendOtp(true);
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlert(null);

    if (!otp.trim()) {
      setAlert({ kind: "error", message: "Enter the 6-digit OTP." });
      return;
    }

    setVerifyingOtp(true);
    try {
      const response = await fetch("/api/verify-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });

      const payload = await readApiPayload(response);
      if (!response.ok || !payload.success) {
        setAlert({ kind: "error", message: payload.error ?? "OTP verification failed." });
        return;
      }

      clearTimers();
      setAlert({ kind: "success", message: "Email verified. Redirecting to login..." });
      setTimeout(() => navigate("/login"), 700);
    } catch {
      setAlert({ kind: "error", message: "Unable to reach the server. Check network/deployment and try again." });
    } finally {
      setVerifyingOtp(false);
    }
  }

  function handleEditDetails() {
    clearTimers();
    setOtpRequested(false);
    setOtp("");
    setAlert(null);
  }

  const otpExpired = otpRequested && expirySeconds === 0;

  return (
    <div className="reg-root">
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
            Verify signup<br />
            <span className="reg-accent">before access.</span>
          </h1>
          <p className="reg-sub">
            New accounts are activated only after OTP confirmation. This keeps registration secure and prevents unauthorized signups.
          </p>

          <div className="reg-steps">
            {[
              { n: "1", title: "Enter details", desc: "Company name, admin name, email, and password" },
              { n: "2", title: "Verify email", desc: "Receive 6-digit OTP via Microsoft 365" },
              { n: "3", title: "Sign in", desc: "Use your verified account" },
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

      <div className="reg-right">
        <div className="reg-form-wrap">
          {/* Progress indicator */}
          <div className="reg-progress">
            <div className={`reg-progress-step ${!otpRequested ? "active" : "done"}`}>
              <div className="reg-prog-dot">{otpRequested ? "✓" : "1"}</div>
              <span>Verify Email</span>
            </div>
            <div className="reg-progress-line" />
            <div className={`reg-progress-step ${otpRequested ? "active" : ""}`}>
              <div className="reg-prog-dot">2</div>
              <span>Confirm OTP</span>
            </div>
          </div>

          <div className="reg-form-header">
            <h2>{otpRequested ? "Confirm your OTP" : "Create account"}</h2>
            <p>
              {otpRequested
                ? `Enter the 6-digit code sent to ${email.trim().toLowerCase() || "your email"}.`
                : "Submit your details to receive a one-time password for email verification."}
            </p>
          </div>

          <div className="reg-info-card">
            OTP emails are sent via <strong>Microsoft 365</strong> from <strong>info@jwithkp.com</strong>.
          </div>

          {/* ── Step 1: collect details ── */}
          {!otpRequested ? (
            <form onSubmit={handleSendOtp} className="reg-form">
              <div className="reg-field">
                <label className="reg-label">Company Name</label>
                <input
                  name="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Technologies Pvt Ltd"
                  className="reg-input"
                  autoComplete="organization"
                />
              </div>

              <div className="reg-field">
                <label className="reg-label">Name</label>
                <input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Keshav Pandit"
                  className="reg-input"
                  autoComplete="name"
                />
              </div>

              <div className="reg-field">
                <label className="reg-label">Email</label>
                <input
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@company.com"
                  className="reg-input"
                  autoComplete="email"
                />
              </div>

              <div className="reg-field">
                <label className="reg-label">Password</label>
                <input
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="At least 8 characters"
                  className="reg-input"
                  autoComplete="new-password"
                />
              </div>

              {alert?.kind === "error" && <div className="reg-error">{alert.message}</div>}
              {alert?.kind === "success" && <div className="reg-success">{alert.message}</div>}

              <div className="reg-actions">
                <button type="submit" className="reg-btn-primary" disabled={sendingOtp}>
                  {sendingOtp ? "Sending OTP…" : "Verify Email"}
                </button>
                <a href="/login" className="reg-btn-ghost">Back to login</a>
              </div>
            </form>

          /* ── Step 2: enter OTP ── */
          ) : (
            <form onSubmit={handleVerifyOtp} className="reg-form">

              {/* Expiry countdown bar */}
              {!otpExpired && (
                <div className="reg-timer-row">
                  <span className="reg-timer-label">Code expires in</span>
                  <span className={`reg-timer-value ${expirySeconds <= 60 ? "reg-timer-warn" : ""}`}>
                    {formatTime(expirySeconds)}
                  </span>
                  <div className="reg-timer-track">
                    <div
                      className="reg-timer-fill"
                      style={{ width: `${(expirySeconds / OTP_EXPIRY_SECONDS) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {otpExpired && (
                <div className="reg-expired-banner">
                  OTP expired — request a new code below.
                </div>
              )}

              <div className="reg-field">
                <label className="reg-label">6-digit OTP</label>
                <input
                  name="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="reg-input reg-input-otp"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  disabled={otpExpired}
                />
              </div>

              {alert?.kind === "error" && <div className="reg-error">{alert.message}</div>}
              {alert?.kind === "success" && <div className="reg-success">{alert.message}</div>}

              <div className="reg-actions">
                <button
                  type="submit"
                  className="reg-btn-primary"
                  disabled={verifyingOtp || otpExpired}
                >
                  {verifyingOtp ? "Verifying…" : "Confirm OTP"}
                </button>
                <button
                  type="button"
                  className="reg-btn-ghost"
                  onClick={handleEditDetails}
                >
                  Edit details
                </button>
              </div>

              {/* Resend row */}
              <div className="reg-resend-row">
                {resendSeconds > 0 ? (
                  <span className="reg-resend-wait">
                    Resend available in <strong>{resendSeconds}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="reg-resend-btn"
                    onClick={handleResendOtp}
                    disabled={sendingOtp}
                  >
                    {sendingOtp ? "Sending…" : "Resend OTP"}
                  </button>
                )}
              </div>
            </form>
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

        /* ── Left panel ── */
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

        /* ── Right panel ── */
        .reg-right {
          width: 520px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 48px; background: #f1f5fd;
        }
        .reg-form-wrap { width: 100%; max-width: 400px; }

        /* ── Progress ── */
        .reg-progress { display: flex; align-items: center; margin-bottom: 32px; }
        .reg-progress-step {
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; font-weight: 600; color: #94a3b8;
        }
        .reg-progress-step.active { color: #6366f1; }
        .reg-progress-step.done  { color: #10b981; }
        .reg-prog-dot {
          width: 26px; height: 26px; border-radius: 50%;
          background: #e2e8f0; color: #94a3b8;
          font-size: 11px; font-weight: 700;
          display: grid; place-items: center; flex-shrink: 0;
        }
        .reg-progress-step.active .reg-prog-dot { background: #6366f1; color: white; box-shadow: 0 2px 10px rgba(99,102,241,0.4); }
        .reg-progress-step.done  .reg-prog-dot  { background: #10b981; color: white; }
        .reg-progress-line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 12px; }

        /* ── Form header ── */
        .reg-form-header { margin-bottom: 22px; }
        .reg-form-header h2 { font-size: 23px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 6px; }
        .reg-form-header p  { font-size: 13.5px; color: #64748b; line-height: 1.55; }

        /* ── Info card ── */
        .reg-info-card {
          background: #eef2ff; border: 1px solid #c7d2fe;
          border-radius: 10px; padding: 12px 14px;
          color: #3730a3; font-size: 12.5px; line-height: 1.65; margin-bottom: 22px;
        }

        /* ── Fields ── */
        .reg-form  { display: flex; flex-direction: column; }
        .reg-field { margin-bottom: 15px; }
        .reg-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; letter-spacing: 0.1px; }
        .reg-input {
          width: 100%; padding: 11px 14px;
          border: 1.5px solid #e2e8f0; border-radius: 10px;
          font-size: 14px; font-family: 'Inter', sans-serif;
          color: #0f172a; background: white; outline: none;
          transition: all 0.18s; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .reg-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.13); }
        .reg-input:hover:not(:focus) { border-color: #c7d2fe; }
        .reg-input:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }
        .reg-input-otp {
          font-size: 28px; font-weight: 800; letter-spacing: 10px;
          text-align: center; color: #6366f1; padding: 14px;
        }

        /* ── Countdown timer ── */
        .reg-timer-row {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 16px; flex-wrap: wrap;
        }
        .reg-timer-label { font-size: 12px; color: #64748b; font-weight: 500; }
        .reg-timer-value { font-size: 13px; font-weight: 700; color: #4f46e5; min-width: 38px; }
        .reg-timer-value.reg-timer-warn { color: #dc2626; }
        .reg-timer-track {
          flex: 1; height: 4px; background: #e2e8f0; border-radius: 99px;
          min-width: 80px; overflow: hidden;
        }
        .reg-timer-fill {
          height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6);
          border-radius: 99px; transition: width 1s linear;
        }

        /* ── Expired banner ── */
        .reg-expired-banner {
          background: #fff7ed; border: 1px solid #fed7aa;
          border-radius: 10px; padding: 11px 14px;
          color: #c2410c; font-size: 13px; font-weight: 500;
          margin-bottom: 16px;
        }

        /* ── Alerts ── */
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

        /* ── Actions ── */
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
          transition: all 0.18s; cursor: pointer;
        }
        .reg-btn-ghost:hover { background: #eef2ff; border-color: #c7d2fe; }

        /* ── Resend ── */
        .reg-resend-row { display: flex; justify-content: center; margin-top: 18px; }
        .reg-resend-wait { font-size: 12.5px; color: #94a3b8; }
        .reg-resend-btn {
          border: none; background: none; padding: 0;
          color: #6366f1; font-size: 13px; font-weight: 600;
          cursor: pointer; text-decoration: underline;
          font-family: 'Inter', sans-serif;
          transition: color 0.15s;
        }
        .reg-resend-btn:hover:not(:disabled) { color: #4f46e5; }
        .reg-resend-btn:disabled { color: #94a3b8; cursor: not-allowed; text-decoration: none; }

        @media (max-width: 960px) { .reg-left { display: none; } .reg-right { width: 100%; } }
        @media (max-width: 480px) { .reg-right { padding: 32px 20px; } }
      `}</style>
    </div>
  );
}

