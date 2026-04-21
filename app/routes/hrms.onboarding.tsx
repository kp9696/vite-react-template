import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/hrms.onboarding";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import {
  createOnboardingJoiner,
  toggleOnboardingTask,
  getOnboardingDashboard,
  updatePreBoarding,
  markWelcomeSent,
  listTechAllocations,
  addTechAllocation,
  deleteTechAllocation,
} from "../lib/workforce.server";
import type { OnboardingTechAllocation } from "../lib/workforce.server";
import { sendOnboardingWelcomeEmail } from "../lib/welcome-onboarding-email.server";
import { createOrUpdateInvitedUser } from "../lib/hrms.server";
import { sendInviteEmail } from "../lib/invite-email.server";

type Tab = "tasks" | "preboard" | "tech";

type ActionResult =
  | { intent: "add-joiner"; ok: boolean; message: string; type: "success" | "error"; joinerId?: string }
  | { intent: "toggle-task"; ok: boolean; message: string; type: "success" | "error" }
  | { intent: "update-preboard"; ok: boolean; message: string; type: "success" | "error" }
  | { intent: "send-welcome"; ok: boolean; message: string; type: "success" | "error" }
  | { intent: "get-tech"; ok: boolean; allocations: OnboardingTechAllocation[] }
  | { intent: "add-tech"; ok: boolean; message: string; type: "success" | "error"; joinerId: string }
  | { intent: "delete-tech"; ok: boolean; message: string; type: "success" | "error" }
  | Record<string, unknown>;

export function meta() {
  return [{ title: "JWithKP HRMS - Onboarding" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  const data = tenantId
    ? await getOnboardingDashboard(context.cloudflare.env.HRMS, tenantId)
    : { joiners: [], stats: [] };
  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) return { intent: "unknown", ok: false, type: "error", message: "Organization not found." };

  const db = context.cloudflare.env.HRMS;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "add-joiner") {
    const name       = String(formData.get("name")       || "").trim();
    const role       = String(formData.get("role")       || "Employee").trim();
    const department = String(formData.get("department") || "").trim();
    const startDate  = String(formData.get("startDate")  || "").trim();
    const email      = String(formData.get("email")      || "").trim();
    const phone      = String(formData.get("phone")      || "").trim();

    if (!name) return { intent, ok: false, type: "error", message: "Name is required." };

    // Create the onboarding tracking record
    const joinerId = await createOnboardingJoiner(db, { companyId: tenantId, name, role, department, startDate, email, phone });

    // If email provided: also create employee account + send invite so they can log in
    let message = "New joiner added.";
    if (email) {
      const user = await createOrUpdateInvitedUser(db, { companyId: tenantId, name, email, role, department, phone, joinedOn: startDate });
      const mailResult = await sendInviteEmail(context.cloudflare.env, db, user.id, { companyId: tenantId, name, email, role, department, phone }, request.url);
      message = mailResult.delivered
        ? `Joiner added & invite sent to ${email}.`
        : `Joiner added. Email failed: ${mailResult.message}`;
    }

    return { intent, ok: true, type: "success", message, joinerId };
  }

  if (intent === "toggle-task") {
    await toggleOnboardingTask(db, String(formData.get("joinerId") || ""), String(formData.get("taskId") || ""));
    return { intent, ok: true, type: "success", message: "Task updated." };
  }

  if (intent === "update-preboard") {
    const joinerId = String(formData.get("joinerId") || "");
    await updatePreBoarding(db, tenantId, joinerId, {
      offerSigned: formData.get("offerSigned") === "1",
      bgCheck: formData.get("bgCheck") === "1",
      docsCollected: formData.get("docsCollected") === "1",
    });
    return { intent, ok: true, type: "success", message: "Pre-boarding status updated." };
  }

  if (intent === "send-welcome") {
    const joinerId = String(formData.get("joinerId") || "");
    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "");
    const role = String(formData.get("role") || "");
    const department = String(formData.get("department") || "");
    const startDate = String(formData.get("startDate") || "");
    if (!email) return { intent, ok: false, type: "error", message: "No email address for this joiner." };
    const result = await sendOnboardingWelcomeEmail(context.cloudflare.env, { name, email, role, department, startDate });
    if (result.delivered) await markWelcomeSent(db, joinerId);
    return { intent, ok: result.delivered, type: result.delivered ? "success" : "error", message: result.message };
  }

  if (intent === "get-tech") {
    const joinerId = String(formData.get("joinerId") || "");
    const allocations = await listTechAllocations(db, joinerId);
    return { intent, ok: true, allocations };
  }

  if (intent === "add-tech") {
    const joinerId = String(formData.get("joinerId") || "");
    await addTechAllocation(db, tenantId, joinerId, {
      assetType: String(formData.get("assetType") || "").trim(),
      assetTag: String(formData.get("assetTag") || "").trim(),
      serialNo: String(formData.get("serialNo") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
    });
    return { intent, ok: true, type: "success", message: "Asset allocated.", joinerId };
  }

  if (intent === "delete-tech") {
    const allocationId = String(formData.get("allocationId") || "");
    await deleteTechAllocation(db, tenantId, allocationId);
    return { intent, ok: true, type: "success", message: "Allocation removed." };
  }

  return { intent: "unknown", ok: false, type: "error", message: "Unsupported action." };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const fetcher = useFetcher<ActionResult>();
  const taskFetcher = useFetcher<ActionResult>();
  const preboardFetcher = useFetcher<ActionResult>();
  const welcomeFetcher = useFetcher<ActionResult>();
  const techFetcher = useFetcher<ActionResult>();

  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("tasks");
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [techAllocations, setTechAllocations] = useState<OnboardingTechAllocation[]>([]);
  const [showTechForm, setShowTechForm] = useState(false);
  const loadedTechForRef = useRef<string | null>(null);

  const joiners = data.joiners;
  const joiner = joiners[selected] ?? joiners[0];
  const doneCount = joiner ? joiner.tasks.filter((t) => t.done).length : 0;

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // add-joiner result
  useEffect(() => {
    const d = fetcher.data as (ActionResult & { intent?: string }) | undefined;
    if (!d || d.intent !== "add-joiner") return;
    const r = d as { ok: boolean; message: string; type: "success" | "error" };
    setToast({ message: r.message, type: r.type });
    if (r.ok) {
      setShowForm(false);
      revalidator.revalidate();
    }
  }, [fetcher.data]);

  // task toggle result
  useEffect(() => {
    const d = taskFetcher.data as (ActionResult & { intent?: string }) | undefined;
    if (!d || d.intent !== "toggle-task") return;
    const r = d as { ok: boolean; message: string; type: "success" | "error" };
    if (r.ok) revalidator.revalidate();
  }, [taskFetcher.data]);

  // pre-board result
  useEffect(() => {
    const d = preboardFetcher.data as (ActionResult & { intent?: string }) | undefined;
    if (!d || d.intent !== "update-preboard") return;
    const r = d as { ok: boolean; message: string; type: "success" | "error" };
    setToast({ message: r.message, type: r.type });
    if (r.ok) revalidator.revalidate();
  }, [preboardFetcher.data]);

  // welcome email result
  useEffect(() => {
    const d = welcomeFetcher.data as (ActionResult & { intent?: string }) | undefined;
    if (!d || d.intent !== "send-welcome") return;
    const r = d as { ok: boolean; message: string; type: "success" | "error" };
    setToast({ message: r.message, type: r.type });
    if (r.ok) revalidator.revalidate();
  }, [welcomeFetcher.data]);

  // tech fetcher results
  useEffect(() => {
    const d = techFetcher.data as (ActionResult & { intent?: string }) | undefined;
    if (!d) return;
    if (d.intent === "get-tech") {
      const r = d as { ok: boolean; allocations: OnboardingTechAllocation[] };
      setTechAllocations(r.allocations ?? []);
    } else if (d.intent === "add-tech" || d.intent === "delete-tech") {
      const r = d as { ok: boolean; message: string; type: "success" | "error" };
      setToast({ message: r.message, type: r.type });
      if (r.ok && joiner) {
        setShowTechForm(false);
        loadedTechForRef.current = null; // force reload
        techFetcher.submit({ intent: "get-tech", joinerId: joiner.id }, { method: "post" });
        loadedTechForRef.current = joiner.id;
      }
    }
  }, [techFetcher.data]);

  // Load tech allocations when tab switches to "tech"
  useEffect(() => {
    if (tab !== "tech" || !joiner) return;
    if (loadedTechForRef.current === joiner.id) return;
    loadedTechForRef.current = joiner.id;
    techFetcher.submit({ intent: "get-tech", joinerId: joiner.id }, { method: "post" });
  }, [tab, joiner?.id]);

  // Reset tech cache when joiner changes
  useEffect(() => {
    loadedTechForRef.current = null;
    setTechAllocations([]);
    setShowTechForm(false);
    setTab("tasks");
  }, [selected]);

  const isAdmin = ["Admin", "HR Admin", "HR", "HR Manager", "hr_admin"].includes(data.currentUser.role ?? "");

  function submitPreboard(field: "offerSigned" | "bgCheck" | "docsCollected", newVal: boolean) {
    if (!joiner || !isAdmin) return;
    preboardFetcher.submit(
      {
        intent: "update-preboard",
        joinerId: joiner.id,
        offerSigned: field === "offerSigned" ? (newVal ? "1" : "0") : (joiner.offerSigned ? "1" : "0"),
        bgCheck: field === "bgCheck" ? (newVal ? "1" : "0") : (joiner.bgCheck ? "1" : "0"),
        docsCollected: field === "docsCollected" ? (newVal ? "1" : "0") : (joiner.docsCollected ? "1" : "0"),
      },
      { method: "post" },
    );
  }

  const ASSET_TYPES = ["Laptop", "Phone", "Access Card", "Monitor", "Keyboard & Mouse", "Other"];

  return (
    <HRMSLayout currentUser={data.currentUser}>
      {toast ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "success" ? "var(--green)" : "var(--red)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13, maxWidth: 320 }}>
          {toast.message}
        </div>
      ) : null}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Onboarding</div>
          <div className="page-sub">Track new hire journeys from offer to fully productive.</div>
        </div>
        {isAdmin ? <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add New Joiner</button> : null}
      </div>

      {/* Add Joiner Form */}
      {showForm ? (
        <fetcher.Form method="post" className="card" style={{ marginBottom: 20 }}>
          <input type="hidden" name="intent" value="add-joiner" />
          <div className="card-title">Add New Joiner</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input name="name" placeholder="Full name *" required style={fieldStyle} />
            <input name="role" placeholder="Role *" required style={fieldStyle} />
            <input name="department" placeholder="Department *" required style={fieldStyle} />
            <input name="startDate" type="date" required style={fieldStyle} />
            <input name="email" type="email" placeholder="Work email" style={fieldStyle} />
            <input name="phone" placeholder="Phone (optional)" style={fieldStyle} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "Saving..." : "Save Joiner"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : null}

      {/* Stats */}
      <div className="stat-grid">
        {data.stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {joiners.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🚀</div>
            <div className="empty-state-title">No joiners added yet</div>
            <div className="empty-state-sub" style={{ marginBottom: 20 }}>Add your first new hire to start tracking their onboarding progress.</div>
            {isAdmin ? <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add New Joiner</button> : null}
          </div>
        </div>
      ) : null}

      {/* Main content: sidebar + detail */}
      {joiners.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
          {/* Joiner list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {joiners.map((j, index) => (
              <div
                key={j.id}
                onClick={() => setSelected(index)}
                style={{ background: selected === index ? "var(--accent)" : "white", border: `1px solid ${selected === index ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: 16, cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: selected === index ? "rgba(255,255,255,0.2)" : "var(--accent-light)", color: selected === index ? "white" : "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12 }}>
                    {j.avatar}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: selected === index ? "white" : "var(--ink)" }}>{j.name}</div>
                    <div style={{ fontSize: 11, color: selected === index ? "rgba(255,255,255,0.7)" : "var(--ink-3)" }}>{j.role}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: selected === index ? "rgba(255,255,255,0.7)" : "var(--ink-3)", marginBottom: 8 }}>
                  Starts {j.startDateLabel} · {j.department}
                </div>
                <div style={{ background: selected === index ? "rgba(255,255,255,0.2)" : "var(--surface)", borderRadius: 99, height: 6 }}>
                  <div style={{ width: `${j.progress}%`, background: selected === index ? "white" : "var(--accent)", height: "100%", borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {joiner ? (
            <div className="card" style={{ margin: 0 }}>
              {/* Panel header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{joiner.name}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    {joiner.role} · {joiner.department} · Starts {joiner.startDateLabel}
                  </div>
                  {joiner.email ? <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>✉ {joiner.email}{joiner.phone ? ` · 📞 ${joiner.phone}` : ""}</div> : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {joiner.welcomeSent ? (
                    <span style={{ fontSize: 11, background: "#dcfce7", color: "#15803d", borderRadius: 99, padding: "4px 10px", fontWeight: 600 }}>✓ Welcome Sent</span>
                  ) : isAdmin && joiner.email ? (
                    <welcomeFetcher.Form method="post">
                      <input type="hidden" name="intent" value="send-welcome" />
                      <input type="hidden" name="joinerId" value={joiner.id} />
                      <input type="hidden" name="name" value={joiner.name} />
                      <input type="hidden" name="email" value={joiner.email} />
                      <input type="hidden" name="role" value={joiner.role} />
                      <input type="hidden" name="department" value={joiner.department} />
                      <input type="hidden" name="startDate" value={joiner.startDate} />
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: "6px 12px" }} type="submit" disabled={welcomeFetcher.state !== "idle"}>
                        {welcomeFetcher.state !== "idle" ? "Sending..." : "✉ Send Welcome Email"}
                      </button>
                    </welcomeFetcher.Form>
                  ) : null}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{doneCount}/{joiner.tasks.length}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>tasks done</div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ background: "var(--surface)", borderRadius: 99, height: 10, marginBottom: 20 }}>
                <div style={{ width: `${joiner.progress}%`, background: "var(--accent)", height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface)", borderRadius: 10, padding: 4 }}>
                {(["tasks", "preboard", "tech"] as Tab[]).map((t) => {
                  const labels: Record<Tab, string> = { tasks: "📋 Onboarding Tasks", preboard: "📄 Pre-boarding", tech: "💻 Tech Setup" };
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      style={{ flex: 1, padding: "8px 12px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: tab === t ? 700 : 500, background: tab === t ? "white" : "transparent", color: tab === t ? "var(--accent)" : "var(--ink-3)", cursor: "pointer", boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>

              {/* ── Tasks Tab ─────────────────────────────────────────── */}
              {tab === "tasks" ? (
                joiner.groupedTasks.map((section) => (
                  <div key={section.section} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>
                      {section.section}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {section.items.map((task) => (
                        <taskFetcher.Form key={task.id} method="post">
                          <input type="hidden" name="intent" value="toggle-task" />
                          <input type="hidden" name="joinerId" value={joiner.id} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <button
                            type="submit"
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: task.done ? "var(--green-light)" : "var(--surface)", border: `1px solid ${task.done ? "#bbf7d0" : "var(--border)"}`, cursor: "pointer" }}
                          >
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: task.done ? "var(--green)" : "white", border: `2px solid ${task.done ? "var(--green)" : "var(--border)"}`, display: "grid", placeItems: "center", color: "white", fontSize: 11, flexShrink: 0 }}>
                              {task.done ? "✓" : ""}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 500, color: task.done ? "var(--green)" : "var(--ink)", textDecoration: task.done ? "line-through" : "none" }}>
                              {task.label}
                            </span>
                            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{task.done ? "Done" : "Mark Done"}</span>
                          </button>
                        </taskFetcher.Form>
                      ))}
                    </div>
                  </div>
                ))
              ) : null}

              {/* ── Pre-boarding Tab ───────────────────────────────────── */}
              {tab === "preboard" ? (
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>
                    Track document collection and verification status before Day 1.
                  </div>

                  {/* Pre-boarding checklist cards */}
                  {[
                    { field: "offerSigned" as const, label: "Offer Letter Signed", sub: "Candidate has signed and returned the offer letter", icon: "📝", value: joiner.offerSigned },
                    { field: "bgCheck" as const, label: "Background Verification", sub: "BGV initiated and cleared with third-party provider", icon: "🔍", value: joiner.bgCheck },
                    { field: "docsCollected" as const, label: "Documents Collected", sub: "ID proof, educational certificates, address proof received", icon: "📁", value: joiner.docsCollected },
                  ].map(({ field, label, sub, icon, value }) => (
                    <div
                      key={field}
                      onClick={() => isAdmin && submitPreboard(field, !value)}
                      style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 10, border: `1.5px solid ${value ? "#bbf7d0" : "var(--border)"}`, background: value ? "#f0fdf4" : "var(--surface)", marginBottom: 10, cursor: isAdmin ? "pointer" : "default" }}
                    >
                      <div style={{ fontSize: 24, width: 40, textAlign: "center", flexShrink: 0 }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: value ? "var(--green)" : "var(--ink)", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: value ? "var(--green)" : "white", border: `2px solid ${value ? "var(--green)" : "var(--border)"}`, display: "grid", placeItems: "center", color: "white", fontSize: 14, flexShrink: 0 }}>
                        {value ? "✓" : ""}
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--ink-3)" }}>
                    {[joiner.offerSigned, joiner.bgCheck, joiner.docsCollected].filter(Boolean).length}/3 pre-boarding items complete
                    {!isAdmin ? " · Only HR Admins can update these" : ""}
                  </div>
                </div>
              ) : null}

              {/* ── Tech Setup Tab ─────────────────────────────────────── */}
              {tab === "tech" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Assets and access provisioned for this joiner.</div>
                    {isAdmin ? (
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setShowTechForm(true)}>+ Allocate Asset</button>
                    ) : null}
                  </div>

                  {/* Add tech form */}
                  {showTechForm ? (
                    <techFetcher.Form method="post" style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
                      <input type="hidden" name="intent" value="add-tech" />
                      <input type="hidden" name="joinerId" value={joiner.id} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", marginBottom: 4 }}>ASSET TYPE *</div>
                          <select name="assetType" required style={{ ...fieldStyle, background: "white" }}>
                            <option value="">Select type…</option>
                            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", marginBottom: 4 }}>ASSET TAG</div>
                          <input name="assetTag" placeholder="e.g. LT-0042" style={fieldStyle} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", marginBottom: 4 }}>SERIAL NO</div>
                          <input name="serialNo" placeholder="e.g. SN123456" style={fieldStyle} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", marginBottom: 4 }}>NOTES</div>
                          <input name="notes" placeholder="e.g. MacBook Pro M3 16GB" style={fieldStyle} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12 }} type="submit" disabled={techFetcher.state !== "idle"}>
                          {techFetcher.state !== "idle" ? "Saving..." : "Allocate"}
                        </button>
                        <button className="btn btn-outline" style={{ fontSize: 12 }} type="button" onClick={() => setShowTechForm(false)}>Cancel</button>
                      </div>
                    </techFetcher.Form>
                  ) : null}

                  {/* Allocations list */}
                  {techFetcher.state === "loading" && techAllocations.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
                  ) : techAllocations.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "var(--ink-3)", fontSize: 13 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>💻</div>
                      No assets allocated yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {techAllocations.map((alloc) => (
                        <div key={alloc.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                          <div style={{ fontSize: 20, width: 32, textAlign: "center" }}>
                            {alloc.assetType === "Laptop" ? "💻" : alloc.assetType === "Phone" ? "📱" : alloc.assetType === "Access Card" ? "🪪" : alloc.assetType === "Monitor" ? "🖥️" : "⌨️"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{alloc.assetType}</div>
                            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                              {[alloc.assetTag && `Tag: ${alloc.assetTag}`, alloc.serialNo && `S/N: ${alloc.serialNo}`, alloc.notes].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{new Date(alloc.allocatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                          {isAdmin ? (
                            <techFetcher.Form method="post">
                              <input type="hidden" name="intent" value="delete-tech" />
                              <input type="hidden" name="allocationId" value={alloc.id} />
                              <button type="submit" style={{ background: "none", border: "none", color: "var(--ink-3)", cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6 }} title="Remove">✕</button>
                            </techFetcher.Form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </HRMSLayout>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
};
