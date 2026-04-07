import { useState } from "react";
import { useNavigate, Link } from "react-router";

export function meta() {
  return [{ title: "JWithKP HRMS · Create Account" }];
}

const roles = ["HR Admin", "HR Manager", "Employee", "Manager", "Finance", "Payroll Manager"];
const depts = ["People Ops", "Engineering", "Design", "Sales", "Marketing", "Finance", "Operations"];

const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: "#374151", marginBottom: 5,
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  border: "1.5px solid #e5e7eb", borderRadius: 9,
  fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
  color: "#0d1117", background: "white", outline: "none",
  transition: "border-color 0.15s",
};

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    orgName: "",
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "HR Admin",
    dept: "People Ops",
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.orgName || !form.fullName || !form.email || !form.password) {
      setError("All fields are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Check if email already registered
    const existing = JSON.parse(localStorage.getItem("hrms_users") || "[]") as any[];
    if (existing.find((u: any) => u.email.toLowerCase() === form.email.toLowerCase())) {
      setError("An account with this email already exists. Please sign in.");
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 900));

    // Save user to localStorage
    const user = {
      id: "USR" + Date.now(),
      orgName: form.orgName,
      fullName: form.fullName,
      email: form.email.toLowerCase(),
      password: form.password, // In production, never store plain text
      role: form.role,
      dept: form.dept,
      createdAt: new Date().toISOString(),
    };

    const users = JSON.parse(localStorage.getItem("hrms_users") || "[]");
    users.push(user);
    localStorage.setItem("hrms_users", JSON.stringify(users));

    // Log them in
    localStorage.setItem("hrms_session", JSON.stringify({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      dept: user.dept,
      orgName: user.orgName,
    }));

    setLoading(false);
    setStep("success");
    setTimeout(() => navigate("/hrms"), 1800);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Left dark panel ── */}
      <div style={{
        flex: 1, background: "#0d1117", position: "relative",
        overflow: "hidden", display: "flex", alignItems: "center", padding: "60px",
      }}>
        <div style={{ position: "relative", zIndex: 10, maxWidth: 480 }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 52 }}>
            <div style={{
              width: 48, height: 48,
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
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
            fontSize: "clamp(34px,3.5vw,48px)", fontWeight: 800, color: "white",
            lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 18,
          }}>
            Set up your<br />
            <span style={{ background: "linear-gradient(90deg,#818cf8,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              workspace.
            </span>
          </h1>

          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 36, maxWidth: 400 }}>
            Create your JWithKP HRMS account in seconds. Manage your team, payroll, leaves, and performance — all from one place.
          </p>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}>
            {[
              { n: "1", label: "Create your account", sub: "Name, email & password" },
              { n: "2", label: "Name your organization", sub: "Company name & department" },
              { n: "3", label: "Start using HRMS", sub: "Dashboard ready instantly" },
            ].map(s => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  display: "grid", placeItems: "center",
                  fontSize: 13, fontWeight: 800, color: "white", flexShrink: 0,
                }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["✦ Free to start", "✦ No credit card", "✦ Instant access", "✦ AI HRBot included"].map(p => (
              <span key={p} style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.6)", padding: "5px 14px", borderRadius: 99, fontSize: 12,
              }}>{p}</span>
            ))}
          </div>
        </div>

        {/* Decorations */}
        <div style={{ position: "absolute", width: 500, height: 500, background: "radial-gradient(circle,rgba(99,102,241,0.15) 0%,transparent 70%)", top: -150, right: -150, borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 300, height: 300, background: "radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)", bottom: -80, left: -80, borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        width: 520, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 48px", background: "#f8f7f4", overflowY: "auto",
      }}>
        <div style={{ width: "100%" }}>

          {step === "success" ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 60, marginBottom: 20 }}>🎉</div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0d1117", letterSpacing: -0.5, marginBottom: 8 }}>
                Account created!
              </h2>
              <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
                Welcome to JWithKP HRMS, <strong style={{ color: "#0d1117" }}>{form.fullName}</strong>!<br />
                Taking you to your dashboard...
              </p>
              <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 99, animation: "progress 1.8s linear forwards" }} />
              </div>
              <style>{`@keyframes progress { from{width:0} to{width:100%} }`}</style>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 26 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0d1117", letterSpacing: -0.5, marginBottom: 6 }}>
                  Create your account
                </h2>
                <p style={{ fontSize: 13.5, color: "#6b7280" }}>
                  Already have an account?{" "}
                  <Link to="/login" style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>

                {/* Org Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Organization Name</label>
                  <input value={form.orgName} onChange={set("orgName")} placeholder="Acme Technologies" style={inp} />
                </div>

                {/* Full Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Your Full Name</label>
                  <input value={form.fullName} onChange={set("fullName")} placeholder="Kiran Pandit" style={inp} />
                </div>

                {/* Email */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Work Email</label>
                  <input type="email" value={form.email} onChange={set("email")} placeholder="kiran@company.com" style={inp} />
                </div>

                {/* Role & Dept */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Your Role</label>
                    <select value={form.role} onChange={set("role")} style={{ ...inp, cursor: "pointer" }}>
                      {roles.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Department</label>
                    <select value={form.dept} onChange={set("dept")} style={{ ...inp, cursor: "pointer" }}>
                      {depts.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {/* Password */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={set("password")}
                      placeholder="Min. 6 characters"
                      style={{ ...inp, paddingRight: 44 }}
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)} style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1,
                    }}>
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>Confirm Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={set("confirmPassword")}
                      placeholder="Re-enter password"
                      style={{ ...inp, paddingRight: 44 }}
                    />
                    <button type="button" onClick={() => setShowConfirm(p => !p)} style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1,
                    }}>
                      {showConfirm ? "🙈" : "👁️"}
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
                    boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, minHeight: 48, transition: "opacity 0.15s",
                  }}
                >
                  {loading ? (
                    <><span style={{
                      width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "white", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.7s linear infinite",
                    }} /> Creating account...</>
                  ) : "Create Account →"}
                </button>

                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 14, textAlign: "center", lineHeight: 1.6 }}>
                  By registering you agree to our{" "}
                  <span style={{ color: "#6366f1", cursor: "pointer" }}>Terms of Service</span> and{" "}
                  <span style={{ color: "#6366f1", cursor: "pointer" }}>Privacy Policy</span>.
                </p>
              </form>
            </>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, select:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        @media (max-width: 900px) {
          div[style*="flex: 1"] { display: none !important; }
          div[style*="width: 520px"] { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
