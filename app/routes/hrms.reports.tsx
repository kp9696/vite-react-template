import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.reports";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";
import { redirect } from "react-router";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportTab = "payroll" | "attendance" | "leave" | "headcount";

const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function toMonthLabel(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function currentYear() { return String(new Date().getFullYear()); }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch { return iso; }
}

// ── CSV download helper ───────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Reports" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  if (!isAdminRole(currentUser.role)) throw redirect("/hrms");

  const url = new URL(request.url);
  const tab = (url.searchParams.get("tab") ?? "payroll") as ReportTab;
  const month = url.searchParams.get("month") ?? currentMonthKey();
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const year = url.searchParams.get("year") ?? currentYear();

  const [payrollRes, attendanceRes, leaveRes, headcountRes] = await Promise.all([
    tab === "payroll"
      ? callCoreHrmsApi<{ rows: unknown[]; totals: Record<string, unknown> }>({
          request, env: context.cloudflare.env, currentUser,
          path: `/api/reports/payroll?month=${month}`,
        })
      : Promise.resolve(null),

    tab === "attendance"
      ? callCoreHrmsApi<{ rows: unknown[]; summary: Record<string, unknown> }>({
          request, env: context.cloudflare.env, currentUser,
          path: `/api/reports/attendance?from=${from}&to=${to}`,
        })
      : Promise.resolve(null),

    tab === "leave"
      ? callCoreHrmsApi<{ rows: unknown[]; typeBreakdown: Record<string, unknown>; year: number }>({
          request, env: context.cloudflare.env, currentUser,
          path: `/api/reports/leave?year=${year}`,
        })
      : Promise.resolve(null),

    tab === "headcount"
      ? callCoreHrmsApi<{ rows: unknown[]; byDept: Record<string, number>; byStatus: Record<string, number>; byType: Record<string, number>; total: number }>({
          request, env: context.cloudflare.env, currentUser,
          path: "/api/reports/headcount",
        })
      : Promise.resolve(null),
  ]);

  return { currentUser, tab, month, from, to, year, payrollRes, attendanceRes, leaveRes, headcountRes };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { currentUser, tab: initTab, month: initMonth, from: initFrom, to: initTo, year: initYear,
    payrollRes, attendanceRes, leaveRes, headcountRes } = useLoaderData<typeof loader>();

  const fetcher = useFetcher();
  const [tab, setTab] = useState<ReportTab>(initTab);

  // Local filter state
  const [month, setMonth] = useState(initMonth);
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [year, setYear] = useState(initYear);

  // Navigate to reload data when filters change
  function applyFilter() {
    const params = new URLSearchParams({ tab });
    if (tab === "payroll" && month) params.set("month", month);
    if (tab === "attendance") { if (from) params.set("from", from); if (to) params.set("to", to); }
    if (tab === "leave" && year) params.set("year", year);
    window.location.href = `/hrms/reports?${params.toString()}`;
  }

  function switchTab(t: ReportTab) {
    setTab(t);
    window.location.href = `/hrms/reports?tab=${t}`;
  }

  // ── Payroll data ──
  const payrollRows = (payrollRes?.rows ?? []) as Array<{
    employee_name: string; department: string; basic: number; hra: number; conveyance: number;
    pf: number; esi: number; tds: number; pt: number; gross: number; deductions: number; net: number;
    status: string; month_key: string;
  }>;
  const payrollTotals = (payrollRes?.totals ?? {}) as Record<string, { gross: number; deductions: number; net: number; count: number }>;

  // ── Attendance data ──
  const attRows = (attendanceRes?.rows ?? []) as Array<{
    employee_name: string; department: string; attendance_date: string;
    status: string; check_in: string | null; check_out: string | null; hours_worked: number | null;
  }>;
  const attSummary = (attendanceRes?.summary ?? {}) as Record<string, { present: number; absent: number; half_day: number; late: number; wfh: number; total_hours: number }>;

  // ── Leave data ──
  const leaveRows = (leaveRes?.rows ?? []) as Array<{
    employee_name: string; department: string; leave_type: string; status: string;
    start_date: string; end_date: string; days: number; reason: string | null; applied_at: string;
  }>;
  const typeBreakdown = (leaveRes?.typeBreakdown ?? {}) as Record<string, { approved: number; pending: number; rejected: number; days: number }>;

  // ── Headcount data ──
  const hcByDept = (headcountRes?.byDept ?? {}) as Record<string, number>;
  const hcByStatus = (headcountRes?.byStatus ?? {}) as Record<string, number>;
  const hcByType = (headcountRes?.byType ?? {}) as Record<string, number>;
  const hcTotal = headcountRes?.total ?? 0;

  // ── Export handlers ──
  function exportPayroll() {
    const header = ["Month", "Employee", "Department", "Basic", "HRA", "Conveyance", "Gross", "PF", "ESI", "TDS", "PT", "Deductions", "Net", "Status"];
    const rows = payrollRows.map(r => [
      toMonthLabel(r.month_key), r.employee_name, r.department,
      r.basic, r.hra, r.conveyance, r.gross, r.pf, r.esi, r.tds, r.pt, r.deductions, r.net, r.status,
    ]);
    downloadCSV(`payroll-${month}.csv`, [header, ...rows] as string[][]);
  }

  function exportAttendance() {
    const header = ["Employee", "Department", "Date", "Status", "Check In", "Check Out", "Hours"];
    const rows = attRows.map(r => [
      r.employee_name, r.department, r.attendance_date, r.status,
      r.check_in ?? "", r.check_out ?? "", r.hours_worked != null ? r.hours_worked.toFixed(2) : "",
    ]);
    downloadCSV(`attendance-${from || "all"}-to-${to || "all"}.csv`, [header, ...rows] as string[][]);
  }

  function exportLeave() {
    const header = ["Employee", "Department", "Leave Type", "Status", "Start", "End", "Days", "Reason"];
    const rows = leaveRows.map(r => [
      r.employee_name, r.department, r.leave_type, r.status,
      r.start_date, r.end_date, r.days, r.reason ?? "",
    ]);
    downloadCSV(`leave-report-${year}.csv`, [header, ...rows] as string[][]);
  }

  function exportHeadcount() {
    const header = ["Category", "Value", "Count"];
    const rows = [
      ...Object.entries(hcByDept).map(([d, c]) => ["Department", d, c]),
      ...Object.entries(hcByStatus).map(([s, c]) => ["Status", s, c]),
      ...Object.entries(hcByType).map(([t, c]) => ["Employment Type", t, c]),
    ];
    downloadCSV("headcount-report.csv", [header, ...rows] as string[][]);
  }

  const TABS: { key: ReportTab; label: string }[] = [
    { key: "payroll", label: "Payroll" },
    { key: "attendance", label: "Attendance" },
    { key: "leave", label: "Leave" },
    { key: "headcount", label: "Headcount" },
  ];

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Reports</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
            Export and analyse payroll, attendance, leave, and headcount data.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e5e7eb", marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)} style={{
              padding: "8px 20px", border: "none",
              borderBottom: tab === t.key ? "2px solid #4f46e5" : "2px solid transparent",
              background: "none", cursor: "pointer",
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "#4f46e5" : "#6b7280",
              fontSize: 14, marginBottom: -2, transition: "all 0.15s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PAYROLL ── */}
        {tab === "payroll" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Filter bar */}
            <div style={filterBar}>
              <label style={filterLabel}>
                <span style={labelTxt}>Month</span>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={filterInp} />
              </label>
              <button onClick={applyFilter} style={applyBtn}>Apply</button>
              {payrollRows.length > 0 && (
                <button onClick={exportPayroll} style={exportBtn}>⬇ Export CSV</button>
              )}
            </div>

            {/* Summary cards */}
            {Object.entries(payrollTotals).map(([mk, t]) => (
              <div key={mk} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatCard label="Month" value={toMonthLabel(mk)} />
                <StatCard label="Employees" value={String(t.count)} />
                <StatCard label="Total Gross" value={INR(t.gross)} highlight />
                <StatCard label="Total Deductions" value={INR(t.deductions)} />
                <StatCard label="Total Net Pay" value={INR(t.net)} highlight />
              </div>
            ))}

            {payrollRows.length === 0 ? (
              <EmptyState msg="No payroll data for this month. Run payroll from the Payroll page first." />
            ) : (
              <div style={tableWrap}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Employee", "Dept", "Basic", "HRA", "Conv.", "Gross", "PF", "ESI", "TDS", "PT", "Net", "Status"].map(h => (
                        <th key={h} style={thS}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={tdS}><span style={{ fontWeight: 600 }}>{r.employee_name}</span></td>
                        <td style={{ ...tdS, color: "#6b7280", fontSize: 12 }}>{r.department}</td>
                        <td style={numTd}>{INR(r.basic)}</td>
                        <td style={numTd}>{INR(r.hra)}</td>
                        <td style={numTd}>{INR(r.conveyance)}</td>
                        <td style={{ ...numTd, fontWeight: 600 }}>{INR(r.gross)}</td>
                        <td style={{ ...numTd, color: "#ef4444" }}>{INR(r.pf)}</td>
                        <td style={{ ...numTd, color: "#ef4444" }}>{INR(r.esi)}</td>
                        <td style={{ ...numTd, color: "#ef4444" }}>{INR(r.tds)}</td>
                        <td style={{ ...numTd, color: "#ef4444" }}>{INR(r.pt)}</td>
                        <td style={{ ...numTd, fontWeight: 700, color: "#059669" }}>{INR(r.net)}</td>
                        <td style={tdS}>
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {tab === "attendance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={filterBar}>
              <label style={filterLabel}>
                <span style={labelTxt}>From</span>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={filterInp} />
              </label>
              <label style={filterLabel}>
                <span style={labelTxt}>To</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={filterInp} />
              </label>
              <button onClick={applyFilter} style={applyBtn}>Apply</button>
              {attRows.length > 0 && (
                <button onClick={exportAttendance} style={exportBtn}>⬇ Export CSV</button>
              )}
            </div>

            {/* Summary table by employee */}
            {Object.keys(attSummary).length > 0 && (
              <div style={tableWrap}>
                <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 14, color: "#111827", borderBottom: "1px solid #f3f4f6" }}>
                  Summary by Employee
                </div>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Employee", "Present", "Absent", "Half Day", "Late", "WFH", "Total Hours"].map(h => (
                        <th key={h} style={thS}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(attSummary).map(([emp, s]) => (
                      <tr key={emp} style={{ borderTop: "1px solid #f3f4f6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={tdS}><span style={{ fontWeight: 600 }}>{emp}</span></td>
                        <td style={{ ...tdS, color: "#059669", fontWeight: 600 }}>{s.present}</td>
                        <td style={{ ...tdS, color: "#ef4444" }}>{s.absent}</td>
                        <td style={tdS}>{s.half_day}</td>
                        <td style={{ ...tdS, color: "#f59e0b" }}>{s.late}</td>
                        <td style={{ ...tdS, color: "#6d28d9" }}>{s.wfh}</td>
                        <td style={{ ...tdS, fontWeight: 600 }}>{s.total_hours.toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {attRows.length === 0 ? (
              <EmptyState msg="No attendance records in this date range." />
            ) : (
              <div style={tableWrap}>
                <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 14, color: "#111827", borderBottom: "1px solid #f3f4f6" }}>
                  Detailed Records ({attRows.length})
                </div>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Employee", "Dept", "Date", "Status", "Check In", "Check Out", "Hours"].map(h => (
                        <th key={h} style={thS}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={tdS}><span style={{ fontWeight: 600 }}>{r.employee_name}</span></td>
                        <td style={{ ...tdS, fontSize: 12, color: "#6b7280" }}>{r.department}</td>
                        <td style={tdS}>{r.attendance_date}</td>
                        <td style={tdS}><AttStatusBadge status={r.status} /></td>
                        <td style={{ ...tdS, fontSize: 12 }}>{r.check_in ? new Date(r.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—"}</td>
                        <td style={{ ...tdS, fontSize: 12 }}>{r.check_out ? new Date(r.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—"}</td>
                        <td style={{ ...tdS, fontWeight: 600 }}>{r.hours_worked != null ? `${r.hours_worked.toFixed(1)}h` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── LEAVE ── */}
        {tab === "leave" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={filterBar}>
              <label style={filterLabel}>
                <span style={labelTxt}>Year</span>
                <select value={year} onChange={e => setYear(e.target.value)} style={filterInp}>
                  {[currentYear(), String(Number(currentYear()) - 1), String(Number(currentYear()) - 2)].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <button onClick={applyFilter} style={applyBtn}>Apply</button>
              {leaveRows.length > 0 && (
                <button onClick={exportLeave} style={exportBtn}>⬇ Export CSV</button>
              )}
            </div>

            {/* Type breakdown cards */}
            {Object.keys(typeBreakdown).length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(typeBreakdown).map(([type, b]) => (
                  <div key={type} style={{
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                    padding: "14px 18px", minWidth: 160, flex: "1 1 160px",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 8 }}>{type}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "#059669" }}>Approved</span>
                        <span style={{ fontWeight: 700, color: "#059669" }}>{b.approved} ({b.days}d)</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "#f59e0b" }}>Pending</span>
                        <span style={{ fontWeight: 700, color: "#f59e0b" }}>{b.pending}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "#ef4444" }}>Rejected</span>
                        <span style={{ fontWeight: 700, color: "#ef4444" }}>{b.rejected}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {leaveRows.length === 0 ? (
              <EmptyState msg="No leave records for this year." />
            ) : (
              <div style={tableWrap}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Employee", "Dept", "Type", "Status", "Start", "End", "Days", "Applied"].map(h => (
                        <th key={h} style={thS}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={tdS}><span style={{ fontWeight: 600 }}>{r.employee_name}</span></td>
                        <td style={{ ...tdS, fontSize: 12, color: "#6b7280" }}>{r.department}</td>
                        <td style={tdS}>{r.leave_type}</td>
                        <td style={tdS}><LeaveStatusBadge status={r.status} /></td>
                        <td style={{ ...tdS, fontSize: 12 }}>{r.start_date}</td>
                        <td style={{ ...tdS, fontSize: 12 }}>{r.end_date}</td>
                        <td style={{ ...tdS, fontWeight: 700 }}>{r.days}</td>
                        <td style={{ ...tdS, fontSize: 12, color: "#6b7280" }}>{fmtDate(r.applied_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── HEADCOUNT ── */}
        {tab === "headcount" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {hcTotal > 0 && (
                <button onClick={exportHeadcount} style={exportBtn}>⬇ Export CSV</button>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatCard label="Total Employees" value={String(hcTotal)} highlight />
              {Object.entries(hcByStatus).map(([s, c]) => (
                <StatCard key={s} label={s} value={String(c)} />
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {/* By Department */}
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", fontWeight: 700, fontSize: 14, color: "#111827", borderBottom: "1px solid #f3f4f6" }}>
                  By Department
                </div>
                {Object.entries(hcByDept).length === 0 ? (
                  <div style={{ padding: "20px 18px", color: "#9ca3af", fontSize: 13 }}>No data</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {Object.entries(hcByDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                        <tr key={dept} style={{ borderTop: "1px solid #f3f4f6" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "10px 18px", fontSize: 14, color: "#374151" }}>{dept}</td>
                          <td style={{ padding: "10px 18px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
                              <div style={{ width: 80, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", height: 6 }}>
                                <div style={{
                                  width: `${Math.round((count / hcTotal) * 100)}%`,
                                  background: "#4f46e5", height: 6, borderRadius: 99,
                                }} />
                              </div>
                              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 24 }}>{count}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* By Employment Type */}
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", fontWeight: 700, fontSize: 14, color: "#111827", borderBottom: "1px solid #f3f4f6" }}>
                  By Employment Type
                </div>
                {Object.entries(hcByType).length === 0 ? (
                  <div style={{ padding: "20px 18px", color: "#9ca3af", fontSize: 13 }}>No data</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {Object.entries(hcByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                        <tr key={type} style={{ borderTop: "1px solid #f3f4f6" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "10px 18px", fontSize: 14, color: "#374151" }}>{type}</td>
                          <td style={{ padding: "10px 18px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
                              <div style={{ width: 80, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", height: 6 }}>
                                <div style={{
                                  width: `${Math.round((count / hcTotal) * 100)}%`,
                                  background: "#0ea5e9", height: 6, borderRadius: 99,
                                }} />
                              </div>
                              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 24 }}>{count}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </HRMSLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? "#4f46e5" : "#fff",
      border: highlight ? "none" : "1px solid #e5e7eb",
      borderRadius: 10, padding: "14px 20px", flex: "1 1 140px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: highlight ? "#c7d2fe" : "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: highlight ? "#fff" : "#111827" }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const bg = s === "processed" ? "#d1fae5" : "#fef3c7";
  const color = s === "processed" ? "#065f46" : "#92400e";
  return <span style={{ background: bg, color, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

function AttStatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  const cfg: Record<string, [string, string]> = {
    present: ["#d1fae5", "#065f46"],
    absent: ["#fee2e2", "#991b1b"],
    wfh: ["#ede9fe", "#6d28d9"],
    late: ["#fef3c7", "#92400e"],
    half_day: ["#dbeafe", "#1e40af"],
    "half-day": ["#dbeafe", "#1e40af"],
  };
  const [bg, clr] = cfg[s] ?? ["#f3f4f6", "#374151"];
  return <span style={{ background: bg, color: clr, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>{status}</span>;
}

function LeaveStatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  const cfg: Record<string, [string, string]> = {
    approved: ["#d1fae5", "#065f46"],
    rejected: ["#fee2e2", "#991b1b"],
    pending: ["#fef3c7", "#92400e"],
  };
  const [bg, clr] = cfg[s] ?? ["#f3f4f6", "#374151"];
  return <span style={{ background: bg, color: clr, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>{status}</span>;
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
      {msg}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const filterBar: React.CSSProperties = { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px" };
const filterLabel: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const labelTxt: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151" };
const filterInp: React.CSSProperties = { padding: "7px 11px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14, color: "#111827", outline: "none" };
const applyBtn: React.CSSProperties = { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const exportBtn: React.CSSProperties = { background: "#fff", color: "#059669", border: "1.5px solid #059669", borderRadius: 7, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const tableWrap: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 700 };
const thS: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "11px 14px", verticalAlign: "middle", fontSize: 13 };
const numTd: React.CSSProperties = { ...tdS, textAlign: "right", fontFamily: "monospace", fontSize: 12 };
