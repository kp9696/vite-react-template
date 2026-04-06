import HRMSLayout from "../components/HRMSLayout";
import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  dept: string;
  status: "Active" | "Invited" | "Pending";
  joinedOn: string;
}

const existingUsers: User[] = [
  { id: "USR001", name: "Deepa Krishnan", email: "deepa@jwithkp.in", role: "HR Admin", dept: "Engineering", status: "Active", joinedOn: "Jan 2025" },
  { id: "USR002", name: "Aarav Shah", email: "aarav@jwithkp.in", role: "Employee", dept: "Engineering", status: "Active", joinedOn: "Apr 2025" },
  { id: "USR003", name: "Priya Nair", email: "priya@jwithkp.in", role: "Manager", dept: "Design", status: "Active", joinedOn: "Mar 2025" },
  { id: "USR004", name: "Rohan Mehta", email: "rohan@jwithkp.in", role: "Employee", dept: "Analytics", status: "Invited", joinedOn: "Mar 2025" },
  { id: "USR005", name: "Sneha Pillai", email: "sneha@jwithkp.in", role: "HR Manager", dept: "People Ops", status: "Active", joinedOn: "Feb 2025" },
];

const roles = ["Employee", "Manager", "HR Manager", "HR Admin", "Finance", "Payroll Manager"];
const depts = ["Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance", "Operations"];

export function meta() {
  return [{ title: "JWithKP HRMS · User Management" }];
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>(existingUsers);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Employee",
    dept: "Engineering",
  });

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;

    setSending(true);
    try {
      const res = await fetch("/api/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          dept: form.dept,
        }),
      });

      const data = await res.json() as { success: boolean; error?: string };

      if (data.success) {
        const newUser: User = {
          id: `USR${String(users.length + 1).padStart(3, "0")}`,
          name: form.name,
          email: form.email,
          role: form.role,
          dept: form.dept,
          status: "Invited",
          joinedOn: new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
        };
        setUsers(prev => [newUser, ...prev]);
        setForm({ name: "", email: "", role: "Employee", dept: "Engineering" });
        setShowForm(false);
        showToast(`Invite sent to ${form.email} ✓`, "success");
      } else {
        showToast(data.error || "Failed to send invite", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSending(false);
    }
  };

  const resendInvite = async (user: User) => {
    setSending(true);
    try {
      const res = await fetch("/api/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: user.name, email: user.email, role: user.role, dept: user.dept }),
      });
      const data = await res.json() as { success: boolean };
      if (data.success) showToast(`Invite resent to ${user.email}`, "success");
      else showToast("Failed to resend invite", "error");
    } catch {
      showToast("Network error.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <HRMSLayout>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.type === "success" ? "var(--green)" : "var(--red)",
          color: "white", padding: "12px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", gap: 8,
          animation: "slideIn 0.3s ease",
        }}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">User Management</div>
          <div className="page-sub">Invite employees and manage their access to JWithKP HRMS.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ Invite User"}
        </button>
      </div>

      {/* Invite Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Send Invitation Email</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Full Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Kiran Pandit"
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Work Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="kiran@company.com"
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}
              >
                {roles.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Department</label>
              <select
                value={form.dept}
                onChange={e => setForm(f => ({ ...f, dept: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}
              >
                {depts.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Email preview */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Email Preview</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
              <strong>To:</strong> {form.email || "employee@company.com"}<br />
              <strong>Subject:</strong> You're invited to JWithKP HRMS 🎉<br /><br />
              Hi <strong>{form.name || "Team Member"}</strong>,<br />
              You've been invited to join <strong>JWithKP HRMS</strong> as <strong>{form.role}</strong> in <strong>{form.dept}</strong>.<br />
              Click the link below to set up your account and get started.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={handleInvite}
              disabled={sending || !form.name || !form.email}
              style={{ opacity: sending || !form.name || !form.email ? 0.6 : 1 }}
            >
              {sending ? "Sending..." : "📧 Send Invite"}
            </button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: "Total Users", value: users.length, color: "var(--accent)" },
          { label: "Active", value: users.filter(u => u.status === "Active").length, color: "var(--green)" },
          { label: "Invited (Pending)", value: users.filter(u => u.status === "Invited").length, color: "var(--amber)" },
          { label: "Admins", value: users.filter(u => u.role.includes("Admin")).length, color: "var(--red)" },
        ].map(s => (
          <div className="stat-card" key={s.label} style={{ borderLeft: `4px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 28 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-title">All Users</div>
        <table className="table">
          <thead>
            <tr><th>User</th><th>Email</th><th>Role</th><th>Department</th><th>Since</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: u.status === "Active" ? "var(--accent-light)" : "var(--amber-light)",
                      color: u.status === "Active" ? "var(--accent)" : "var(--amber)",
                      display: "grid", placeItems: "center",
                      fontWeight: 700, fontSize: 12, flexShrink: 0,
                    }}>
                      {u.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{u.id}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13 }}>{u.email}</td>
                <td style={{ fontSize: 13 }}>{u.role}</td>
                <td style={{ fontSize: 13 }}>{u.dept}</td>
                <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{u.joinedOn}</td>
                <td>
                  <span className={`badge ${u.status === "Active" ? "badge-green" : "badge-amber"}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {u.status === "Invited" && (
                      <button
                        className="btn btn-outline"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => resendInvite(u)}
                        disabled={sending}
                      >
                        Resend
                      </button>
                    )}
                    <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}>Edit</button>
                    {u.status === "Active" && (
                      <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11, color: "var(--red)", borderColor: "var(--red)" }}>
                        Revoke
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(40px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </HRMSLayout>
  );
}
