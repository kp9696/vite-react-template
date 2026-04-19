import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/hrms.recruitment";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { createJobOpening, getRecruitmentDashboard } from "../lib/workforce.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";

type ActionResult = { ok: boolean; message: string; type: "success" | "error" } | Record<string, unknown>;

const DEPT_COLORS: Record<string, string> = {
  Engineering: "#6366f1", Design: "#ec4899", Analytics: "#f59e0b",
  Sales: "#10b981", "People Ops": "#0ea5e9", Marketing: "#8b5cf6",
  Finance: "#06b6d4", Operations: "#ef4444",
};

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"] as const;
type Stage = typeof STAGES[number];

const STAGE_COLORS: Record<Stage, string> = {
  Applied:   "#7b8099",
  Screening: "#4f46e5",
  Interview: "#f59e0b",
  Offer:     "#10b981",
  Hired:     "#059669",
  Rejected:  "#ef4444",
};

interface Applicant {
  id: string;
  job_id: string;
  name: string;
  email: string;
  phone?: string;
  resume_url?: string;
  stage: Stage;
  notes?: string;
  applied_at: string;
}

export function meta() {
  return [{ title: "JWithKP HRMS - Recruitment" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  const data = tenantId
    ? await getRecruitmentDashboard(context.cloudflare.env.HRMS, tenantId)
    : { openings: [], pipeline: [] };
  return { currentUser, isAdmin: isAdminRole(currentUser.role), ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const tenantId = currentUser.companyId;
  if (!tenantId) return { ok: false, type: "error", message: "Organization not found." };

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "post-job");

  if (intent === "post-job") {
    await createJobOpening(env.HRMS, {
      companyId: tenantId,
      title: String(formData.get("title") || "").trim(),
      department: String(formData.get("department") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      priority: String(formData.get("priority") || "Normal").trim(),
    });
    return { ok: true, type: "success", message: "Job opening posted successfully." };
  }

  if (intent === "get-applicants") {
    const jobId = String(formData.get("jobId") || "");
    const res = await callCoreHrmsApi<{ applicants?: Applicant[] }>({
      request, env, currentUser,
      path: `/api/recruitment/applicants?jobId=${encodeURIComponent(jobId)}`,
    });
    return { intent, applicants: res?.applicants ?? [] };
  }

  if (intent === "add-applicant") {
    const res = await callCoreHrmsApi<{ ok?: boolean; id?: string; error?: string }>({
      request, env, currentUser,
      path: "/api/recruitment/applicants",
      method: "POST",
      body: {
        jobId:     String(formData.get("jobId") || ""),
        name:      String(formData.get("name") || "").trim(),
        email:     String(formData.get("email") || "").trim(),
        phone:     String(formData.get("phone") || "").trim() || undefined,
        resumeUrl: String(formData.get("resumeUrl") || "").trim() || undefined,
      },
    });
    if (res?.error) return { ok: false, type: "error", message: res.error };
    return { intent, ok: true, id: res?.id, jobId: String(formData.get("jobId") || "") };
  }

  if (intent === "move-stage") {
    const aplId = String(formData.get("aplId") || "");
    const stage = String(formData.get("stage") || "");
    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: `/api/recruitment/applicants/${aplId}/stage`,
      method: "PATCH",
      body: { stage },
    });
    if (res?.error) return { ok: false, type: "error", message: res.error };
    return { intent, ok: true, aplId, stage };
  }

  if (intent === "delete-applicant") {
    const aplId = String(formData.get("aplId") || "");
    const jobId = String(formData.get("jobId") || "");
    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: `/api/recruitment/applicants/${aplId}`,
      method: "DELETE",
    });
    if (res?.error) return { ok: false, type: "error", message: res.error };
    return { intent, ok: true, aplId, jobId };
  }

  return { ok: false, type: "error", message: "Unknown action." };
}

export default function Recruitment() {
  const { currentUser, isAdmin, openings, pipeline } = useLoaderData<typeof loader>();
  const fetcher      = useFetcher<ActionResult>();
  const aplFetcher   = useFetcher<ActionResult>();
  const revalidator  = useRevalidator();

  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  // Applicant panel state
  const [selectedJob, setSelectedJob] = useState<{ id: string; title: string; dept: string } | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [aplLoading, setAplLoading] = useState(false);
  const [showAddApl, setShowAddApl] = useState(false);
  const [aplForm, setAplForm] = useState({ name: "", email: "", phone: "", resumeUrl: "" });
  const [stageMoving, setStageMoving] = useState<string | null>(null);
  const pendingAplFormRef = useRef<typeof aplForm | null>(null);
  const pendingStageRef   = useRef<{ aplId: string; stage: Stage } | null>(null);
  const pendingDeleteRef  = useRef<{ aplId: string; name: string } | null>(null);

  // Local copy of openings so applicant_count updates without full reload
  const [jobs, setJobs] = useState(openings);
  const [localPipeline, setLocalPipeline] = useState(pipeline);

  // Sync jobs when loader revalidates
  useEffect(() => { setJobs(openings); }, [openings]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Post-job result
  useEffect(() => {
    if (!fetcher.data) return;
    const d = fetcher.data as { ok: boolean; message: string };
    showToast(d.message, d.ok);
    if (d.ok) { setShowForm(false); revalidator.revalidate(); }
  }, [fetcher.data]);

  // Applicant fetcher result (get/add/move/delete)
  useEffect(() => {
    if (!aplFetcher.data) return;
    const d = aplFetcher.data as Record<string, unknown>;

    if (d.intent === "get-applicants") {
      setApplicants((d.applicants as Applicant[]) || []);
      setAplLoading(false);
      return;
    }
    if (d.intent === "add-applicant") {
      if (!d.ok) { showToast((d.message as string) || "Failed to add.", false); return; }
      const pf = pendingAplFormRef.current;
      if (pf && selectedJob) {
        const newApl: Applicant = {
          id: d.id as string,
          job_id: selectedJob.id,
          name: pf.name.trim(),
          email: pf.email.trim(),
          phone: pf.phone?.trim() || undefined,
          resume_url: pf.resumeUrl?.trim() || undefined,
          stage: "Applied",
          applied_at: new Date().toISOString(),
        };
        setApplicants(prev => [newApl, ...prev]);
        setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, applicantCount: j.applicantCount + 1 } : j));
        setAplForm({ name: "", email: "", phone: "", resumeUrl: "" });
        setShowAddApl(false);
        showToast(`${pf.name} added to applicants.`);
        pendingAplFormRef.current = null;
      }
      return;
    }
    if (d.intent === "move-stage") {
      setStageMoving(null);
      if (!d.ok) { showToast((d.message as string) || "Failed to update.", false); return; }
      const p = pendingStageRef.current;
      if (p) {
        setApplicants(prev => prev.map(a => a.id === p.aplId ? { ...a, stage: p.stage } : a));
        showToast(`Moved to ${p.stage}.`);
        pendingStageRef.current = null;
      }
      return;
    }
    if (d.intent === "delete-applicant") {
      if (!d.ok) { showToast((d.message as string) || "Failed to delete.", false); return; }
      const p = pendingDeleteRef.current;
      if (p) {
        setApplicants(prev => prev.filter(a => a.id !== p.aplId));
        if (selectedJob) setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, applicantCount: Math.max(0, j.applicantCount - 1) } : j));
        showToast(`${p.name} removed.`);
        pendingDeleteRef.current = null;
      }
    }
  }, [aplFetcher.data]);

  const loadApplicants = (jobId: string) => {
    setAplLoading(true);
    aplFetcher.submit({ intent: "get-applicants", jobId }, { method: "post" });
  };

  const openJobPanel = (job: { id: string; title: string; department: string }) => {
    setSelectedJob({ id: job.id, title: job.title, dept: job.department });
    loadApplicants(job.id);
  };

  const handleAddApplicant = () => {
    if (!aplForm.name.trim() || !aplForm.email.trim() || !selectedJob) return;
    pendingAplFormRef.current = { ...aplForm };
    aplFetcher.submit(
      { intent: "add-applicant", jobId: selectedJob.id, ...aplForm },
      { method: "post" },
    );
  };

  const handleMoveStage = (aplId: string, newStage: Stage) => {
    setStageMoving(aplId);
    pendingStageRef.current = { aplId, stage: newStage };
    aplFetcher.submit({ intent: "move-stage", aplId, stage: newStage }, { method: "post" });
  };

  const handleDeleteApplicant = (aplId: string, name: string) => {
    if (!confirm(`Remove ${name} from applicants?`)) return;
    pendingDeleteRef.current = { aplId, name };
    aplFetcher.submit({ intent: "delete-applicant", aplId, jobId: selectedJob?.id || "" }, { method: "post" });
  };

  const totalApplicants = jobs.reduce((a, o) => a + o.applicantCount, 0);

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast && (
        <div className={`toast ${toast.ok ? "toast-success" : "toast-error"}`}>{toast.msg}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Recruitment</div>
          <div className="page-sub">
            {jobs.length} open position{jobs.length !== 1 ? "s" : ""} · {totalApplicants} total applicant{totalApplicants !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {(["kanban", "table"] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: viewMode === v ? "white" : "transparent",
                color: viewMode === v ? "var(--ink)" : "var(--ink-3)", transition: "all 0.12s",
              }}>
                {v === "kanban" ? "⊞ Kanban" : "≡ Table"}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Post New Role</button>
          )}
        </div>
      </div>

      {/* Post Role Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Post New Role
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="post-job" />
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
      )}

      {/* Applicant Panel */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal-box" style={{ width: 640, maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <div>
                <div>{selectedJob.title}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)", marginTop: 2 }}>{selectedJob.dept} · {applicants.length} applicant{applicants.length !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isAdmin && (
                  <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setShowAddApl(true)}>
                    + Add Applicant
                  </button>
                )}
                <button className="modal-close" onClick={() => setSelectedJob(null)}>✕</button>
              </div>
            </div>

            {/* Add Applicant Form */}
            {showAddApl && (
              <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>New Applicant</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={lblStyle}>Name *</label>
                    <input value={aplForm.name} onChange={(e) => setAplForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" style={inpStyle} />
                  </div>
                  <div>
                    <label style={lblStyle}>Email *</label>
                    <input value={aplForm.email} onChange={(e) => setAplForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" style={inpStyle} type="email" />
                  </div>
                  <div>
                    <label style={lblStyle}>Phone</label>
                    <input value={aplForm.phone} onChange={(e) => setAplForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" style={inpStyle} />
                  </div>
                  <div>
                    <label style={lblStyle}>Resume URL</label>
                    <input value={aplForm.resumeUrl} onChange={(e) => setAplForm((f) => ({ ...f, resumeUrl: e.target.value }))} placeholder="https://drive.google.com/..." style={inpStyle} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: "6px 16px", fontSize: 12 }}
                    onClick={handleAddApplicant} disabled={!aplForm.name.trim() || !aplForm.email.trim()}>
                    Add
                  </button>
                  <button className="btn btn-outline" style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => { setShowAddApl(false); setAplForm({ name: "", email: "", phone: "", resumeUrl: "" }); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {aplLoading ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--ink-3)" }}>Loading applicants…</div>
            ) : applicants.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">👥</div>
                <div className="empty-state-title">No applicants yet</div>
                <div className="empty-state-sub">Add the first applicant for this role.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {applicants.map((apl) => (
                  <div key={apl.id} style={{
                    background: "var(--surface)", borderRadius: 10, padding: "12px 14px",
                    border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span className="avatar-sm" style={{ background: avatarColor(apl.name), width: 36, height: 36, fontSize: 13, flexShrink: 0 }}>
                      {getInitials(apl.name)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{apl.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{apl.email}{apl.phone ? ` · ${apl.phone}` : ""}</div>
                      {apl.resume_url && (
                        <a href={apl.resume_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)" }}>
                          📎 Resume
                        </a>
                      )}
                    </div>
                    {/* Stage badge */}
                    <span style={{
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: STAGE_COLORS[apl.stage] + "20", color: STAGE_COLORS[apl.stage],
                      border: `1px solid ${STAGE_COLORS[apl.stage]}40`, flexShrink: 0,
                    }}>{apl.stage}</span>

                    {/* Move stage dropdown */}
                    {isAdmin && (
                      <select
                        value={apl.stage}
                        disabled={stageMoving === apl.id}
                        onChange={(e) => handleMoveStage(apl.id, e.target.value as Stage)}
                        style={{ fontSize: 11, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "white", cursor: "pointer", flexShrink: 0 }}
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteApplicant(apl.id, apl.name)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 14, flexShrink: 0, padding: "2px 4px" }}
                        title="Remove applicant"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {jobs.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <div className="empty-state-title">No open positions yet</div>
            <div className="empty-state-sub" style={{ marginBottom: 20 }}>Post your first role to start tracking applicants.</div>
            {isAdmin && <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Post New Role</button>}
          </div>
        </div>
      )}

      {/* Kanban view */}
      {jobs.length > 0 && viewMode === "kanban" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {localPipeline.map((column) => (
            <div key={column.stage}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: column.color }} />
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{column.stage}</div>
                <div style={{ marginLeft: "auto", background: column.color + "22", border: `1px solid ${column.color}44`, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, color: column.color }}>
                  {column.count}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {column.roles.map((role) => {
                  const deptColor = DEPT_COLORS[role.department] ?? "#6b7280";
                  const job = jobs.find((j) => j.id === role.id);
                  const aplCount = job?.applicantCount ?? role.applicants;
                  return (
                    <div
                      key={role.id}
                      style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 14, borderTop: `3px solid ${column.color}`, transition: "box-shadow 0.15s, transform 0.15s", cursor: "pointer" }}
                      onClick={() => openJobPanel({ id: role.id, title: role.title, department: role.department })}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{role.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: deptColor + "18", color: deptColor }}>{role.department}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>📍 {role.location}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>
                          👥 {aplCount} applied
                        </span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Click to view →</span>
                      </div>
                    </div>
                  );
                })}
                {column.roles.length === 0 && (
                  <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 20, textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
                    No openings in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table view */}
      {jobs.length > 0 && viewMode === "table" && (
        <div className="card">
          <div className="card-title">Open Positions</div>
          <table className="table">
            <thead>
              <tr><th>Role</th><th>Department</th><th>Location</th><th>Applicants</th><th>Priority</th><th>Stage</th><th></th></tr>
            </thead>
            <tbody>
              {jobs.map((opening) => {
                const deptColor = DEPT_COLORS[opening.department] ?? "#6b7280";
                return (
                  <tr key={opening.id} style={{ cursor: "pointer" }} onClick={() => openJobPanel({ id: opening.id, title: opening.title, department: opening.department })}>
                    <td style={{ fontWeight: 600, color: "var(--ink)" }}>{opening.title}</td>
                    <td>
                      <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: deptColor + "18", color: deptColor }}>
                        {opening.department}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>📍 {opening.location}</td>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{opening.applicantCount}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 4 }}>applied</span>
                    </td>
                    <td>
                      <span className={`badge ${opening.priority === "Urgent" ? "badge-red" : "badge-green"}`}>
                        {opening.priority === "Urgent" ? "🔴 " : "🟢 "}{opening.priority}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{opening.stage}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>View →</span>
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
