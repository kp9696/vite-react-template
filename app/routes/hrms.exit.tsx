import HRMSLayout from "../components/HRMSLayout";
import { useState } from "react";

const exits = [
  {
    name: "Rajesh Kumar", id: "EMP088", role: "Backend Engineer", dept: "Engineering",
    type: "Resignation", noticePeriod: "60 days", lastDay: "May 31 2026",
    progress: 45, reason: "Better opportunity",
    tasks: [
      { label: "Resignation Accepted", done: true },
      { label: "Notice Period Confirmed", done: true },
      { label: "Knowledge Transfer Plan", done: true },
      { label: "Asset Retrieval", done: false },
      { label: "Access Revocation", done: false },
      { label: "Exit Interview", done: false },
      { label: "Full & Final Settlement", done: false },
      { label: "Experience Letter", done: false },
    ]
  },
  {
    name: "Aditi Sharma", id: "EMP124", role: "Marketing Analyst", dept: "Marketing",
    type: "Resignation", noticePeriod: "30 days", lastDay: "Apr 30 2026",
    progress: 75, reason: "Higher studies",
    tasks: [
      { label: "Resignation Accepted", done: true },
      { label: "Notice Period Confirmed", done: true },
      { label: "Knowledge Transfer Plan", done: true },
      { label: "Asset Retrieval", done: true },
      { label: "Access Revocation", done: true },
      { label: "Exit Interview", done: true },
      { label: "Full & Final Settlement", done: false },
      { label: "Experience Letter", done: false },
    ]
  },
];

const typeColors: Record<string, string> = {
  "Resignation": "var(--amber)",
  "Termination": "var(--red)",
  "Retirement": "var(--accent)",
};

export function meta() {
  return [{ title: "PeopleOS · Exit Management" }];
}

export default function Exit() {
  const [selected, setSelected] = useState(0);
  const emp = exits[selected];
  const done = emp.tasks.filter(t => t.done).length;

  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Exit Management</div>
          <div className="page-sub">Manage offboarding, clearances, and full & final settlements.</div>
        </div>
        <button className="btn btn-primary">+ Initiate Exit</button>
      </div>

      <div className="stat-grid">
        {[
          { label: "Active Exits", value: "7", sub: "In notice period" },
          { label: "Ending This Month", value: "3", sub: "Last day in April" },
          { label: "Pending F&F", value: "4", sub: "Settlement due" },
          { label: "Attrition (YTD)", value: "9.1%", sub: "↓ from 10.5% last yr" },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {exits.map((e, i) => (
            <div key={e.id} onClick={() => setSelected(i)} style={{
              background: selected === i ? "var(--ink)" : "white",
              border: `1px solid ${selected === i ? "var(--ink)" : "var(--border)"}`,
              borderRadius: 12, padding: 16, cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: selected === i ? "white" : "var(--ink)" }}>{e.name}</div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: selected === i ? "rgba(255,255,255,0.15)" : "var(--amber-light)", color: selected === i ? "white" : "var(--amber)", fontWeight: 600 }}>{e.type}</span>
              </div>
              <div style={{ fontSize: 12, color: selected === i ? "rgba(255,255,255,0.6)" : "var(--ink-3)", marginBottom: 10 }}>
                {e.role} · Last day {e.lastDay}
              </div>
              <div style={{ background: selected === i ? "rgba(255,255,255,0.15)" : "var(--surface)", borderRadius: 99, height: 6 }}>
                <div style={{ width: `${e.progress}%`, background: selected === i ? "white" : "var(--accent)", height: "100%", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 11, color: selected === i ? "rgba(255,255,255,0.6)" : "var(--ink-3)", marginTop: 4 }}>{e.progress}% cleared</div>
            </div>
          ))}

          {/* Exit Reasons pie-ish */}
          <div className="card" style={{ margin: 0, marginTop: 8 }}>
            <div className="card-title">Top Exit Reasons</div>
            {[
              { reason: "Better Opportunity", pct: 42, color: "#4f46e5" },
              { reason: "Higher Studies", pct: 18, color: "#10b981" },
              { reason: "Relocation", pct: 15, color: "#f59e0b" },
              { reason: "Personal", pct: 25, color: "#8b5cf6" },
            ].map(r => (
              <div key={r.reason} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{r.reason}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{r.pct}%</span>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 99, height: 5 }}>
                  <div style={{ width: `${r.pct}%`, background: r.color, height: "100%", borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{emp.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{emp.id} · {emp.role} · {emp.dept}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                <span className="badge badge-amber">{emp.type}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Notice: {emp.noticePeriod}</span>
                <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 600 }}>Last Day: {emp.lastDay}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--accent)" }}>{done}/{emp.tasks.length}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>tasks cleared</div>
            </div>
          </div>

          <div style={{ background: "var(--surface)", borderRadius: 99, height: 10, marginBottom: 24 }}>
            <div style={{ width: `${emp.progress}%`, background: "var(--accent)", height: "100%", borderRadius: 99, transition: "width 0.6s" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {emp.tasks.map(t => (
              <div key={t.label} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 8,
                background: t.done ? "var(--green-light)" : "var(--surface)",
                border: `1px solid ${t.done ? "#bbf7d0" : "var(--border)"}`,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: t.done ? "var(--green)" : "white",
                  border: `2px solid ${t.done ? "var(--green)" : "var(--border)"}`,
                  display: "grid", placeItems: "center",
                  color: "white", fontSize: 11
                }}>
                  {t.done ? "✓" : ""}
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: t.done ? "var(--green)" : "var(--ink-2)" }}>
                  {t.label}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
            <button className="btn btn-primary">Schedule Exit Interview</button>
            <button className="btn btn-outline">Generate F&F Statement</button>
            <button className="btn btn-outline">Issue Experience Letter</button>
          </div>
        </div>
      </div>
    </HRMSLayout>
  );
}
