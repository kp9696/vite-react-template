import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.resignation";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole, avatarColor, getInitials } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resignation {
  id: string;
  user_id: string;
  user_name: string;
  department: string | null;
  role: string | null;
  last_working_day: string;
  notice_period_days: number;
  reason: string;
  status: "pending" | "accepted" | "withdrawn" | "rejected";
  manager_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  withdrawal_reason: string | null;
  withdrawn_at: string | null;
  created_at: string;
}

type ActionResult =
  | { ok: boolean; message: string; type?: "success" | "error"; intent: string }
  | Record<string, unknown>;

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Resignation" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);

  const res = await callCoreHrmsApi<
    { resignations?: Resignation[]; resignation?: Resignation | null }
  >({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/resignations",
  });

  return {
    currentUser,
    isAdmin,
    resignations: res?.resignations ?? [],
    myResignation: res?.resignation ?? null,
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "submit") {
    const lastWorkingDay = String(formData.get("lastWorkingDay") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const noticePeriodDays = Number(formData.get("noticePeriodDays") ?? 30);
    if (!lastWorkingDay || !reason) {
      return { intent, ok: false, type: "error", message: "Last working day and reason are required." };
    }
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/resignations",
      method: "POST",
      body: { lastWorkingDay, reason, noticePeriodDays },
    });
    return {
      intent,
      ok: res?.ok ?? false,
      type: res?.ok ? "success" : "error",
      message: res?.error ?? "Resignation submitted successfully.",
    };
  }

  if (intent === "decision") {
    const id = String(formData.get("id") ?? "").trim();
    const decision = String(formData.get("decision") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!id || !decision) return { intent, ok: false, type: "error", message: "Missing required fields." };
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/resignations/${id}/decision`,
      method: "PATCH",
      body: { decision, note: note || undefined },
    });
    return {
      intent,
      ok: res?.ok ?? false,
      type: res?.ok ? "success" : "error",
      message: res?.error ?? `Resignation ${decision}.`,
    };
  }

  if (intent === "withdraw") {
    const id = String(formData.get("id") ?? "").trim();
    const reason = String(formData.get("withdrawReason") ?? "").trim();
    if (!id) return { intent, ok: false, type: "error", message: "Resignation ID missing." };
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/resignations/${id}/withdraw`,
      method: "PATCH",
      body: { reason: reason || undefined },
    });
    return {
      intent,
      ok: res?.ok ?? false,
      type: res?.ok ? "success" : "error",
      message: res?.error ?? "Resignation withdrawn.",
    };
  }

  return { intent, ok: false, type: "error", message: "Unknown action." };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  pending:   { label: "Pending",   bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  accepted:  { label: "Accepted",  bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" },
  rejected:  { label: "Rejected",  bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  withdrawn: { label: "Withdrawn", bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
    });
  } catch { return iso; }
}

function noticeDaysLeft(lwd: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lwd);
  last.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((last.getTime() - today.getTime()) / 86400000));
}

// ── Employee View ─────────────────────────────────────────────────────────────

function EmployeeResignation({
  resignation,
  currentUser,
}: {
  resignation: Resignation | null;
  currentUser: { name: string; role: string; email: string };
}) {
  const fetcher = useFetcher<ActionResult>();
  const [showForm, setShowForm] = useState(!resignation);
  const [form, setForm] = useState({ lastWorkingDay: "", reason: "", noticePeriodDays: 30 });

  const toast = fetcher.data as { ok?: boolean; message?: string } | undefined;
  const isSubmitting = fetcher.state !== "idle";

  // Compute default last working day (30 days from today)
  function defaultLwd() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }

  if (resignation && !showForm) {
    const sc = STATUS_CONFIG[resignation.status] ?? STATUS_CONFIG.pending;
    const daysLeft = noticeDaysLeft(resignation.last_working_day);
    return (
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{
          background: "white", border: "1px solid #e2e8f0", borderRadius: 16,
          overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Status Header */}
          <div style={{
            background: resignation.status === "accepted"
              ? "linear-gradient(135deg,#10b981,#059669)"
              : resignation.status === "rejected"
              ? "linear-gradient(135deg,#ef4444,#dc2626)"
              : resignation.status === "withdrawn"
              ? "linear-gradient(135deg,#64748b,#475569)"
              : "linear-gradient(135deg,#f59e0b,#d97706)",
            padding: "24px 28px", color: "white",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, opacity: 0.8, marginBottom: 6 }}>
              Resignation Status
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {sc.label}
            </div>
            {resignation.status === "pending" && (
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                Awaiting HR review · Submitted {fmtDate(resignation.created_at)}
              </div>
            )}
            {resignation.status === "accepted" && (
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                Accepted on {fmtDate(resignation.decided_at)} · {daysLeft} days remaining
              </div>
            )}
          </div>
          {/* Details */}
          <div style={{ padding: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Last Working Day
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                  {fmtDate(resignation.last_working_day)}
                </div>
                {resignation.status === "accepted" && daysLeft > 0 && (
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, marginTop: 2 }}>
                    {daysLeft} days left
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Notice Period
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                  {resignation.notice_period_days} days
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Reason for Resignation
              </div>
              <div style={{
                background: "#f8fafc", borderRadius: 10, padding: "12px 16px",
                fontSize: 13, color: "#475569", lineHeight: 1.6,
                border: "1px solid #e2e8f0",
              }}>
                {resignation.reason}
              </div>
            </div>
            {resignation.manager_note && (
              <div style={{
                background: sc.bg, border: `1px solid ${sc.border}`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 20,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: sc.color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  HR Note
                </div>
                <div style={{ fontSize: 13, color: "#475569" }}>{resignation.manager_note}</div>
              </div>
            )}
            {/* Withdraw button for pending */}
            {resignation.status === "pending" && (
              <>
                {toast && (
                  <div style={{
                    marginBottom: 12, padding: "10px 14px", borderRadius: 8,
                    background: (toast as { ok?: boolean }).ok ? "#f0fdf4" : "#fef2f2",
                    color: (toast as { ok?: boolean }).ok ? "#15803d" : "#dc2626",
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {(toast as { message?: string }).message}
                  </div>
                )}
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="withdraw" />
                  <input type="hidden" name="id" value={resignation.id} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    onClick={(e) => {
                      if (!confirm("Are you sure you want to withdraw your resignation?")) e.preventDefault();
                    }}
                    style={{
                      padding: "10px 20px", borderRadius: 8, border: "1px solid #fecaca",
                      background: "#fef2f2", color: "#dc2626",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      opacity: isSubmitting ? 0.7 : 1,
                    }}
                  >
                    Withdraw Resignation
                  </button>
                </fetcher.Form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show resignation form (no active resignation, or previous is withdrawn/rejected)
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Notice banner */}
      <div style={{
        background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
        padding: "16px 20px", marginBottom: 24,
        display: "flex", gap: 12, alignItems: "flex-start",
      }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 2 }}>
            Please read before resigning
          </div>
          <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
            Your notice period is typically 30 days unless specified in your offer letter.
            Resignation once submitted will be reviewed by HR. You can withdraw while it's pending.
            Contact HR if you have questions before submitting.
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 10,
          background: (toast as { ok?: boolean }).ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${(toast as { ok?: boolean }).ok ? "#86efac" : "#fecaca"}`,
          color: (toast as { ok?: boolean }).ok ? "#15803d" : "#dc2626",
          fontSize: 13, fontWeight: 600,
        }}>
          {(toast as { message?: string }).message}
        </div>
      )}

      <div style={{
        background: "white", border: "1px solid #e2e8f0", borderRadius: 16,
        padding: 28, boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
          Submit Resignation
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          This will notify HR immediately upon submission.
        </div>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="submit" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>
                Proposed Last Working Day *
              </label>
              <input
                name="lastWorkingDay"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                defaultValue={defaultLwd()}
                required
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                }}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                Minimum 30-day notice required
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>
                Notice Period (days)
              </label>
              <input
                name="noticePeriodDays"
                type="number"
                defaultValue={30}
                min={0}
                max={180}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>
              Reason for Resignation *
            </label>
            <textarea
              name="reason"
              required
              rows={5}
              placeholder="Please describe your reason for leaving…"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                resize: "vertical", fontFamily: "inherit",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "12px 28px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#ef4444,#dc2626)",
              color: "white", fontWeight: 700, fontSize: 14,
              cursor: "pointer", opacity: isSubmitting ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(239,68,68,0.35)",
            }}
          >
            {isSubmitting ? "Submitting…" : "Submit Resignation"}
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Admin View ────────────────────────────────────────────────────────────────

function AdminResignations({ resignations }: { resignations: Resignation[] }) {
  const fetcher = useFetcher<ActionResult>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const toast = fetcher.data as { ok?: boolean; message?: string } | undefined;
  const isSubmitting = fetcher.state !== "idle";

  const pending = resignations.filter((r) => r.status === "pending");
  const processed = resignations.filter((r) => r.status !== "pending");

  return (
    <div>
      {toast && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 10,
          background: (toast as { ok?: boolean }).ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${(toast as { ok?: boolean }).ok ? "#86efac" : "#fecaca"}`,
          color: (toast as { ok?: boolean }).ok ? "#15803d" : "#dc2626",
          fontSize: 13, fontWeight: 600,
        }}>
          {toast.message}
        </div>
      )}

      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total", value: resignations.length, color: "#6366f1", bg: "#eef2ff" },
          { label: "Pending", value: pending.length, color: "#f59e0b", bg: "#fffbeb" },
          { label: "Accepted", value: resignations.filter((r) => r.status === "accepted").length, color: "#10b981", bg: "#ecfdf5" },
          { label: "Withdrawn", value: resignations.filter((r) => r.status === "withdrawn").length, color: "#64748b", bg: "#f8fafc" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "white", border: "1px solid #e2e8f0", borderRadius: 12,
            padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pending Resignations */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
            Pending Review ({pending.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pending.map((r) => {
              const color = avatarColor(r.user_name);
              const initials = getInitials(r.user_name);
              const daysLeft = noticeDaysLeft(r.last_working_day);
              return (
                <div key={r.id} style={{
                  background: "white", border: "1px solid #fde68a",
                  borderRadius: 14, padding: 20,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: color, color: "white",
                      display: "grid", placeItems: "center",
                      fontSize: 16, fontWeight: 700, flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{r.user_name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {r.department} {r.role ? `· ${r.role}` : ""}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>
                          Submitted: {fmtDate(r.created_at)}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: daysLeft < 7 ? "#ef4444" : "#f59e0b" }}>
                          LWD: {fmtDate(r.last_working_day)} ({daysLeft} days)
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "4px 12px",
                      borderRadius: 20, background: "#fffbeb", color: "#d97706",
                      border: "1px solid #fde68a", textTransform: "uppercase",
                    }}>
                      Pending
                    </span>
                  </div>
                  {/* Reason */}
                  <div style={{
                    background: "#f8fafc", borderRadius: 8, padding: "10px 14px",
                    fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 16,
                    border: "1px solid #e2e8f0",
                  }}>
                    <span style={{ fontWeight: 600, color: "#334155" }}>Reason: </span>
                    {r.reason}
                  </div>
                  {/* Decision panel */}
                  {selectedId === r.id ? (
                    <fetcher.Form method="post" onSubmit={() => setSelectedId(null)}>
                      <input type="hidden" name="intent" value="decision" />
                      <input type="hidden" name="id" value={r.id} />
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                          HR Note (optional)
                        </label>
                        <textarea
                          name="note"
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          rows={2}
                          placeholder="Add a note for the employee…"
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: 8,
                            border: "1px solid #e2e8f0", fontSize: 13, outline: "none",
                            resize: "none", fontFamily: "inherit",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="submit"
                          name="decision"
                          value="accepted"
                          disabled={isSubmitting}
                          style={{
                            padding: "9px 20px", borderRadius: 8, border: "none",
                            background: "#10b981", color: "white",
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          ✓ Accept
                        </button>
                        <button
                          type="submit"
                          name="decision"
                          value="rejected"
                          disabled={isSubmitting}
                          style={{
                            padding: "9px 20px", borderRadius: 8, border: "none",
                            background: "#ef4444", color: "white",
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          ✕ Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedId(null)}
                          style={{
                            padding: "9px 16px", borderRadius: 8,
                            border: "1px solid #e2e8f0", background: "white",
                            fontSize: 13, color: "#64748b", cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </fetcher.Form>
                  ) : (
                    <button
                      onClick={() => { setSelectedId(r.id); setDecisionNote(""); }}
                      style={{
                        padding: "9px 20px", borderRadius: 8,
                        background: "#6366f1", color: "white", border: "none",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Review & Decide
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Resignations History */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
          All Resignations ({resignations.length})
        </div>
        {resignations.length === 0 ? (
          <div style={{
            background: "white", border: "1px solid #e2e8f0", borderRadius: 14,
            padding: "32px 24px", textAlign: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>No resignations on record</div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Employee resignations will appear here when submitted.</div>
          </div>
        ) : (
          <div style={{
            background: "white", border: "1px solid #e2e8f0", borderRadius: 14,
            overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Employee", "Dept", "Last Working Day", "Notice", "Status", "Decided", "Submitted"].map((h) => (
                    <th key={h} style={{
                      fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
                      letterSpacing: 0.7, padding: "10px 16px", textAlign: "left",
                      borderBottom: "2px solid #e2e8f0",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resignations.map((r) => {
                  const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{r.user_name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.role}</div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
                        {r.department ?? "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#0f172a", borderBottom: "1px solid #f1f5f9" }}>
                        {fmtDate(r.last_working_day)}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
                        {r.notice_period_days}d
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 10px",
                          borderRadius: 20, background: sc.bg, color: sc.color,
                          border: `1px solid ${sc.border}`, textTransform: "uppercase",
                        }}>
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
                        {fmtDate(r.decided_at)}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
                        {fmtDate(r.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────

export default function ResignationPage() {
  const { currentUser, isAdmin, resignations, myResignation } = useLoaderData<typeof loader>();

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ maxWidth: isAdmin ? 1000 : 640, margin: "0 auto", padding: "24px 0" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            {isAdmin ? "Resignations" : "My Resignation"}
          </h1>
          <p style={{ fontSize: 13, color: "#64748b" }}>
            {isAdmin
              ? "Review and manage employee resignation requests."
              : "Submit and track your resignation through the self-service portal."}
          </p>
        </div>

        {isAdmin ? (
          <AdminResignations resignations={resignations} />
        ) : (
          <EmployeeResignation resignation={myResignation} currentUser={currentUser} />
        )}
      </div>
    </HRMSLayout>
  );
}
