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
    await new Promise(r => setTimeout(r, 800));

    // Look up user in localStorage
    const users = JSON.parse(localStorage.getItem("hrms_users") || "[]") as any[];
    const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      setLoading(false);
      setError("No account found with this email. Please register first.");
      return;
    }

    if (user.password !== password) {
      setLoading(false);
      setError("Incorrect password. Please try again.");
      return;
    }

    // Save session
    localStorage.setItem("hrms_session", JSON.stringify({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      dept: user.dept,
      orgName: user.orgName,
    }));

    setLoading(false);
    navigate("/hrms");
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));

    // Auto-create demo user if not exists
    const users = JSON.parse(localStorage.getItem("hrms_users") || "[]") as any[];
    const demoEmail = "demo@jwithkp.in";
    if (!users.find((u: any) => u.email === demoEmail)) {
      users.push({
        id: "USRDEMO01",
        orgName: "JWithKP Demo Co.",
        fullName: "Demo Admin",
        email: demoEmail,
        password: "demo123",
        role: "HR Admin",
        dept: "People Ops",
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem("hrms_users", JSON.stringify(users));
    }

    localStorage.setItem("hrms_session", JSON.stringify({
      email: demoEmail,
      fullName: "Demo Admin",
      role: "HR Admin",
      dept: "People Ops",
      orgName: "JWithKP Demo Co.",
    }));

    setLoading(false);
    navigate("/hrms");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Left dark panel ── */}
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

          <h1 style={{
            fontSize: "clamp(36px,4vw,52px)", fontWeight: 800, color: "white",
            lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 20,
          }}>
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

          {/* Testimonial */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, fontStyle: "italic", marginBottom: 16 }}>
              "JWithKP HRMS reduced our HR workload by 60% within the first month."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                display: "grid", placeItems: "center",
                fontSize: 12, fontWeight: 700, color: "white",
              }}>RK</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>Rajesh Kumar</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>VP People, TechCorp India</div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorations */}
        <div style={{ position: "absolute", width: 500, height: 500, background: "radial-gradient(circle,rgba(99,102,241,0.15) 0%,transparent 70%)", top: -150, right: -150, borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 300, height: 300, background: "radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)", bottom: -80, left: -80, borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        width: 480, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px", background: "#f8f7f4",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>

          <div style={{ marginBottom: 30 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0d1117", letterSpacing: -0.5, marginBottom: 6 }}>
              Welcome back 👋
            </h2>
            <p style={{ fontSize: 13.5, color: "#6b7280" }}>
              Sign in to your JWithKP HRMS account
            </p>
          </div>

          {/* Demo login */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            style={{
              width: "100%", padding: "11px 16px", borderRadius: 10,
              border: "1.5px solid #e5e7eb", background: "white",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              fontSize: 13.5, fontWeight: 600, color: "#374151", cursor: "pointer",
              marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              transition: "border-color 0.15s",
            }}
          >
            ⚡ Try Demo — no sign up needed
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, color: "#9ca3af", fontSize: 12, fontWeight: 500 }}>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <span>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>

          <form onSubmit={handleLogin} noValidate>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Email
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 15 }}>✉</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  style={{
                    width: "100%", padding: "11px 14px 11px 38px",
                    border: "1.5px solid #e5e7eb", borderRadius: 10,
                    fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
                    color: "#0d1117", background: "white", outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Password</label>
                <span style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", fontWeight: 500 }}>Forgot password?</span>
              </div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 15 }}>🔒</span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{
                    width: "100%", padding: "11px 44px 11px 38px",
                    border: "1.5px solid #e5e7eb", borderRadius: 10,
                    fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
                    color: "#0d1117", background: "white", outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
                >
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                color: "#dc2626", fontSize: 13, padding: "10px 14px",
                borderRadius: 8, marginBottom: 16,
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: 13, borderRadius: 10, border: "none",
                background: loading ? "#a5b4fc" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "white", fontSize: 15, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, minHeight: 48,
              }}
            >
              {loading ? (
                <><span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Signing in...</>
              ) : "Sign In →"}
            </button>
          </form>

          {/* Register link */}
          <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>New to JWithKP HRMS?</span>
            <Link to="/register" style={{ color: "#6366f1", fontWeight: 700, textDecoration: "none" }}>
              Create account →
            </Link>
          </div>

          {/* Security badge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, fontSize: 11, color: "#9ca3af" }}>
            🔐 256-bit SSL encrypted · SOC 2 compliant
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.1) !important; }
        @media (max-width: 900px) {
          div[style*="flex: 1"] { display: none !important; }
          div[style*="width: 480px"] { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
