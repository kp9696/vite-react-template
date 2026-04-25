import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/hrms.expenses";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExpenseStatus = "pending" | "approved" | "rejected" | "reimbursed";

interface ExpenseClaim {
  id: string;
  user_id: string;
  user_name: string;
  category: string;
  description: string;
  amount: number;
  claim_date: string;
  has_receipt: number;
  status: ExpenseStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  notes?: string | null;
  payment_ref?: string | null;
  reimbursed_at?: string | null;
  created_at: string;
}

interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string;
  status?: string;
}

interface ExpensePolicy {
  id: string;
  category: string;
  max_amount: number;
  requires_receipt_above: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

const CAT_COLORS: Record<string, string> = {
  "Travel": "#6366f1",
  "Meals": "#f59e0b",
  "Software": "#8b5cf6",
  "Office Supplies": "#10b981",
  "Training": "#ef4444",
  "Other": "#64748b",
};

const CAT_ICONS: Record<string, string> = {
  "Travel": "✈️",
  "Meals": "🍽️",
  "Software": "💻",
  "Office Supplies": "📦",
  "Training": "🎓",
  "Other": "🧾",
};

function statusBadge(status: ExpenseStatus) {
  if (status === "approved" || status === "reimbursed")
    return <span className="badge badge-green">{status === "reimbursed" ? "Reimbursed" : "Approved"}</span>;
  if (status === "pending")
    return <span className="badge badge-amber">Pending</span>;
  return <span className="badge badge-red">Rejected</span>;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Expenses" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isManager = isAdminRole(currentUser.role);

  const res = await callCoreHrmsApi<{ claims?: ExpenseClaim[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/expenses",
  });

  const policiesRes = await callCoreHrmsApi<{ policies?: ExpensePolicy[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/expense-policies",
  });

  return { currentUser, isManager, claims: res?.claims ?? [], expensePolicies: policiesRes?.policies ?? [] };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "submit-claim") {
    const category = String(formData.get("category") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    const claimDate = String(formData.get("claimDate") || "").trim();
    const hasReceipt = formData.get("hasReceipt") === "1";

    if (!category || !description || amount <= 0) {
      return { error: "Category, description, and a valid amount are required." };
    }

    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/expenses",
      method: "POST",
      body: { category, description, amount, claimDate, hasReceipt },
    });

    if (!res?.ok) return { error: res?.error || "Failed to submit claim." };
    return { ok: true, id: res.id };
  }

  if (intent === "decide-claim") {
    const id = String(formData.get("id") || "").trim();
    const status = String(formData.get("status") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!id || !status) return { error: "Invalid request." };

    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/expenses/${encodeURIComponent(id)}/decision`,
      method: "POST",
      body: { status, notes: notes || undefined },
    });

    if (!res?.ok) return { error: res?.error || "Failed to update claim." };
    return { ok: true, id, status };
  }

  if (intent === "reimburse-claim") {
    const id = String(formData.get("id") || "").trim();
    const paymentRef = String(formData.get("paymentRef") || "").trim();
    if (!id) return { error: "Invalid request." };
    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/expenses/${encodeURIComponent(id)}/reimburse`,
      method: "POST",
      body: { paymentRef: paymentRef || undefined },
    });
    if (!res?.ok) return { error: res?.error || "Failed to reimburse claim." };
    return { ok: true, id, status: "reimbursed" };
  }

  if (intent === "save-expense-policy") {
    const category = String(formData.get("category") || "").trim();
    const maxAmount = Number(formData.get("maxAmount") || 0);
    const requiresReceiptAbove = Number(formData.get("requiresReceiptAbove") || 500);
    if (!category) return { error: "Category is required." };
    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/expense-policies",
      method: "POST",
      body: { category, maxAmount, requiresReceiptAbove },
    });
    if (!res?.ok) return { error: res?.error || "Failed to save policy." };
    return { ok: true };
  }

  return { error: "Unsupported action." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Expenses() {
  const { currentUser, isManager, claims: initialClaims, expensePolicies: initialPolicies } = useLoaderData<typeof loader>();
  const submitFetcher = useFetcher<ActionResult>();
  const decideFetcher = useFetcher<ActionResult>();
  const reimburseFetcher = useFetcher<ActionResult>();
  const policyFetcher = useFetcher<ActionResult>();

  const [tab, setTab] = useState<"all" | "pending" | "mine" | "policy">("all");
  const [showForm, setShowForm] = useState(false);
  const [claims, setClaims] = useState<ExpenseClaim[]>(initialClaims);
  const [expensePolicies, setExpensePolicies] = useState<ExpensePolicy[]>(initialPolicies);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = useState({ category: "Travel", description: "", amount: "", claimDate: "", hasReceipt: false });
  const [reimburseModal, setReimburseModal] = useState<{ id: string; amount: number; user_name: string } | null>(null);
  const [paymentRef, setPaymentRef] = useState("");
  const [policyModal, setPolicyModal] = useState<Partial<ExpensePolicy> | null>(null);
  const [policyForm, setPolicyForm] = useState({ category: "Travel", maxAmount: "0", requiresReceiptAbove: "500" });
  const pendingSubmit = useRef<ExpenseClaim | null>(null);
  const pendingDecide = useRef<{ id: string; status: string } | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Handle submit result
  useEffect(() => {
    const data = submitFetcher.data;
    if (!data) return;
    if (data.error) { setToast({ msg: data.error, ok: false }); return; }
    if (data.ok && pendingSubmit.current) {
      setClaims((prev) => [{ ...pendingSubmit.current!, id: data.id ?? pendingSubmit.current!.id }, ...prev]);
      setForm({ category: "Travel", description: "", amount: "", claimDate: "", hasReceipt: false });
      setShowForm(false);
      setToast({ msg: "✓ Expense claim submitted.", ok: true });
      pendingSubmit.current = null;
    }
  }, [submitFetcher.data]);

  // Handle decide result
  useEffect(() => {
    const data = decideFetcher.data;
    if (!data) return;
    if (data.error) { setToast({ msg: data.error, ok: false }); return; }
    if (data.ok && pendingDecide.current) {
      const { id, status } = pendingDecide.current;
      setClaims((prev) => prev.map((c) => c.id === id ? { ...c, status: status as ExpenseStatus } : c));
      setToast({ msg: `✓ Claim ${status}.`, ok: true });
      pendingDecide.current = null;
    }
  }, [decideFetcher.data]);

  // Handle reimburse result
  useEffect(() => {
    const data = reimburseFetcher.data;
    if (!data) return;
    if (data.error) { setToast({ msg: data.error, ok: false }); return; }
    if (data.ok && data.id) {
      setClaims((prev) => prev.map((c) => c.id === data.id ? { ...c, status: "reimbursed", payment_ref: paymentRef || null } : c));
      setToast({ msg: "✓ Expense reimbursed.", ok: true });
      setReimburseModal(null);
      setPaymentRef("");
    }
  }, [reimburseFetcher.data]);

  // Handle policy save result
  useEffect(() => {
    const data = policyFetcher.data;
    if (!data) return;
    if (data.error) { setToast({ msg: data.error, ok: false }); return; }
    if (data.ok) {
      setToast({ msg: "Policy saved.", ok: true });
      setPolicyModal(null);
    }
  }, [policyFetcher.data]);

  const handleSubmit = () => {
    if (!form.description.trim() || !Number(form.amount)) {
      setToast({ msg: "Description and amount are required.", ok: false });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const newClaim: ExpenseClaim = {
      id: `EXP-${Date.now().toString().slice(-6)}`,
      user_id: currentUser.id,
      user_name: currentUser.name,
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      claim_date: form.claimDate || today,
      has_receipt: form.hasReceipt ? 1 : 0,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    pendingSubmit.current = newClaim;
    const fd = new FormData();
    fd.set("intent", "submit-claim");
    fd.set("category", form.category);
    fd.set("description", form.description);
    fd.set("amount", String(form.amount));
    fd.set("claimDate", form.claimDate || today);
    fd.set("hasReceipt", form.hasReceipt ? "1" : "0");
    submitFetcher.submit(fd, { method: "POST" });
  };

  const handleDecide = (id: string, status: string) => {
    pendingDecide.current = { id, status };
    const fd = new FormData();
    fd.set("intent", "decide-claim");
    fd.set("id", id);
    fd.set("status", status);
    decideFetcher.submit(fd, { method: "POST" });
  };

  const filtered = tab === "pending"
    ? claims.filter((c) => c.status === "pending")
    : tab === "mine"
    ? claims.filter((c) => c.user_id === currentUser.id)
    : claims.filter((c) => tab === "all" || tab === "policy");

  const totalPending    = claims.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalApproved   = claims.filter((c) => c.status === "approved").reduce((s, c) => s + c.amount, 0);
  const totalReimbursed = claims.filter((c) => c.status === "reimbursed").reduce((s, c) => s + c.amount, 0);
  const pendingCount    = claims.filter((c) => c.status === "pending").length;

  // Category spend totals
  const catTotals = Object.fromEntries(
    Object.keys(CAT_COLORS).map((cat) => [
      cat,
      claims.filter((c) => c.category === cat).reduce((s, c) => s + c.amount, 0),
    ])
  );
  const maxCatSpend = Math.max(...Object.values(catTotals), 1);

  // Top category
  const topCat = Object.entries(catTotals).sort(([, a], [, b]) => b - a)[0];
  const topCatName = topCat?.[0] ?? "—";
  const topCatPct = claims.length > 0
    ? Math.round((catTotals[topCatName] / claims.reduce((s, c) => s + c.amount, 0)) * 100)
    : 0;

  return (
    <HRMSLayout currentUser={currentUser}>
      {/* Toast */}
      {toast ? (
        <div className={`toast ${toast.ok ? "toast-success" : "toast-error"}`}>{toast.msg}</div>
      ) : null}

      {/* Reimburse modal */}
      {reimburseModal && (
        <div className="modal-overlay" onClick={() => { setReimburseModal(null); setPaymentRef(""); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-title">
              Reimburse Claim
              <button className="modal-close" onClick={() => { setReimburseModal(null); setPaymentRef(""); }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
              {reimburseModal.user_name} · <strong>{fmt(reimburseModal.amount)}</strong>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lblStyle}>Payment Reference <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(optional)</span></label>
              <input style={fldStyle} value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. TXN123456 or Bank Transfer" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-success"
                disabled={reimburseFetcher.state !== "idle"}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("intent", "reimburse-claim");
                  fd.set("id", reimburseModal.id);
                  fd.set("paymentRef", paymentRef);
                  reimburseFetcher.submit(fd, { method: "POST" });
                }}>
                {reimburseFetcher.state !== "idle" ? "Processing..." : "Confirm Reimbursement"}
              </button>
              <button className="btn btn-outline" onClick={() => { setReimburseModal(null); setPaymentRef(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Expense Management</div>
          <div className="page-sub">Submit, track, and reimburse employee expenses.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Claim"}
        </button>
      </div>

      {/* New Claim Form */}
      {showForm ? (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Submit New Expense Claim</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={lblStyle}>Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={fldStyle}>
                {Object.keys(CAT_COLORS).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0" style={fldStyle} min={1} />
            </div>
            <div>
              <label style={lblStyle}>Date</label>
              <input type="date" value={form.claimDate} onChange={(e) => setForm((f) => ({ ...f, claimDate: e.target.value }))} style={fldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lblStyle}>Description *</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of the expense…" style={fldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={form.hasReceipt} onChange={(e) => setForm((f) => ({ ...f, hasReceipt: e.target.checked }))} />
                Receipt attached / available
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitFetcher.state !== "idle"}>
              {submitFetcher.state !== "idle" ? "Submitting…" : "Submit Claim"}
            </button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--amber)" }}>{fmt(totalPending)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{pendingCount} claim{pendingCount !== 1 ? "s" : ""}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--accent)" }}>{fmt(totalApproved)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Awaiting reimbursement</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reimbursed</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{fmt(totalReimbursed)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Paid out</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Category</div>
          <div className="stat-value" style={{ fontSize: 22 }}>
            {claims.length > 0 ? `${CAT_ICONS[topCatName] ?? "🧾"} ${topCatName}` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            {claims.length > 0 ? `${topCatPct}% of all claims` : "No data yet"}
          </div>
        </div>
      </div>

      {/* Category chart */}
      {claims.length > 0 ? (
        <div className="card">
          <div className="card-title">Spend by Category</div>
          <div style={{ display: "flex", gap: 16 }}>
            {Object.entries(CAT_COLORS).map(([cat, color]) => {
              const total = catTotals[cat];
              return (
                <div key={cat} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 8 }}>
                    <div style={{
                      width: "60%", background: color,
                      borderRadius: "6px 6px 0 0",
                      height: `${Math.max((total / maxCatSpend) * 100, total > 0 ? 5 : 0)}%`,
                      opacity: total > 0 ? 1 : 0.15,
                      transition: "height 0.3s",
                    }} />
                  </div>
                  <div style={{ fontSize: 18 }}>{CAT_ICONS[cat]}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>{cat}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: total > 0 ? color : "var(--ink-3)" }}>
                    {total > 0 ? fmt(total) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Claims table */}
      <div className="card">
        <div className="tab-bar" style={{ marginBottom: 20 }}>
          <button className={`tab-btn ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All Claims</button>
          <button className={`tab-btn ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
            Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
          <button className={`tab-btn ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>My Claims</button>
          {isManager && (
            <button className={`tab-btn ${tab === "policy" ? "active" : ""}`} onClick={() => setTab("policy")}>Expense Policy</button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">No expense claims yet</div>
            <div className="empty-state-sub">
              {tab === "mine" ? "Submit your first claim using the button above." : "No claims match this filter."}
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee</th>
                <th>Category</th>
                <th>Description</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Status</th>
                {isManager ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "monospace" }}>{c.id}</td>
                  <td style={{ fontWeight: 600, color: "var(--ink)" }}>{c.user_name}</td>
                  <td>
                    <span style={{ fontSize: 12 }}>
                      {CAT_ICONS[c.category] ?? "🧾"} {c.category}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--ink-2)", maxWidth: 200 }}>{c.description}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(c.claim_date)}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(c.amount)}</td>
                  <td>
                    {c.has_receipt
                      ? <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }}>✓ Attached</span>
                      : <span style={{ color: "var(--red)", fontSize: 12 }}>Missing</span>}
                  </td>
                  <td>{statusBadge(c.status)}</td>
                  {isManager ? (
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {c.status === "pending" ? (
                          <>
                            <button
                              className="btn btn-success"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                              onClick={() => handleDecide(c.id, "approved")}
                            >✓</button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                              onClick={() => handleDecide(c.id, "rejected")}
                            >✕</button>
                          </>
                        ) : null}
                        {c.status === "approved" ? (
                          <button
                            className="btn btn-outline"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => setReimburseModal({ id: c.id, amount: c.amount, user_name: c.user_name })}
                          >💸 Reimburse</button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Expense Policy tab */}
      {tab === "policy" && isManager && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Expense Policies</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>Set per-category spending limits and receipt requirements.</div>
            </div>
            <button className="btn btn-primary" onClick={() => {
              setPolicyForm({ category: "Travel", maxAmount: "0", requiresReceiptAbove: "500" });
              setPolicyModal({});
            }}>+ Add / Edit Policy</button>
          </div>
          {expensePolicies.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--ink-3)", fontSize: 13 }}>No expense policies set. All claims accepted without limits.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Max Claim Amount</th>
                  <th>Receipt Required Above</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expensePolicies.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{CAT_ICONS[p.category] ?? "🧾"} {p.category}</td>
                    <td>{p.max_amount > 0 ? fmt(p.max_amount) : <span style={{ color: "var(--ink-3)" }}>No limit</span>}</td>
                    <td>{p.requires_receipt_above > 0 ? fmt(p.requires_receipt_above) : "Always"}</td>
                    <td>
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => {
                          setPolicyForm({ category: p.category, maxAmount: String(p.max_amount), requiresReceiptAbove: String(p.requires_receipt_above) });
                          setPolicyModal(p);
                        }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {policyModal !== null && (
            <div className="modal-overlay" onClick={() => setPolicyModal(null)}>
              <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <div className="modal-title">
                  {policyModal.id ? `Edit Policy: ${policyForm.category}` : "Add Expense Policy"}
                  <button className="modal-close" onClick={() => setPolicyModal(null)}>✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={lblStyle}>Category</label>
                    <select style={fldStyle} value={policyForm.category}
                      onChange={(e) => setPolicyForm((f) => ({ ...f, category: e.target.value }))}>
                      {Object.keys(CAT_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lblStyle}>Max Amount (₹, 0=no limit)</label>
                      <input type="number" min="0" style={fldStyle} value={policyForm.maxAmount}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, maxAmount: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lblStyle}>Receipt Required Above (₹)</label>
                      <input type="number" min="0" style={fldStyle} value={policyForm.requiresReceiptAbove}
                        onChange={(e) => setPolicyForm((f) => ({ ...f, requiresReceiptAbove: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button className="btn btn-primary"
                      disabled={policyFetcher.state !== "idle"}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "save-expense-policy");
                        fd.set("category", policyForm.category);
                        fd.set("maxAmount", policyForm.maxAmount);
                        fd.set("requiresReceiptAbove", policyForm.requiresReceiptAbove);
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
        </div>
      )}
    </HRMSLayout>
  );
}

const lblStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fldStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", color: "var(--ink)" };
