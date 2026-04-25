import HRMSLayout from "../components/HRMSLayout";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms";
import { getDashboardData } from "../lib/hrms.server";
import { isAdminRole, avatarColor, getInitials } from "../lib/hrms.shared";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { getCompanyByOwnerId, getSaasEmployeeCount } from "../lib/company.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";

const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9"];

export function meta() {
  return [{ title: "JWithKP HRMS - Dashboard" }];
}

interface AttendanceRecord {
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
  remaining: number;
}

interface ExpenseClaim {
  id: string;
  category: string;
  description: string;
  amount: number;
  claim_date: string;
  status: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId ?? undefined;
  const env = context.cloudflare.env;

  if (isAdminRole(currentUser.role)) {
    const dashboard = await getDashboardData(env.HRMS, tenantId);
    let company = null;
    let saasEmployeeCount = 0;
    if (currentUser.email) {
      company = await getCompanyByOwnerId(env.HRMS, currentUser.email);
      if (company) {
        saasEmployeeCount = await getSaasEmployeeCount(env.HRMS, company.id);
      }
    }
    const [adminSummaryRes, pendingExpensesRes, pendingRegRes] = await Promise.all([
      callCoreHrmsApi<{
        totalEmployees: number;
        attendanceSummary: { present: number; date: string };
        pendingApprovals: number;
        assignedAssets: number;
      }>({ request, env, currentUser, path: "/api/dashboard/summary" }),
      callCoreHrmsApi<{ claims: unknown[] }>({ request, env, currentUser, path: "/api/expenses?status=pending" }),
      callCoreHrmsApi<{ regularisations: unknown[] }>({ request, env, currentUser, path: "/api/attendance/regularisations?status=pending" }),
    ]);
    return {
      currentUser, isEmployee: false,
      ...dashboard, company, saasEmployeeCount,
      adminSummary: adminSummaryRes ?? null,
      pendingExpenseCount: pendingExpensesRes?.claims?.length ?? 0,
      pendingRegCount: pendingRegRes?.regularisations?.length ?? 0,
      // employee-only fields
      todayRecord: null, leaveBalances: [], recentExpenses: [],
      pendingExpenses: 0, totalLeaveRemaining: 0,
      lastPayslip: null as { net: number; gross: number; month_key: string } | null,
      itDeclStatus: null as { status: string; financial_year: string; tax_regime: string } | null,
      prevMonthKey: "",
    };
  }

  // ── Employee dashboard data ─────────────────────────────────────────────────
  const n = new Date();
  const prevM = n.getMonth() === 0 ? 12 : n.getMonth();
  const prevY = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
  const prevMonthKey = `${prevY}-${String(prevM).padStart(2, "0")}`;

  const [attendanceData, leaveData, expenseData, payslipData, itDeclData] = await Promise.all([
    callCoreHrmsApi<{ records: AttendanceRecord[] }>({
      request, env, currentUser, path: "/api/attendance/my?limit=7",
    }),
    callCoreHrmsApi<{ balances: LeaveBalance[] }>({
      request, env, currentUser, path: "/api/leaves/balance",
    }),
    callCoreHrmsApi<{ claims: ExpenseClaim[] }>({
      request, env, currentUser, path: "/api/expenses",
    }),
    callCoreHrmsApi<{ payslip: { net: number; gross: number; month_key: string } | null }>({
      request, env, currentUser, path: `/api/payslip?monthKey=${prevMonthKey}`,
    }),
    callCoreHrmsApi<{ declarations: Array<{ status: string; financial_year: string; tax_regime: string }> }>({
      request, env, currentUser, path: "/api/it-declarations",
    }),
  ]);

  const todayIso = new Date().toISOString().split("T")[0];
  const todayRecord = attendanceData?.records?.find((r) => r.attendance_date === todayIso) ?? null;
  const leaveBalances = leaveData?.balances ?? [];
  const allExpenses = expenseData?.claims ?? [];
  const recentExpenses = allExpenses.slice(0, 3);
  const pendingExpenses = allExpenses.filter((c) => c.status === "pending").length;
  const totalLeaveRemaining = leaveBalances.reduce((sum, b) => sum + (b.remaining ?? 0), 0);
  const lastPayslip = payslipData?.payslip ?? null;
  const itDecls = itDeclData?.declarations ?? [];
  const itDeclStatus = itDecls.length > 0 ? itDecls[0] : null;

  return {
    currentUser, isEmployee: true,
    todayRecord, leaveBalances, recentExpenses, pendingExpenses, totalLeaveRemaining,
    lastPayslip, itDeclStatus, prevMonthKey,
    // admin-only fields
    stats: [], recentUsers: [], pendingInvites: [], departmentData: [],
    organization: null, company: null, saasEmployeeCount: 0,
    adminSummary: null as { totalEmployees: number; attendanceSummary: { present: number; date: string }; pendingApprovals: number; assignedAssets: number } | null,
    pendingExpenseCount: 0,
    pendingRegCount: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

const LEAVE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  "Casual Leave":    { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  "Earned Leave":    { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" },
  "Sick Leave":      { bg: "#fef3c7", color: "#d97706", border: "#fde68a" },
  "Maternity Leave": { bg: "#fdf4ff", color: "#9333ea", border: "#e9d5ff" },
  "Paternity Leave": { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
};
function leaveStyle(type: string) {
  return LEAVE_COLORS[type] ?? { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
}

const EXPENSE_STATUS: Record<string, { bg: string; color: string }> = {
  pending:     { bg: "#fef3c7", color: "#d97706" },
  approved:    { bg: "#ecfdf5", color: "#059669" },
  rejected:    { bg: "#fef2f2", color: "#dc2626" },
  reimbursed:  { bg: "#eff6ff", color: "#2563eb" },
};
function expBadge(status: string) {
  return EXPENSE_STATUS[status] ?? { bg: "#f1f5f9", color: "#475569" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────

function EmployeeDashboard({ data }: { data: ReturnType<typeof useLoaderData<typeof loader>> }) {
  const { currentUser, todayRecord, leaveBalances, recentExpenses, pendingExpenses, totalLeaveRemaining, lastPayslip, itDeclStatus, prevMonthKey } = data;
  const accentColor = avatarColor(currentUser.name);
  const initials = getInitials(currentUser.name);

  const isCheckedIn  = Boolean(todayRecord?.check_in_at);
  const isCheckedOut = Boolean(todayRecord?.check_out_at);
  const todayStatus  = isCheckedOut ? "Completed" : isCheckedIn ? "Active" : "Absent";

  return (
    <>
      {/* ── Profile Hero ─────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, #0d1117 0%, #1a1f2e 60%, #1e1b4b 100%)`,
        borderRadius: 18, padding: "28px 32px", marginBottom: 24,
        display: "flex", alignItems: "center", gap: 24,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        position: "relative", overflow: "hidden",
      }}>
        {/* subtle background glow */}
        <div style={{
          position: "absolute", top: -40, right: -40,
          width: 200, height: 200,
          background: `radial-gradient(circle, ${accentColor}33 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
          display: "grid", placeItems: "center",
          fontSize: 26, fontWeight: 800, color: "white",
          flexShrink: 0,
          boxShadow: `0 0 0 4px rgba(255,255,255,0.1), 0 4px 16px ${accentColor}66`,
        }}>
          {initials}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "white", letterSpacing: -0.5 }}>
              {currentUser.name}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px",
              borderRadius: 20, background: "rgba(99,102,241,0.25)",
              color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.35)",
              letterSpacing: 0.5, textTransform: "uppercase",
            }}>
              {currentUser.role}
            </span>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              ID: {currentUser.id.slice(0, 12).toUpperCase()}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {currentUser.department ?? "General"}
              {currentUser.designation ? ` · ${currentUser.designation}` : ""}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {currentUser.employmentType ?? "Full-time"}
            </span>
            {(currentUser.joinedOn && currentUser.joinedOn !== "Invalid Date") ? (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                Joined {currentUser.joinedOn}
              </span>
            ) : currentUser.createdAt ? (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                Joined {new Date(currentUser.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
              </span>
            ) : null}
          </div>
        </div>

        {/* Status pill */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{
            padding: "8px 18px", borderRadius: 12,
            background: isCheckedIn ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${isCheckedIn ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.25)"}`,
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>TODAY</div>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: isCheckedIn ? "#34d399" : "#f87171",
            }}>
              {isCheckedOut ? "Completed" : isCheckedIn ? "Checked In" : "Not Yet"}
            </div>
            {isCheckedIn && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                since {fmtTime(todayRecord?.check_in_at ?? null)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── IT Declaration Banner ────────────────────────────────────────── */}
      {(itDeclStatus === null || itDeclStatus.status === "draft") && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 20px", borderRadius: 12, marginBottom: 16,
          background: "#fffbeb", border: "1px solid #fde68a",
        }}>
          <div style={{ fontSize: 18, flexShrink: 0 }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>
              {itDeclStatus?.status === "draft"
                ? `IT Declaration Draft — FY ${itDeclStatus.financial_year}`
                : "IT Declaration Not Filed"}
            </div>
            <div style={{ fontSize: 12, color: "#d97706" }}>
              Submit your IT declaration to ensure correct TDS computation.
            </div>
          </div>
          <Link to="/hrms/it-declaration" style={{
            fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 8,
            background: "#d97706", color: "white", textDecoration: "none", flexShrink: 0,
          }}>
            {itDeclStatus?.status === "draft" ? "Complete & Submit" : "File Now"}
          </Link>
        </div>
      )}
      {itDeclStatus?.status === "submitted" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 20px", borderRadius: 12, marginBottom: 16,
          background: "#eff6ff", border: "1px solid #bfdbfe",
        }}>
          <div style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>
              IT Declaration Submitted — Awaiting HR Approval
            </div>
            <div style={{ fontSize: 12, color: "#3b82f6" }}>
              Your declaration for FY {itDeclStatus.financial_year} is under review.
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Stats ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {[
          {
            label: "Today's Attendance",
            value: isCheckedOut ? "Done" : isCheckedIn ? "Active" : "Pending",
            sub: isCheckedIn ? `In: ${fmtTime(todayRecord?.check_in_at ?? null)}` : "Not checked in",
            color: isCheckedIn ? "#10b981" : "#ef4444",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
            bg: isCheckedIn ? "#ecfdf5" : "#fef2f2",
            to: "/hrms/attendance",
          },
          {
            label: "Leave Available",
            value: `${totalLeaveRemaining}`,
            sub: totalLeaveRemaining > 0 ? "days remaining" : leaveBalances.length > 0 ? "days remaining" : "Contact HR to set up",
            color: "#6366f1",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
            bg: "#eef2ff",
            to: "/hrms/leave",
          },
          {
            label: "Expense Claims",
            value: `${pendingExpenses}`,
            sub: "pending review",
            color: "#f59e0b",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8H8m8 4H8m5 4H8"/></svg>,
            bg: "#fffbeb",
            to: "/hrms/expenses",
          },
          {
            label: "Last Net Pay",
            value: lastPayslip ? `₹${Math.round(lastPayslip.net / 1000)}k` : "—",
            sub: lastPayslip ? `${prevMonthKey} payslip` : "No payslip yet",
            color: "#0ea5e9",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
            bg: "#eff6ff",
            to: "/hrms/payroll",
          },
        ].map((s) => (
          <Link key={s.label} to={s.to} style={{
            background: "white", border: "1px solid #e2e8f0",
            borderRadius: 14, padding: "18px 20px",
            display: "flex", flexDirection: "column", gap: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            transition: "transform 0.15s, box-shadow 0.15s",
            textDecoration: "none", cursor: "pointer",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7 }}>
                {s.label}
              </div>
              <div style={{ color: s.color, background: s.bg, padding: 7, borderRadius: 10 }}>
                {s.icon}
              </div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color, letterSpacing: -1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{s.sub}</div>
          </Link>
        ))}
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <Link to="/hrms/attendance" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          {isCheckedIn ? (isCheckedOut ? "View Attendance" : "Check Out") : "Check In"}
        </Link>
        <Link to="/hrms/expenses" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #10b981, #059669)",
          color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M12 7v10m-4-5h8"/></svg>
          Submit Expense
        </Link>
        <Link to="/hrms/leave" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Apply Leave
        </Link>
      </div>

      {/* ── Two-column: Attendance Today + Leave Balance ──────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Attendance Card */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Today's Attendance</div>
            <Link to="/hrms/attendance" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>
              Full Log →
            </Link>
          </div>

          {/* Status indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
            borderRadius: 12, marginBottom: 20,
            background: isCheckedIn ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${isCheckedIn ? "#a7f3d0" : "#fecaca"}`,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: isCheckedIn ? "#10b981" : "#ef4444",
              display: "grid", placeItems: "center", color: "white", flexShrink: 0,
            }}>
              {isCheckedIn
                ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              }
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: isCheckedIn ? "#059669" : "#dc2626" }}>
                {isCheckedOut ? "Day Completed" : isCheckedIn ? "Currently Checked In" : "Not Checked In"}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
              </div>
            </div>
          </div>

          {/* Time grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Check-In Time", value: fmtTime(todayRecord?.check_in_at ?? null), color: "#10b981", icon: "→" },
              { label: "Check-Out Time", value: fmtTime(todayRecord?.check_out_at ?? null), color: "#6366f1", icon: "←" },
            ].map((t) => (
              <div key={t.label} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: t.value === "—" ? "#cbd5e1" : t.color, letterSpacing: -0.5 }}>{t.value}</div>
              </div>
            ))}
          </div>

          <Link to="/hrms/attendance" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px 0", borderRadius: 10,
            border: "1.5px solid #e2e8f0", color: "#475569",
            fontWeight: 600, fontSize: 13, textDecoration: "none",
            background: "#f8fafc", transition: "all 0.15s",
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            {isCheckedIn && !isCheckedOut ? "Go to Attendance to Check Out" : "View Attendance Page"}
          </Link>
        </div>

        {/* Leave Balance Card */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Leave Balance</div>
            <Link to="/hrms/leave" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>
              View All →
            </Link>
          </div>

          {leaveBalances.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>No leave balances yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Contact HR to set up your leave entitlements</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {leaveBalances.map((lb) => {
                const s = leaveStyle(lb.leave_type);
                const pct = lb.total > 0 ? Math.round((lb.remaining / lb.total) * 100) : 0;
                return (
                  <div key={lb.leave_type}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                        }}>
                          {lb.leave_type.replace(" Leave", "").toUpperCase()}
                        </span>
                        <span style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>{lb.leave_type}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>
                        {lb.remaining} <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 400 }}>/ {lb.total} days</span>
                      </span>
                    </div>
                    <div style={{ background: "#f1f5f9", borderRadius: 99, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, background: s.color, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                    </div>
                    {lb.pending > 0 && (
                      <div style={{ fontSize: 11, color: "#d97706", marginTop: 3 }}>{lb.pending} day(s) pending approval</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Expense Claims ─────────────────────────────────────────── */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Recent Expense Claims</div>
          <Link to="/hrms/expenses" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>
            View All & Submit →
          </Link>
        </div>

        {recentExpenses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#475569" }}>No expense claims yet</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, marginBottom: 16 }}>Submit your first expense claim below</div>
            <Link to="/hrms/expenses" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 10,
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "white", fontWeight: 700, fontSize: 13, textDecoration: "none",
            }}>
              Submit Expense
            </Link>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Category", "Description", "Amount", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, padding: "6px 12px", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentExpenses.map((exp) => {
                const bs = expBadge(exp.status);
                return (
                  <tr key={exp.id}>
                    <td style={{ padding: "12px", fontSize: 13, color: "#475569", borderBottom: "1px solid #f1f5f9" }}>{fmtDate(exp.claim_date)}</td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#0f172a", fontWeight: 500, borderBottom: "1px solid #f1f5f9" }}>{exp.category}</td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#475569", borderBottom: "1px solid #f1f5f9", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exp.description}</td>
                    <td style={{ padding: "12px", fontSize: 13, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #f1f5f9" }}>{fmtAmount(exp.amount)}</td>
                    <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: bs.bg, color: bs.color, textTransform: "capitalize" }}>
                        {exp.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function AdminDashboard({ data }: { data: ReturnType<typeof useLoaderData<typeof loader>> }) {
  const { company, saasEmployeeCount, adminSummary, pendingExpenseCount, pendingRegCount } = data;
  const usedCount = saasEmployeeCount ?? 0;
  const limitCount = company?.employee_limit ?? 5;
  const atLimit = usedCount >= limitCount;
  const usagePct = company ? Math.min(100, Math.round((usedCount / limitCount) * 100)) : 0;
  const accentColor = avatarColor(data.currentUser.name);
  const initials = getInitials(data.currentUser.name);

  const totalEmployees = adminSummary?.totalEmployees ?? 0;
  const presentToday = adminSummary?.attendanceSummary?.present ?? 0;
  const pendingLeaves = adminSummary?.pendingApprovals ?? 0;
  const assignedAssets = adminSummary?.assignedAssets ?? 0;

  return (
    <>
      {/* ── Admin Hero ─────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, #0d1117 0%, #1a1f2e 60%, #1e1b4b 100%)`,
        borderRadius: 18, padding: "28px 32px", marginBottom: 24,
        display: "flex", alignItems: "center", gap: 24,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -40, width: 200, height: 200,
          background: `radial-gradient(circle, ${accentColor}33 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
          display: "grid", placeItems: "center",
          fontSize: 26, fontWeight: 800, color: "white", flexShrink: 0,
          boxShadow: `0 0 0 4px rgba(255,255,255,0.1), 0 4px 16px ${accentColor}66`,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "white", letterSpacing: -0.5 }}>
              {data.currentUser.name}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: "rgba(99,102,241,0.25)", color: "#a5b4fc",
              border: "1px solid rgba(99,102,241,0.35)", letterSpacing: 0.5, textTransform: "uppercase",
            }}>
              {data.currentUser.role}
            </span>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              {data.organization?.name ?? company?.company_name ?? "Your Organisation"}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{
            padding: "8px 18px", borderRadius: 12,
            background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>TOTAL TEAM</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>{totalEmployees}</div>
          </div>
        </div>
      </div>

      {/* ── 4-column Stat Grid ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {[
          {
            label: "Total Employees", value: `${totalEmployees}`, sub: "active team members",
            color: "#6366f1", bg: "#eef2ff", to: "/hrms/employees",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
          },
          {
            label: "Present Today", value: `${presentToday}`, sub: "checked in",
            color: "#10b981", bg: "#ecfdf5", to: "/hrms/attendance",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
          },
          {
            label: "Pending Approvals", value: `${pendingLeaves + pendingExpenseCount + pendingRegCount}`,
            sub: "awaiting action", color: "#f59e0b", bg: "#fffbeb", to: "/hrms/leave",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
          },
          {
            label: "Assets Assigned", value: `${assignedAssets}`, sub: "in use",
            color: "#0ea5e9", bg: "#eff6ff", to: "/hrms/assets",
            icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
          },
        ].map((s) => (
          <Link key={s.label} to={s.to} style={{
            background: "white", border: "1px solid #e2e8f0",
            borderRadius: 14, padding: "18px 20px",
            display: "flex", flexDirection: "column", gap: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)", textDecoration: "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7 }}>
                {s.label}
              </div>
              <div style={{ color: s.color, background: s.bg, padding: 7, borderRadius: 10 }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color, letterSpacing: -1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{s.sub}</div>
          </Link>
        ))}
      </div>

      {/* ── Pending Approvals ─────────────────────────────────────────────── */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>Pending Approvals</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { label: "Leave Requests", count: pendingLeaves, color: "#6366f1", bg: "#eef2ff", to: "/hrms/leave" },
            { label: "Expense Claims", count: pendingExpenseCount, color: "#f59e0b", bg: "#fffbeb", to: "/hrms/expenses" },
            { label: "Attendance Regularisations", count: pendingRegCount, color: "#10b981", bg: "#ecfdf5", to: "/hrms/attendance" },
          ].map((item) => (
            <Link key={item.label} to={item.to} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              borderRadius: 12, background: item.bg,
              border: `1px solid ${item.color}22`, textDecoration: "none",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: item.color, color: "white",
                display: "grid", placeItems: "center",
                fontSize: 16, fontWeight: 800, flexShrink: 0,
              }}>
                {item.count}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{item.count === 0 ? "All clear" : "Awaiting action"}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Link to="/hrms/employees" style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          Invite Employee
        </Link>
        <Link to="/hrms/payroll" style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #10b981, #059669)", color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          Run Payroll
        </Link>
        <Link to="/hrms/analytics" style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(245,158,11,0.3)",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Analytics
        </Link>
        <Link to="/hrms/reports" style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 12,
          background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "white", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(14,165,233,0.3)",
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Reports
        </Link>
      </div>

      {/* ── Company Usage Bar ─────────────────────────────────────────────── */}
      {company && (
        <div style={{
          background: "white", border: atLimit ? "1px solid #fecaca" : "1px solid #e2e8f0",
          borderRadius: 14, padding: 20, marginBottom: 20,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{company.company_name}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                textTransform: "uppercase", letterSpacing: 0.5,
                background: company.plan === "free" ? "#f1f5f9" : company.plan === "pro" ? "#ede9fe" : "#dcfce7",
                color: company.plan === "free" ? "#64748b" : company.plan === "pro" ? "#7c3aed" : "#15803d",
              }}>{company.plan}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Employee Usage</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 160, height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  width: `${usagePct}%`, height: "100%", borderRadius: 99,
                  background: atLimit ? "#f97316" : usagePct > 70 ? "#f59e0b" : "#6366f1",
                  transition: "width 0.3s",
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: atLimit ? "#ea580c" : "#475569" }}>
                {usedCount} / {limitCount} employees
              </span>
            </div>
            {atLimit && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>Employee limit reached</div>}
          </div>
          {atLimit ? (
            <a href="mailto:info@jwithkp.com?subject=Upgrade HRMS Plan" style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10,
              background: "#2563eb", color: "white", fontWeight: 700, fontSize: 13, textDecoration: "none",
            }}>Upgrade Plan</a>
          ) : (
            <Link to="/hrms/employees" style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10,
              background: "#6366f1", color: "white", fontWeight: 700, fontSize: 13, textDecoration: "none",
            }}>Manage Employees</Link>
          )}
        </div>
      )}

      {/* ── Two-column: Team Snapshot + Pending Invites ───────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Team Snapshot</div>
            <Link to="/hrms/employees" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>Manage →</Link>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Role", "Joined", "Status"].map((h) => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recentUsers.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: "16px 10px", fontSize: 13, color: "#94a3b8" }}>No users found yet.</td></tr>
              ) : (
                data.recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>
                      <Link to={`/hrms/employee/${user.id}`} style={{ textDecoration: "none" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{user.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{user.department}</div>
                      </Link>
                    </td>
                    <td style={{ padding: "10px", fontSize: 12, color: "#475569", borderBottom: "1px solid #f1f5f9" }}>{user.role}</td>
                    <td style={{ padding: "10px", fontSize: 12, color: "#475569", borderBottom: "1px solid #f1f5f9" }}>{user.joinedOn}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                        background: user.status === "Active" ? "#ecfdf5" : "#fef3c7",
                        color: user.status === "Active" ? "#059669" : "#d97706",
                      }}>{user.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Pending Invites</div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: data.pendingInvites.length > 0 ? "#fef2f2" : "#ecfdf5",
              color: data.pendingInvites.length > 0 ? "#dc2626" : "#059669",
            }}>{data.pendingInvites.length} pending</span>
          </div>
          {data.pendingInvites.length === 0 ? (
            <div style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0" }}>No outstanding invites.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.pendingInvites.map((invite) => (
                <div key={invite.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 0", borderBottom: "1px solid #f1f5f9",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{invite.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{invite.role} · {invite.department}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{invite.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Workforce by Department ───────────────────────────────────────── */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 20 }}>Workforce by Department</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.departmentData.length === 0 ? (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Department breakdown will appear once users are added.</div>
          ) : (
            data.departmentData.map((item, index) => (
              <div key={item.department} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 140, fontSize: 13, fontWeight: 500, color: "#475569" }}>{item.department}</div>
                <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 99, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${item.percent}%`, background: colors[index % colors.length], height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                </div>
                <div style={{ width: 60, fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{item.count}</div>
                <div style={{ width: 44, fontSize: 12, color: "#94a3b8" }}>{item.percent}%</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────

export default function HRMSDashboard() {
  const data = useLoaderData<typeof loader>();

  return (
    <HRMSLayout currentUser={data.currentUser}>
      {data.isEmployee
        ? <EmployeeDashboard data={data} />
        : <AdminDashboard data={data} />
      }
    </HRMSLayout>
  );
}
