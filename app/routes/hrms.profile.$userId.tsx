import { useState } from "react";
import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.profile.$userId";
import HRMSLayout from "../components/HRMSLayout";
import { getUserById, updateUserDetails } from "../lib/hrms.server";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { isAdminRole, avatarColor, getInitials } from "../lib/hrms.shared";

// ── Types ──────────────────────────────────────────────────────────────────────
interface AttendanceRow {
  id: string;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
}
interface LeaveBalance {
  leave_type: string;
  total: number;
  used: number;
  pending: number;
}
interface LeaveRow {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: string;
  created_at: string;
}
interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  claim_date: string;
  status: string;
  has_receipt: number;
}

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

export function meta({ data }: { data?: { employee?: { name: string } } }) {
  return [{ title: `${data?.employee?.name ?? "Employee"} — JWithKP HRMS` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  if (!isAdminRole(currentUser.role)) throw redirect("/hrms");

  const { userId } = params as { userId: string };
  const db = context.cloudflare.env.HRMS;
  const orgId = currentUser.companyId;
  if (!orgId) throw redirect("/hrms");

  const employee = await getUserById(db, userId);
  if (!employee || employee.companyId !== orgId) throw redirect("/hrms/employees");

  const [attendanceRes, leaveBalancesRes, leavesRes, expensesRes] = await Promise.all([
    db.prepare(`SELECT id, attendance_date, check_in_at, check_out_at, status FROM attendance WHERE user_id = ? AND org_id = ? ORDER BY attendance_date DESC LIMIT 60`)
      .bind(userId, orgId).all<AttendanceRow>(),
    db.prepare(`SELECT leave_type, total, used, pending FROM leave_balances WHERE user_id = ? AND org_id = ? ORDER BY leave_type`)
      .bind(userId, orgId).all<LeaveBalance>(),
    db.prepare(`SELECT id, leave_type, start_date, end_date, total_days, reason, status, created_at FROM leaves WHERE user_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT 30`)
      .bind(userId, orgId).all<LeaveRow>(),
    db.prepare(`SELECT id, category, description, amount, claim_date, status, has_receipt FROM expense_claims WHERE user_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT 30`)
      .bind(userId, orgId).all<ExpenseRow>(),
  ]);

  return {
    currentUser,
    employee,
    attendance: attendanceRes.results ?? [],
    leaveBalances: leaveBalancesRes.results ?? [],
    leaves: leavesRes.results ?? [],
    expenses: expensesRes.results ?? [],
  };
}

export async function action({ request, context, params }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  if (!isAdminRole(currentUser.role)) return { ok: false, type: "error", message: "Unauthorized." };

  const { userId } = params as { userId: string };
  const tenantId = currentUser.companyId;
  if (!tenantId) return { ok: false, type: "error", message: "No organization found." };

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const db = context.cloudflare.env.HRMS;

  try {
    if (intent === "edit-profile") {
      await updateUserDetails(db, userId, tenantId, {
        name:           String(formData.get("name") || "").trim() || undefined,
        role:           String(formData.get("role") || "").trim() || undefined,
        department:     String(formData.get("department") || "").trim() || undefined,
        designation:    String(formData.get("designation") || "").trim() || undefined,
        phone:          String(formData.get("phone") || "").trim() || undefined,
        gender:         String(formData.get("gender") || "").trim() || undefined,
        dob:            String(formData.get("dob") || "").trim() || undefined,
        employmentType: String(formData.get("employmentType") || "").trim() || undefined,
        joinedOn:       String(formData.get("joinedOn") || "").trim() || undefined,
      });
      return { ok: true, type: "success", message: "Profile updated successfully." };
    }
    return { ok: false, type: "error", message: "Unknown action." };
  } catch (err) {
    return { ok: false, type: "error", message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0",
  borderRadius: 8, fontSize: 13, background: "white", fontFamily: "inherit",
  color: "#0f172a", outline: "none", boxSizing: "border-box",
};
const selectSt: React.CSSProperties = { ...inputSt, cursor: "pointer" };

const roles = ["Employee", "Manager", "HR Manager", "HR Admin", "Finance", "Payroll Manager"];
const departments = ["Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance", "Operations", "General"];
const genders = ["Male", "Female", "Other", "Prefer not to say"];
const employmentTypes = ["Full-time", "Part-time", "Contract", "Intern", "Consultant"];

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { bg: string; color: string }> }) {
  const s = map[status.toLowerCase()] ?? { bg: "#f1f5f9", color: "#64748b" };
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color }}>{status}</span>;
}

const attendanceStatusMap: Record<string, { bg: string; color: string }> = {
  present: { bg: "#ecfdf5", color: "#059669" },
  absent:  { bg: "#fef2f2", color: "#dc2626" },
  late:    { bg: "#fffbeb", color: "#d97706" },
  half:    { bg: "#f0f9ff", color: "#0284c7" },
};
const leaveStatusMap: Record<string, { bg: string; color: string }> = {
  approved: { bg: "#ecfdf5", color: "#059669" },
  pending:  { bg: "#fffbeb", color: "#d97706" },
  rejected: { bg: "#fef2f2", color: "#dc2626" },
};
const expenseStatusMap: Record<string, { bg: string; color: string }> = {
  approved: { bg: "#ecfdf5", color: "#059669" },
  pending:  { bg: "#fffbeb", color: "#d97706" },
  rejected: { bg: "#fef2f2", color: "#dc2626" },
};

function formatTime(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
}
function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}
function calcHours(inAt: string | null, outAt: string | null) {
  if (!inAt || !outAt) return "—";
  try {
    const diff = (new Date(outAt).getTime() - new Date(inAt).getTime()) / 3600000;
    return `${diff.toFixed(1)}h`;
  } catch { return "—"; }
}

// ── Profile Tab ────────────────────────────────────────────────────────────────
function ProfileTab({ employee, fetcher }: { employee: ReturnType<typeof useLoaderData<typeof loader>>["employee"]; fetcher: ReturnType<typeof useFetcher> }) {
  const [editing, setEditing] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const submitting = fetcher.state !== "idle";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Profile Information</div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569", fontFamily: "inherit" }}>
            ✏️ Edit
          </button>
        )}
      </div>

      {editing ? (
        <fetcher.Form method="post" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="intent" value="edit-profile" />
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} /> Personal <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <FL label="Full Name"><input name="name" defaultValue={employee.name} style={inputSt} required /></FL>
              <FL label="Mobile Phone"><input name="phone" type="tel" defaultValue={employee.phone ?? ""} style={inputSt} /></FL>
              <FL label="Date of Birth"><input name="dob" type="date" defaultValue={employee.dob ?? ""} max={today} style={inputSt} /></FL>
              <FL label="Gender">
                <select name="gender" defaultValue={employee.gender ?? ""} style={selectSt}>
                  <option value="">Select gender</option>
                  {genders.map((g) => <option key={g}>{g}</option>)}
                </select>
              </FL>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} /> Work <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FL label="Role">
                <select name="role" defaultValue={employee.role} style={selectSt}>
                  {roles.map((r) => <option key={r}>{r}</option>)}
                </select>
              </FL>
              <FL label="Department">
                <select name="department" defaultValue={employee.department} style={selectSt}>
                  {departments.map((d) => <option key={d}>{d}</option>)}
                </select>
              </FL>
              <FL label="Designation"><input name="designation" defaultValue={employee.designation ?? ""} style={inputSt} /></FL>
              <FL label="Employment Type">
                <select name="employmentType" defaultValue={employee.employmentType ?? "Full-time"} style={selectSt}>
                  {employmentTypes.map((t) => <option key={t}>{t}</option>)}
                </select>
              </FL>
              <FL label="Date of Joining"><input name="joinedOn" type="date" defaultValue={employee.joinedOn ?? ""} max={today} style={inputSt} /></FL>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setEditing(false)} style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </fetcher.Form>
      ) : (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} /> Personal <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {[
                { label: "Email", value: employee.email },
                { label: "Phone", value: employee.phone ?? "—" },
                { label: "Gender", value: employee.gender ?? "—" },
                { label: "Date of Birth", value: employee.dob ? formatDate(employee.dob) : "—" },
                { label: "Employee ID", value: employee.id },
                { label: "Status", value: employee.status },
              ].map((f) => (
                <div key={f.label} style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} /> Work <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {[
                { label: "Role", value: employee.role },
                { label: "Department", value: employee.department },
                { label: "Designation", value: employee.designation ?? "—" },
                { label: "Employment Type", value: employee.employmentType ?? "Full-time" },
                { label: "Date of Joining", value: employee.joinedOn ? formatDate(employee.joinedOn) : "—" },
                { label: "Organisation", value: employee.organizationName ?? "—" },
              ].map((f) => (
                <div key={f.label} style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attendance Tab ─────────────────────────────────────────────────────────────
function AttendanceTab({ attendance }: { attendance: AttendanceRow[] }) {
  const presentDays = attendance.filter((a) => a.status === "present").length;
  const absentDays  = attendance.filter((a) => a.status === "absent").length;
  const lateDays    = attendance.filter((a) => a.status === "late").length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Present", value: presentDays, color: "#10b981" },
          { label: "Absent", value: absentDays, color: "#ef4444" },
          { label: "Late", value: lateDays, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "14px 16px", background: "white", border: "1px solid #e2e8f0", borderRadius: 12, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {attendance.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#475569" }}>No attendance records yet</div>
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                {["Date", "Check In", "Check Out", "Hours", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, padding: "10px 14px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{formatDate(a.attendance_date)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{formatTime(a.check_in_at)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{formatTime(a.check_out_at)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{calcHours(a.check_in_at, a.check_out_at)}</td>
                  <td style={{ padding: "12px 14px" }}><StatusBadge status={a.status} map={attendanceStatusMap} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Leave Tab ──────────────────────────────────────────────────────────────────
function LeaveTab({ leaveBalances, leaves }: { leaveBalances: LeaveBalance[]; leaves: LeaveRow[] }) {
  return (
    <div>
      {/* Balances */}
      {leaveBalances.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Leave Balances</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
            {leaveBalances.map((b) => {
              const remaining = b.total - b.used - b.pending;
              const pct = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0;
              return (
                <div key={b.leave_type} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{b.leave_type}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1", marginBottom: 4 }}>{remaining}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>of {b.total} remaining</div>
                  <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "#6366f1", borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      {leaves.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌴</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#475569" }}>No leave records</div>
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6 }}>Leave History</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                {["Type", "From", "To", "Days", "Reason", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, padding: "10px 14px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{l.leave_type}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{formatDate(l.start_date)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{formatDate(l.end_date)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{l.total_days}d</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.reason}</td>
                  <td style={{ padding: "12px 14px" }}><StatusBadge status={l.status} map={leaveStatusMap} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Expenses Tab ───────────────────────────────────────────────────────────────
function ExpensesTab({ expenses }: { expenses: ExpenseRow[] }) {
  const total    = expenses.reduce((s, e) => s + e.amount, 0);
  const approved = expenses.filter((e) => e.status === "approved").reduce((s, e) => s + e.amount, 0);
  const pending  = expenses.filter((e) => e.status === "pending").reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Claimed", value: `₹${total.toLocaleString("en-IN")}`, color: "#6366f1" },
          { label: "Approved", value: `₹${approved.toLocaleString("en-IN")}`, color: "#10b981" },
          { label: "Pending", value: `₹${pending.toLocaleString("en-IN")}`, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "14px 16px", background: "white", border: "1px solid #e2e8f0", borderRadius: 12, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {expenses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#475569" }}>No expense claims</div>
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                {["Category", "Description", "Amount", "Date", "Receipt", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, padding: "10px 14px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{e.category}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>₹{e.amount.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{formatDate(e.claim_date)}</td>
                  <td style={{ padding: "12px 14px" }}>
                    {e.has_receipt ? <span style={{ color: "#059669", fontSize: 12, fontWeight: 600 }}>✓ Yes</span> : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}><StatusBadge status={e.status} map={expenseStatusMap} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function EmployeeProfile() {
  const { currentUser, employee, attendance, leaveBalances, leaves, expenses } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [tab, setTab] = useState<"profile" | "attendance" | "leave" | "expenses">("profile");
  const [toast, setToast] = useState<ActionResult | null>(null);

  const color = avatarColor(employee.name);
  const initials = getInitials(employee.name);
  const isAdmin = isAdminRole(employee.role);

  // Show toast on save
  if (fetcher.data && fetcher.data !== toast) {
    setToast(fetcher.data);
    setTimeout(() => setToast(null), 4000);
  }

  const tabs = [
    { key: "profile",    label: "👤 Profile" },
    { key: "attendance", label: "📅 Attendance" },
    { key: "leave",      label: "🌴 Leave" },
    { key: "expenses",   label: "🧾 Expenses" },
  ] as const;

  return (
    <HRMSLayout currentUser={currentUser}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", minWidth: 240, background: toast.type === "success" ? "#f0fdf4" : "#fef2f2", color: toast.type === "success" ? "#15803d" : "#dc2626", border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fecaca"}` }}>
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}

      {/* Back breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/hrms/employees" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
          Back to Employees
        </Link>
      </div>

      {/* Profile hero */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", borderRadius: 18, padding: "28px 32px", marginBottom: 24, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: color, display: "grid", placeItems: "center", fontSize: 24, fontWeight: 800, color: "white", flexShrink: 0, border: "3px solid rgba(255,255,255,0.15)" }}>{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "white", letterSpacing: -0.4 }}>{employee.name}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{employee.designation ?? employee.role} · {employee.department}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: isAdmin ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.2)", color: isAdmin ? "#fca5a5" : "#a5b4fc" }}>{employee.role}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: employee.status === "Active" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: employee.status === "Active" ? "#6ee7b7" : "#fcd34d" }}>{employee.status}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{employee.id}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Email</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{employee.email}</div>
          {employee.phone && <>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, marginBottom: 4 }}>Phone</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{employee.phone}</div>
          </>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0", paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ padding: "9px 18px", borderRadius: "8px 8px 0 0", border: "none", background: tab === t.key ? "white" : "transparent", color: tab === t.key ? "#6366f1" : "#64748b", fontSize: 13, fontWeight: tab === t.key ? 700 : 500, cursor: "pointer", fontFamily: "inherit", borderBottom: tab === t.key ? "2px solid #6366f1" : "2px solid transparent", marginBottom: -2, transition: "all 0.15s" }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24 }}>
        {tab === "profile"    && <ProfileTab employee={employee} fetcher={fetcher} />}
        {tab === "attendance" && <AttendanceTab attendance={attendance} />}
        {tab === "leave"      && <LeaveTab leaveBalances={leaveBalances} leaves={leaves} />}
        {tab === "expenses"   && <ExpensesTab expenses={expenses} />}
      </div>
    </HRMSLayout>
  );
}
