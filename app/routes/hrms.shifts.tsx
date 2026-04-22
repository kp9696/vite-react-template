import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.shifts";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
}

interface RosterEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  shift_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  color: string;
  effective_from: string;
  effective_to: string | null;
}

interface Employee {
  id: string;
  name: string;
  department: string;
}

const SHIFT_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

function fmtTime(t: string) {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function meta() {
  return [{ title: "JWithKP HRMS - Shifts & Roster" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const [shiftsRes, rosterRes, empRes] = await Promise.all([
    callCoreHrmsApi<{ shifts: Shift[] }>({ request, env: context.cloudflare.env, currentUser, path: "/api/shifts" }),
    callCoreHrmsApi<{ roster: RosterEntry[] }>({ request, env: context.cloudflare.env, currentUser, path: "/api/roster" }),
    callCoreHrmsApi<{ employees: Employee[] }>({ request, env: context.cloudflare.env, currentUser, path: "/api/dashboard/summary" }),
  ]);

  // Fetch employees list separately via existing users endpoint
  const usersRes = await callCoreHrmsApi<{ users?: Employee[] }>({
    request, env: context.cloudflare.env, currentUser,
    path: "/api/dashboard/summary",
  });

  return {
    currentUser,
    isAdmin: isAdminRole(currentUser.role),
    shifts: shiftsRes?.shifts ?? [],
    roster: rosterRes?.roster ?? [],
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create-shift") {
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/shifts", method: "POST",
      body: {
        name: String(formData.get("name") || "").trim(),
        startTime: String(formData.get("startTime") || ""),
        endTime: String(formData.get("endTime") || ""),
        color: String(formData.get("color") || "#4f46e5"),
      },
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Shift created." : "Failed to create shift." };
  }

  if (intent === "delete-shift") {
    const id = String(formData.get("id") || "");
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/shifts/${id}`, method: "DELETE",
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Shift deleted." : "Failed." };
  }

  if (intent === "assign-shift") {
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/roster", method: "POST",
      body: {
        employeeId: String(formData.get("employeeId") || ""),
        shiftId: String(formData.get("shiftId") || ""),
        effectiveFrom: String(formData.get("effectiveFrom") || ""),
        effectiveTo: String(formData.get("effectiveTo") || "") || null,
      },
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Shift assigned." : "Failed to assign." };
  }

  if (intent === "remove-roster") {
    const id = String(formData.get("id") || "");
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/roster/${id}`, method: "DELETE",
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Removed." : "Failed." };
  }

  return { ok: false, intent, message: "Unknown action." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const { currentUser, isAdmin, shifts, roster } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; intent: string; message?: string }>();

  const [tab, setTab] = useState<"shifts" | "roster">("shifts");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Shift form
  const [shiftName, setShiftName] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [color, setColor] = useState(SHIFT_COLORS[0]);

  // Roster assign form
  const [empId, setEmpId] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState("");

  useEffect(() => {
    if (fetcher.data?.message) {
      setToast({ msg: fetcher.data.message, ok: fetcher.data.ok });
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      if (fetcher.data.intent === "create-shift") {
        setShiftName(""); setStartTime("09:00"); setEndTime("18:00"); setColor(SHIFT_COLORS[0]);
      }
      if (fetcher.data.intent === "assign-shift") {
        setEmpId(""); setEmpSearch(""); setShiftId(""); setEffectiveFrom(new Date().toISOString().slice(0, 10)); setEffectiveTo("");
      }
    }
  }, [fetcher.data]);

  const submitting = fetcher.state !== "idle";

  // Unique employees from roster for the assign form dropdown
  const rosterByEmp: Record<string, RosterEntry[]> = {};
  for (const r of roster) {
    if (!rosterByEmp[r.employee_id]) rosterByEmp[r.employee_id] = [];
    rosterByEmp[r.employee_id].push(r);
  }

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? "#10b981" : "#ef4444",
          color: "#fff", padding: "10px 20px", borderRadius: 8,
          fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Shifts & Roster</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
            Define work shifts and assign employees to their schedules.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e5e7eb", marginBottom: 24 }}>
          {(["shifts", "roster"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 20px", border: "none",
              borderBottom: tab === t ? "2px solid #4f46e5" : "2px solid transparent",
              background: "none", cursor: "pointer",
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? "#4f46e5" : "#6b7280",
              fontSize: 14, marginBottom: -2, transition: "all 0.15s",
              textTransform: "capitalize",
            }}>
              {t === "shifts" ? `Shifts (${shifts.length})` : `Roster (${roster.length})`}
            </button>
          ))}
        </div>

        {/* ── Shifts tab ── */}
        {tab === "shifts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Create shift form */}
            {isAdmin && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>New Shift</h2>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="create-shift" />
                  <input type="hidden" name="color" value={color} />
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "2 1 160px" }}>
                      <span style={labelText}>Shift Name</span>
                      <input name="name" value={shiftName} onChange={e => setShiftName(e.target.value)}
                        placeholder="e.g. Morning Shift" required style={inp} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 120px" }}>
                      <span style={labelText}>Start Time</span>
                      <input type="time" name="startTime" value={startTime} onChange={e => setStartTime(e.target.value)} required style={inp} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 120px" }}>
                      <span style={labelText}>End Time</span>
                      <input type="time" name="endTime" value={endTime} onChange={e => setEndTime(e.target.value)} required style={inp} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={labelText}>Color</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {SHIFT_COLORS.map(c => (
                          <button key={c} type="button" onClick={() => setColor(c)}
                            style={{
                              width: 24, height: 24, borderRadius: "50%", background: c, border: "none",
                              cursor: "pointer", outline: color === c ? `3px solid ${c}` : "none",
                              outlineOffset: 2,
                            }} />
                        ))}
                      </div>
                    </label>
                    <button type="submit" disabled={submitting || !shiftName.trim()} style={{
                      background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
                      padding: "9px 20px", fontWeight: 600, fontSize: 14,
                      cursor: submitting || !shiftName.trim() ? "not-allowed" : "pointer",
                      opacity: submitting || !shiftName.trim() ? 0.6 : 1,
                      flexShrink: 0, alignSelf: "flex-end",
                    }}>
                      + Add Shift
                    </button>
                  </div>
                </fetcher.Form>
              </div>
            )}

            {/* Shifts list */}
            {shifts.length === 0 ? (
              <EmptyState icon="🕐" title="No shifts defined" sub={isAdmin ? "Create your first shift above." : "No shifts have been created yet."} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {shifts.map(s => (
                  <div key={s.id} style={{
                    background: "#fff", border: `2px solid ${s.color}22`,
                    borderLeft: `4px solid ${s.color}`, borderRadius: 10, padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{s.name}</div>
                        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                          {(() => {
                            const [sh, sm] = s.start_time.split(":").map(Number);
                            const [eh, em] = s.end_time.split(":").map(Number);
                            let mins = (eh * 60 + em) - (sh * 60 + sm);
                            if (mins < 0) mins += 24 * 60;
                            return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                          })()}
                        </div>
                      </div>
                      {isAdmin && (
                        confirmDeleteId === s.id ? (
                          <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                            <span style={{ fontSize: 11, color: "#ef4444" }}>Delete?</span>
                            <span style={{ display: "flex", gap: 4 }}>
                              <fetcher.Form method="post" style={{ display: "inline" }}>
                                <input type="hidden" name="intent" value="delete-shift" />
                                <input type="hidden" name="id" value={s.id} />
                                <button type="submit" onClick={() => setConfirmDeleteId(null)} style={dangerBtn}>Yes</button>
                              </fetcher.Form>
                              <button onClick={() => setConfirmDeleteId(null)} style={cancelBtn}>No</button>
                            </span>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(s.id)} style={ghostDangerBtn}>✕</button>
                        )
                      )}
                    </div>
                    <div style={{ marginTop: 10, background: `${s.color}18`, borderRadius: 6, padding: "3px 8px", display: "inline-block" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>
                        {roster.filter(r => r.shift_id === s.id).length} assigned
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Roster tab ── */}
        {tab === "roster" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Assign form */}
            {isAdmin && shifts.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>Assign Shift</h2>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="assign-shift" />
                  <input type="hidden" name="employeeId" value={empId} />
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "2 1 180px" }}>
                      <span style={labelText}>Employee</span>
                      <input
                        placeholder="Type employee name or ID"
                        value={empSearch}
                        onChange={e => { setEmpSearch(e.target.value); setEmpId(e.target.value); }}
                        required style={inp}
                      />
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>Enter employee ID (from Employees page)</span>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "2 1 160px" }}>
                      <span style={labelText}>Shift</span>
                      <select name="shiftId" value={shiftId} onChange={e => setShiftId(e.target.value)} required style={inp}>
                        <option value="">Select shift…</option>
                        {shifts.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({fmtTime(s.start_time)} – {fmtTime(s.end_time)})</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 130px" }}>
                      <span style={labelText}>Effective From</span>
                      <input type="date" name="effectiveFrom" value={effectiveFrom}
                        onChange={e => setEffectiveFrom(e.target.value)} required style={inp} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 130px" }}>
                      <span style={labelText}>Effective To (optional)</span>
                      <input type="date" name="effectiveTo" value={effectiveTo}
                        onChange={e => setEffectiveTo(e.target.value)} style={inp} />
                    </label>
                    <button type="submit" disabled={submitting || !empId || !shiftId || !effectiveFrom} style={{
                      background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
                      padding: "9px 20px", fontWeight: 600, fontSize: 14,
                      cursor: submitting || !empId || !shiftId ? "not-allowed" : "pointer",
                      opacity: submitting || !empId || !shiftId ? 0.6 : 1, flexShrink: 0, alignSelf: "flex-end",
                    }}>
                      Assign
                    </button>
                  </div>
                </fetcher.Form>
              </div>
            )}

            {isAdmin && shifts.length === 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 18px", fontSize: 14, color: "#92400e" }}>
                ⚠️ Create at least one shift first before assigning employees.
              </div>
            )}

            {/* Roster table */}
            {roster.length === 0 ? (
              <EmptyState icon="📋" title="No roster entries" sub="Assign shifts to employees above." />
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={th}>Employee</th>
                      <th style={th}>Shift</th>
                      <th style={th}>Hours</th>
                      <th style={th}>Effective From</th>
                      <th style={th}>Effective To</th>
                      {isAdmin && <th style={{ ...th, textAlign: "right" }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map(r => (
                      <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={td}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{r.employee_name}</span>
                        </td>
                        <td style={td}>
                          <span style={{
                            background: `${r.color}18`, color: r.color, borderRadius: 6,
                            padding: "3px 10px", fontSize: 12, fontWeight: 700,
                          }}>
                            {r.shift_name}
                          </span>
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                            {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                          </div>
                        </td>
                        <td style={{ ...td, fontSize: 13, color: "#6b7280" }}>
                          {(() => {
                            const [sh, sm] = r.start_time.split(":").map(Number);
                            const [eh, em] = r.end_time.split(":").map(Number);
                            let mins = (eh * 60 + em) - (sh * 60 + sm);
                            if (mins < 0) mins += 24 * 60;
                            return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? mins % 60 + "m" : ""}`;
                          })()}
                        </td>
                        <td style={{ ...td, fontSize: 13 }}>{r.effective_from}</td>
                        <td style={{ ...td, fontSize: 13, color: r.effective_to ? "#374151" : "#9ca3af" }}>
                          {r.effective_to ?? "Ongoing"}
                        </td>
                        {isAdmin && (
                          <td style={{ ...td, textAlign: "right" }}>
                            {confirmDeleteId === r.id ? (
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#ef4444" }}>Remove?</span>
                                <fetcher.Form method="post" style={{ display: "inline" }}>
                                  <input type="hidden" name="intent" value="remove-roster" />
                                  <input type="hidden" name="id" value={r.id} />
                                  <button type="submit" onClick={() => setConfirmDeleteId(null)} style={dangerBtn}>Yes</button>
                                </fetcher.Form>
                                <button onClick={() => setConfirmDeleteId(null)} style={cancelBtn}>No</button>
                              </span>
                            ) : (
                              <button onClick={() => setConfirmDeleteId(r.id)} style={ghostDangerBtn}>Remove</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </HRMSLayout>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "50px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 15, color: "#374151", marginBottom: 6 }}>{title}</div>
      <div style={{ color: "#9ca3af", fontSize: 13 }}>{sub}</div>
    </div>
  );
}

const labelText: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151" };
const inp: React.CSSProperties = { padding: "8px 11px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 14, color: "#111827", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
const th: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" };
const td: React.CSSProperties = { padding: "12px 16px", verticalAlign: "middle" };
const dangerBtn: React.CSSProperties = { background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const cancelBtn: React.CSSProperties = { background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const ghostDangerBtn: React.CSSProperties = { background: "transparent", border: "1px solid #fca5a5", borderRadius: 6, color: "#ef4444", padding: "3px 10px", fontSize: 12, cursor: "pointer" };
