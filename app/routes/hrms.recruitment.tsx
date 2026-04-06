import HRMSLayout from "../components/HRMSLayout";

const pipeline = [
  {
    stage: "Applied", color: "#7b8099", count: 84,
    candidates: [
      { name: "Riya Desai", role: "Frontend Engineer", exp: "4 yrs", score: 78 },
      { name: "Karan Malhotra", role: "Frontend Engineer", exp: "3 yrs", score: 72 },
    ]
  },
  {
    stage: "Screening", color: "#4f46e5", count: 31,
    candidates: [
      { name: "Ananya Bose", role: "Product Manager", exp: "6 yrs", score: 85 },
      { name: "Farhan Ali", role: "Backend Engineer", exp: "5 yrs", score: 80 },
    ]
  },
  {
    stage: "Interview", color: "#f59e0b", count: 18,
    candidates: [
      { name: "Tanvi Kulkarni", role: "Data Scientist", exp: "4 yrs", score: 91 },
      { name: "Nikhil Sinha", role: "DevOps Engineer", exp: "7 yrs", score: 88 },
    ]
  },
  {
    stage: "Offer", color: "#10b981", count: 6,
    candidates: [
      { name: "Ishaan Verma", role: "ML Engineer", exp: "5 yrs", score: 94 },
      { name: "Pooja Hegde", role: "UX Researcher", exp: "4 yrs", score: 90 },
    ]
  },
];

const openRoles = [
  { title: "Senior Frontend Engineer", dept: "Engineering", loc: "Bengaluru", applied: 28, urgent: true },
  { title: "Product Manager", dept: "Product", loc: "Remote", applied: 45, urgent: false },
  { title: "Data Scientist", dept: "Analytics", loc: "Hyderabad", applied: 19, urgent: true },
  { title: "DevOps Engineer", dept: "Engineering", loc: "Bengaluru", applied: 12, urgent: false },
  { title: "UX Researcher", dept: "Design", loc: "Mumbai", applied: 8, urgent: false },
];

export function meta() {
  return [{ title: "PeopleOS · Recruitment" }];
}

export default function Recruitment() {
  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Recruitment</div>
          <div className="page-sub">Track candidates across your hiring pipeline.</div>
        </div>
        <button className="btn btn-primary">+ Post New Role</button>
      </div>

      {/* Pipeline Kanban */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {pipeline.map((col) => (
          <div key={col.stage}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
              <div style={{ fontWeight: 700, fontSize: 13 }}>{col.stage}</div>
              <div style={{ marginLeft: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>{col.count}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {col.candidates.map((c) => (
                <div key={c.name} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 14, cursor: "pointer", borderTop: `3px solid ${col.color}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 10 }}>{c.role} · {c.exp}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>AI Score</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: c.score >= 90 ? "var(--green)" : c.score >= 80 ? "var(--accent)" : "var(--amber)" }}>{c.score}%</div>
                  </div>
                  <div style={{ marginTop: 6, background: "var(--surface)", borderRadius: 99, height: 4 }}>
                    <div style={{ width: `${c.score}%`, background: col.color, height: "100%", borderRadius: 99 }} />
                  </div>
                </div>
              ))}
              <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: "14px", textAlign: "center", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" }}>
                + {col.count - col.candidates.length} more
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Open Roles */}
      <div className="card">
        <div className="card-title">Open Positions</div>
        <table className="table">
          <thead>
            <tr><th>Role</th><th>Department</th><th>Location</th><th>Applicants</th><th>Priority</th><th></th></tr>
          </thead>
          <tbody>
            {openRoles.map((r) => (
              <tr key={r.title}>
                <td style={{ fontWeight: 600, color: "var(--ink)" }}>{r.title}</td>
                <td>{r.dept}</td>
                <td>{r.loc}</td>
                <td><span style={{ fontWeight: 700 }}>{r.applied}</span> applied</td>
                <td>
                  <span className={`badge ${r.urgent ? "badge-red" : "badge-green"}`}>
                    {r.urgent ? "Urgent" : "Normal"}
                  </span>
                </td>
                <td>
                  <button className="btn btn-outline" style={{ padding: "4px 12px", fontSize: 12 }}>View Pipeline</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HRMSLayout>
  );
}
