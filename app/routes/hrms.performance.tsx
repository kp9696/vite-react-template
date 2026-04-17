import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.performance";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";

const cycles = ["Q2 2026", "H1 2026", "Annual 2026", "Custom"];

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
  const [showOkrForm, setShowOkrForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cycleName, setCycleName] = useState("Q2 2026");
  const [reviewType, setReviewType] = useState("360-degree (Self + Manager + Peer)");
  const [okrObjective, setOkrObjective] = useState("");
  const [okrOwner, setOkrOwner] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "#0f172a", color: "white", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", maxWidth: 360, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✓</span> {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Performance</div>
          <div className="page-sub">360-degree reviews, OKRs, and growth insights.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Start Review Cycle</button>
      </div>

      {/* Start Review Cycle form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Configure Review Cycle</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Cycle Name</label>
              <select value={cycleName} onChange={(e) => setCycleName(e.target.value)} style={fieldStyle}>
                {cycles.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Review Type</label>
              <select value={reviewType} onChange={(e) => setReviewType(e.target.value)} style={fieldStyle}>
                <option>360-degree (Self + Manager + Peer)</option>
                <option>Manager Only</option>
                <option>Self Assessment Only</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input type="date" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Include Employees</label>
              <select style={fieldStyle}>
                <option>All employees</option>
                <option>Select manually</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={() => { setShowForm(false); setToast(`Review cycle "${cycleName}" launched! Employees will be notified.`); }}>
              Launch Cycle
            </button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats — real zeros until data exists */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: "Active Cycle",    value: "—",   sub: "No active review cycle" },
          { label: "Completed",       value: "0",   sub: "of 0 reviews done" },
          { label: "Avg Score",       value: "—",   sub: "No scores yet" },
          { label: "Top Performers",  value: "0",   sub: "90%+ overall score" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* 360-degree Reviews */}
        <div className="card">
          <div className="card-title">360-degree Review Scores</div>
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 8 }}>No review cycles yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20, maxWidth: 260, margin: "0 auto 20px" }}>
              Start your first performance review cycle to see 360-degree scores here.
            </div>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowForm(true)}>
              + Start Review Cycle
            </button>
          </div>
        </div>

        {/* OKRs */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Company OKRs</div>
            <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setShowOkrForm(true)}>
              + Add OKR
            </button>
          </div>

          {showOkrForm && (
            <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1.5px solid var(--border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Objective</label>
                  <input value={okrObjective} onChange={(e) => setOkrObjective(e.target.value)} placeholder="e.g. Scale engineering team to 50 people" style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Owner</label>
                  <input value={okrOwner} onChange={(e) => setOkrOwner(e.target.value)} placeholder="e.g. Mratunjay Kumar" style={fieldStyle} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => {
                  if (!okrObjective.trim()) return;
                  setShowOkrForm(false);
                  setOkrObjective("");
                  setOkrOwner("");
                  setToast("OKR added! Key results can be added once this feature is live.");
                }}>Add OKR</button>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowOkrForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 8 }}>No OKRs defined</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 240, margin: "0 auto 16px" }}>
              Set company-wide objectives and key results to align your team.
            </div>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowOkrForm(true)}>
              + Add First OKR
            </button>
          </div>
        </div>
      </div>
    </HRMSLayout>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontFamily: "inherit", color: "var(--ink)", outline: "none", boxSizing: "border-box" as const };
