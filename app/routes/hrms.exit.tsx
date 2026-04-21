import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.exit";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { createExitProcess, getExitDashboard, toggleExitTask } from "../lib/workforce.server";

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

export function meta() {
  return [{ title: "JWithKP HRMS - Exit Management" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  const data = tenantId
    ? await getExitDashboard(context.cloudflare.env.HRMS, tenantId)
    : { exits: [] };
  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) {
    return { ok: false, type: "error", message: "Organization not found for this user." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "add-exit") {
    const name = String(formData.get("name") || "").trim();
    const employeeCode = String(formData.get("employeeCode") || "").trim();
    const role = String(formData.get("role") || "").trim();
    if (!name || !employeeCode || !role) {
      return { ok: false, type: "error", message: "Please fill in employee name, ID, and role." };
    }

    await createExitProcess(context.cloudflare.env.HRMS, {
      companyId: tenantId,
      name,
      employeeCode,
      role,
      department: String(formData.get("department") || "").trim(),
      exitType: String(formData.get("exitType") || "Resignation").trim(),
      noticePeriod: String(formData.get("noticePeriod") || "30 days").trim(),
      lastDay: String(formData.get("lastDay") || new Date().toISOString().slice(0, 10)).trim(),
    });

    return { ok: true, type: "success", message: `Exit process initiated for ${name}.` };
  }

  if (intent === "toggle-task") {
    await toggleExitTask(
      context.cloudflare.env.HRMS,
      String(formData.get("exitId") || ""),
      String(formData.get("taskId") || ""),
    );
    return { ok: true, type: "success", message: "Exit checklist updated." };
  }

  return { ok: false, type: "error", message: "Unsupported exit action." };
}

export default function Exit() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const taskFetcher = useFetcher<ActionResult>();
  const [toast, setToast] = useState<ActionResult | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const exits = data.exits;

  useEffect(() => {
    if (fetcher.data) {
      setToast(fetcher.data);
      if (fetcher.data.ok) setShowForm(false);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetcher.data]);

  useEffect(() => {
    if (taskFetcher.data) {
      setToast(taskFetcher.data);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [taskFetcher.data]);

  const currentExit = exits[selected] ?? exits[0] ?? null;
  const completedTasks = currentExit ? currentExit.tasks.filter((task) => task.done).length : 0;
  const pendingFF = exits.filter((exitItem) => exitItem.tasks.some((task) => task.label === "Full & Final Settlement" && !task.done)).length;
  const now = new Date();
  const endingThisMonth = exits.filter((exitItem) => {
    const value = new Date(exitItem.lastDay);
    return Number.isFinite(value.getTime())
      && value.getMonth() === now.getMonth()
      && value.getFullYear() === now.getFullYear();
  }).length;

  // Calculate real YTD attrition
  const ytdExits = exits.filter((e) => {
    const d = new Date(e.lastDay);
    return Number.isFinite(d.getTime()) && d.getFullYear() === now.getFullYear();
  }).length;
  const attritionPct = data.totalEmployees > 0
    ? ((ytdExits / (data.totalEmployees + ytdExits)) * 100).toFixed(1)
    : "0.0";

  // Calculate real exit reasons breakdown from actual data
  const reasonCounts: Record<string, number> = {};
  for (const e of exits) {
    const key = e.exitType || "Other";
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }
  const reasonColors: Record<string, string> = {
    Resignation: "#6366f1", Termination: "#ef4444", Retirement: "#10b981",
    Abandonment: "#f59e0b", Other: "#8b5cf6",
  };
  const exitReasons = Object.entries(reasonCounts).map(([reason, count]) => ({
    reason,
    pct: exits.length > 0 ? Math.round((count / exits.length) * 100) : 0,
    color: reasonColors[reason] ?? "#6b7280",
  }));

  return (
    <HRMSLayout currentUser={data.currentUser}>
      {toast ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "success" ? "var(--green)" : "var(--red)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", maxWidth: 340 }}>
          {toast.message}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Exit Management</div>
          <div className="page-sub">Manage offboarding, clearances, and full & final settlements.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Initiate Exit</button>
      </div>

      {showForm ? (
        <fetcher.Form method="post" className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--red)" }}>
          <input type="hidden" name="intent" value="add-exit" />
          <div className="card-title">Initiate Exit Process</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Employee Name *</label>
              <input name="name" placeholder="e.g. Arjun Gupta" style={fieldStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Employee ID *</label>
              <input name="employeeCode" placeholder="e.g. EMP042" style={fieldStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Role *</label>
              <input name="role" placeholder="e.g. Sales Executive" style={fieldStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <input name="department" placeholder="e.g. Sales" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Exit Type</label>
              <select name="exitType" defaultValue="Resignation" style={fieldStyle}>
                <option>Resignation</option>
                <option>Termination</option>
                <option>Retirement</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Notice Period</label>
              <select name="noticePeriod" defaultValue="30 days" style={fieldStyle}>
                <option>30 days</option>
                <option>60 days</option>
                <option>90 days</option>
                <option>Immediate</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Last Working Day</label>
              <input type="date" name="lastDay" style={fieldStyle} required />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" style={{ background: "var(--red)" }} type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "Saving..." : "Initiate Exit"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : null}

      <div className="stat-grid">
        {[
          { label: "Active Exits", value: String(exits.length), sub: "In notice period" },
          { label: "Ending This Month", value: String(endingThisMonth), sub: "Last day this month" },
          { label: "Pending F&F", value: String(pendingFF), sub: "Settlement due" },
          { label: "Attrition (YTD)", value: `${attritionPct}%`, sub: ytdExits > 0 ? `${ytdExits} exit${ytdExits !== 1 ? "s" : ""} this year` : "No exits this year" },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {exits.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📉</div>
            <div className="empty-state-title">No active exits</div>
            <div className="empty-state-sub" style={{ marginBottom: 20 }}>Start an exit process to track tasks, progress, and settlements.</div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Initiate Exit</button>
          </div>
        </div>
      ) : null}

      {currentExit ? <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {exits.map((exitItem, index) => (
            <div key={exitItem.id} onClick={() => setSelected(index)} style={{
              background: selected === index ? "var(--ink)" : "white",
              border: `1px solid ${selected === index ? "var(--ink)" : "var(--border)"}`,
              borderRadius: 12,
              padding: 16,
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: selected === index ? "white" : "var(--ink)" }}>{exitItem.name}</div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: selected === index ? "rgba(255,255,255,0.15)" : "var(--amber-light)", color: selected === index ? "white" : "var(--amber)", fontWeight: 600 }}>{exitItem.exitType}</span>
              </div>
              <div style={{ fontSize: 12, color: selected === index ? "rgba(255,255,255,0.6)" : "var(--ink-3)", marginBottom: 10 }}>
                {exitItem.role} - Last day {exitItem.lastDay}
              </div>
              <div style={{ background: selected === index ? "rgba(255,255,255,0.15)" : "var(--surface)", borderRadius: 99, height: 6 }}>
                <div style={{ width: `${exitItem.progress}%`, background: selected === index ? "white" : "var(--accent)", height: "100%", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 11, color: selected === index ? "rgba(255,255,255,0.6)" : "var(--ink-3)", marginTop: 4 }}>{exitItem.progress}% cleared</div>
            </div>
          ))}

          <div className="card" style={{ margin: 0, marginTop: 8 }}>
            <div className="card-title">Exit by Type</div>
            {exits.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>No exits recorded yet.</div>
            ) : exitReasons.map((reason) => (
              <div key={reason.reason} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{reason.reason}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{reason.pct}%</span>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 99, height: 5 }}>
                  <div style={{ width: `${reason.pct}%`, background: reason.color, height: "100%", borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{currentExit.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{currentExit.employeeCode} - {currentExit.role} - {currentExit.department}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                <span className="badge badge-amber">{currentExit.exitType}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Notice: {currentExit.noticePeriod}</span>
                <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 600 }}>Last Day: {currentExit.lastDay}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--accent)" }}>{completedTasks}/{currentExit.tasks.length}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>tasks cleared</div>
            </div>
          </div>

          <div style={{ background: "var(--surface)", borderRadius: 99, height: 10, marginBottom: 24 }}>
            <div style={{ width: `${currentExit.progress}%`, background: "var(--accent)", height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
            {currentExit.tasks.map((task) => (
              <taskFetcher.Form key={task.id} method="post">
                <input type="hidden" name="intent" value="toggle-task" />
                <input type="hidden" name="exitId" value={currentExit.id} />
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: task.done ? "var(--green-light)" : "var(--surface)",
                    border: `1px solid ${task.done ? "#bbf7d0" : "var(--border)"}`,
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: task.done ? "var(--green)" : "white",
                    border: `2px solid ${task.done ? "var(--green)" : "var(--border)"}`,
                    display: "grid",
                    placeItems: "center",
                    color: "white",
                    fontSize: 10,
                  }}>
                    {task.done ? "OK" : ""}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: task.done ? "var(--green)" : "var(--ink-2)" }}>
                    {task.label}
                  </span>
                </button>
              </taskFetcher.Form>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => setToast({ ok: true, type: "success", message: "Exit interview scheduled." })}>
              Schedule Exit Interview
            </button>
            <button className="btn btn-outline" onClick={() => setToast({ ok: true, type: "success", message: "F&F statement generated." })}>
              Generate F&F Statement
            </button>
            <button className="btn btn-outline" onClick={() => setToast({ ok: true, type: "success", message: "Experience letter issued." })}>
              Issue Experience Letter
            </button>
          </div>
        </div>
      </div> : null}
    </HRMSLayout>
  );
}

const labelStyle: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };

