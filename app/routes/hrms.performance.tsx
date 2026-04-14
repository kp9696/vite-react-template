import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.performance";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";

const reviews = [
  { name: "Deepa Krishnan", role: "Eng Manager", cycle: "Q1 2026", self: 88, manager: 91, peer: 85, overall: 88, status: "Completed" },
  { name: "Aarav Shah", role: "Sr Engineer", cycle: "Q1 2026", self: 80, manager: 84, peer: 82, overall: 82, status: "Completed" },
  { name: "Priya Nair", role: "Designer", cycle: "Q1 2026", self: 75, manager: 78, peer: 80, overall: 78, status: "In Review" },
  { name: "Rohan Mehta", role: "Data Analyst", cycle: "Q1 2026", self: 70, manager: null, peer: 72, overall: null, status: "Pending" },
  { name: "Meera Iyer", role: "Mktg Lead", cycle: "Q1 2026", self: 85, manager: 87, peer: 84, overall: 85, status: "Completed" },
  { name: "Vikram Joshi", role: "Backend Eng", cycle: "Q1 2026", self: 78, manager: 80, peer: 76, overall: 78, status: "In Review" },
];

const okrs = [
  { objective: "Scale Engineering to 500 engineers", owner: "Deepa K.", progress: 72, krs: 4 },
  { objective: "Launch v3 Design System", owner: "Priya N.", progress: 55, krs: 3 },
  { objective: "Reduce Customer Churn by 15%", owner: "Meera I.", progress: 88, krs: 5 },
  { objective: "Hire 50 Sales Reps Q1", owner: "HR Team", progress: 34, krs: 3 },
];

const cycles = ["Q2 2026", "H1 2026", "Annual 2026", "Custom"];

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: "var(--ink-3)" }}>-</span>;
  const color = score >= 85 ? "var(--green)" : score >= 75 ? "var(--accent)" : "var(--amber)";
  return <span style={{ fontWeight: 800, color }}>{score}%</span>;
}

export function meta() {
  return [{ title: "JWithKP HRMS - Performance" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  return { currentUser };
}

export default function Performance() {
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
          <div className="page-title">Performance</div>
          <div className="page-sub">360-degree reviews, OKRs, and growth insights.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>Start Review Cycle</button>
      </div>

      {showForm ? (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Configure Review Cycle</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Cycle Name</label>
              <select style={fieldStyle}>
                {cycles.map((cycle) => <option key={cycle}>{cycle}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Review Type</label>
              <select style={fieldStyle}>
                <option>360-degree (Self + Manager + Peer)</option>
                <option>Manager Only</option>
                <option>Self Assessment Only</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" defaultValue="2026-04-15" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input type="date" defaultValue="2026-04-30" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Include Employees</label>
              <select style={fieldStyle}>
                <option>All employees (10)</option>
                <option>Engineering only</option>
                <option>Select manually</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => { setShowForm(false); setToast("Review cycle configured successfully."); }}>
              Launch Cycle
            </button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        {[
          { label: "Review Cycle", value: "Q1 2026", sub: "Closes Apr 30" },
          { label: "Completed", value: "68%", sub: "of 1,284 employees" },
          { label: "Avg Score", value: "83%", sub: "up 4 pts vs Q4 2025" },
          { label: "Top Performers", value: "142", sub: "90%+ overall score" },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-title">360-degree Review Scores</div>
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Self</th><th>Manager</th><th>Peer</th><th>Overall</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.name}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{review.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{review.role}</div>
                  </td>
                  <td><ScoreDot score={review.self} /></td>
                  <td><ScoreDot score={review.manager} /></td>
                  <td><ScoreDot score={review.peer} /></td>
                  <td><ScoreDot score={review.overall} /></td>
                  <td>
                    <span className={`badge ${review.status === "Completed" ? "badge-green" : review.status === "In Review" ? "badge-blue" : "badge-amber"}`}>
                      {review.status}
                    </span>
                  </td>
                  <td>
                    {review.status === "Pending" ? (
                      <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => setToast(`Reminder sent to ${review.name}.`)}>
                        Remind
                      </button>
                    ) : (
                      <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => setToast(`Viewing review for ${review.name}.`)}>
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Company OKRs - Q1 2026</div>
            <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => setToast("OKR creation coming soon.")}>
              + Add OKR
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {okrs.map((okr) => (
              <div key={okr.objective} style={{ padding: 14, background: "var(--surface)", borderRadius: 10, cursor: "pointer" }}
                onClick={() => setToast(`Editing OKR: "${okr.objective}"`)}>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{okr.objective}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
                  Owner: {okr.owner} - {okr.krs} Key Results
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, background: "var(--border)", borderRadius: 99, height: 8 }}>
                    <div style={{
                      width: `${okr.progress}%`,
                      background: okr.progress >= 75 ? "var(--green)" : okr.progress >= 50 ? "var(--accent)" : "var(--amber)",
                      height: "100%",
                      borderRadius: 99,
                    }} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, width: 40, textAlign: "right",
                    color: okr.progress >= 75 ? "var(--green)" : okr.progress >= 50 ? "var(--accent)" : "var(--amber)" }}>
                    {okr.progress}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </HRMSLayout>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };

