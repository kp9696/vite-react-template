import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/hrms.leave";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { avatarColor, getInitials } from "../lib/hrms.shared";

type LeaveStatus = "Pending" | "Approved" | "Rejected";

interface LeaveRequest {
  id?: string;
  name: string;
  type: string;
  from: string;
  to: string;
  days: number;
  status: LeaveStatus;
  reason: string;
  fromDate: Date;
  toDate: Date;
}

interface ApiLeaveRow {
  id?: string;
  name?: string;
  leave_type?: string;
  start_date?: string;
  end_date?: string;
  total_days?: number;
  status?: string;
  reason?: string;
}

interface ApiLeaveBalanceRow {
  leave_type?: string;
  total?: number;
  used?: number;
  remaining?: number;
}

const LEAVE_TYPE_COLORS: Record<string, string> = {
  "Annual Leave": "#6366f1",
  "Sick Leave": "#ef4444",
  "Maternity Leave": "#ec4899",
  "WFH": "#0ea5e9",
  "Comp Off": "#10b981",
  "Casual Leave": "#f59e0b",
};


const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function mapApiStatus(status?: string): LeaveStatus {
  const value = (status || "").toLowerCase();
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  return "Pending";
}

function mapApiLeave(row: ApiLeaveRow): LeaveRequest {
  const fromDate = row.start_date ? new Date(row.start_date) : new Date();
  const toDate = row.end_date ? new Date(row.end_date) : fromDate;
  const formatDay = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });

  return {
    id: row.id,
    name: row.name || "Employee",
    type: row.leave_type || "Annual Leave",
    from: formatDay(fromDate),
    to: formatDay(toDate),
    days: Number(row.total_days ?? 1),
    status: mapApiStatus(row.status),
    reason: row.reason || "",
    fromDate,
    toDate,
  };
}

interface LeaveActionResult {
  ok: boolean;
  message?: string;
  intent?: "apply" | "decision";
  id?: string;
  status?: LeaveStatus;
}

export function meta() {
  return [{ title: "JWithKP HRMS - Leave" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const leaveResponse = await callCoreHrmsApi<{ leaves?: ApiLeaveRow[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/leaves",
  });

  const balanceResponse = await callCoreHrmsApi<{ balances?: ApiLeaveBalanceRow[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/leaves/balance",
  });

  const apiRequests = (leaveResponse?.leaves || []).map(mapApiLeave);
  const rawBalances = (balanceResponse?.balances || []).map((row) => ({
    type: row.leave_type || "Annual Leave",
    total: Number(row.total ?? 0),
    used: Number(row.used ?? 0),
    remaining: Number(row.remaining ?? row.total ?? 0),
  }));

  // Fall back to org defaults when no balances have been set up yet
  const DEFAULT_LEAVE_BALANCES = [
    { type: "Annual Leave",  total: 18, used: 0, remaining: 18 },
    { type: "Sick Leave",    total: 12, used: 0, remaining: 12 },
    { type: "Casual Leave",  total: 6,  used: 0, remaining: 6  },
    { type: "Comp Off",      total: 4,  used: 0, remaining: 4  },
  ];
  const apiBalances = rawBalances.length > 0 ? rawBalances : DEFAULT_LEAVE_BALANCES;

  return {
    currentUser,
    apiRequests,
    apiBalances,
  };
}

export async function action({ request, context }: Route.ActionArgs): Promise<LeaveActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "apply-leave") {
    const leaveType = String(formData.get("leaveType") || "").trim();
    const startDate = String(formData.get("startDate") || "").trim();
    const endDate = String(formData.get("endDate") || "").trim();
    const reason = String(formData.get("reason") || "").trim();

    const response = await callCoreHrmsApi<{ ok?: boolean; id?: string; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/leaves",
      method: "POST",
      body: {
        leaveType,
        startDate,
        endDate,
        reason,
      },
    });

    if (!response?.ok) {
      return { ok: false, message: response?.error || "Failed to apply leave." };
    }

    return { ok: true, intent: "apply", id: response.id };
  }

  if (intent === "decide-leave") {
    const id = String(formData.get("id") || "").trim();
    const nextStatus = String(formData.get("status") || "").trim();

    if (!id || (nextStatus !== "Approved" && nextStatus !== "Rejected")) {
      return { ok: false, message: "Invalid leave decision request." };
    }

    const response = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/leaves/${encodeURIComponent(id)}/decision`,
      method: "POST",
      body: {
        status: nextStatus.toLowerCase(),
      },
    });

    if (!response?.ok) {
      return { ok: false, message: response?.error || "Failed to update leave request." };
    }

    return { ok: true, intent: "decision", id, status: nextStatus as LeaveStatus };
  }

  return { ok: false, message: "Unsupported action." };
}

export default function Leave() {
  const { currentUser, apiRequests, apiBalances } = useLoaderData<typeof loader>();
  const applyFetcher = useFetcher<LeaveActionResult>();
  const decisionFetcher = useFetcher<LeaveActionResult>();
  const [tab, setTab] = useState<"requests" | "balance" | "calendar">("requests");
  const [requests, setRequests] = useState<LeaveRequest[]>(apiRequests);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(3); // April
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({ type: "Annual Leave", from: "", to: "", reason: "" });
  const [pendingApply, setPendingApply] = useState<LeaveRequest | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{ id?: string; name: string; from: string; status: LeaveStatus } | null>(null);

  const leaveBalance = apiBalances;

  useEffect(() => {
    const result = applyFetcher.data;
    if (!result || !pendingApply) {
      return;
    }

    if (result.ok) {
      setRequests((prev) => [{ ...pendingApply, id: result.id }, ...prev]);
      setApplyForm({ type: "Annual Leave", from: "", to: "", reason: "" });
      setShowApplyModal(false);
    }

    setPendingApply(null);
  }, [applyFetcher.data, pendingApply]);

  useEffect(() => {
    if (!decisionFetcher.data || !pendingDecision) {
      return;
    }

    if (decisionFetcher.data.ok) {
      setRequests((prev) =>
        prev.map((r) => {
          if (pendingDecision.id) {
            return r.id === pendingDecision.id ? { ...r, status: pendingDecision.status } : r;
          }
          return r.name === pendingDecision.name && r.from === pendingDecision.from
            ? { ...r, status: pendingDecision.status }
            : r;
        }),
      );
    }

    setPendingDecision(null);
  }, [decisionFetcher.data, pendingDecision]);

  const handleApply = () => {
    if (!applyForm.from || !applyForm.to || !applyForm.reason.trim()) return;
    const fromDate = new Date(applyForm.from);
    const toDate = new Date(applyForm.to);
    const days = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    const newRequest: LeaveRequest = {
      name: currentUser.name,
      type: applyForm.type,
      from: fmt(fromDate),
      to: fmt(toDate),
      days,
      status: "Pending",
      reason: applyForm.reason,
      fromDate,
      toDate,
    };
    const payload = new FormData();
    payload.set("intent", "apply-leave");
    payload.set("leaveType", applyForm.type);
    payload.set("startDate", applyForm.from);
    payload.set("endDate", applyForm.to);
    payload.set("reason", applyForm.reason.trim());

    setPendingApply(newRequest);
    applyFetcher.submit(payload, { method: "POST" });
  };

  const handleAction = (row: LeaveRequest, action: LeaveStatus) => {
    if (!row.id) {
      setRequests((prev) =>
        prev.map((r) => r.name === row.name && r.from === row.from ? { ...r, status: action } : r)
      );
      return;
    }

    const payload = new FormData();
    payload.set("intent", "decide-leave");
    payload.set("id", row.id);
    payload.set("status", action);

    setPendingDecision({ id: row.id, name: row.name, from: row.from, status: action });
    decisionFetcher.submit(payload, { method: "POST" });
  };

  const pendingCount = requests.filter((r) => r.status === "Pending").length;

  // Calendar helpers
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // Collect leave days in current month view
  const leaveDayMap: Record<number, { name: string; color: string }[]> = {};
  requests
    .filter((r) => r.status !== "Rejected")
    .forEach((r) => {
      const d = new Date(r.fromDate);
      const end = new Date(r.toDate);
      while (d <= end) {
        if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
          const day = d.getDate();
          if (!leaveDayMap[day]) leaveDayMap[day] = [];
          leaveDayMap[day].push({ name: r.name.split(" ")[0], color: LEAVE_TYPE_COLORS[r.type] ?? "#6b7280" });
        }
        d.setDate(d.getDate() + 1);
      }
    });

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Leave Management</div>
          <div className="page-sub">Track, approve, and manage all leave requests.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowApplyModal(true)}>+ Apply Leave</button>
      </div>

      {/* Apply Leave Modal */}
      {showApplyModal ? (
        <div className="modal-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Apply for Leave
              <button className="modal-close" onClick={() => setShowApplyModal(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lblStyle}>Leave Type</label>
                <select value={applyForm.type} onChange={(e) => setApplyForm((f) => ({ ...f, type: e.target.value }))} style={inpStyle}>
                  {Object.keys(LEAVE_TYPE_COLORS).map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lblStyle}>From Date</label>
                  <input type="date" value={applyForm.from} onChange={(e) => setApplyForm((f) => ({ ...f, from: e.target.value }))} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>To Date</label>
                  <input type="date" value={applyForm.to} onChange={(e) => setApplyForm((f) => ({ ...f, to: e.target.value }))} style={inpStyle} />
                </div>
              </div>
              <div>
                <label style={lblStyle}>Reason</label>
                <textarea value={applyForm.reason} onChange={(e) => setApplyForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Brief reason for leave…" rows={3}
                  style={{ ...inpStyle, resize: "vertical" as const }} />
              </div>
              {applyForm.from && applyForm.to ? (
                <div style={{ background: "var(--accent-light)", border: "1px solid #c7d2fe", borderRadius: 10, padding: 12, fontSize: 13 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                    {Math.max(1, Math.ceil((new Date(applyForm.to).getTime() - new Date(applyForm.from).getTime()) / 86400000) + 1)} working days
                  </span>{" "}
                  <span style={{ color: "var(--ink-3)" }}>will be deducted from {applyForm.type}</span>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={!applyForm.from || !applyForm.to || !applyForm.reason.trim()}
              >
                Submit Request
              </button>
              <button className="btn btn-outline" onClick={() => setShowApplyModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Balance cards — top 4 primary types */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {leaveBalance.filter((l) => ["Annual Leave", "Sick Leave", "Casual Leave", "Comp Off"].includes(l.type)).map((l) => {
          const color = LEAVE_TYPE_COLORS[l.type] ?? "#6b7280";
          const usedPct = l.total > 0 ? Math.round((l.used / l.total) * 100) : 0;
          return (
            <div className="stat-card" key={l.type} style={{ borderLeft: `4px solid ${color}` }}>
              <div className="stat-label">{l.type}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <div className="stat-value" style={{ color }}>{l.remaining}</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>/ {l.total} days left</div>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${usedPct}%`, background: color }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>
                {l.used} used · {usedPct}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {(["requests", "balance", "calendar"] as const).map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "requests" ? `Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}` : t === "balance" ? "Balance" : "Calendar"}
          </button>
        ))}
      </div>

      {/* Requests tab */}
      {tab === "requests" && (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Type</th><th>Duration</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.name + r.from}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="avatar-sm" style={{ background: avatarColor(r.name) }}>
                        {getInitials(r.name)}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{r.name}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: LEAVE_TYPE_COLORS[r.type] ?? "#6b7280", display: "inline-block", flexShrink: 0 }} />
                      {r.type}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.from} → {r.to}</td>
                  <td style={{ fontWeight: 700, color: "var(--ink)" }}>{r.days}d</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 140 }}>{r.reason}</td>
                  <td>
                    <span className={`badge ${r.status === "Approved" ? "badge-green" : r.status === "Pending" ? "badge-amber" : "badge-red"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === "Pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-success"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => handleAction(r, "Approved")}
                        >✓ Approve</button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => handleAction(r, "Rejected")}
                        >✕ Reject</button>
                      </div>
                    )}
                    {r.status === "Approved" && (
                      <button
                        className="btn btn-outline"
                        style={{ padding: "4px 10px", fontSize: 11, color: "var(--ink-3)" }}
                        onClick={() => handleAction(r, "Rejected")}
                      >Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Balance tab */}
      {tab === "balance" && (
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {leaveBalance.map((l) => {
              const color = LEAVE_TYPE_COLORS[l.type] ?? "#6b7280";
              return (
                <div key={l.type} style={{ padding: 20, background: "var(--surface)", borderRadius: 14, border: `1.5px solid ${color}22` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{l.type}</span>
                  </div>
                  {[["Total Entitled", l.total + " days", "var(--ink)"], ["Used", l.used + " days", "var(--red)"], ["Remaining", l.remaining + " days", "var(--green)"]].map(([label, val, col]) => (
                    <div key={label as string} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
                      <span style={{ fontWeight: 700, color: col as string }}>{val}</span>
                    </div>
                  ))}
                  <div className="progress-track" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${l.total > 0 ? Math.round((l.used / l.total) * 100) : 0}%`, background: color }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5, textAlign: "right" }}>
                    {l.total > 0 ? Math.round((l.used / l.total) * 100) : 0}% used
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar tab */}
      {tab === "calendar" && (
        <div className="card">
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={prevMonth}>‹</button>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)" }}>
              {MONTHS[calMonth]} {calYear}
            </div>
            <button className="btn btn-outline" style={{ padding: "6px 12px" }} onClick={nextMonth}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {DAYS.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", paddingBottom: 6 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {/* Empty cells for first day offset */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const today = new Date();
              const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
              const isWeekend = ((firstDay + i) % 7 === 0) || ((firstDay + i) % 7 === 6);
              const leaveEntries = leaveDayMap[day] ?? [];

              return (
                <div
                  key={day}
                  style={{
                    minHeight: 70,
                    padding: "6px 8px",
                    borderRadius: 10,
                    border: isToday ? "2px solid var(--accent)" : "1px solid var(--border)",
                    background: isToday ? "var(--accent-light)" : isWeekend ? "var(--surface)" : "white",
                    transition: "box-shadow 0.12s",
                    cursor: leaveEntries.length > 0 ? "pointer" : "default",
                  }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: isToday ? 800 : 500,
                    color: isToday ? "var(--accent)" : isWeekend ? "var(--ink-3)" : "var(--ink)",
                    marginBottom: 4,
                  }}>
                    {day}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {leaveEntries.slice(0, 2).map((entry, idx) => (
                      <div key={idx} style={{
                        fontSize: 10, fontWeight: 600, color: "white",
                        background: entry.color, borderRadius: 4,
                        padding: "1px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {entry.name}
                      </div>
                    ))}
                    {leaveEntries.length > 2 && (
                      <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>
                        +{leaveEntries.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 20, display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(LEAVE_TYPE_COLORS).map(([type, color]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
                {type}
              </div>
            ))}
          </div>
        </div>
      )}
    </HRMSLayout>
  );
}

const lblStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 5 };
const inpStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", color: "var(--ink)" };

