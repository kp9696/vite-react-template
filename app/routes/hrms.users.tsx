import { useEffect, useState } from "react";
import {
  useFetcher,
  useLoaderData,
} from "react-router";
import type { Route } from "./+types/hrms.users";
import HRMSLayout from "../components/HRMSLayout";
import {
  createOrUpdateInvitedUser,
  listUsers,
} from "../lib/hrms.server";
import { sendInviteEmail } from "../lib/invite-email.server";

const roles = ["Employee", "Manager", "HR Manager", "HR Admin", "Finance", "Payroll Manager"];
const departments = ["Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance", "Operations"];

type ActionResult = {
  ok: boolean;
  message: string;
  type: "success" | "error";
};

export function meta() {
  return [{ title: "JWithKP HRMS - User Management" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const users = await listUsers(context.cloudflare.env.HRMS);
  return { users };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const db = context.cloudflare.env.HRMS;

  try {
    if (intent === "invite") {
      const payload = {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        role: String(formData.get("role") || "Employee"),
        department: String(formData.get("department") || "Engineering"),
      };

      if (!payload.name || !payload.email) {
        return { ok: false, type: "error", message: "Name and work email are required." };
      }

      const user = await createOrUpdateInvitedUser(db, payload);
      const mailResult = await sendInviteEmail(context.cloudflare.env, db, user.id, payload, request.url);

      return {
        ok: true,
        type: mailResult.delivered ? "success" : "error",
        message: mailResult.delivered
          ? mailResult.message
          : `${mailResult.message} The user record is still saved in D1.`,
      };
    }

    if (intent === "resend") {
      const payload = {
        userId: String(formData.get("userId") || ""),
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        role: String(formData.get("role") || "Employee"),
        department: String(formData.get("department") || "Engineering"),
      };

      if (!payload.userId || !payload.email) {
        return { ok: false, type: "error", message: "User details were incomplete for resend." };
      }

      const mailResult = await sendInviteEmail(
        context.cloudflare.env,
        db,
        payload.userId,
        {
          name: payload.name,
          email: payload.email,
          role: payload.role,
          department: payload.department,
        },
        request.url,
      );

      return {
        ok: mailResult.delivered,
        type: mailResult.delivered ? "success" : "error",
        message: mailResult.message,
      };
    }

    return { ok: false, type: "error", message: "Unsupported action." };
  } catch (error) {
    return {
      ok: false,
      type: "error",
      message: error instanceof Error ? error.message : "Something went wrong while processing the request.",
    };
  }
}

export default function AdminUsers() {
  const { users } = useLoaderData<typeof loader>();
  const inviteFetcher = useFetcher<ActionResult>();
  const resendFetcher = useFetcher<ActionResult>();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Employee",
    department: "Engineering",
  });

  useEffect(() => {
    if (inviteFetcher.data) {
      setToast(inviteFetcher.data);
      if (inviteFetcher.data.ok) {
        setForm({ name: "", email: "", role: "Employee", department: "Engineering" });
        setShowForm(false);
      }
    }
  }, [inviteFetcher.data]);

  useEffect(() => {
    if (resendFetcher.data) {
      setToast(resendFetcher.data);
    }
  }, [resendFetcher.data]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const sendingInvite = inviteFetcher.state !== "idle";
  const sendingResend = resendFetcher.state !== "idle";

  return (
    <HRMSLayout>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: toast.type === "success" ? "var(--green)" : "var(--red)",
          color: "white", padding: "12px 20px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", gap: 8,
          animation: "slideIn 0.3s ease",
        }}>
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">User Management</div>
          <div className="page-sub">Invite employees and manage their access with D1-backed records.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ Invite User"}
        </button>
      </div>

      {showForm && (
        <inviteFetcher.Form method="post" className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <input type="hidden" name="intent" value="invite" />
          <div className="card-title">Send Invitation Email</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Full Name *</label>
              <input
                name="name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Kiran Pandit"
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Work Email *</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="kiran@company.com"
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Role</label>
              <select
                name="role"
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}
              >
                {roles.map((role) => <option key={role}>{role}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Department</label>
              <select
                name="department"
                value={form.department}
                onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}
              >
                {departments.map((department) => <option key={department}>{department}</option>)}
              </select>
            </div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Email Preview</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
              <strong>To:</strong> {form.email || "employee@company.com"}<br />
              <strong>Subject:</strong> You're invited to JWithKP HRMS<br /><br />
              Hi <strong>{form.name || "Team Member"}</strong>,<br />
              You've been invited to join <strong>JWithKP HRMS</strong> as <strong>{form.role}</strong> in <strong>{form.department}</strong>.<br />
              The record will be stored in D1 and the invite email will be sent if Gmail variables are configured.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sendingInvite || !form.name || !form.email}
              style={{ opacity: sendingInvite || !form.name || !form.email ? 0.6 : 1 }}
            >
              {sendingInvite ? "Sending..." : "Send Invite"}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </inviteFetcher.Form>
      )}

      <div className="stat-grid">
        {[
          { label: "Total Users", value: users.length, color: "var(--accent)" },
          { label: "Active", value: users.filter((user) => user.status === "Active").length, color: "var(--green)" },
          { label: "Invited", value: users.filter((user) => user.status === "Invited").length, color: "var(--amber)" },
          { label: "Admins", value: users.filter((user) => user.role.includes("Admin")).length, color: "var(--red)" },
        ].map((stat) => (
          <div className="stat-card" key={stat.label} style={{ borderLeft: `4px solid ${stat.color}` }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ color: stat.color, fontSize: 28 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">All Users</div>
        <table className="table">
          <thead>
            <tr><th>User</th><th>Email</th><th>Role</th><th>Department</th><th>Since</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--ink-3)" }}>No users have been inserted into D1 yet.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: user.status === "Active" ? "var(--accent-light)" : "var(--amber-light)",
                        color: user.status === "Active" ? "var(--accent)" : "var(--amber)",
                        display: "grid", placeItems: "center",
                        fontWeight: 700, fontSize: 12, flexShrink: 0,
                      }}>
                        {user.name.split(" ").map((name) => name[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{user.name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{user.email}</td>
                  <td style={{ fontSize: 13 }}>{user.role}</td>
                  <td style={{ fontSize: 13 }}>{user.department}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{user.joinedOn}</td>
                  <td>
                    <span className={`badge ${user.status === "Active" ? "badge-green" : "badge-amber"}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {user.status === "Invited" && (
                        <resendFetcher.Form method="post">
                          <input type="hidden" name="intent" value="resend" />
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="name" value={user.name} />
                          <input type="hidden" name="email" value={user.email} />
                          <input type="hidden" name="role" value={user.role} />
                          <input type="hidden" name="department" value={user.department} />
                          <button
                            type="submit"
                            className="btn btn-outline"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            disabled={sendingResend}
                          >
                            Resend
                          </button>
                        </resendFetcher.Form>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
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
