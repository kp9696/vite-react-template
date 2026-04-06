import { useState } from "react";
import { useNavigate } from "react-router";

export function meta() {
  return [{ title: "JWithKP HRMS · Login" }];
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    navigate("/hrms");
  };

  return (
    <div className="login-root">
      {/* Left Panel */}
      <div className="login-left">
        <div className="left-inner">
          {/* Logo */}
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

          {/* Headline */}
          <div className="left-headline">
            <h1>People-first.<br /><span className="accent-text">HR simplified.</span></h1>
            <p className="left-sub">The complete HR platform trusted by growing teams. Manage your workforce, payroll, and performance — all in one place.</p>
          </div>

          {/* Feature pills */}
          <div className="feature-pills">
            {["✦ Smart Payroll", "✦ Leave Tracking", "✦ AI HRBot", "✦ Performance Reviews", "✦ Recruitment Pipeline"].map(f => (
              <span key={f} className="pill">{f}</span>
            ))}
          </div>

          {/* Testimonial */}
          <div className="testimonial">
            <div className="testimonial-quote">"JWithKP HRMS reduced our HR workload by 60% within the first month."</div>
            <div className="testimonial-author">
              <div className="author-avatar">RK</div>
              <div>
                <div className="author-name">Rajesh Kumar</div>
                <div className="author-role">VP People, TechCorp India</div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative background elements */}
        <div className="deco-circle deco-1" />
        <div className="deco-circle deco-2" />
        <div className="deco-grid" />
      </div>

      {/* Right Panel — Login Form */}
      <div className="login-right">
        <div className="form-wrapper">
          <div className="form-header">
            <h2>Welcome back 👋</h2>
            <p>Sign in to your JWithKP HRMS account</p>
          </div>

          {/* SSO Button */}
          <button className="sso-btn" type="button">
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.4-.1-2.7-.4-4z"/>
              <path fill="#34A853" d="M6.3 14.7l7 5.1C15 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.3 4.5-17.7 11.7z"/>
              <path fill="#FBBC05" d="M24 45c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.6 36 26.9 37 24 37c-5.7 0-10.6-3.1-11.7-8.4l-7 5.4C8 40.5 15.4 45 24 45z"/>
              <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-1.1 3-3.4 5.4-6.3 7l6.7 5.5C40.6 37 44.5 31 44.5 24c0-1.4-.1-2.7-.5-4z"/>
            </svg>
            Continue with Google SSO
          </button>

          <div className="divider"><span>or sign in with email</span></div>

          <form onSubmit={handleLogin}>
            <div className="field-group">
              <label className="field-label">Work Email</label>
              <div className="field-wrap">
                <span className="field-icon">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="field-input"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="field-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="field-label">Password</label>
                <a href="#" className="forgot-link">Forgot password?</a>
              </div>
              <div className="field-wrap">
                <span className="field-icon">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="field-input"
                  autoComplete="current-password"
                />
                <button type="button" className="toggle-pass" onClick={() => setShowPass(!showPass)}>
                  {showPass
                    ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="error-msg">⚠ {error}</div>
            )}

            <button type="submit" className={`submit-btn ${loading ? "loading" : ""}`} disabled={loading}>
              {loading ? (
                <span className="spinner" />
              ) : "Sign In →"}
            </button>
          </form>

          <div className="form-footer">
            <span>New to JWithKP HRMS?</span>
            <a href="#" className="contact-link">Contact your HR admin</a>
          </div>

          <div className="security-note">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            256-bit SSL encrypted · SOC 2 compliant
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .login-root {
          display: flex;
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          background: #f8f7f4;
        }

        /* ─── LEFT PANEL ─── */
        .login-left {
          flex: 1;
          background: #0d1117;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          padding: 60px;
        }

        .left-inner {
          position: relative;
          z-index: 10;
          max-width: 520px;
        }

        /* Brand */
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 56px;
        }
        .brand-logo {
          width: 48px; height: 48px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 14px;
          letter-spacing: -1px;
          color: white;
          box-shadow: 0 8px 24px rgba(99,102,241,0.4);
        }
        .brand-j { color: white; }
        .brand-k { color: #c4b5fd; }
        .brand-text { display: flex; flex-direction: column; }
        .brand-name {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 18px;
          color: white;
          letter-spacing: -0.5px;
          line-height: 1.1;
        }
        .brand-tag {
          font-size: 11px;
          color: rgba(255,255,255,0.4);
          font-weight: 400;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Headline */
        .left-headline h1 {
          font-family: 'Syne', sans-serif;
          font-size: clamp(36px, 4vw, 52px);
          font-weight: 800;
          color: white;
          line-height: 1.1;
          letter-spacing: -1.5px;
          margin-bottom: 20px;
        }
        .accent-text {
          background: linear-gradient(90deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .left-sub {
          font-size: 15px;
          color: rgba(255,255,255,0.5);
          line-height: 1.7;
          max-width: 420px;
          margin-bottom: 36px;
        }

        /* Pills */
        .feature-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 48px;
        }
        .pill {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.65);
          padding: 6px 14px;
          border-radius: 99px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.2px;
          backdrop-filter: blur(4px);
        }

        /* Testimonial */
        .testimonial {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(8px);
        }
        .testimonial-quote {
          font-size: 14px;
          color: rgba(255,255,255,0.8);
          line-height: 1.6;
          font-style: italic;
          margin-bottom: 16px;
        }
        .testimonial-author {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .author-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700;
          color: white; flex-shrink: 0;
        }
        .author-name { font-size: 13px; font-weight: 600; color: white; }
        .author-role { font-size: 11px; color: rgba(255,255,255,0.4); }

        /* Decorative */
        .deco-circle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }
        .deco-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%);
          top: -150px; right: -150px;
        }
        .deco-2 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%);
          bottom: -80px; left: -80px;
        }
        .deco-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        /* ─── RIGHT PANEL ─── */
        .login-right {
          width: 480px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          background: #f8f7f4;
        }

        .form-wrapper {
          width: 100%;
          max-width: 380px;
        }

        .form-header {
          margin-bottom: 32px;
        }
        .form-header h2 {
          font-family: 'Syne', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: #0d1117;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }
        .form-header p {
          font-size: 14px;
          color: #6b7280;
        }

        /* SSO */
        .sso-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          background: white;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .sso-btn:hover {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 24px 0;
          color: #9ca3af;
          font-size: 12px;
          font-weight: 500;
        }
        .divider::before, .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }

        /* Fields */
        .field-group { margin-bottom: 18px; }
        .field-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
        }
        .field-wrap {
          position: relative;
        }
        .field-icon {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          display: flex;
          align-items: center;
        }
        .field-input {
          width: 100%;
          padding: 11px 40px 11px 40px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          color: #0d1117;
          background: white;
          outline: none;
          transition: all 0.15s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .field-input::placeholder { color: #9ca3af; }
        .field-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .toggle-pass {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          display: flex;
          align-items: center;
          padding: 2px;
        }
        .toggle-pass:hover { color: #6366f1; }

        /* Forgot */
        .forgot-link {
          font-size: 12px;
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
        }
        .forgot-link:hover { text-decoration: underline; }

        /* Error */
        .error-msg {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        /* Submit */
        .submit-btn {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          font-family: 'Syne', sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
          box-shadow: 0 4px 14px rgba(99,102,241,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          letter-spacing: -0.2px;
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99,102,241,0.5);
        }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        .submit-btn:disabled { opacity: 0.8; cursor: not-allowed; }

        /* Spinner */
        .spinner {
          width: 20px; height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer */
        .form-footer {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .contact-link {
          color: #6366f1;
          font-weight: 600;
          text-decoration: none;
        }
        .contact-link:hover { text-decoration: underline; }

        /* Security */
        .security-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 20px;
          font-size: 11px;
          color: #9ca3af;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .login-left { display: none; }
          .login-right { width: 100%; }
        }
      `}</style>
    </div>
  );
}
