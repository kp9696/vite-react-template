import { useEffect, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.recruitment";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { createJobOpening, getRecruitmentDashboard } from "../lib/workforce.server";
import { avatarColor, getInitials } from "../lib/hrms.shared";

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

const DEPT_COLORS: Record<string, string> = {
  Engineering: "#6366f1", Design: "#ec4899", Analytics: "#f59e0b",
  Sales: "#10b981", "People Ops": "#0ea5e9", Marketing: "#8b5cf6",
  Finance: "#06b6d4", Operations: "#ef4444",
};

// Sample applicant names per opening for avatar stacks
const SAMPLE_APPLICANTS: Record<string, string[]> = {
  default: ["Aryan K", "Sana M", "Vikram R", "Priya S", "Riya T"],
};

function getApplicants(id: string, count: number) {
  const names = SAMPLE_APPLICANTS.default;
  return names.slice(0, Math.min(count, 4));
}

export function meta() {
  return [{ title: "JWithKP HRMS - Recruitment" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const data = currentUser.orgId
    ? await getRecruitmentDashboard(context.cloudflare.env.HRMS, currentUser.orgId)
    : { openings: [], pipeline: [] };
  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  if (!currentUser.orgId) {
    return { ok: false, type: "error", message: "Organization not found for this user." };
  }
  const formData = await request.formData();
  await createJobOpening(context.cloudflare.env.HRMS, {
    orgId: currentUser.orgId,
    title: String(formData.get("title") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    location: String(formData.get("location") || "").trim(),
    priority: String(formData.get("priority") || "Normal").trim(),
  });
  return { ok: true, type: "success", message: "Job opening posted successfully." };
}

export default function Recruitment() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  useEffect(() => {
    if (fetcher.data) {
      setToast(fetcher.data);
      if (fetcher.data.ok) setShowForm(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [fetcher.data]);

  return (
    <HRMSLayout currentUser={data.currentUser}>
      {toast ? (
        <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)} style={{ cursor: "pointer" }}>
          <span>{toast.type === "success" ? "✓" : "✕"}</span> {toast.message}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Recruitment</div>
          <div className="page-sub">
            {data.openings.length} open positions · {data.openings.reduce((a, o) => a + o.applicantCount, 0)} total applicants
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {(["kanban", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: "7px 14px", border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: viewMode === v ? "white" : "transparent",
                  color: viewMode === v ? "var(--ink)" : "var(--ink-3)",
                  transition: "all 0.12s",
                }}
              >
                {v === "kanban" ? "⊞ Kanban" : "≡ Table"}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Post New Role</button>
        </div>
      </div>

      {/* Post Role Modal */}
      {showForm ? (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Post New Role
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <fetcher.Form method="post">
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={lblStyle}>Role Title *</label>
                  <input name="title" placeholder="e.g. Senior Backend Engineer" style={inpStyle} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lblStyle}>Department</label>
                    <select name="department" style={inpStyle}>
                      {Object.keys(DEPT_COLORS).map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lblStyle}>Location</label>
                    <input name="location" placeholder="e.g. Bengaluru / Remote" style={inpStyle} />
                  </div>
                </div>
                <div>
                  <label style={lblStyle}>Priority</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["Normal", "Urgent"].map((p) => (
                      <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                        <input type="radio" name="priority" value={p} defaultChecked={p === "Normal"} />
                        <span style={{ fontWeight: 600, color: p === "Urgent" ? "var(--red)" : "var(--ink-2)" }}>
                          {p === "Urgent" ? "🔴 " : "🟢 "}{p}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={fetcher.state !== "idle"}>
                  {fetcher.state !== "idle" ? "Posting…" : "Post Role"}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      ) : null}

      {/* Empty state */}
      {data.openings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <div className="empty-state-title">No open positions yet</div>
            <div className="empty-state-sub" style={{ marginBottom: 20 }}>Post your first role to start tracking applicants through the pipeline.</div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Post New Role</button>
          </div>
        </div>
      ) : null}

      {/* Kanban view */}
      {data.openings.length > 0 && viewMode === "kanban" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {data.pipeline.map((column) => (
            <div key={column.stage}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: column.color }} />
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{column.stage}</div>
                <div style={{
                  marginLeft: "auto", background: column.color + "22", border: `1px solid ${column.color}44`,
                  borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, color: column.color,
                }}>{column.count}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {column.roles.map((role) => {
                  const deptColor = DEPT_COLORS[role.department] ?? "#6b7280";
                  const applicants = getApplicants(role.id, role.applicants);
                  return (
                    <div
                      key={role.id}
                      style={{
                        background: "white", border: "1px solid var(--border)",
                        borderRadius: 12, padding: 14,
                        borderTop: `3px solid ${column.color}`,
                        transition: "box-shadow 0.15s, transform 0.15s",
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{role.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 5,
                          fontSize: 11, fontWeight: 600,
                          background: deptColor + "18", color: deptColor,
                        }}>{role.department}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>📍 {role.location}</span>
                      </div>

                      {/* Applicant avatar stack */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {applicants.map((name, idx) => (
                            <span
                              key={idx}
                              title={name}
                              className="avatar-sm"
                              style={{
                                background: avatarColor(name),
                                marginLeft: idx === 0 ? 0 : -8,
                                border: "2px solid white",
                                zIndex: applicants.length - idx,
                                fontSize: 9,
                                width: 22, height: 22,
                              }}
                            >
                              {getInitials(name)}
                            </span>
                          ))}
                          {role.applicants > 4 ? (
                            <span style={{
                              marginLeft: -8, width: 22, height: 22, border: "2px solid white",
                              background: "var(--surface)", borderRadius: "50%",
                              fontSize: 9, fontWeight: 700, color: "var(--ink-3)",
                              display: "inline-grid", placeItems: "center",
                            }}>+{role.applicants - 4}</span>
                          ) : null}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>
                          {role.applicants} applied
                        </span>
                      </div>
                    </div>
                  );
                })}
                {column.roles.length === 0 ? (
                  <div style={{
                    border: "2px dashed var(--border)", borderRadius: 12, padding: 20,
                    textAlign: "center", fontSize: 12, color: "var(--ink-3)",
                  }}>
                    No openings in this stage
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table view */}
      {data.openings.length > 0 && viewMode === "table" && (
        <div className="card">
          <div className="card-title">Open Positions</div>
          <table className="table">
            <thead>
              <tr><th>Role</th><th>Department</th><th>Location</th><th>Applicants</th><th>Priority</th><th>Stage</th></tr>
            </thead>
            <tbody>
              {data.openings.map((opening) => {
                const deptColor = DEPT_COLORS[opening.department] ?? "#6b7280";
                return (
                  <tr key={opening.id}>
                    <td style={{ fontWeight: 600, color: "var(--ink)" }}>{opening.title}</td>
                    <td>
                      <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: deptColor + "18", color: deptColor }}>
                        {opening.department}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>📍 {opening.location}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{opening.applicantCount}</span>
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>applied</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${opening.priority === "Urgent" ? "badge-red" : "badge-green"}`}>
                        {opening.priority === "Urgent" ? "🔴 " : "🟢 "}{opening.priority}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{opening.stage}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HRMSLayout>
  );
}

const lblStyle: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 5 };
const inpStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", color: "var(--ink)" };

