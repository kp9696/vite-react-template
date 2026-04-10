import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.analytics";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";

const attritionByDept = [
  { dept: "Engineering", rate: 8.2, headcount: 412 },
  { dept: "Sales", rate: 14.6, headcount: 278 },
  { dept: "Operations", rate: 6.1, headcount: 215 },
  { dept: "Design", rate: 5.4, headcount: 142 },
  { dept: "Marketing", rate: 11.2, headcount: 98 },
];

const hiringTrend = [
  { month: "Oct", hired: 18, left: 8 },
  { month: "Nov", hired: 22, left: 11 },
  { month: "Dec", hired: 10, left: 14 },
  { month: "Jan", hired: 28, left: 9 },
  { month: "Feb", hired: 31, left: 12 },
  { month: "Mar", hired: 24, left: 7 },
  { month: "Apr", hired: 12, left: 3 },
];

const maxHired = Math.max(...hiringTrend.map(h => h.hired));

export function meta() {
  return [{ title: "JWithKP HRMS - Analytics" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

export default function Analytics() {
  const { currentUser } = useLoaderData<typeof loader>();
  return (
    <HRMSLayout currentUser={currentUser}>
      <div className="page-title">Workforce Analytics</div>
      <div className="page-sub">Data-driven insights to guide people decisions.</div>

      <div className="stat-grid">
        {[
          { label: "Attrition Rate", value: "9.1%", sub: "↓ 1.4pts vs last year", good: true },
          { label: "Time to Hire", value: "23 days", sub: "↓ 3 days vs Q3", good: true },
          { label: "Offer Acceptance", value: "84%", sub: "↑ 6% vs last year", good: true },
          { label: "eNPS Score", value: "+42", sub: "Promoters 68% · Detractors 26%", good: true },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 24 }}>{s.value}</div>
            <div className="stat-delta delta-up" style={{ fontSize: 12 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* Hiring Trend Chart */}
        <div className="card">
          <div className="card-title">Hiring vs Attrition (6 months)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160, marginBottom: 8 }}>
            {hiringTrend.map((m) => (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", display: "flex", gap: 3, alignItems: "flex-end", height: 130 }}>
                  <div style={{ flex: 1, background: "var(--accent)", borderRadius: "4px 4px 0 0", height: `${(m.hired / maxHired) * 100}%`, minHeight: 4 }} title={`Hired: ${m.hired}`} />
                  <div style={{ flex: 1, background: "#fecaca", borderRadius: "4px 4px 0 0", height: `${(m.left / maxHired) * 100}%`, minHeight: 4 }} title={`Left: ${m.left}`} />
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{m.month}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <div style={{ width: 12, height: 12, background: "var(--accent)", borderRadius: 3 }} />
              Hired
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <div style={{ width: 12, height: 12, background: "#fecaca", borderRadius: 3 }} />
              Attrition
            </div>
          </div>
        </div>

        {/* Attrition by Dept */}
        <div className="card">
          <div className="card-title">Attrition by Department</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {attritionByDept.sort((a, b) => b.rate - a.rate).map((d) => (
              <div key={d.dept}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{d.dept}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: d.rate > 12 ? "var(--red)" : d.rate > 8 ? "var(--amber)" : "var(--green)" }}>
                    {d.rate}%
                  </span>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 99, height: 8 }}>
                  <div style={{
                    width: `${(d.rate / 20) * 100}%`,
                    background: d.rate > 12 ? "var(--red)" : d.rate > 8 ? "var(--amber)" : "var(--green)",
                    height: "100%", borderRadius: 99
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{d.headcount} employees</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diversity */}
      <div className="card">
        <div className="card-title">Diversity & Inclusion Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {[
            { label: "Women in Leadership", value: "38%", target: "50%", pct: 38 },
            { label: "New Hires — Women", value: "44%", target: "50%", pct: 44 },
            { label: "Differently Abled", value: "2.1%", target: "3%", pct: 70 },
            { label: "Inclusive Hiring Score", value: "82/100", target: "90", pct: 82 },
          ].map((d) => (
            <div key={d.label} style={{ textAlign: "center" }}>
              <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 12px" }}>
                <svg viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)", width: 80, height: 80 }}>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface)" strokeWidth="8" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--accent)" strokeWidth="8"
                    strokeDasharray={`${(d.pct / 100) * 201} 201`} strokeLinecap="round" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800 }}>{d.value}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{d.label}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Target: {d.target}</div>
            </div>
          ))}
        </div>
      </div>
    </HRMSLayout>
  );
}
