import { useLoaderData } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/hrms.analytics";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeptHeadcount {
  dept: string;
  headcount: number;
  exits: number;
  rate: number;
}

interface HiringMonth {
  month: string;
  hired: number;
  left: number;
}

interface DeptSalary {
  dept: string;
  count: number;
  avg: number;
  min: number;
  max: number;
}

interface LeaveType {
  type: string;
  entitled: number;
  used: number;
  pct: number;
  employees: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + (n / 100000).toFixed(1) + "L";

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Analytics" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const [summary, headcountRes, hiringRes, salaryRes, leaveRes, attendanceRes] = await Promise.all([
    callCoreHrmsApi<{
      totalEmployees?: number;
      attendanceSummary?: { present?: number };
      pendingApprovals?: number;
    }>({ request, env: context.cloudflare.env, currentUser, path: "/api/dashboard/summary" }),

    callCoreHrmsApi<{ depts?: DeptHeadcount[] }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/analytics/headcount",
    }),

    callCoreHrmsApi<{ trend?: HiringMonth[] }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/analytics/hiring-trend",
    }),

    callCoreHrmsApi<{ depts?: DeptSalary[]; month?: string | null }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/analytics/salary",
    }),

    callCoreHrmsApi<{ types?: LeaveType[]; year?: number }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/analytics/leave-utilization",
    }),

    callCoreHrmsApi<{ summary?: Record<string, number>; total?: number }>({
      request, env: context.cloudflare.env, currentUser, path: "/api/analytics/attendance-summary",
    }),
  ]);

  return {
    currentUser,
    totalEmployees: summary?.totalEmployees ?? 0,
    presentToday: summary?.attendanceSummary?.present ?? 0,
    pendingApprovals: summary?.pendingApprovals ?? 0,
    deptHeadcount: headcountRes?.depts ?? [],
    hiringTrend: hiringRes?.trend ?? [],
    salaryByDept: salaryRes?.depts ?? [],
    salaryMonth: salaryRes?.month ?? null,
    leaveUtilization: leaveRes?.types ?? [],
    leaveYear: leaveRes?.year ?? new Date().getFullYear(),
    attendanceSummary: attendanceRes?.summary ?? {},
    attendanceTotal: attendanceRes?.total ?? 0,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const {
    currentUser,
    totalEmployees,
    presentToday,
    pendingApprovals,
    deptHeadcount,
    hiringTrend,
    salaryByDept,
    salaryMonth,
    leaveUtilization,
    leaveYear,
    attendanceSummary,
    attendanceTotal,
  } = useLoaderData<typeof loader>();

  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [hoveredSalary, setHoveredSalary] = useState<string | null>(null);

  const maxHired = hiringTrend.length > 0 ? Math.max(...hiringTrend.map((h) => Math.max(h.hired, h.left)), 1) : 1;
  const maxSalary = salaryByDept.length > 0 ? Math.max(...salaryByDept.map((d) => d.max), 1) : 1;

  const attendancePresentPct = attendanceTotal > 0
    ? Math.round(((attendanceSummary["present"] ?? 0) / attendanceTotal) * 100)
    : 0;

  const DEPT_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
  const LEAVE_COLORS: Record<string, string> = {
    "Annual Leave": "#6366f1",
    "Sick Leave": "#ef4444",
    "Casual Leave": "#f59e0b",
    "Comp Off": "#10b981",
    "WFH": "#0ea5e9",
    "Maternity Leave": "#ec4899",
  };

  return (
    <HRMSLayout currentUser={currentUser}>
      <div className="page-title">Workforce Analytics</div>
      <div className="page-sub">Data-driven insights to guide people decisions.</div>

      {/* KPI cards */}
      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: "3px solid var(--green)" }}>
          <div className="stat-label">Total Employees</div>
          <div className="stat-value" style={{ fontSize: 26, color: "var(--green)" }}>{totalEmployees}</div>
          <div className="stat-delta delta-up" style={{ fontSize: 12 }}>Active headcount</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div className="stat-label">Present Today</div>
          <div className="stat-value" style={{ fontSize: 26, color: "var(--accent)" }}>{presentToday}</div>
          <div className="stat-delta delta-up" style={{ fontSize: 12 }}>Live attendance</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid #3b82f6" }}>
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value" style={{ fontSize: 26, color: "#3b82f6" }}>{pendingApprovals}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Leave requests</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--amber)" }}>
          <div className="stat-label">Attendance Rate</div>
          <div className="stat-value" style={{ fontSize: 26, color: attendancePresentPct >= 85 ? "var(--green)" : "var(--amber)" }}>
            {attendanceTotal > 0 ? `${attendancePresentPct}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Last 30 days</div>
        </div>
      </div>

      <div className="two-col">
        {/* Hiring Trend Chart */}
        <div className="card">
          <div className="card-title">
            Hiring vs Attrition
            {hiringTrend.length === 0 && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>— no data yet</span>
            )}
          </div>
          {hiringTrend.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, marginBottom: 8 }}>
                {hiringTrend.map((m) => {
                  const key = m.month;
                  const isHov = hoveredBar === key;
                  return (
                    <div
                      key={key}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
                      onMouseEnter={() => setHoveredBar(key)}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {isHov ? (
                        <div style={{
                          position: "absolute", background: "var(--ink)", color: "white",
                          fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 7,
                          pointerEvents: "none", whiteSpace: "nowrap", marginBottom: 4,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                        }}>
                          +{m.hired} hired · -{m.left} left
                        </div>
                      ) : null}
                      <div style={{ width: "100%", display: "flex", gap: 3, alignItems: "flex-end", height: 140 }}>
                        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                          {isHov ? <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>{m.hired}</div> : null}
                          <div style={{
                            background: isHov ? "#4338ca" : "var(--accent)",
                            borderRadius: "4px 4px 0 0",
                            height: `${(m.hired / maxHired) * 120}px`,
                            minHeight: m.hired > 0 ? 4 : 0,
                            transition: "background 0.12s, height 0.3s",
                          }} />
                        </div>
                        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                          {isHov ? <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 2 }}>{m.left}</div> : null}
                          <div style={{
                            background: isHov ? "#dc2626" : "#fca5a5",
                            borderRadius: "4px 4px 0 0",
                            height: `${(m.left / maxHired) * 120}px`,
                            minHeight: m.left > 0 ? 4 : 0,
                            transition: "background 0.12s, height 0.3s",
                          }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: hoveredBar === key ? 700 : 500 }}>{m.month}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <div style={{ width: 12, height: 12, background: "var(--accent)", borderRadius: 3 }} /> Hired
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <div style={{ width: 12, height: 12, background: "#fca5a5", borderRadius: 3 }} /> Attrition
                </div>
                <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)" }}>
                  Net: {hiringTrend.reduce((a, m) => a + m.hired - m.left, 0) >= 0 ? "+" : ""}
                  {hiringTrend.reduce((a, m) => a + m.hired - m.left, 0)} headcount
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📈</div>
              <div className="empty-state-title">No hiring data yet</div>
              <div className="empty-state-sub">Data will appear once employees are added.</div>
            </div>
          )}
        </div>

        {/* Headcount & Attrition by Dept */}
        <div className="card">
          <div className="card-title">
            Headcount by Department
            {deptHeadcount.length === 0 && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>— no data yet</span>
            )}
          </div>
          {deptHeadcount.length > 0 ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {deptHeadcount.slice(0, 6).map((d) => (
                  <div key={d.dept}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{d.dept}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>{d.headcount} active</span>
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 800,
                        color: d.rate > 12 ? "var(--red)" : d.rate > 8 ? "var(--amber)" : "var(--green)",
                      }}>
                        {d.exits > 0 ? `${d.rate}% attrition` : "0% attrition"}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{
                        width: `${Math.min(100, (d.headcount / Math.max(...deptHeadcount.map((x) => x.headcount))) * 100)}%`,
                        background: d.rate > 12 ? "var(--red)" : d.rate > 8 ? "var(--amber)" : "var(--accent)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 12, fontSize: 12 }}>
                {[["var(--accent)", "Good"], ["var(--amber)", "Watch (>8%)"], ["var(--red)", "Critical (>12%)"]].map(([color, label]) => (
                  <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color as string, display: "inline-block" }} />
                    {label}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🏢</div>
              <div className="empty-state-title">No department data yet</div>
              <div className="empty-state-sub">Add employees to see dept breakdown.</div>
            </div>
          )}
        </div>
      </div>

      {/* Salary Distribution */}
      <div className="card">
        <div className="card-title">
          Salary Distribution by Department
          {salaryMonth && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>({salaryMonth})</span>}
          {salaryByDept.length === 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>— no payroll data yet</span>}
        </div>
        {salaryByDept.length > 0 ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {salaryByDept.map((d, i) => {
                const isHov = hoveredSalary === d.dept;
                const color = DEPT_COLORS[i % DEPT_COLORS.length];
                const minPct = (d.min / maxSalary) * 100;
                const maxPct = (d.max / maxSalary) * 100;
                const avgPct = (d.avg / maxSalary) * 100;

                return (
                  <div
                    key={d.dept}
                    style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                    onMouseEnter={() => setHoveredSalary(d.dept)}
                    onMouseLeave={() => setHoveredSalary(null)}
                  >
                    <div style={{ width: 110, fontSize: 13, fontWeight: isHov ? 700 : 500, color: isHov ? "var(--ink)" : "var(--ink-2)", transition: "all 0.12s" }}>
                      {d.dept}
                    </div>
                    <div style={{ flex: 1, position: "relative", height: 20 }}>
                      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 6, background: "var(--surface)", borderRadius: 99, transform: "translateY(-50%)" }} />
                      <div style={{
                        position: "absolute", top: "50%", height: 6, borderRadius: 99,
                        left: `${minPct}%`, width: `${Math.max(maxPct - minPct, 0.5)}%`,
                        background: `${color}44`, transform: "translateY(-50%)",
                      }} />
                      <div style={{
                        position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
                        left: `${avgPct}%`, width: isHov ? 14 : 12, height: isHov ? 14 : 12,
                        borderRadius: "50%", background: color, border: "2px solid white",
                        boxShadow: isHov ? `0 0 0 3px ${color}44` : "none",
                        transition: "all 0.15s",
                      }} />
                    </div>
                    {isHov ? (
                      <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", width: 240 }}>
                        <span>Min </span><strong style={{ color: "var(--ink)" }}>{fmt(d.min)}</strong>
                        <span style={{ margin: "0 6px", color: "var(--border)" }}>·</span>
                        <span style={{ color, fontWeight: 800 }}>Avg {fmt(d.avg)}</span>
                        <span style={{ margin: "0 6px", color: "var(--border)" }}>·</span>
                        <span>Max </span><strong style={{ color: "var(--ink)" }}>{fmt(d.max)}</strong>
                        <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>({d.count} emp)</span>
                      </div>
                    ) : (
                      <div style={{ width: 240, fontSize: 13, fontWeight: 700, color, textAlign: "right" }}>
                        Avg {fmt(d.avg)} · {d.count} emp
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)" }}>
              Dot = average net · Band = min–max range · Hover for details
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-title">No payroll data yet</div>
            <div className="empty-state-sub">Salary analytics will appear after the first payroll run.</div>
          </div>
        )}
      </div>

      <div className="two-col">
        {/* Leave Utilization */}
        <div className="card">
          <div className="card-title">
            Leave Utilization {leaveYear}
            {leaveUtilization.length === 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>— no data yet</span>}
          </div>
          {leaveUtilization.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {leaveUtilization.map((l) => {
                const color = LEAVE_COLORS[l.type] ?? "#6b7280";
                return (
                  <div key={l.type}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{l.type}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        {l.used} / {l.entitled} days · {l.employees} emp
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{
                        width: `${l.pct}%`,
                        background: l.pct > 80 ? "var(--red)" : l.pct > 50 ? "var(--amber)" : color,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, textAlign: "right" }}>{l.pct}% utilized</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🏖️</div>
              <div className="empty-state-title">No leave data yet</div>
              <div className="empty-state-sub">Leave utilization will appear after employees apply for leaves.</div>
            </div>
          )}
        </div>

        {/* Attendance Summary */}
        <div className="card">
          <div className="card-title">
            Attendance Summary
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>Last 30 days</span>
          </div>
          {attendanceTotal > 0 ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(attendanceSummary).map(([status, cnt]) => {
                  const pct = Math.round((cnt / attendanceTotal) * 100);
                  const colorMap: Record<string, string> = {
                    present: "var(--green)",
                    absent: "var(--red)",
                    wfh: "var(--accent)",
                    half_day: "var(--amber)",
                    on_leave: "#8b5cf6",
                  };
                  const color = colorMap[status] ?? "var(--ink-3)";
                  const labelMap: Record<string, string> = {
                    present: "Present",
                    absent: "Absent",
                    wfh: "WFH",
                    half_day: "Half Day",
                    on_leave: "On Leave",
                  };
                  return (
                    <div key={status}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{labelMap[status] ?? status}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{cnt} days ({pct}%)</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--surface)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Overall attendance rate</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: attendancePresentPct >= 85 ? "var(--green)" : "var(--amber)" }}>
                  {attendancePresentPct}%
                </span>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🕐</div>
              <div className="empty-state-title">No attendance records yet</div>
              <div className="empty-state-sub">Records will appear as employees check in daily.</div>
            </div>
          )}
        </div>
      </div>
    </HRMSLayout>
  );
}
