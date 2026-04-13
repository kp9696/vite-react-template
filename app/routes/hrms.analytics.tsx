import { useLoaderData } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/hrms.analytics";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";

const attritionByDept = [
  { dept: "Engineering", rate: 8.2,  headcount: 412 },
  { dept: "Sales",       rate: 14.6, headcount: 278 },
  { dept: "Operations",  rate: 6.1,  headcount: 215 },
  { dept: "Design",      rate: 5.4,  headcount: 142 },
  { dept: "Marketing",   rate: 11.2, headcount: 98  },
];

const hiringTrend = [
  { month: "Oct", hired: 18, left: 8  },
  { month: "Nov", hired: 22, left: 11 },
  { month: "Dec", hired: 10, left: 14 },
  { month: "Jan", hired: 28, left: 9  },
  { month: "Feb", hired: 31, left: 12 },
  { month: "Mar", hired: 24, left: 7  },
  { month: "Apr", hired: 12, left: 3  },
];

const salaryByDept = [
  { dept: "Engineering", avg: 2800000, min: 1800000, max: 4200000 },
  { dept: "Design",      avg: 2200000, min: 1600000, max: 3200000 },
  { dept: "Analytics",   avg: 1950000, min: 1500000, max: 2800000 },
  { dept: "Marketing",   avg: 2000000, min: 1400000, max: 2600000 },
  { dept: "Sales",       avg: 1500000, min: 1100000, max: 2200000 },
  { dept: "People Ops",  avg: 1700000, min: 1200000, max: 2400000 },
  { dept: "Finance",     avg: 1800000, min: 1400000, max: 2600000 },
];

const maxHired = Math.max(...hiringTrend.map((h) => h.hired));
const maxSalary = Math.max(...salaryByDept.map((d) => d.max));
const fmt = (n: number) => "₹" + (n / 100000).toFixed(1) + "L";

export function meta() {
  return [{ title: "JWithKP HRMS - Analytics" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

export default function Analytics() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [hoveredSalary, setHoveredSalary] = useState<string | null>(null);

  return (
    <HRMSLayout currentUser={currentUser}>
      <div className="page-title">Workforce Analytics</div>
      <div className="page-sub">Data-driven insights to guide people decisions.</div>

      {/* KPI cards */}
      <div className="stat-grid">
        {[
          { label: "Attrition Rate",    value: "9.1%",   sub: "↓ 1.4pts vs last year", good: true,  color: "var(--green)"  },
          { label: "Time to Hire",      value: "23 days", sub: "↓ 3 days vs Q3",        good: true,  color: "var(--accent)" },
          { label: "Offer Acceptance",  value: "84%",     sub: "↑ 6% vs last year",     good: true,  color: "var(--blue, #3b82f6)" },
          { label: "eNPS Score",        value: "+42",     sub: "Promoters 68%",          good: true,  color: "var(--amber)"  },
        ].map((s) => (
          <div className="stat-card" key={s.label} style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 26, color: s.color }}>{s.value}</div>
            <div className="stat-delta delta-up" style={{ fontSize: 12 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* Hiring Trend Chart */}
        <div className="card">
          <div className="card-title">Hiring vs Attrition (7 months)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, marginBottom: 8 }}>
            {hiringTrend.map((m) => {
              const key = m.month;
              const isHov = hoveredBar === key;
              return (
                <div
                  key={key}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
                  onMouseEnter={() => setHoveredBar(key)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {/* Tooltip */}
                  {isHov ? (
                    <div style={{
                      position: "absolute", background: "var(--ink)", color: "white",
                      fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 7,
                      pointerEvents: "none", whiteSpace: "nowrap", marginBottom: 4,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                    }}>
                      +{m.hired} hired · -{m.left} left
                    </div>
                  ) : null}
                  <div style={{ width: "100%", display: "flex", gap: 3, alignItems: "flex-end", height: 140 }}>
                    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      {isHov ? (
                        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>{m.hired}</div>
                      ) : null}
                      <div style={{
                        background: isHov ? "#4338ca" : "var(--accent)",
                        borderRadius: "4px 4px 0 0",
                        height: `${(m.hired / maxHired) * 120}px`,
                        minHeight: 4,
                        transition: "background 0.12s, height 0.3s",
                      }} />
                    </div>
                    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      {isHov ? (
                        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 2 }}>{m.left}</div>
                      ) : null}
                      <div style={{
                        background: isHov ? "#dc2626" : "#fca5a5",
                        borderRadius: "4px 4px 0 0",
                        height: `${(m.left / maxHired) * 120}px`,
                        minHeight: 4,
                        transition: "background 0.12s, height 0.3s",
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: hoveredBar === key ? 700 : 500 }}>{m.month}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <div style={{ width: 12, height: 12, background: "var(--accent)", borderRadius: 3 }} /> Hired
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <div style={{ width: 12, height: 12, background: "#fca5a5", borderRadius: 3 }} /> Attrition
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)" }}>
              Net: +{hiringTrend.reduce((a, m) => a + m.hired - m.left, 0)} headcount
            </div>
          </div>
        </div>

        {/* Attrition by Dept */}
        <div className="card">
          <div className="card-title">Attrition by Department</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {attritionByDept.sort((a, b) => b.rate - a.rate).map((d) => (
              <div key={d.dept}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{d.dept}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>{d.headcount} employees</span>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 800,
                    color: d.rate > 12 ? "var(--red)" : d.rate > 8 ? "var(--amber)" : "var(--green)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    {d.rate > 12 ? "⚠ " : ""}{d.rate}%
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: `${(d.rate / 20) * 100}%`,
                    background: d.rate > 12 ? "var(--red)" : d.rate > 8 ? "var(--amber)" : "var(--green)",
                  }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12, fontSize: 12 }}>
            {[["var(--green)", "< 8% — Good"], ["var(--amber)", "8–12% — Watch"], ["var(--red)", "> 12% — Critical"]].map(([color, label]) => (
              <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color as string, display: "inline-block" }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Salary Distribution by Dept */}
      <div className="card">
        <div className="card-title">Salary Distribution by Department</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {salaryByDept.sort((a, b) => b.avg - a.avg).map((d, i) => {
            const isHov = hoveredSalary === d.dept;
            const COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
            const color = COLORS[i % COLORS.length];
            const minPct = (d.min / maxSalary) * 100;
            const maxPct = (d.max / maxSalary) * 100;
            const avgPct = (d.avg / maxSalary) * 100;

            return (
              <div
                key={d.dept}
                style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                onMouseEnter={() => setHoveredSalary(d.dept)}
                onMouseLeave={() => setHoveredSalary(null)}
              >
                <div style={{ width: 100, fontSize: 13, fontWeight: isHov ? 700 : 500, color: isHov ? "var(--ink)" : "var(--ink-2)", transition: "all 0.12s" }}>{d.dept}</div>

                {/* Range bar */}
                <div style={{ flex: 1, position: "relative", height: 20 }}>
                  {/* Track */}
                  <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 6, background: "var(--surface)", borderRadius: 99, transform: "translateY(-50%)" }} />
                  {/* Range band */}
                  <div style={{
                    position: "absolute", top: "50%", height: 6, borderRadius: 99,
                    left: `${minPct}%`, width: `${maxPct - minPct}%`,
                    background: `${color}44`, transform: "translateY(-50%)",
                  }} />
                  {/* Avg dot */}
                  <div style={{
                    position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
                    left: `${avgPct}%`, width: isHov ? 14 : 12, height: isHov ? 14 : 12,
                    borderRadius: "50%", background: color, border: "2px solid white",
                    boxShadow: isHov ? `0 0 0 3px ${color}44` : "none",
                    transition: "all 0.15s",
                  }} />
                </div>

                {isHov ? (
                  <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", width: 220 }}>
                    <span style={{ color: "var(--ink-3)" }}>Min </span><strong style={{ color: "var(--ink)" }}>{fmt(d.min)}</strong>
                    <span style={{ margin: "0 6px", color: "var(--border)" }}>·</span>
                    <span style={{ color, fontWeight: 800 }}>Avg {fmt(d.avg)}</span>
                    <span style={{ margin: "0 6px", color: "var(--border)" }}>·</span>
                    <span style={{ color: "var(--ink-3)" }}>Max </span><strong style={{ color: "var(--ink)" }}>{fmt(d.max)}</strong>
                  </div>
                ) : (
                  <div style={{ width: 220, fontSize: 13, fontWeight: 700, color, textAlign: "right" }}>
                    Avg {fmt(d.avg)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)" }}>
          Dot = average CTC · Band = min–max range · Hover for details
        </div>
      </div>

      {/* Diversity & Inclusion */}
      <div className="card">
        <div className="card-title">Diversity & Inclusion Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {[
            { label: "Women in Leadership", value: "38%", target: "50%", pct: 38, color: "#ec4899" },
            { label: "New Hires — Women",   value: "44%", target: "50%", pct: 44, color: "#8b5cf6" },
            { label: "Differently Abled",   value: "2.1%",target: "3%",  pct: 70, color: "#0ea5e9" },
            { label: "Inclusive Hiring",    value: "82/100",target: "90",pct: 82, color: "#10b981" },
          ].map((d) => (
            <div key={d.label} style={{ textAlign: "center" }}>
              <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 12px" }}>
                <svg viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)", width: 80, height: 80 }}>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface)" strokeWidth="8" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke={d.color} strokeWidth="8"
                    strokeDasharray={`${(d.pct / 100) * 201} 201`} strokeLinecap="round" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, color: d.color }}>{d.value}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{d.label}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>Target: {d.target}</div>
              <div style={{ marginTop: 6, display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${d.color}18`, color: d.color }}>
                {d.pct >= 80 ? "On Track" : d.pct >= 60 ? "Progressing" : "Needs Focus"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </HRMSLayout>
  );
}
