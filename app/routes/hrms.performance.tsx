import HRMSLayout from "../components/HRMSLayout";

const reviews = [
  { name: "Deepa Krishnan", role: "Eng Manager", cycle: "Q1 2026", self: 88, manager: 91, peer: 85, overall: 88, status: "Completed" },
  { name: "Aarav Shah", role: "Sr Engineer", cycle: "Q1 2026", self: 80, manager: 84, peer: 82, overall: 82, status: "Completed" },
  { name: "Priya Nair", role: "Designer", cycle: "Q1 2026", self: 75, manager: 78, peer: 80, overall: 78, status: "In Review" },
  { name: "Rohan Mehta", role: "Data Analyst", cycle: "Q1 2026", self: 70, manager: null, peer: 72, overall: null, status: "Pending" },
  { name: "Meera Iyer", role: "Mktg Lead", cycle: "Q1 2026", self: 85, manager: 87, peer: 84, overall: 85, status: "Completed" },
];

const okrs = [
  { objective: "Scale Engineering to 500 engineers", owner: "Deepa K.", progress: 72, krs: 4 },
  { objective: "Launch v3 Design System", owner: "Priya N.", progress: 55, krs: 3 },
  { objective: "Reduce Customer Churn by 15%", owner: "Meera I.", progress: 88, krs: 5 },
  { objective: "Hire 50 Sales Reps Q1", owner: "HR Team", progress: 34, krs: 3 },
];

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: "var(--ink-3)" }}>—</span>;
  const color = score >= 85 ? "var(--green)" : score >= 75 ? "var(--accent)" : "var(--amber)";
  return <span style={{ fontWeight: 800, color }}>{score}%</span>;
}

export function meta() {
  return [{ title: "PeopleOS · Performance" }];
}

export default function Performance() {
  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Performance</div>
          <div className="page-sub">360° reviews, OKRs, and growth insights.</div>
        </div>
        <button className="btn btn-primary">Start Review Cycle</button>
      </div>

      <div className="stat-grid">
        {[
          { label: "Review Cycle", value: "Q1 2026", sub: "Closes Apr 30" },
          { label: "Completed", value: "68%", sub: "of 1,284 employees" },
          { label: "Avg Score", value: "83%", sub: "↑ 4pts vs Q4 2025" },
          { label: "Top Performers", value: "142", sub: "≥90% overall score" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* 360 Reviews */}
        <div className="card">
          <div className="card-title">360° Review Scores</div>
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Self</th><th>Manager</th><th>Peer</th><th>Overall</th><th>Status</th></tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.name}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.role}</div>
                  </td>
                  <td><ScoreDot score={r.self} /></td>
                  <td><ScoreDot score={r.manager} /></td>
                  <td><ScoreDot score={r.peer} /></td>
                  <td><ScoreDot score={r.overall} /></td>
                  <td>
                    <span className={`badge ${r.status === "Completed" ? "badge-green" : r.status === "In Review" ? "badge-blue" : "badge-amber"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* OKRs */}
        <div className="card">
          <div className="card-title">Company OKRs — Q1 2026</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {okrs.map((o) => (
              <div key={o.objective} style={{ padding: 14, background: "var(--surface)", borderRadius: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{o.objective}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
                  Owner: {o.owner} · {o.krs} Key Results
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, background: "var(--border)", borderRadius: 99, height: 8 }}>
                    <div style={{
                      width: `${o.progress}%`,
                      background: o.progress >= 75 ? "var(--green)" : o.progress >= 50 ? "var(--accent)" : "var(--amber)",
                      height: "100%", borderRadius: 99
                    }} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, width: 40, textAlign: "right",
                    color: o.progress >= 75 ? "var(--green)" : o.progress >= 50 ? "var(--accent)" : "var(--amber)"
                  }}>{o.progress}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </HRMSLayout>
  );
}
