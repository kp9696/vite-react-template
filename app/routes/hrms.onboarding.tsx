import HRMSLayout from "../components/HRMSLayout";
import { useState } from "react";

const newJoiners = [
  {
    name: "Ishaan Verma", role: "ML Engineer", dept: "Engineering", startDate: "Apr 14",
    avatar: "IV", progress: 35,
    tasks: [
      { section: "Pre-joining", items: [
        { label: "Offer Letter Signed", done: true },
        { label: "Background Verification", done: true },
        { label: "Document Submission", done: true },
      ]},
      { section: "Day 1 Setup", items: [
        { label: "Laptop Assigned", done: true },
        { label: "Email & Slack Access", done: false },
        { label: "ID Card Issued", done: false },
      ]},
      { section: "Week 1", items: [
        { label: "HR Induction Session", done: false },
        { label: "Team Introduction", done: false },
        { label: "Tool Access (Jira, GitHub)", done: false },
      ]},
      { section: "30-Day Goals", items: [
        { label: "Complete Security Training", done: false },
        { label: "First Project Kickoff", done: false },
        { label: "Buddy Check-in", done: false },
      ]},
    ]
  },
  {
    name: "Pooja Hegde", role: "UX Researcher", dept: "Design", startDate: "Apr 7",
    avatar: "PH", progress: 72,
    tasks: [
      { section: "Pre-joining", items: [
        { label: "Offer Letter Signed", done: true },
        { label: "Background Verification", done: true },
        { label: "Document Submission", done: true },
      ]},
      { section: "Day 1 Setup", items: [
        { label: "Laptop Assigned", done: true },
        { label: "Email & Slack Access", done: true },
        { label: "ID Card Issued", done: true },
      ]},
      { section: "Week 1", items: [
        { label: "HR Induction Session", done: true },
        { label: "Team Introduction", done: true },
        { label: "Tool Access (Figma, Notion)", done: false },
      ]},
      { section: "30-Day Goals", items: [
        { label: "Complete Security Training", done: false },
        { label: "First Research Sprint", done: false },
        { label: "Buddy Check-in", done: false },
      ]},
    ]
  },
  {
    name: "Tanvi Kulkarni", role: "Data Scientist", dept: "Analytics", startDate: "Apr 21",
    avatar: "TK", progress: 10,
    tasks: [
      { section: "Pre-joining", items: [
        { label: "Offer Letter Signed", done: true },
        { label: "Background Verification", done: false },
        { label: "Document Submission", done: false },
      ]},
      { section: "Day 1 Setup", items: [
        { label: "Laptop Assigned", done: false },
        { label: "Email & Slack Access", done: false },
        { label: "ID Card Issued", done: false },
      ]},
      { section: "Week 1", items: [
        { label: "HR Induction Session", done: false },
        { label: "Team Introduction", done: false },
        { label: "Tool Access (Databricks, Jupyter)", done: false },
      ]},
      { section: "30-Day Goals", items: [
        { label: "Complete Security Training", done: false },
        { label: "First Data Pipeline", done: false },
        { label: "Buddy Check-in", done: false },
      ]},
    ]
  },
];

export function meta() {
  return [{ title: "PeopleOS · Onboarding" }];
}

export default function Onboarding() {
  const [selected, setSelected] = useState(0);
  const joiner = newJoiners[selected];
  const allTasks = joiner.tasks.flatMap(s => s.items);
  const done = allTasks.filter(t => t.done).length;

  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Onboarding</div>
          <div className="page-sub">Track new hire journeys from offer to fully productive.</div>
        </div>
        <button className="btn btn-primary">+ Add New Joiner</button>
      </div>

      <div className="stat-grid">
        {[
          { label: "Joining This Month", value: "12", sub: "Apr 2026" },
          { label: "In Progress", value: "8", sub: "Active onboarding" },
          { label: "Completed", value: "4", sub: "Fully onboarded" },
          { label: "Avg Completion", value: "58%", sub: "↑ 12% vs last month" },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        {/* Joiner List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {newJoiners.map((j, i) => (
            <div
              key={j.name}
              onClick={() => setSelected(i)}
              style={{
                background: selected === i ? "var(--accent)" : "white",
                border: `1px solid ${selected === i ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 12, padding: 16, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: selected === i ? "rgba(255,255,255,0.2)" : "var(--accent-light)",
                  color: selected === i ? "white" : "var(--accent)",
                  display: "grid", placeItems: "center",
                  fontWeight: 700, fontSize: 12, flexShrink: 0
                }}>{j.avatar}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: selected === i ? "white" : "var(--ink)" }}>{j.name}</div>
                  <div style={{ fontSize: 11, color: selected === i ? "rgba(255,255,255,0.7)" : "var(--ink-3)" }}>{j.role}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: selected === i ? "rgba(255,255,255,0.7)" : "var(--ink-3)", marginBottom: 8 }}>
                Starts {j.startDate} · {j.dept}
              </div>
              <div style={{ background: selected === i ? "rgba(255,255,255,0.2)" : "var(--surface)", borderRadius: 99, height: 6 }}>
                <div style={{ width: `${j.progress}%`, background: selected === i ? "white" : "var(--accent)", height: "100%", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 11, color: selected === i ? "rgba(255,255,255,0.8)" : "var(--ink-3)", marginTop: 4 }}>
                {j.progress}% complete
              </div>
            </div>
          ))}
        </div>

        {/* Checklist Detail */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{joiner.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{joiner.role} · Starts {joiner.startDate}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{done}/{allTasks.length}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>tasks done</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ background: "var(--surface)", borderRadius: 99, height: 10, marginBottom: 24 }}>
            <div style={{ width: `${joiner.progress}%`, background: "var(--accent)", height: "100%", borderRadius: 99, transition: "width 0.6s" }} />
          </div>

          {joiner.tasks.map(section => (
            <div key={section.section} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>
                {section.section}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {section.items.map(item => (
                  <div key={item.label} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 8,
                    background: item.done ? "var(--green-light)" : "var(--surface)",
                    border: `1px solid ${item.done ? "#bbf7d0" : "var(--border)"}`,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: item.done ? "var(--green)" : "white",
                      border: `2px solid ${item.done ? "var(--green)" : "var(--border)"}`,
                      display: "grid", placeItems: "center", flexShrink: 0,
                      color: "white", fontSize: 11
                    }}>
                      {item.done ? "✓" : ""}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: item.done ? "var(--green)" : "var(--ink)", textDecoration: item.done ? "line-through" : "none" }}>
                      {item.label}
                    </span>
                    {!item.done && (
                      <button className="btn btn-outline" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }}>
                        Mark Done
                      </button>
                    )}
                    {item.done && (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--green)", fontWeight: 600 }}>✓ Done</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </HRMSLayout>
  );
}
