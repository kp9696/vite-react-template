import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.exit";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";

const DEMO_USER_ID = "USRDEMO01";

const initialExits = [
  {
    name: "Rajesh Kumar", id: "EMP088", role: "Backend Engineer", dept: "Engineering",
    type: "Resignation", noticePeriod: "60 days", lastDay: "May 31 2026",
    progress: 45, reason: "Better opportunity",
    tasks: [
      { id: "t1", label: "Resignation Accepted", done: true },
      { id: "t2", label: "Notice Period Confirmed", done: true },
      { id: "t3", label: "Knowledge Transfer Plan", done: true },
      { id: "t4", label: "Asset Retrieval", done: false },
      { id: "t5", label: "Access Revocation", done: false },
      { id: "t6", label: "Exit Interview", done: false },
      { id: "t7", label: "Full & Final Settlement", done: false },
      { id: "t8", label: "Experience Letter", done: false },
    ],
  },
  {
    name: "Aditi Sharma", id: "EMP124", role: "Marketing Analyst", dept: "Marketing",
    type: "Resignation", noticePeriod: "30 days", lastDay: "Apr 30 2026",
    progress: 75, reason: "Higher studies",
    tasks: [
      { id: "t9", label: "Resignation Accepted", done: true },
      { id: "t10", label: "Notice Period Confirmed", done: true },
      { id: "t11", label: "Knowledge Transfer Plan", done: true },
      { id: "t12", label: "Asset Retrieval", done: true },
      { id: "t13", label: "Access Revocation", done: true },
      { id: "t14", label: "Exit Interview", done: true },
      { id: "t15", label: "Full & Final Settlement", done: false },
      { id: "t16", label: "Experience Letter", done: false },
    ],
  },
];

export function meta() {
  return [{ title: "JWithKP HRMS - Exit Management" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

export default function Exit() {
  const { currentUser } = useLoaderData<typeof loader>();
  const isDemo = currentUser.id === DEMO_USER_ID;
  const [exits, setExits] = useState(initialExits);
  const [selected, setSelected] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", id: "", role: "", dept: "", type: "Resignation", noticePeriod: "30 days", lastDay: "" });

  const showDemoToast = (msg: string) => {
    setShowForm(false);
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const toggleTask = (exitIndex: number, taskId: string) => {
    if (!isDemo) return;

    setExits((prev) => prev.map((exitItem, index) => {
      if (index !== exitIndex) return exitItem;
      const updatedTasks = exitItem.tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
      const doneCount = updatedTasks.filter((task) => task.done).length;
      const progress = Math.round((doneCount / updatedTasks.length) * 100);
      return { ...exitItem, tasks: updatedTasks, progress };
    }));
  };

  const handleInitiate = () => {
    if (!form.name || !form.id || !form.role) {
      setToast("Please fill in employee name, ID, and role.");
      return;
    }

    const uniquePrefix = Date.now();
    const newExit = {
      name: form.name,
      id: form.id,
      role: form.role,
      dept: form.dept,
      type: form.type,
      noticePeriod: form.noticePeriod,
      lastDay: form.lastDay || "TBD",
      progress: 0,
      reason: "-",
      tasks: [
        { id: `n1-${uniquePrefix}`, label: "Resignation Accepted", done: false },
        { id: `n2-${uniquePrefix}`, label: "Notice Period Confirmed", done: false },
        { id: `n3-${uniquePrefix}`, label: "Knowledge Transfer Plan", done: false },
        { id: `n4-${uniquePrefix}`, label: "Asset Retrieval", done: false },
        { id: `n5-${uniquePrefix}`, label: "Access Revocation", done: false },
        { id: `n6-${uniquePrefix}`, label: "Exit Interview", done: false },
        { id: `n7-${uniquePrefix}`, label: "Full & Final Settlement", done: false },
        { id: `n8-${uniquePrefix}`, label: "Experience Letter", done: false },
      ],
    };

    setExits((prev) => [...prev, newExit]);
    setSelected(exits.length);
    showDemoToast(`Exit initiated for ${form.name}. Create your own account to track the full offboarding workflow.`);
    setForm({ name: "", id: "", role: "", dept: "", type: "Resignation", noticePeriod: "30 days", lastDay: "" });
  };

  const currentExit = exits[selected] ?? exits[0];
  const completedTasks = currentExit.tasks.filter((task) => task.done).length;

  return (
    <HRMSLayout currentUser={currentUser}>
      {isDemo && toast ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "var(--accent)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", maxWidth: 340 }}>
          {toast} <a href="/register" style={{ color: "#c4b5fd", marginLeft: 6 }}>Get started -&gt;</a>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Exit Management</div>
          <div className="page-sub">Manage offboarding, clearances, and full & final settlements.</div>
        </div>
        {isDemo ? <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Initiate Exit</button> : null}
      </div>

      {!isDemo ? (
        <div className="card" style={{ marginBottom: 24, borderLeft: "4px solid var(--accent)" }}>
          <div className="card-title">Read-only Preview</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7 }}>
            Exit initiation and document-generation actions are still being connected to persistent backend workflows in this build.
          </div>
        </div>
      ) : null}

      {isDemo && showForm ? (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--red)" }}>
          <div className="card-title">Initiate Exit Process</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Employee Name *</label>
              <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Arjun Gupta" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Employee ID *</label>
              <input value={form.id} onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))} placeholder="e.g. EMP042" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Role *</label>
              <input value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))} placeholder="e.g. Sales Executive" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <input value={form.dept} onChange={(e) => setForm((prev) => ({ ...prev, dept: e.target.value }))} placeholder="e.g. Sales" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Exit Type</label>
              <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} style={fieldStyle}>
                <option>Resignation</option>
                <option>Termination</option>
                <option>Retirement</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Notice Period</label>
              <select value={form.noticePeriod} onChange={(e) => setForm((prev) => ({ ...prev, noticePeriod: e.target.value }))} style={fieldStyle}>
                <option>30 days</option>
                <option>60 days</option>
                <option>90 days</option>
                <option>Immediate</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Last Working Day</label>
              <input type="date" value={form.lastDay} onChange={(e) => setForm((prev) => ({ ...prev, lastDay: e.target.value }))} style={fieldStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" style={{ background: "var(--red)" }} onClick={handleInitiate}>Initiate Exit</button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        {[
          { label: "Active Exits", value: String(exits.length), sub: "In notice period" },
          { label: "Ending This Month", value: "3", sub: "Last day in April" },
          { label: "Pending F&F", value: String(exits.filter((exitItem) => exitItem.tasks.some((task) => task.label === "Full & Final Settlement" && !task.done)).length), sub: "Settlement due" },
          { label: "Attrition (YTD)", value: "9.1%", sub: "down from 10.5% last year" },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
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
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: selected === index ? "rgba(255,255,255,0.15)" : "var(--amber-light)", color: selected === index ? "white" : "var(--amber)", fontWeight: 600 }}>{exitItem.type}</span>
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
            <div className="card-title">Top Exit Reasons</div>
            {[
              { reason: "Better Opportunity", pct: 42, color: "#4f46e5" },
              { reason: "Higher Studies", pct: 18, color: "#10b981" },
              { reason: "Relocation", pct: 15, color: "#f59e0b" },
              { reason: "Personal", pct: 25, color: "#8b5cf6" },
            ].map((reason) => (
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
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{currentExit.id} - {currentExit.role} - {currentExit.dept}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                <span className="badge badge-amber">{currentExit.type}</span>
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
              <button
                key={task.id}
                onClick={() => toggleTask(selected, task.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  cursor: isDemo ? "pointer" : "default",
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
            ))}
          </div>

          {isDemo ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={() => showDemoToast("Exit interview scheduled. Create your own account to set up real calendar invites.")}>
                Schedule Exit Interview
              </button>
              <button className="btn btn-outline" onClick={() => showDemoToast("F&F statement generated. Create your own account to download real payroll documents.")}>
                Generate F&F Statement
              </button>
              <button className="btn btn-outline" onClick={() => showDemoToast("Experience letter drafted. Create your own account to send it from your company domain.")}>
                Issue Experience Letter
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </HRMSLayout>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };
