import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/hrms.leave";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";

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
  note?: string;
  decidedAt?: string;
  approverName?: string;
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
  decision_note?: string;
  decided_at?: string;
  approver_name?: string;
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
    note: row.decision_note || undefined,
    decidedAt: row.decided_at || undefined,
    approverName: row.approver_name || undefined,
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
    const note = String(formData.get("note") || "").trim();

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
        note: note || undefined,
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
  const isAdmin = isAdminRole(currentUser.role);
  const applyFetcher = useFetcher<LeaveActionResult>();
  const decisionFetcher = useFetcher<LeaveActionResult>();
  const balanceFetcher = useFetcher<{ apiBalances?: typeof apiBalances }>();
  const [tab, setTab] = useState<"requests" | "balance" | "calendar">("requests");
  const [requestFilter, setRequestFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [requests, setRequests] = useState<LeaveRequest[]>(apiRequests);
  const [balances, setBalances] = useState(apiBalances);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({ type: "Annual Leave", from: "", to: "", reason: "" });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<LeaveRequest | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{ id?: string; name: string; from: string; status: LeaveStatus } | null>(null);
  const [decisionModal, setDecisionModal] = useState<{ row: LeaveRequest; action: "Approved" | "Rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const leaveBalance = balances;

  useEffect(() => {
    const result = applyFetcher.data;
    if (!result || !pendingApply) return;

    if (result.ok) {
      setRequests((prev) => [{ ...pendingApply, id: result.id }, ...prev]);
      setApplyForm({ type: "Annual Leave", from: "", to: "", reason: "" });
      setShowApplyModal(false);
      showToast("Leave request submitted successfully.");
    } else {
      setApplyError(result.message || "Failed to submit leave request.");
    }

    setPendingApply(null);
  }, [applyFetcher.data]);

  useEffect(() => {
    const result = decisionFetcher.data;
    if (!result || !pendingDecision) return;

    if (result.ok) {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === pendingDecision.id ? { ...r, status: pendingDecision.status } : r
        )
      );
      showToast(
        pendingDecision.status === "Approved"
          ? "Leave approved successfully."
          : "Leave rejected.",
        pendingDecision.status === "Approved"
      );
      // Re-fetch balance so cards update immediately after approval/rejection
      balanceFetcher.load(window.location.pathname);
    } else {
      showToast(result.message || "Failed to update leave request.", false);
    }

    setPendingDecision(null);
  }, [decisionFetcher.data]);

  // Sync balance when re-fetched after a decision
  useEffect(() => {
    if (balanceFetcher.data?.apiBalances) {
      setBalances(balanceFetcher.data.apiBalances);
    }
  }, [balanceFetcher.data]);

  const handleApply = () => {
    setApplyError(null);
    if (!applyForm.from || !applyForm.to || !applyForm.reason.trim()) {
      setApplyError("Please fill in all required fields.");
      return;
    }
    const fromDate = new Date(applyForm.from);
    const toDate = new Date(applyForm.to);
    if (toDate < fromDate) {
      setApplyError("'To Date' cannot be before 'From Date'.");
      return;
    }
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

  const confirmDecision = () => {
    if (!decisionModal) return;
    const { row, action } = decisionModal;

    if (!row.id) {
      setRequests((prev) =>
        prev.map((r) => r.name === row.name && r.from === row.from ? { ...r, status: action } : r)
      );
      setDecisionModal(null);
      setDecisionNote("");
      return;
    }

    const payload = new FormData();
    payload.set("intent", "decide-leave");
    payload.set("id", row.id);
    payload.set("status", action);
    payload.set("note", decisionNote);

    setPendingDecision({ id: row.id, name: row.name, from: row.from, status: action });
    decisionFetcher.submit(payload, { method: "POST" });
    setDecisionModal(null);
    setDecisionNote("");
  };

  const pendingCount = requests.filter((r) => r.status === "Pending").length;

  const filteredRequests = requestFilter === "All"
    ? requests
    : requests.filter((r) => r.status === requestFilter);

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
      {toast && (
        <div className={`toast ${toast.ok ? "toast-success" : "toast-error"}`}>
          {toast.msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Leave Management</div>
          <div className="page-sub">{isAdmin ? "Track, approve, and manage all leave requests." : "Apply for leave and track your request status."}</div>
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
              {applyForm.from && applyForm.to ? (() => {
                const from = new Date(applyForm.from);
                const to = new Date(applyForm.to);
                const days = to >= from ? Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1) : 0;
                return days > 0 ? (
                  <div style={{ background: "var(--accent-light)", border: "1px solid #c7d2fe", borderRadius: 10, padding: 12, fontSize: 13 }}>
                    <span style={{ color: "var(--accent)", fontWeight: 700 }}>{days} calendar day{days > 1 ? "s" : ""}</span>{" "}
                    <span style={{ color: "var(--ink-3)" }}>will be deducted from {applyForm.type}</span>
                  </div>
                ) : (
                  <div style={{ background: "var(--red-light)", border: "1px solid #fecaca", borderRadius: 10, padding: 10, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
                    'To Date' must be on or after 'From Date'
                  </div>
                );
              })() : null}
              {applyError && (
                <div style={{ background: "var(--red-light)", border: "1px solid #fecaca", borderRadius: 10, padding: 10, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
                  {applyError}
                </div>
              )}
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

      {/* Decision Modal */}
      {decisionModal ? (
        <div className="modal-overlay" onClick={() => { setDecisionModal(null); setDecisionNote(""); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {decisionModal.action === "Approved" ? "Approve Leave" : "Reject Leave"}
              <button className="modal-close" onClick={() => { setDecisionModal(null); setDecisionNote(""); }}>✕</button>
            </div>

            <div style={{ background: "var(--surface)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 4 }}>{decisionModal.row.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: LEAVE_TYPE_COLORS[decisionModal.row.type] ?? "#6b7280", display: "inline-block", flexShrink: 0 }} />
                <span style={{ color: "var(--ink-2)" }}>{decisionModal.row.type}</span>
                <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{decisionModal.row.from} → {decisionModal.row.to} ({decisionModal.row.days}d)</span>
              </div>
            </div>

            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: decisionModal.action === "Approved" ? "#dcfce7" : "#fee2e2",
              color: decisionModal.action === "Approved" ? "var(--green)" : "var(--red)",
              borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, marginBottom: 16
            }}>
              {decisionModal.action === "Approved" ? "Approving this request" : "Rejecting this request"}
            </div>

            <div>
              <label style={lblStyle}>Decision Note / Comment <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(optional)</span></label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Optional comment for the employee..."
                rows={3}
                style={{ ...inpStyle, resize: "vertical" as const }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className={decisionModal.action === "Approved" ? "btn btn-success" : "btn btn-danger"}
                onClick={confirmDecision}
                disabled={decisionFetcher.state !== "idle"}
              >
                {decisionFetcher.state !== "idle" ? "Saving..." : `Confirm ${decisionModal.action === "Approved" ? "Approval" : "Rejection"}`}
              </button>
              <button className="btn btn-outline" onClick={() => { setDecisionModal(null); setDecisionNote(""); }}>Cancel</button>
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
          {/* Filter bar for admins */}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {(["All", "Pending", "Approved", "Rejected"] as const).map((f) => {
                const count = f === "All" ? requests.length : requests.filter((r) => r.status === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setRequestFilter(f)}
                    style={{
                      padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: "1.5px solid",
                      borderColor: requestFilter === f ? "var(--accent)" : "var(--border)",
                      background: requestFilter === f ? "var(--accent-light)" : "white",
                      color: requestFilter === f ? "var(--accent)" : "var(--ink-3)",
                      transition: "all 0.15s",
                    }}
                  >
                    {f} {count > 0 ? `(${count})` : ""}
                  </button>
                );
              })}
            </div>
          )}

          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Type</th><th>Duration</th><th>Days</th><th>Reason</th><th>Status</th><th>Note</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
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
                  <td style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 140 }}>
                    {r.note ? r.note : <span style={{ color: "var(--border)" }}>—</span>}
                  </td>
                  <td>
                    {isAdmin && r.status === "Pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-success"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setDecisionModal({ row: r, action: "Approved" })}
                        >Approve</button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setDecisionModal({ row: r, action: "Rejected" })}
                        >Reject</button>
                      </div>
                    )}
                    {isAdmin && r.status === "Approved" && (
                      <button
                        className="btn btn-outline"
                        style={{ padding: "4px 10px", fontSize: 11, color: "var(--ink-3)" }}
                        onClick={() => setDecisionModal({ row: r, action: "Rejected" })}
                      >Revoke</button>
                    )}
                    {!isAdmin && r.status === "Pending" && (
                      <span style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>Awaiting review</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--ink-3)", textAlign: "center", padding: 24 }}>
                    No {requestFilter !== "All" ? requestFilter.toLowerCase() + " " : ""}leave requests found.
                  </td>
                </tr>
              )}
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
      {tab === "calendar" && (() => {
        const todayDate = new Date();
        const todayIsThisMonth = todayDate.getFullYear() === calYear && todayDate.getMonth() === calMonth;
        const whoIsOutToday = todayIsThisMonth ? (leaveDayMap[todayDate.getDate()] ?? []) : [];
        const totalOnLeaveThisMonth = Object.values(leaveDayMap).flat().length;

        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20, alignItems: "start" }}>
            {/* Main calendar */}
            <div className="card" style={{ marginBottom: 0 }}>
              {/* Month nav + stats */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <button
                  style={{ width: 34, height: 34, borderRadius: 8, border: "1.5px solid var(--border)", background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", fontFamily: "inherit" }}
                  onClick={prevMonth}
                >‹</button>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)", letterSpacing: -0.5 }}>
                    {MONTHS[calMonth]} {calYear}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {totalOnLeaveThisMonth > 0
                      ? `${Object.keys(leaveDayMap).length} days with leave entries`
                      : "No leave recorded this month"}
                  </div>
                </div>
                <button
                  style={{ width: 34, height: 34, borderRadius: 8, border: "1.5px solid var(--border)", background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", fontFamily: "inherit" }}
                  onClick={nextMonth}
                >›</button>
              </div>

              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
                {DAYS.map((d, idx) => (
                  <div key={d} style={{
                    textAlign: "center", fontSize: 11, fontWeight: 700,
                    color: (idx === 0 || idx === 6) ? "#ef4444" : "var(--ink-3)",
                    textTransform: "uppercase", letterSpacing: 0.5, paddingBottom: 8,
                  }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ minHeight: 80 }} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = todayDate.getFullYear() === calYear && todayDate.getMonth() === calMonth && todayDate.getDate() === day;
                  const dayOfWeek = (firstDay + i) % 7;
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const leaveEntries = leaveDayMap[day] ?? [];
                  const isHovered = hoveredDay === day && leaveEntries.length > 0;

                  return (
                    <div
                      key={day}
                      onMouseEnter={() => leaveEntries.length > 0 && setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                      style={{
                        minHeight: 82,
                        padding: "7px 8px",
                        borderRadius: 10,
                        border: isToday ? "2px solid #6366f1" : isHovered ? "1.5px solid #c7d2fe" : "1px solid #e8eef4",
                        background: isToday ? "#eff6ff" : isWeekend ? "#fafbfc" : "white",
                        transition: "all 0.12s",
                        boxShadow: isHovered ? "0 4px 12px rgba(99,102,241,0.12)" : "none",
                        position: "relative",
                      }}
                    >
                      <div style={{
                        fontSize: 13, fontWeight: isToday ? 800 : 500,
                        color: isToday ? "#6366f1" : isWeekend ? "#94a3b8" : "#0f172a",
                        marginBottom: 5,
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        {day}
                        {isToday && <span style={{ fontSize: 9, fontWeight: 700, background: "#6366f1", color: "white", borderRadius: 3, padding: "1px 4px", letterSpacing: 0.3 }}>TODAY</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {leaveEntries.slice(0, 3).map((entry, idx) => (
                          <div key={idx} style={{
                            fontSize: 10, fontWeight: 700, color: "white",
                            background: entry.color, borderRadius: 4,
                            padding: "2px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            letterSpacing: 0.1,
                          }}>
                            {entry.name}
                          </div>
                        ))}
                        {leaveEntries.length > 3 && (
                          <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, padding: "1px 4px" }}>
                            +{leaveEntries.length - 3} more
                          </div>
                        )}
                      </div>
                      {leaveEntries.length > 0 && (
                        <div style={{
                          position: "absolute", bottom: 6, right: 7,
                          width: 6, height: 6, borderRadius: "50%",
                          background: leaveEntries[0].color, opacity: 0.7,
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e8eef4", display: "flex", gap: 16, flexWrap: "wrap" }}>
                {Object.entries(LEAVE_TYPE_COLORS).map(([type, clr]) => (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-2)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: clr, display: "inline-block", flexShrink: 0 }} />
                    {type}
                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Who's out today */}
              <div style={{ background: "white", border: "1px solid #e8eef4", borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 }}>
                  {todayIsThisMonth ? "Out Today" : `${MONTHS[calMonth]} Overview`}
                </div>
                {whoIsOutToday.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0" }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Everyone's in!</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>No leaves today</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {whoIsOutToday.map((entry, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: entry.color, display: "grid", placeItems: "center", color: "white", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                          {entry.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{entry.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>On leave</div>
                        </div>
                        <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Monthly summary */}
              <div style={{ background: "white", border: "1px solid #e8eef4", borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 }}>
                  This Month
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Days with leave", value: Object.keys(leaveDayMap).length, color: "#6366f1" },
                    { label: "Approved leaves", value: requests.filter(r => r.status === "Approved" && r.fromDate.getMonth() === calMonth && r.fromDate.getFullYear() === calYear).length, color: "#10b981" },
                    { label: "Pending approvals", value: requests.filter(r => r.status === "Pending" && r.fromDate.getMonth() === calMonth && r.fromDate.getFullYear() === calYear).length, color: "#f59e0b" },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{s.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upcoming leaves */}
              {(() => {
                const upcoming = requests
                  .filter(r => r.status === "Approved" && r.fromDate >= todayDate)
                  .sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime())
                  .slice(0, 4);
                return upcoming.length > 0 ? (
                  <div style={{ background: "white", border: "1px solid #e8eef4", borderRadius: 14, padding: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 }}>
                      Upcoming Leaves
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {upcoming.map((r, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: LEAVE_TYPE_COLORS[r.type] ?? "#6b7280", flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{r.from} → {r.to}</div>
                            <div style={{ fontSize: 10, color: LEAVE_TYPE_COLORS[r.type] ?? "#6b7280", fontWeight: 600, marginTop: 2 }}>{r.type}</div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{r.days}d</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        );
      })()}
    </HRMSLayout>
  );
}

const lblStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 5 };
const inpStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", color: "var(--ink)" };
