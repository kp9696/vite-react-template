import HRMSLayout from "../components/HRMSLayout";

const courses = [
  { title: "Leadership Fundamentals", category: "Management", duration: "4h 30m", enrolled: 284, completion: 67, level: "Intermediate" },
  { title: "Data Privacy & GDPR", category: "Compliance", duration: "1h 15m", enrolled: 1102, completion: 89, level: "All" },
  { title: "Advanced TypeScript", category: "Technical", duration: "6h", enrolled: 145, completion: 42, level: "Advanced" },
  { title: "Effective Communication", category: "Soft Skills", duration: "2h 45m", enrolled: 560, completion: 78, level: "Beginner" },
  { title: "DEI in the Workplace", category: "Culture", duration: "1h 30m", enrolled: 980, completion: 91, level: "All" },
  { title: "Project Management with Agile", category: "Management", duration: "5h", enrolled: 320, completion: 55, level: "Intermediate" },
];

const catColors: Record<string, string> = {
  "Management": "#4f46e5",
  "Compliance": "#ef4444",
  "Technical": "#8b5cf6",
  "Soft Skills": "#10b981",
  "Culture": "#f59e0b",
};

export function meta() {
  return [{ title: "PeopleOS · Learning" }];
}

export default function Learning() {
  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Learning & Development</div>
          <div className="page-sub">Upskill your workforce with curated courses and certifications.</div>
        </div>
        <button className="btn btn-primary">+ Add Course</button>
      </div>

      <div className="stat-grid">
        {[
          { label: "Total Courses", value: "48", sub: "Across 6 categories" },
          { label: "Enrollments", value: "3,391", sub: "This quarter" },
          { label: "Avg Completion", value: "70%", sub: "↑ 8% vs last quarter" },
          { label: "Certifications", value: "624", sub: "Issued this year" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="three-col">
        {courses.map((c) => (
          <div className="card" key={c.title} style={{ margin: 0, cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="badge" style={{ background: `${catColors[c.category]}18`, color: catColors[c.category] }}>{c.category}</span>
              <span style={{ fontSize: 11, color: "var(--ink-3)", background: "var(--surface)", padding: "3px 8px", borderRadius: 20 }}>{c.level}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 6 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>⏱ {c.duration} · {c.enrolled} enrolled</div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Completion</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: catColors[c.category] }}>{c.completion}%</span>
              </div>
              <div style={{ background: "var(--surface)", borderRadius: 99, height: 6 }}>
                <div style={{ width: `${c.completion}%`, background: catColors[c.category], height: "100%", borderRadius: 99 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </HRMSLayout>
  );
}
