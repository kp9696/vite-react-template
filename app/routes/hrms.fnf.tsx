import { useState, useRef, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.fnf";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type FnfStatus = "draft" | "approved" | "disbursed";

interface FnfSettlement {
  id: string;
  user_id: string;
  user_name: string;
  last_working_day: string;
  pending_salary: number;
  leave_encashment: number;
  gratuity: number;
  bonus: number;
  other_earnings: number;
  loan_recovery: number;
  tds_recovery: number;
  other_deductions: number;
  gross_payable: number;
  total_deductions: number;
  net_payable: number;
  status: FnfStatus;
  notes: string | null;
  approved_at: string | null;
  disbursed_at: string | null;
  payment_ref: string | null;
  created_at: string;
}

interface ComputedFnf {
  userId: string;
  name: string;
  annualCtc: number;
  monthlySalary: number;
  yearsOfService: number;
  completeYears: number;
  gratuityEligible: boolean;
  computed: {
    pendingSalary: number;
    leaveEncashment: number;
    gratuity: number;
    bonus: number;
    otherEarnings: number;
    loanRecovery: number;
    tdsRecovery: number;
    otherDeductions: number;
    grossPayable: number;
    totalDeductions: number;
    netPayable: number;
  };
}

type ActionResult = { ok?: boolean; error?: string; id?: string; status?: string; intent?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function statusBadge(s: FnfStatus) {
  const cfg = {
    draft:    { bg: "#fef3c7", color: "#92400e", label: "Draft" },
    approved: { bg: "#d1fae5", color: "#065f46", label: "Approved" },
    disbursed:{ bg: "#dbeafe", color: "#1e40af", label: "Disbursed" },
  };
  const { bg, color, label } = cfg[s];
  return (
    <span style={{ background: bg, color, borderRadius: 6, padding: "2px 9px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Full & Final Settlement" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);

  if (!isAdmin) {
    return { currentUser, isAdmin, settlements: [] as FnfSettlement[] };
  }

  const res = await callCoreHrmsApi<{ settlements?: FnfSettlement[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/fnf",
  });

  return { currentUser, isAdmin, settlements: res?.settlements ?? [] };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "compute") {
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return { intent, error: "userId is required." };
    const res = await callCoreHrmsApi<ComputedFnf & { error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/fnf/compute/${userId}`,
    });
    return { ...res, intent } as ActionResult & ComputedFnf;
  }

  if (intent === "create-fnf") {
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/fnf", method: "POST",
      body: {
        userId:          String(formData.get("userId") ?? ""),
        exitId:          String(formData.get("exitId") ?? "") || undefined,
        lastWorkingDay:  String(formData.get("lastWorkingDay") ?? ""),
        pendingSalary:   Number(formData.get("pendingSalary") ?? 0),
        leaveEncashment: Number(formData.get("leaveEncashment") ?? 0),
        gratuity:        Number(formData.get("gratuity") ?? 0),
        bonus:           Number(formData.get("bonus") ?? 0),
        otherEarnings:   Number(formData.get("otherEarnings") ?? 0),
        loanRecovery:    Number(formData.get("loanRecovery") ?? 0),
        tdsRecovery:     Number(formData.get("tdsRecovery") ?? 0),
        otherDeductions: Number(formData.get("otherDeductions") ?? 0),
        notes:           String(formData.get("notes") ?? "") || undefined,
      },
    });
    return { ...res, intent };
  }

  if (intent === "approve-fnf") {
    const fnfId = String(formData.get("fnfId") ?? "");
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/fnf/${fnfId}/approve`, method: "PATCH",
      body: {},
    });
    return { ...res, intent };
  }

  if (intent === "disburse-fnf") {
    const fnfId = String(formData.get("fnfId") ?? "");
    const res = await callCoreHrmsApi<ActionResult>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/fnf/${fnfId}/disburse`, method: "PATCH",
      body: { paymentRef: String(formData.get("paymentRef") ?? "") || undefined },
    });
    return { ...res, intent };
  }

  return { error: "Unknown intent.", intent };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FnfPage() {
  const { currentUser, isAdmin, settlements } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const computeFetcher = useFetcher<(ActionResult & Partial<ComputedFnf>) | null>();

  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New settlement workflow
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({
    userId: "", lastWorkingDay: "", exitId: "", notes: "",
    pendingSalary: 0, leaveEncashment: 0, gratuity: 0,
    bonus: 0, otherEarnings: 0, loanRecovery: 0, tdsRecovery: 0, otherDeductions: 0,
  });
  const [computed, setComputed] = useState<ComputedFnf | null>(null);

  // Selected row for detail panel
  const [selected, setSelected] = useState<FnfSettlement | null>(null);

  // Disburse modal
  const [disburseModal, setDisburseModal] = useState<FnfSettlement | null>(null);
  const [paymentRef, setPaymentRef] = useState("");

  useEffect(() => {
    if (!fetcher.data) return;
    const d = fetcher.data;
    const ok = !!d.ok;
    setToast({ ok, message: d.error ?? (ok ? "Done!" : "Something went wrong.") });
    if (ok) { setShowNewModal(false); setDisburseModal(null); setSelected(null); }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [fetcher.data]);

  // When compute returns, populate the form
  useEffect(() => {
    if (!computeFetcher.data || computeFetcher.data.error || !("computed" in computeFetcher.data)) return;
    const c = computeFetcher.data as ComputedFnf;
    setComputed(c);
    setNewForm((f) => ({
      ...f,
      pendingSalary:   c.computed.pendingSalary,
      leaveEncashment: c.computed.leaveEncashment,
      gratuity:        c.computed.gratuity,
      loanRecovery:    c.computed.loanRecovery,
      tdsRecovery:     c.computed.tdsRecovery,
    }));
  }, [computeFetcher.data]);

  const busy = fetcher.state !== "idle";
  const computing = computeFetcher.state !== "idle";

  const grossPayable = newForm.pendingSalary + newForm.leaveEncashment + newForm.gratuity + newForm.bonus + newForm.otherEarnings;
  const totalDed = newForm.loanRecovery + newForm.tdsRecovery + newForm.otherDeductions;
  const netPayable = Math.max(0, grossPayable - totalDed);

  if (!isAdmin) {
    return (
      <HRMSLayout currentUser={currentUser}>
        <div style={{ maxWidth: 600, margin: "80px auto", textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#1e293b", marginBottom: 8 }}>HR Access Only</div>
          <div style={{ fontSize: 14 }}>Full & Final settlements are managed by HR. Contact your HR team for details about your F&amp;F.</div>
        </div>
      </HRMSLayout>
    );
  }

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>Full &amp; Final Settlement</h1>
            <p style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>
              Compute and process F&amp;F for exiting employees — pending salary, leave encashment, and gratuity.
            </p>
          </div>
          <button
            onClick={() => { setNewForm({ userId: "", lastWorkingDay: "", exitId: "", notes: "", pendingSalary: 0, leaveEncashment: 0, gratuity: 0, bonus: 0, otherEarnings: 0, loanRecovery: 0, tdsRecovery: 0, otherDeductions: 0 }); setComputed(null); setShowNewModal(true); }}
            style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
          >
            + New F&amp;F Settlement
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total", value: settlements.length, icon: "📋", color: "#6366f1" },
            { label: "Draft", value: settlements.filter(s => s.status === "draft").length, icon: "✏️", color: "#f59e0b" },
            { label: "Approved", value: settlements.filter(s => s.status === "approved").length, icon: "✅", color: "#10b981" },
            { label: "Disbursed", value: settlements.filter(s => s.status === "disbursed").length, icon: "💰", color: "#3b82f6" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        {settlements.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#64748b", marginBottom: 6 }}>No settlements yet</div>
            <button
              onClick={() => setShowNewModal(true)}
              style={{ marginTop: 12, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer" }}
            >
              Create First Settlement
            </button>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["Employee", "Last Working Day", "Gross Payable", "Deductions", "Net Payable", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <>
                    <tr
                      key={s.id}
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        background: selected?.id === s.id ? "#f0f4ff" : "transparent",
                        transition: "background .1s",
                      }}
                    >
                      <td style={{ padding: "13px 14px", fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{s.user_name}</td>
                      <td style={{ padding: "13px 14px", fontSize: 13, color: "#64748b" }}>{fmtDate(s.last_working_day)}</td>
                      <td style={{ padding: "13px 14px", fontSize: 13, fontWeight: 600, color: "#10b981" }}>{fmt(s.gross_payable)}</td>
                      <td style={{ padding: "13px 14px", fontSize: 13, color: "#ef4444" }}>{fmt(s.total_deductions)}</td>
                      <td style={{ padding: "13px 14px", fontSize: 14, fontWeight: 700, color: "#6366f1" }}>{fmt(s.net_payable)}</td>
                      <td style={{ padding: "13px 14px" }}>{statusBadge(s.status)}</td>
                      <td style={{ padding: "13px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          {s.status === "draft" && (
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="approve-fnf" />
                              <input type="hidden" name="fnfId" value={s.id} />
                              <button
                                type="submit" disabled={busy}
                                style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                              >
                                Approve
                              </button>
                            </fetcher.Form>
                          )}
                          {s.status === "approved" && (
                            <button
                              onClick={() => { setPaymentRef(""); setDisburseModal(s); }}
                              style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                            >
                              Disburse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {selected?.id === s.id && (
                      <tr key={s.id + "-detail"}>
                        <td colSpan={7} style={{ padding: "0 14px 16px", background: "#f8faff" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, paddingTop: 14 }}>
                            {/* Earnings */}
                            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Earnings</div>
                              {[
                                ["Pending Salary", s.pending_salary],
                                ["Leave Encashment", s.leave_encashment],
                                ["Gratuity", s.gratuity],
                                ["Bonus / Ex-Gratia", s.bonus],
                                ["Other Earnings", s.other_earnings],
                              ].map(([label, val]) => (
                                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                                  <span style={{ color: "#64748b" }}>{label}</span>
                                  <span style={{ fontWeight: 600, color: "#1e293b" }}>{fmt(Number(val))}</span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 700, color: "#10b981", fontSize: 14 }}>
                                <span>Gross Payable</span><span>{fmt(s.gross_payable)}</span>
                              </div>
                            </div>
                            {/* Deductions */}
                            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Deductions</div>
                              {[
                                ["Loan Recovery", s.loan_recovery],
                                ["TDS Recovery", s.tds_recovery],
                                ["Other Deductions", s.other_deductions],
                              ].map(([label, val]) => (
                                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                                  <span style={{ color: "#64748b" }}>{label}</span>
                                  <span style={{ fontWeight: 600, color: "#ef4444" }}>{fmt(Number(val))}</span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 700, color: "#ef4444", fontSize: 14 }}>
                                <span>Total Deductions</span><span>{fmt(s.total_deductions)}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800, color: "#6366f1", fontSize: 16, borderTop: "2px solid #e2e8f0", marginTop: 8 }}>
                                <span>Net Payable</span><span>{fmt(s.net_payable)}</span>
                              </div>
                            </div>
                          </div>
                          {s.notes && (
                            <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#64748b" }}>
                              <strong>Notes:</strong> {s.notes}
                            </div>
                          )}
                          {s.payment_ref && (
                            <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                              <strong>Payment Ref:</strong> {s.payment_ref} — Disbursed on {fmtDate(s.disbursed_at)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Settlement Modal ──────────────────────────────────────────────── */}
      {showNewModal && (
        <ModalBackdrop onClose={() => setShowNewModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 560, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>New F&amp;F Settlement</h3>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
              Enter the employee User ID and click "Auto-compute" to pre-fill figures.
            </p>

            {/* Auto-compute strip */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <input
                type="text" placeholder="Employee User ID"
                value={newForm.userId}
                onChange={(e) => setNewForm({ ...newForm, userId: e.target.value })}
                style={{ flex: 1, ...inputStyle }}
              />
              <button
                type="button" disabled={!newForm.userId || computing}
                onClick={() => {
                  const fd = new FormData();
                  fd.append("intent", "compute");
                  fd.append("userId", newForm.userId);
                  computeFetcher.submit(fd, { method: "POST" });
                }}
                style={{
                  background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontWeight: 600, cursor: newForm.userId && !computing ? "pointer" : "not-allowed",
                  opacity: newForm.userId && !computing ? 1 : 0.5, whiteSpace: "nowrap", fontSize: 13,
                }}
              >
                {computing ? "Computing…" : "Auto-compute"}
              </button>
            </div>

            {computeFetcher.data?.error && (
              <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
                {String(computeFetcher.data.error)}
              </div>
            )}

            {computed && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13 }}>
                <strong style={{ color: "#065f46" }}>{computed.name}</strong>
                <span style={{ color: "#64748b" }}> — {computed.yearsOfService} yrs service</span>
                {computed.gratuityEligible
                  ? <span style={{ marginLeft: 8, background: "#d1fae5", color: "#065f46", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>Gratuity Eligible ✓</span>
                  : <span style={{ marginLeft: 8, background: "#fef3c7", color: "#92400e", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>&lt;5 yrs — No Gratuity</span>
                }
                <div style={{ color: "#64748b", marginTop: 4 }}>Annual CTC: {fmt(computed.annualCtc)} · Monthly: {fmt(computed.monthlySalary)}</div>
              </div>
            )}

            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="create-fnf" />
              <input type="hidden" name="userId" value={newForm.userId} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Last Working Day">
                    <input type="date" name="lastWorkingDay" required value={newForm.lastWorkingDay}
                      onChange={(e) => setNewForm({ ...newForm, lastWorkingDay: e.target.value })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Exit Process ID (optional)">
                    <input type="text" name="exitId" placeholder="e.g. EXT001" value={newForm.exitId}
                      onChange={(e) => setNewForm({ ...newForm, exitId: e.target.value })}
                      style={inputStyle} />
                  </Field>
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Earnings</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Pending Salary (₹)">
                    <input type="number" name="pendingSalary" min={0} value={newForm.pendingSalary}
                      onChange={(e) => setNewForm({ ...newForm, pendingSalary: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Leave Encashment (₹)">
                    <input type="number" name="leaveEncashment" min={0} value={newForm.leaveEncashment}
                      onChange={(e) => setNewForm({ ...newForm, leaveEncashment: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Gratuity (₹)">
                    <input type="number" name="gratuity" min={0} value={newForm.gratuity}
                      onChange={(e) => setNewForm({ ...newForm, gratuity: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Bonus / Ex-Gratia (₹)">
                    <input type="number" name="bonus" min={0} value={newForm.bonus}
                      onChange={(e) => setNewForm({ ...newForm, bonus: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Other Earnings (₹)">
                    <input type="number" name="otherEarnings" min={0} value={newForm.otherEarnings}
                      onChange={(e) => setNewForm({ ...newForm, otherEarnings: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Deductions</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Loan Recovery (₹)">
                    <input type="number" name="loanRecovery" min={0} value={newForm.loanRecovery}
                      onChange={(e) => setNewForm({ ...newForm, loanRecovery: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="TDS Recovery (₹)">
                    <input type="number" name="tdsRecovery" min={0} value={newForm.tdsRecovery}
                      onChange={(e) => setNewForm({ ...newForm, tdsRecovery: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Other Deductions (₹)">
                    <input type="number" name="otherDeductions" min={0} value={newForm.otherDeductions}
                      onChange={(e) => setNewForm({ ...newForm, otherDeductions: Number(e.target.value) })}
                      style={inputStyle} />
                  </Field>
                </div>

                {/* Live Summary */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                    <span>Gross Payable</span><span style={{ fontWeight: 600, color: "#10b981" }}>{fmt(grossPayable)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                    <span>Total Deductions</span><span style={{ fontWeight: 600, color: "#ef4444" }}>{fmt(totalDed)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#6366f1", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                    <span>Net Payable</span><span>{fmt(netPayable)}</span>
                  </div>
                </div>

                <Field label="Notes (optional)">
                  <textarea rows={2} name="notes" placeholder="Any remarks…" value={newForm.notes}
                    onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                    style={{ ...inputStyle, resize: "vertical" }} />
                </Field>
              </div>
              {fetcher.data?.error && (
                <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "8px 12px", marginTop: 14, fontSize: 13 }}>
                  {fetcher.data.error}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowNewModal(false)}
                  style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy || !newForm.userId || !newForm.lastWorkingDay}
                  style={{ flex: 2, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: (busy || !newForm.userId || !newForm.lastWorkingDay) ? "not-allowed" : "pointer", opacity: (busy || !newForm.userId || !newForm.lastWorkingDay) ? 0.6 : 1 }}>
                  {busy ? "Saving…" : "Save as Draft"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Disburse Modal ───────────────────────────────────────────────────── */}
      {disburseModal && (
        <ModalBackdrop onClose={() => setDisburseModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 400, maxWidth: "95vw" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>💰 Disburse F&amp;F</h3>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 18 }}>
              {disburseModal.user_name} — Net Payable: <strong style={{ color: "#6366f1" }}>{fmt(disburseModal.net_payable)}</strong>
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="disburse-fnf" />
              <input type="hidden" name="fnfId" value={disburseModal.id} />
              <Field label="Payment Reference (optional)">
                <input type="text" name="paymentRef" placeholder="e.g. NEFT/UTR12345"
                  value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                  style={inputStyle} />
              </Field>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setDisburseModal(null)}
                  style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  style={{ flex: 2, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
                  {busy ? "Processing…" : "Confirm Disbursement"}
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8,
  fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff",
};
