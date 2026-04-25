import { useState, useRef, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.loans";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole, avatarColor, getInitials } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type LoanStatus = "pending" | "approved" | "active" | "rejected" | "closed";

interface EmployeeLoan {
  id: string;
  user_id: string;
  user_name: string;
  loan_type: string;
  amount: number;
  emi_amount: number;
  emi_months: number;
  emis_paid: number;
  outstanding: number;
  purpose: string | null;
  status: LoanStatus;
  approved_at: string | null;
  rejection_note: string | null;
  disburse_ref: string | null;
  disbursed_at: string | null;
  created_at: string;
}

type ActionResult = { ok?: boolean; error?: string; id?: string; status?: string; intent?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

const LOAN_TYPE_LABELS: Record<string, string> = {
  salary_advance: "Salary Advance",
  personal_loan: "Personal Loan",
  vehicle_loan: "Vehicle Loan",
};

function loanTypeName(t: string) { return LOAN_TYPE_LABELS[t] ?? t; }

function statusBadge(s: LoanStatus) {
  const cfg: Record<LoanStatus, { bg: string; color: string; label: string }> = {
    pending:  { bg: "#fef3c7", color: "#92400e", label: "Pending" },
    approved: { bg: "#d1fae5", color: "#065f46", label: "Approved" },
    active:   { bg: "#dbeafe", color: "#1e40af", label: "Active" },
    rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
    closed:   { bg: "#f1f5f9", color: "#475569", label: "Closed" },
  };
  const { bg, color, label } = cfg[s] ?? cfg.pending;
  return (
    <span style={{ background: bg, color, borderRadius: 6, padding: "2px 9px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{ background: "#6366f1", borderRadius: 4, height: 6, width: `${pct}%`, transition: "width .3s" }} />
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Loans & Advances" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);

  const res = await callCoreHrmsApi<{ loans?: EmployeeLoan[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/loans",
  });

  return { currentUser, isAdmin, loans: res?.loans ?? [] };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "apply") {
    const amount = Number(formData.get("amount") ?? 0);
    const emiMonths = Number(formData.get("emiMonths") ?? 1);
    if (!amount || amount <= 0) return { intent, error: "Amount must be greater than 0." };
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/loans", method: "POST",
      body: {
        loanType: String(formData.get("loanType") ?? "salary_advance"),
        amount,
        emiMonths,
        purpose: String(formData.get("purpose") ?? "").trim() || undefined,
      },
    });
    return { ...res, intent };
  }

  if (intent === "decide") {
    const loanId = String(formData.get("loanId") ?? "");
    const decision = String(formData.get("decision") ?? "");
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/loans/${loanId}/decision`, method: "PATCH",
      body: {
        decision,
        rejectionNote: String(formData.get("rejectionNote") ?? "").trim() || undefined,
        disburseRef: String(formData.get("disburseRef") ?? "").trim() || undefined,
      },
    });
    return { ...res, intent };
  }

  if (intent === "record-emi") {
    const loanId = String(formData.get("loanId") ?? "");
    const monthKey = String(formData.get("monthKey") ?? "");
    const emiAmount = Number(formData.get("emiAmount") ?? 0) || undefined;
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/loans/${loanId}/emi`, method: "POST",
      body: { monthKey, emiAmount },
    });
    return { ...res, intent };
  }

  if (intent === "close-loan") {
    const loanId = String(formData.get("loanId") ?? "");
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/loans/${loanId}/close`, method: "POST",
      body: {},
    });
    return { ...res, intent };
  }

  return { error: "Unknown intent.", intent };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Loans() {
  const { currentUser, isAdmin, loans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();

  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply Loan modal
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({ loanType: "salary_advance", amount: "", emiMonths: "1", purpose: "" });

  // Decide (approve/reject) modal
  const [decideModal, setDecideModal] = useState<{ loan: EmployeeLoan; decision: "approved" | "rejected" } | null>(null);
  const [decideForm, setDecideForm] = useState({ disburseRef: "", rejectionNote: "" });

  // Record EMI modal
  const [emiModal, setEmiModal] = useState<EmployeeLoan | null>(null);
  const [emiForm, setEmiForm] = useState({ monthKey: new Date().toISOString().slice(0, 7), emiAmount: "" });

  // Selected loan (detail panel)
  const [selectedLoan, setSelectedLoan] = useState<EmployeeLoan | null>(null);

  // Tab (admin only)
  const [tab, setTab] = useState<"all" | "active" | "pending" | "closed">("all");

  useEffect(() => {
    if (!fetcher.data) return;
    const d = fetcher.data;
    const ok = !!d.ok;
    const message = d.error ?? (ok ? "Done!" : "Something went wrong.");
    setToast({ ok, message });
    if (ok) {
      setShowApplyModal(false);
      setDecideModal(null);
      setEmiModal(null);
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [fetcher.data]);

  const busy = fetcher.state !== "idle";

  const filteredLoans = loans.filter((l) => {
    if (!isAdmin) return true;
    if (tab === "all") return true;
    if (tab === "active") return l.status === "active";
    if (tab === "pending") return l.status === "pending";
    if (tab === "closed") return ["closed", "rejected"].includes(l.status);
    return true;
  });

  const pendingCount = loans.filter((l) => l.status === "pending").length;

  // ── Sub-renders ─────────────────────────────────────────────────────────────

  function LoanCard({ loan }: { loan: EmployeeLoan }) {
    const isSelected = selectedLoan?.id === loan.id;
    return (
      <div
        onClick={() => setSelectedLoan(isSelected ? null : loan)}
        style={{
          background: isSelected ? "#f0f4ff" : "#fff",
          border: isSelected ? "1.5px solid #6366f1" : "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "14px 16px",
          cursor: "pointer",
          transition: "box-shadow .15s",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {isAdmin && (
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: avatarColor(loan.user_name),
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {getInitials(loan.user_name)}
              </div>
            )}
            <div>
              {isAdmin && <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{loan.user_name}</div>}
              <div style={{ fontSize: 13, color: "#64748b" }}>{loanTypeName(loan.loan_type)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{fmt(loan.amount)}</span>
            {statusBadge(loan.status)}
          </div>
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <Stat label="EMI" value={fmt(loan.emi_amount) + "/mo"} />
          <Stat label="Paid" value={`${loan.emis_paid}/${loan.emi_months} months`} />
          <Stat label="Outstanding" value={fmt(loan.outstanding)} color={loan.outstanding > 0 ? "#ef4444" : "#10b981"} />
        </div>
        {loan.status === "active" && loan.emi_months > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Repayment progress</div>
            <ProgressBar value={loan.emis_paid} max={loan.emi_months} />
          </div>
        )}
        {isSelected && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <Stat label="Applied On" value={fmtDate(loan.created_at)} />
              {loan.approved_at && <Stat label="Approved On" value={fmtDate(loan.approved_at)} />}
              {loan.disbursed_at && <Stat label="Disbursed On" value={fmtDate(loan.disbursed_at)} />}
              {loan.disburse_ref && <Stat label="Payment Ref" value={loan.disburse_ref} />}
              {loan.rejection_note && <Stat label="Rejection Note" value={loan.rejection_note} />}
              {loan.purpose && <Stat label="Purpose" value={loan.purpose} />}
            </div>
            {isAdmin && loan.status === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setDecideForm({ disburseRef: "", rejectionNote: "" }); setDecideModal({ loan, decision: "approved" }); }}
                  style={{ flex: 1, background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  Approve
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDecideForm({ disburseRef: "", rejectionNote: "" }); setDecideModal({ loan, decision: "rejected" }); }}
                  style={{ flex: 1, background: "#fff", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 0", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  Reject
                </button>
              </div>
            )}
            {isAdmin && loan.status === "active" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setEmiForm({ monthKey: new Date().toISOString().slice(0, 7), emiAmount: String(loan.emi_amount) }); setEmiModal(loan); }}
                  style={{ flex: 1, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  Record EMI Deduction
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`Close this loan and mark ${loan.user_name}'s outstanding balance as fully settled?`)) return;
                    const fd = new FormData();
                    fd.append("intent", "close-loan");
                    fd.append("loanId", loan.id);
                    fetcher.submit(fd, { method: "POST" });
                  }}
                  style={{ background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>Loans & Advances</h1>
            <p style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>
              {isAdmin ? "Manage employee salary advances and loans." : "Apply for a salary advance or personal loan."}
            </p>
          </div>
          {!isAdmin && (
            <button
              onClick={() => { setApplyForm({ loanType: "salary_advance", amount: "", emiMonths: "1", purpose: "" }); setShowApplyModal(true); }}
              style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
            >
              + Apply for Loan
            </button>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Loans", value: loans.length, icon: "💳", color: "#6366f1" },
            { label: "Active", value: loans.filter(l => l.status === "active").length, icon: "🔵", color: "#3b82f6" },
            { label: "Pending Approval", value: pendingCount, icon: "⏳", color: "#f59e0b" },
            {
              label: "Total Outstanding",
              value: fmt(loans.filter(l => l.status === "active").reduce((s, l) => s + l.outstanding, 0)),
              icon: "💰", color: "#ef4444",
            },
          ].map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs (admin) */}
        {isAdmin && (
          <div style={{ display: "flex", gap: 4, background: "#f8fafc", borderRadius: 10, padding: 4, marginBottom: 18, width: "fit-content" }}>
            {(["all", "pending", "active", "closed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "#fff" : "transparent",
                  color: tab === t ? "#6366f1" : "#64748b",
                  border: tab === t ? "1px solid #e2e8f0" : "1px solid transparent",
                  borderRadius: 8, padding: "6px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === "pending" && pendingCount > 0 && (
                  <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11 }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Loan list */}
        {filteredLoans.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: "#64748b" }}>No loans found</div>
            {!isAdmin && (
              <button
                onClick={() => { setApplyForm({ loanType: "salary_advance", amount: "", emiMonths: "1", purpose: "" }); setShowApplyModal(true); }}
                style={{ marginTop: 12, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer" }}
              >
                Apply for Loan
              </button>
            )}
          </div>
        ) : (
          <div>{filteredLoans.map((loan) => <LoanCard key={loan.id} loan={loan} />)}</div>
        )}
      </div>

      {/* ── Apply Modal ─────────────────────────────────────────────────────── */}
      {showApplyModal && (
        <ModalBackdrop onClose={() => setShowApplyModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 440, maxWidth: "95vw" }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Apply for Loan / Advance</h3>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="apply" />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Loan Type">
                  <select
                    name="loanType" value={applyForm.loanType}
                    onChange={(e) => setApplyForm({ ...applyForm, loanType: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="salary_advance">Salary Advance</option>
                    <option value="personal_loan">Personal Loan</option>
                    <option value="vehicle_loan">Vehicle Loan</option>
                  </select>
                </Field>
                <Field label="Amount (₹)">
                  <input
                    type="number" name="amount" min={1} required
                    placeholder="e.g. 25000"
                    value={applyForm.amount}
                    onChange={(e) => setApplyForm({ ...applyForm, amount: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Repayment (months)">
                  <input
                    type="number" name="emiMonths" min={1} max={36}
                    value={applyForm.emiMonths}
                    onChange={(e) => setApplyForm({ ...applyForm, emiMonths: e.target.value })}
                    style={inputStyle}
                  />
                  {applyForm.amount && applyForm.emiMonths && Number(applyForm.amount) > 0 && Number(applyForm.emiMonths) > 0 && (
                    <div style={{ fontSize: 12, color: "#6366f1", marginTop: 4 }}>
                      Monthly EMI: {fmt(Math.ceil(Number(applyForm.amount) / Number(applyForm.emiMonths)))}
                    </div>
                  )}
                </Field>
                <Field label="Purpose (optional)">
                  <input
                    type="text" name="purpose" placeholder="e.g. Medical emergency"
                    value={applyForm.purpose}
                    onChange={(e) => setApplyForm({ ...applyForm, purpose: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
              </div>
              {fetcher.data?.error && (
                <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "8px 12px", marginTop: 14, fontSize: 13 }}>
                  {fetcher.data.error}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowApplyModal(false)}
                  style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  style={{ flex: 2, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
                  {busy ? "Submitting…" : "Submit Application"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Decide Modal ─────────────────────────────────────────────────────── */}
      {decideModal && (
        <ModalBackdrop onClose={() => setDecideModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 420, maxWidth: "95vw" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
              {decideModal.decision === "approved" ? "✅ Approve Loan" : "❌ Reject Loan"}
            </h3>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 18 }}>
              {decideModal.loan.user_name} — {loanTypeName(decideModal.loan.loan_type)} of {fmt(decideModal.loan.amount)}
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="decide" />
              <input type="hidden" name="loanId" value={decideModal.loan.id} />
              <input type="hidden" name="decision" value={decideModal.decision} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {decideModal.decision === "approved" ? (
                  <Field label="Payment / Transfer Reference (optional)">
                    <input
                      type="text" name="disburseRef" placeholder="e.g. NEFT/UTR12345"
                      value={decideForm.disburseRef}
                      onChange={(e) => setDecideForm({ ...decideForm, disburseRef: e.target.value })}
                      style={inputStyle}
                    />
                  </Field>
                ) : (
                  <Field label="Rejection Reason (optional)">
                    <textarea
                      name="rejectionNote" rows={3} placeholder="Reason for rejection…"
                      value={decideForm.rejectionNote}
                      onChange={(e) => setDecideForm({ ...decideForm, rejectionNote: e.target.value })}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </Field>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setDecideModal(null)}
                  style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  style={{
                    flex: 2, background: decideModal.decision === "approved" ? "#10b981" : "#ef4444",
                    color: "#fff", border: "none", borderRadius: 8, padding: "9px 0",
                    fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
                  }}>
                  {busy ? "Processing…" : decideModal.decision === "approved" ? "Approve & Disburse" : "Reject"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </ModalBackdrop>
      )}

      {/* ── EMI Modal ────────────────────────────────────────────────────────── */}
      {emiModal && (
        <ModalBackdrop onClose={() => setEmiModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 400, maxWidth: "95vw" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Record EMI Deduction</h3>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 18 }}>
              {emiModal.user_name} — Outstanding: {fmt(emiModal.outstanding)}
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="record-emi" />
              <input type="hidden" name="loanId" value={emiModal.id} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Payroll Month">
                  <input
                    type="month" name="monthKey" required
                    value={emiForm.monthKey}
                    onChange={(e) => setEmiForm({ ...emiForm, monthKey: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label={`EMI Amount (default: ${fmt(emiModal.emi_amount)})`}>
                  <input
                    type="number" name="emiAmount" min={1}
                    placeholder={String(emiModal.emi_amount)}
                    value={emiForm.emiAmount}
                    onChange={(e) => setEmiForm({ ...emiForm, emiAmount: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setEmiModal(null)}
                  style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  style={{ flex: 2, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
                  {busy ? "Saving…" : "Record Deduction"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </ModalBackdrop>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: toast.ok ? "#10b981" : "#ef4444", color: "#fff",
          borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14,
          boxShadow: "0 4px 20px rgba(0,0,0,.18)",
        }}>
          {toast.ok ? "✅" : "❌"} {toast.message}
        </div>
      )}
    </HRMSLayout>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: color ?? "#1e293b" }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8,
  fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff",
};
