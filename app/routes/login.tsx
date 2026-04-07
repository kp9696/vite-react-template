import { useState } from "react";
import { useNavigate, Link } from "react-router";

export function meta() {
  return [{ title: "JWithKP HRMS · Sign In" }];
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
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    navigate("/hrms");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Left Panel */}
      <div style={{
        flex: 1, background: "#0d1117", position: "relative",
        overflow: "hidden", display: "flex", alignItems: "center", padding: "60px",
      }}>
        <div style={{ position: "relative", zIndex: 10, maxWidth: 520 }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 56 }}>
            <div style={{
              width: 48, height: 48, background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              borderRadius: 14, display: "grid", placeItems: "center",
              fontWeight: 800, fontSize: 15, color: "white",
              boxShadow: "0 8px 24px rgba(99,102,241,0.4)",
            }}>JK</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "white", letterSpacing: -0.5 }}>JWithKP</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase" }}>HRMS Platform</div>
            </div>
          </div>

          <h1 style={{ fontSize: "clamp(36px,4vw,52px)", fontWeight: 800, color: "white", lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 20 }}>
            People-first.<br />
            <span style={{ background: "linear-gradient(90deg,#818cf8,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              HR simplified.
            </span>
          </h1>

          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 420, marginBottom: 36 }}>
            The complete HR platform for growing teams. Manage payroll, leaves, recruitment, and performance — all in one place.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 48 }}>
            {["✦ Smart Payroll", "✦ Leave Tracking", "✦ AI HRBot", "✦ Performance Reviews", "✦ Recruitment Pipeline"].map(f => (
              <span key={f} style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.65)", padding: "6px 14px", borderRadius: 99, fontSize: 12,
              }}>{f}</span>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, fontStyle: "italic", marginBottom: 16 }}>
              "JWithKP HRMS reduced our HR workload by 60% within the first month."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "white",
              }}>RK</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>Rajesh Kumar</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>VP People, TechCorp India</div>
              </div>
            </div>
          </div>
        </div>

        {/* BG effects */}
        <div style={{ position: "absolute", width: 500, height: 500, background: "radial-gradient(circle,rgba(99,102,241,0.15) 0%,transparent 70%)", top: -150, right: -150, borderRadius: "50%" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      {/* Right Panel */}
      <div style={{
        width: 480, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px", background: "#f8f7f4",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>

          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0d1117", letterSpacing: -0.5, marginBottom: 6 }}>Welcome back 👋</h2>
            <p style={{ fontSize: 14, color: "#6b7280" }}>Sign in to your JWithKP HRMS account</p>
          </div>

          {/* Register CTA */}
          <Link to="/register" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: 12, border: "1.5px solid #6366f1", borderRadius: 10,
            background: "#eef2ff", color: "#4f46e5", textDecoration: "none",
            fontSize: 14, fontWeight: 600, marginBottom: 20,
            transition: "all 0.15s",
          }}>
            ✨ New here? Create your account
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, color: "#9ca3af", fontSize: 12, fontWeight: 500 }}>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <span>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Email</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", display: "flex" }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={inp}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={lbl}>Password</label>
                <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 500, cursor: "pointer" }}>Forgot password?</span>
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", display: "flex" }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{ ...inp, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}>
                  {showPass
                    ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: 13, background: loading ? "#a5b4fc" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48,
              }}
            >
              {loading
                ? <><span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Signing in...</>
                : "Sign In →"
              }
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#6b7280" }}>
            Don't have an account?{" "}
            <Link to="/register" style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>Create one free</Link>
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, fontSize: 11, color: "#9ca3af" }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            256-bit SSL encrypted · SOC 2 compliant
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media (max-width: 900px) {
          div[style*="flex: 1"] { display: none !important; }
          div[style*="width: 480px"] { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 0 };
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px 10px 40px",
  border: "1.5px solid #e5e7eb", borderRadius: 9, fontSize: 13.5,
  fontFamily: "'DM Sans',sans-serif", color: "#0d1117", background: "white", outline: "none",
};
