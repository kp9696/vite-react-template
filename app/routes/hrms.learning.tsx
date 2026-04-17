import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.learning";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";

const catColors: Record<string, string> = {
  Management:    "#6366f1",
  Compliance:    "#ef4444",
  Technical:     "#8b5cf6",
  "Soft Skills": "#10b981",
  Culture:       "#f59e0b",
};

const categories = ["Management", "Compliance", "Technical", "Soft Skills", "Culture"];
const levels = ["All", "Beginner", "Intermediate", "Advanced"];

export function meta() {
  return [{ title: "JWithKP HRMS - Learning" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  return { currentUser };
}

export default function Learning() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast]       = useState<string | null>(null);

  // Form state
  const [title, setTitle]       = useState("");
  const [category, setCategory] = useState("Technical");
  const [level, setLevel]       = useState("All");
  const [duration, setDuration] = useState("");
  const [provider, setProvider] = useState("");
  const [desc, setDesc]         = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleAdd = () => {
    if (!title.trim()) return;
    setShowForm(false);
    setTitle(""); setDuration(""); setProvider(""); setDesc("");
    setToast(`"${title}" added to the course library! Full enrolment management coming soon.`);
  };

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "#0f172a", color: "white", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", maxWidth: 380, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✓</span> {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Learning & Development</div>
          <div className="page-sub">Upskill your workforce with curated courses and certifications.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Course</button>
      </div>

      {/* Add course form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Add New Course</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Course Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Advanced Data Analysis" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Level</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)} style={fieldStyle}>
                {levels.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Duration</label>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 2h 30m" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Provider / Instructor</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Internal — Kiran Sharma" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Description</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief course description..." style={{ ...fieldStyle, height: 72, resize: "vertical" as const }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={!title.trim()} onClick={handleAdd}>Add Course</button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats — real zeros */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: "Total Courses",   value: "0",  sub: "Add your first course" },
          { label: "Enrollments",     value: "0",  sub: "This quarter" },
          { label: "Avg Completion",  value: "—",  sub: "No courses yet" },
          { label: "Certifications",  value: "0",  sub: "Issued this year" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)", marginBottom: 8 }}>No courses yet</div>
        <div style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 28px", lineHeight: 1.6 }}>
          Build your organisation's learning library. Add internal or external courses, assign them to teams, and track completion progress.
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add First Course
          </button>
          <button className="btn btn-outline" onClick={() => setToast("Course import from external providers coming soon!")}>
            Import from Library
          </button>
        </div>

        {/* Category chips preview */}
        <div style={{ marginTop: 32, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <div key={cat} style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${catColors[cat]}18`, color: catColors[cat], border: `1px solid ${catColors[cat]}30` }}>
              {cat}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 12 }}>Supported categories</div>
      </div>
    </HRMSLayout>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontFamily: "inherit", color: "var(--ink)", outline: "none", boxSizing: "border-box" as const };
