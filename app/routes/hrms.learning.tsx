import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.learning";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";

const courses = [
  { title: "Leadership Fundamentals", category: "Management", duration: "4h 30m", enrolled: 284, completion: 67, level: "Intermediate" },
  { title: "Data Privacy & GDPR", category: "Compliance", duration: "1h 15m", enrolled: 1102, completion: 89, level: "All" },
  { title: "Advanced TypeScript", category: "Technical", duration: "6h", enrolled: 145, completion: 42, level: "Advanced" },
  { title: "Effective Communication", category: "Soft Skills", duration: "2h 45m", enrolled: 560, completion: 78, level: "Beginner" },
  { title: "DEI in the Workplace", category: "Culture", duration: "1h 30m", enrolled: 980, completion: 91, level: "All" },
  { title: "Project Management with Agile", category: "Management", duration: "5h", enrolled: 320, completion: 55, level: "Intermediate" },
];

const catColors: Record<string, string> = {
  Management: "#6366f1",
  Compliance: "#ef4444",
  Technical: "#8b5cf6",
  "Soft Skills": "#10b981",
  Culture: "#f59e0b",
};

const categories = ["Management", "Compliance", "Technical", "Soft Skills", "Culture"];

export function meta() {
  return [{ title: "JWithKP HRMS - Learning" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

export default function Learning() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "var(--accent)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", maxWidth: 320 }}>
          {toast}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Learning & Development</div>
          <div className="page-sub">Upskill your workforce with curated courses and certifications.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Course</button>
      </div>

      {showForm ? (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Add New Course</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Course Title</label>
              <input placeholder="e.g. Advanced Data Analysis" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={fieldStyle}>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Level</label>
              <select style={fieldStyle}>
                <option>All</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Duration</label>
              <input placeholder="e.g. 2h 30m" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Provider / Instructor</label>
              <input placeholder="e.g. Internal - Sneha Pillai" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Description</label>
              <textarea placeholder="Brief course description..." style={{ ...fieldStyle, height: 72, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => { setShowForm(false); setToast("Course added successfully."); }}>Add Course</button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        {[
          { label: "Total Courses", value: "48", sub: "Across 6 categories" },
          { label: "Enrollments", value: "3,391", sub: "This quarter" },
          { label: "Avg Completion", value: "70%", sub: "up 8% vs last quarter" },
          { label: "Certifications", value: "624", sub: "Issued this year" },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="three-col">
        {courses.map((course) => (
          <div
            key={course.title}
            className="card"
            style={{ margin: 0, transition: "transform 0.15s, box-shadow 0.15s" }}
            onMouseEnter={(event) => {
              (event.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              (event.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(event) => {
              (event.currentTarget as HTMLElement).style.transform = "";
              (event.currentTarget as HTMLElement).style.boxShadow = "";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="badge" style={{ background: `${catColors[course.category]}18`, color: catColors[course.category] }}>{course.category}</span>
              <span style={{ fontSize: 11, color: "var(--ink-3)", background: "var(--surface)", padding: "3px 8px", borderRadius: 20 }}>{course.level}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 6 }}>{course.title}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>Duration {course.duration} - {course.enrolled} enrolled</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Completion</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: catColors[course.category] }}>{course.completion}%</span>
              </div>
              <div style={{ background: "var(--surface)", borderRadius: 99, height: 6 }}>
                <div style={{ width: `${course.completion}%`, background: catColors[course.category], height: "100%", borderRadius: 99 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: "6px 10px" }}
                onClick={() => setToast(`Team enrolled in "${course.title}".`)}>
                Enroll Team
              </button>
              <button className="btn btn-outline" style={{ fontSize: 12, padding: "6px 10px" }}
                onClick={() => setToast(`Viewing details for "${course.title}".`)}>
                Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </HRMSLayout>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };
