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
  intent?: "apply" | "decision" | "save-policy" | "credit-balances" | "run-accrual" | "year-end-rollover";
  id?: string;
  status?: LeaveStatus;
  credited?: number;
  // accrual run result
  accrualResult?: {
    monthKey: string; dryRun: boolean;
    policiesProcessed: number; credited: number;
    totalDaysAccrued: number; skippedProbation: number; skippedDuplicate: number;
  };
  // year-end rollover result
  rolloverResult?: {
    fromYear: number; toYear: number; dryRun: boolean;
    processed: number; totalCarried: number; totalForfeited: number;
  };
}

interface LeavePolicy {
  id: string;
  leave_type: string;
  accrual_type: string;
  accrual_days: number;
  max_balance: number;
  carry_forward_max: number;
  encashment_eligible: number;
  probation_lock_months: number;
  requires_approval: number;
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

  const policiesResponse = await callCoreHrmsApi<{ policies?: LeavePolicy[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/leave-policies",
  });

  return {
    currentUser,
    apiRequests,
    apiBalances,
    apiPolicies: policiesResponse?.policies ?? [],
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

  if (intent === "save-leave-policy") {
    const leaveType = String(formData.get("leaveType") || "").trim();
    const accrualType = String(formData.get("accrualType") || "yearly");
    const accrualDays = Number(formData.get("accrualDays") || 0);
    const maxBalance = Number(formData.get("maxBalance") || 0);
    const carryForwardMax = Number(formData.get("carryForwardMax") || 0);
    const encashmentEligible = formData.get("encashmentEligible") === "1";
    const probationLockMonths = Number(formData.get("probationLockMonths") || 0);

    if (!leaveType) return { ok: false, message: "Leave type is required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/leave-policies",
      method: "POST",
      body: { leaveType, accrualType, accrualDays, maxBalance, carryForwardMax, encashmentEligible, probationLockMonths },
    });
    if (!res?.ok) return { ok: false, message: res?.error || "Failed to save policy." };
    return { ok: true, intent: "save-policy" };
  }

  if (intent === "credit-leave-balances") {
    const leaveType = String(formData.get("leaveType") || "").trim();
    const year = Number(formData.get("year") || new Date().getFullYear());
    const res = await callCoreHrmsApi<{ ok?: boolean; credited?: number; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/leave-policies/credit",
      method: "POST",
      body: { leaveType, year },
    });
    if (!res?.ok) return { ok: false, message: res?.error || "Failed to credit balances." };
    return { ok: true, intent: "credit-balances", credited: res.credited };
  }

  if (intent === "run-monthly-accrual") {
    const monthKey = String(formData.get("monthKey") || "").trim();
    const dryRun = formData.get("dryRun") === "1";
    if (!monthKey) return { ok: false, message: "Month is required." };
    const res = await callCoreHrmsApi<{
      ok?: boolean; error?: string;
      monthKey: string; dryRun: boolean;
      policiesProcessed: number; credited: number;
      totalDaysAccrued: number; skippedProbation: number; skippedDuplicate: number;
    }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/leaves/run-accrual",
      method: "POST",
      body: { monthKey, dryRun },
    });
    if (!res?.ok) return { ok: false, message: res?.error || "Accrual run failed." };
    return { ok: true, intent: "run-accrual", accrualResult: res as NonNullable<LeaveActionResult["accrualResult"]> };
  }

  if (intent === "year-end-rollover") {
    const fromYear = Number(formData.get("fromYear") || new Date().getFullYear());
    const toYear = fromYear + 1;
    const dryRun = formData.get("dryRun") === "1";
    const res = await callCoreHrmsApi<{
      ok?: boolean; error?: string;
      fromYear: number; toYear: number; dryRun: boolean;
      processed: number; totalCarried: number; totalForfeited: number;
    }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/leaves/year-end-rollover",
      method: "POST",
      body: { fromYear, toYear, dryRun },
    });
    if (!res?.ok) return { ok: false, message: res?.error || "Year-end rollover failed." };
    return { ok: true, intent: "year-end-rollover", rolloverResult: res as NonNullable<LeaveActionResult["rolloverResult"]> };
  }

  return { ok: false, message: "Unsupported action." };
}

export default function Leave() {
  const { currentUser, apiRequests, apiBalances, apiPolicies } = useLoaderData<typeof loader>();
  const isAdmin = isAdminRole(currentUser.role);
  const applyFetcher = useFetcher<LeaveActionResult>();
  const decisionFetcher = useFetcher<LeaveActionResult>();
  const balanceFetcher = useFetcher<{ apiBalances?: typeof apiBalances }>();
  const policyFetcher = useFetcher<LeaveActionResult>();
  const [tab, setTab] = useState<"requests" | "balance" | "calendar" | "policy">("requests");
  const [policies, setPolicies] = useState<LeavePolicy[]>(apiPolicies);
  const [policyModal, setPolicyModal] = useState<LeavePolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({ leaveType: "", accrualType: "yearly", accrualDays: "18", maxBalance: "45", carryForwardMax: "15", encashmentEligible: false, probationLockMonths: "0" });
  const [creditModal, setCreditModal] = useState<{ leaveType: string } | null>(null);
  const [accrualModal, setAccrualModal] = useState(false);
  const [accrualMonthKey, setAccrualMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [accrualDryRun, setAccrualDryRun] = useState(false);
  const [accrualResult, setAccrualResult] = useState<LeaveActionResult["accrualResult"] | null>(null);
  const [rolloverModal, setRolloverModal] = useState(false);
  const [rolloverYear, setRolloverYear] = useState(() => new Date().getFullYear());
  const [rolloverDryRun, setRolloverDryRun] = useState(false);
  const [rolloverResult, setRolloverResult] = useState<LeaveActionResult["rolloverResult"] | null>(null);
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

  // Sync policies after save / accrual run / rollover
  useEffect(() => {
    const result = policyFetcher.data;
    if (!result) return;
    if (result.ok && result.intent === "save-policy") {
      setPolicyModal(null);
      showToast("Policy saved successfully.");
      balanceFetcher.load(typeof window !== "undefined" ? window.location.pathname : "/hrms/leave");
    } else if (result.ok && result.intent === "credit-balances") {
      setCreditModal(null);
      showToast(`Credited ${result.credited ?? 0} employee(s) successfully.`);
    } else if (result.ok && result.intent === "run-accrual") {
      setAccrualResult(result.accrualResult ?? null);
    } else if (result.ok && result.intent === "year-end-rollover") {
      setRolloverResult(result.rolloverResult ?? null);
    } else if (!result.ok) {
      showToast(result.message || "Error.", false);
    }
  }, [policyFetcher.data]);

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
        <button className={`tab-btn ${tab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>
          Requests{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
        <button className={`tab-btn ${tab === "balance" ? "active" : ""}`} onClick={() => setTab("balance")}>Balance</button>
        <button className={`tab-btn ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}>Calendar</button>
        {isAdmin && (
          <button className={`tab-btn ${tab === "policy" ? "active" : ""}`} onClick={() => setTab("policy")}>Leave Policy</button>
        )}
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
      {/* Policy tab (admin only) */}
      {tab === "policy" && isAdmin && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Leave Policy Configuration</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>Configure accrual, carry-forward, and encashment rules per leave type.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setAccrualResult(null); setAccrualModal(true); }}>
                ▶ Run Monthly Accrual
              </button>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setRolloverResult(null); setRolloverModal(true); }}>
                🔄 Year-End Rollover
              </button>
              <button className="btn btn-primary" onClick={() => {
                setPolicyForm({ leaveType: "", accrualType: "yearly", accrualDays: "18", maxBalance: "45", carryForwardMax: "15", encashmentEligible: false, probationLockMonths: "0" });
                setPolicyModal({} as LeavePolicy);
              }}>+ Add / Edit Policy</button>
            </div>
          </div>

          {policies.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-3)", fontSize: 13 }}>
              No leave policies configured yet. Add one to enable accrual and carry-forward rules.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Leave Type</th>
                  <th>Accrual</th>
                  <th>Max Balance</th>
                  <th>Carry Forward</th>
                  <th>Encashable</th>
                  <th>Probation Lock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.leave_type}</td>
                    <td style={{ fontSize: 13 }}>
                      {p.accrual_days}d / {p.accrual_type}
                    </td>
                    <td>{p.max_balance > 0 ? `${p.max_balance}d` : "Unlimited"}</td>
                    <td>{p.carry_forward_max > 0 ? `Up to ${p.carry_forward_max}d` : "None"}</td>
                    <td>
                      <span className={`badge ${p.encashment_eligible ? "badge-green" : "badge-red"}`}>
                        {p.encashment_eligible ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{p.probation_lock_months > 0 ? `${p.probation_lock_months} months` : "None"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => {
                            setPolicyForm({
                              leaveType: p.leave_type,
                              accrualType: p.accrual_type,
                              accrualDays: String(p.accrual_days),
                              maxBalance: String(p.max_balance),
                              carryForwardMax: String(p.carry_forward_max),
                              encashmentEligible: !!p.encashment_eligible,
                              probationLockMonths: String(p.probation_lock_months),
                            });
                            setPolicyModal(p);
                          }}>Edit</button>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => setCreditModal({ leaveType: p.leave_type })}>
                          Credit Balances
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Policy edit modal */}
          {policyModal !== null && (
            <div className="modal-overlay" onClick={() => setPolicyModal(null)}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-title">
                  {policyForm.leaveType ? `Edit Policy: ${policyForm.leaveType}` : "Add Leave Policy"}
                  <button className="modal-close" onClick={() => setPolicyModal(null)}>✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={lblStyle}>Leave Type *</label>
                    <input style={inpStyle} value={policyForm.leaveType}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, leaveType: e.target.value }))}
                      placeholder="e.g. Annual Leave" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lblStyle}>Accrual Type</label>
                      <select style={inpStyle} value={policyForm.accrualType}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, accrualType: e.target.value }))}>
                        <option value="yearly">Yearly</option>
                        <option value="monthly">Monthly</option>
                        <option value="on-joining">On Joining</option>
                      </select>
                    </div>
                    <div>
                      <label style={lblStyle}>Days per Cycle</label>
                      <input type="number" min="0" step="0.5" style={inpStyle} value={policyForm.accrualDays}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, accrualDays: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lblStyle}>Max Balance (days, 0=unlimited)</label>
                      <input type="number" min="0" style={inpStyle} value={policyForm.maxBalance}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, maxBalance: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lblStyle}>Carry Forward Max (0=none)</label>
                      <input type="number" min="0" style={inpStyle} value={policyForm.carryForwardMax}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, carryForwardMax: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lblStyle}>Probation Lock (months)</label>
                      <input type="number" min="0" style={inpStyle} value={policyForm.probationLockMonths}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, probationLockMonths: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
                      <input type="checkbox" id="encash" checked={policyForm.encashmentEligible}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, encashmentEligible: e.target.checked }))} />
                      <label htmlFor="encash" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>Encashment Eligible</label>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button className="btn btn-primary"
                      disabled={!policyForm.leaveType.trim() || policyFetcher.state !== "idle"}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "save-leave-policy");
                        fd.set("leaveType", policyForm.leaveType.trim());
                        fd.set("accrualType", policyForm.accrualType);
                        fd.set("accrualDays", policyForm.accrualDays);
                        fd.set("maxBalance", policyForm.maxBalance);
                        fd.set("carryForwardMax", policyForm.carryForwardMax);
                        fd.set("encashmentEligible", policyForm.encashmentEligible ? "1" : "0");
                        fd.set("probationLockMonths", policyForm.probationLockMonths);
                        policyFetcher.submit(fd, { method: "POST" });
                      }}>
                      {policyFetcher.state !== "idle" ? "Saving..." : "Save Policy"}
                    </button>
                    <button className="btn btn-outline" onClick={() => setPolicyModal(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Run Monthly Accrual modal */}
          {accrualModal && (
            <div className="modal-overlay" onClick={() => { setAccrualModal(false); setAccrualResult(null); }}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div className="modal-title">
                  Run Monthly Leave Accrual
                  <button className="modal-close" onClick={() => { setAccrualModal(false); setAccrualResult(null); }}>✕</button>
                </div>

                {accrualResult ? (
                  /* Result view */
                  <div>
                    <div style={{ padding: "12px 14px", background: accrualResult.dryRun ? "#fffbeb" : "#ecfdf5", borderRadius: 10, border: `1px solid ${accrualResult.dryRun ? "#fde68a" : "#a7f3d0"}`, marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: accrualResult.dryRun ? "#92400e" : "#065f46", marginBottom: 8 }}>
                        {accrualResult.dryRun ? "🔍 Dry Run — no changes written" : "✅ Accrual completed"} · {accrualResult.monthKey}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                        <div><span style={{ color: "var(--ink-3)" }}>Policies processed:</span> <strong>{accrualResult.policiesProcessed}</strong></div>
                        <div><span style={{ color: "var(--ink-3)" }}>Employees credited:</span> <strong>{accrualResult.credited}</strong></div>
                        <div><span style={{ color: "var(--ink-3)" }}>Days accrued:</span> <strong>{accrualResult.totalDaysAccrued}</strong></div>
                        <div><span style={{ color: "var(--ink-3)" }}>Skipped (probation):</span> <strong>{accrualResult.skippedProbation}</strong></div>
                        <div><span style={{ color: "var(--ink-3)" }}>Skipped (duplicate):</span> <strong>{accrualResult.skippedDuplicate}</strong></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {accrualResult.dryRun && (
                        <button className="btn btn-primary"
                          disabled={policyFetcher.state !== "idle"}
                          onClick={() => {
                            setAccrualResult(null);
                            const fd = new FormData();
                            fd.set("intent", "run-monthly-accrual");
                            fd.set("monthKey", accrualMonthKey);
                            fd.set("dryRun", "0");
                            policyFetcher.submit(fd, { method: "POST" });
                          }}>
                          Run for Real
                        </button>
                      )}
                      <button className="btn btn-outline" onClick={() => { setAccrualModal(false); setAccrualResult(null); }}>Close</button>
                    </div>
                  </div>
                ) : (
                  /* Input form */
                  <div>
                    <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.5 }}>
                      Credits prorated monthly leave (accrual_days ÷ 12) to all active employees for each <strong>monthly</strong> policy. Employees in probation are skipped automatically.
                    </p>
                    <div style={{ marginBottom: 14 }}>
                      <label style={lblStyle}>Accrual Month</label>
                      <input type="month" value={accrualMonthKey} onChange={(e) => setAccrualMonthKey(e.target.value)} style={inpStyle} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                      <input type="checkbox" id="accrualDry" checked={accrualDryRun} onChange={(e) => setAccrualDryRun(e.target.checked)} />
                      <label htmlFor="accrualDry" style={{ fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
                        Dry run — preview results without writing
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btn-primary"
                        disabled={!accrualMonthKey || policyFetcher.state !== "idle"}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("intent", "run-monthly-accrual");
                          fd.set("monthKey", accrualMonthKey);
                          fd.set("dryRun", accrualDryRun ? "1" : "0");
                          policyFetcher.submit(fd, { method: "POST" });
                        }}>
                        {policyFetcher.state !== "idle" ? "Running…" : accrualDryRun ? "Preview" : "Run Accrual"}
                      </button>
                      <button className="btn btn-outline" onClick={() => setAccrualModal(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Year-End Rollover modal */}
          {rolloverModal && (
            <div className="modal-overlay" onClick={() => { setRolloverModal(false); setRolloverResult(null); }}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div className="modal-title">
                  Year-End Leave Rollover
                  <button className="modal-close" onClick={() => { setRolloverModal(false); setRolloverResult(null); }}>✕</button>
                </div>

                {rolloverResult ? (
                  <div>
                    <div style={{ padding: "12px 14px", background: rolloverResult.dryRun ? "#fffbeb" : "#ecfdf5", borderRadius: 10, border: `1px solid ${rolloverResult.dryRun ? "#fde68a" : "#a7f3d0"}`, marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: rolloverResult.dryRun ? "#92400e" : "#065f46", marginBottom: 8 }}>
                        {rolloverResult.dryRun ? "🔍 Dry Run — no changes written" : "✅ Rollover completed"} · {rolloverResult.fromYear} → {rolloverResult.toYear}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                        <div><span style={{ color: "var(--ink-3)" }}>Employee × policy rows:</span> <strong>{rolloverResult.processed}</strong></div>
                        <div><span style={{ color: "var(--ink-3)" }}>Days carried forward:</span> <strong style={{ color: "var(--green)" }}>{rolloverResult.totalCarried}</strong></div>
                        <div><span style={{ color: "var(--ink-3)" }}>Days forfeited:</span> <strong style={{ color: "var(--red)" }}>{rolloverResult.totalForfeited}</strong></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {rolloverResult.dryRun && (
                        <button className="btn btn-primary"
                          disabled={policyFetcher.state !== "idle"}
                          onClick={() => {
                            setRolloverResult(null);
                            const fd = new FormData();
                            fd.set("intent", "year-end-rollover");
                            fd.set("fromYear", String(rolloverYear));
                            fd.set("dryRun", "0");
                            policyFetcher.submit(fd, { method: "POST" });
                          }}>
                          Apply Rollover
                        </button>
                      )}
                      <button className="btn btn-outline" onClick={() => { setRolloverModal(false); setRolloverResult(null); }}>Close</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.5 }}>
                      Carries unused leave (up to each policy's <strong>carry_forward_max</strong>) into the next year. Excess days are forfeited and logged. Run this at financial year-end.
                    </p>
                    <div style={{ marginBottom: 14 }}>
                      <label style={lblStyle}>Roll over from year</label>
                      <input type="number" value={rolloverYear} min={2020} max={2100}
                        onChange={(e) => setRolloverYear(Number(e.target.value))} style={inpStyle} />
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                        Will roll unused balances from {rolloverYear} → {rolloverYear + 1}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                      <input type="checkbox" id="rolloverDry" checked={rolloverDryRun} onChange={(e) => setRolloverDryRun(e.target.checked)} />
                      <label htmlFor="rolloverDry" style={{ fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
                        Dry run — preview without writing
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btn-primary"
                        disabled={policyFetcher.state !== "idle"}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("intent", "year-end-rollover");
                          fd.set("fromYear", String(rolloverYear));
                          fd.set("dryRun", rolloverDryRun ? "1" : "0");
                          policyFetcher.submit(fd, { method: "POST" });
                        }}>
                        {policyFetcher.state !== "idle" ? "Running…" : rolloverDryRun ? "Preview" : "Run Rollover"}
                      </button>
                      <button className="btn btn-outline" onClick={() => setRolloverModal(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Credit balances modal */}
          {creditModal && (
            <div className="modal-overlay" onClick={() => setCreditModal(null)}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-title">
                  Credit Leave Balances
                  <button className="modal-close" onClick={() => setCreditModal(null)}>✕</button>
                </div>
                <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.5 }}>
                  This will credit accrual days for <strong>{creditModal.leaveType}</strong> to all active employees for the current year.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-primary"
                    disabled={policyFetcher.state !== "idle"}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("intent", "credit-leave-balances");
                      fd.set("leaveType", creditModal.leaveType);
                      fd.set("year", String(new Date().getFullYear()));
                      policyFetcher.submit(fd, { method: "POST" });
                    }}>
                    {policyFetcher.state !== "idle" ? "Processing..." : "Confirm & Credit"}
                  </button>
                  <button className="btn btn-outline" onClick={() => setCreditModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </HRMSLayout>
  );
}

const lblStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 5 };
const inpStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", color: "var(--ink)" };
