import { useEffect, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.onboarding";
import HRMSLayout from "../components/HRMSLayout";
import { DEMO_USER } from "../lib/hrms.server";
import { requireSignedInUser } from "../lib/session.server";
import { createOnboardingJoiner, getDemoOnboardingDashboard, getOnboardingDashboard, toggleOnboardingTask } from "../lib/workforce.server";

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

export function meta() {
  return [{ title: "PeopleOS - Onboarding" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  const data = currentUser.id === DEMO_USER.id
    ? getDemoOnboardingDashboard()
    : currentUser.orgId
      ? await getOnboardingDashboard(context.cloudflare.env.HRMS, currentUser.orgId)
      : getDemoOnboardingDashboard();

  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  if (currentUser.id === DEMO_USER.id) {
    return { ok: false, type: "error", message: "Demo onboarding data is read-only." };
  }
  if (!currentUser.orgId) {
    return { ok: false, type: "error", message: "Organization not found for this user." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "add-joiner") {
    await createOnboardingJoiner(context.cloudflare.env.HRMS, {
      orgId: currentUser.orgId,
      name: String(formData.get("name") || "").trim(),
      role: String(formData.get("role") || "").trim(),
      department: String(formData.get("department") || "").trim(),
      startDate: String(formData.get("startDate") || "").trim(),
    });
    return { ok: true, type: "success", message: "New joiner added successfully." };
  }

  if (intent === "toggle-task") {
    await toggleOnboardingTask(
      context.cloudflare.env.HRMS,
      String(formData.get("joinerId") || ""),
      String(formData.get("taskId") || ""),
    );
    return { ok: true, type: "success", message: "Onboarding task updated." };
  }

  return { ok: false, type: "error", message: "Unsupported onboarding action." };
}

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const taskFetcher = useFetcher<ActionResult>();
  const [selected, setSelected] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (fetcher.data) {
      setToast(fetcher.data);
      if (fetcher.data.ok) setShowForm(false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (taskFetcher.data) setToast(taskFetcher.data);
  }, [taskFetcher.data]);

  const joiner = data.joiners[selected] ?? data.joiners[0];
  const doneCount = joiner ? joiner.tasks.filter((task) => task.done).length : 0;

  return (
    <HRMSLayout>
      {toast ? <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "success" ? "var(--green)" : "var(--red)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13 }}>{toast.message}</div> : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Onboarding</div>
          <div className="page-sub">Track new hire journeys from offer to fully productive.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add New Joiner</button>
      </div>

      {showForm ? (
        <fetcher.Form method="post" className="card" style={{ marginBottom: 20 }}>
          <input type="hidden" name="intent" value="add-joiner" />
          <div className="card-title">Add New Joiner</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input name="name" placeholder="Full name" style={fieldStyle} />
            <input name="role" placeholder="Role" style={fieldStyle} />
            <input name="department" placeholder="Department" style={fieldStyle} />
            <input name="startDate" type="date" style={fieldStyle} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Saving..." : "Save Joiner"}</button>
            <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : null}

      <div className="stat-grid">
        {data.stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.joiners.map((current, index) => (
            <div key={current.id} onClick={() => setSelected(index)} style={{ background: selected === index ? "var(--accent)" : "white", border: `1px solid ${selected === index ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: selected === index ? "rgba(255,255,255,0.2)" : "var(--accent-light)", color: selected === index ? "white" : "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12 }}>{current.avatar}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: selected === index ? "white" : "var(--ink)" }}>{current.name}</div>
                  <div style={{ fontSize: 11, color: selected === index ? "rgba(255,255,255,0.7)" : "var(--ink-3)" }}>{current.role}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: selected === index ? "rgba(255,255,255,0.7)" : "var(--ink-3)", marginBottom: 8 }}>
                Starts {current.startDateLabel} · {current.department}
              </div>
              <div style={{ background: selected === index ? "rgba(255,255,255,0.2)" : "var(--surface)", borderRadius: 99, height: 6 }}>
                <div style={{ width: `${current.progress}%`, background: selected === index ? "white" : "var(--accent)", height: "100%", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>

        {joiner ? (
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{joiner.name}</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{joiner.role} · Starts {joiner.startDateLabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{doneCount}/{joiner.tasks.length}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>tasks done</div>
              </div>
            </div>

            <div style={{ background: "var(--surface)", borderRadius: 99, height: 10, marginBottom: 24 }}>
              <div style={{ width: `${joiner.progress}%`, background: "var(--accent)", height: "100%", borderRadius: 99 }} />
            </div>

            {joiner.groupedTasks.map((section) => (
              <div key={section.section} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>{section.section}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {section.items.map((task) => (
                    <taskFetcher.Form key={task.id} method="post">
                      <input type="hidden" name="intent" value="toggle-task" />
                      <input type="hidden" name="joinerId" value={joiner.id} />
                      <input type="hidden" name="taskId" value={task.id} />
                      <button type="submit" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: task.done ? "var(--green-light)" : "var(--surface)", border: `1px solid ${task.done ? "#bbf7d0" : "var(--border)"}`, cursor: "pointer" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: task.done ? "var(--green)" : "white", border: `2px solid ${task.done ? "var(--green)" : "var(--border)"}`, display: "grid", placeItems: "center", color: "white", fontSize: 11 }}>
                          {task.done ? "✓" : ""}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: task.done ? "var(--green)" : "var(--ink)", textDecoration: task.done ? "line-through" : "none" }}>{task.label}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{task.done ? "Done" : "Mark Done"}</span>
                      </button>
                    </taskFetcher.Form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </HRMSLayout>
  );
}

const fieldStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 };
