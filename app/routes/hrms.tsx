import HRMSLayout from "../components/HRMSLayout";
import { Link } from "react-router";

const stats = [
  { label: "Total Employees", value: "1,284", delta: "+12 this month", up: true },
  { label: "Open Positions", value: "38", delta: "6 urgent", up: false },
  { label: "On Leave Today", value: "47", delta: "3.6% of workforce", up: true },
  { label: "Avg. Tenure", value: "3.2y", delta: "+0.4 vs last yr", up: true },
];

const recentHires = [
  { name: "Aarav Shah", role: "Senior Engineer", dept: "Engineering", date: "Apr 2", status: "Active" },
  { name: "Priya Nair", role: "Product Designer", dept: "Design", date: "Apr 1", status: "Active" },
  { name: "Rohan Mehta", role: "Data Analyst", dept: "Analytics", date: "Mar 28", status: "Onboarding" },
  { name: "Sneha Pillai", role: "HR Generalist", dept: "People Ops", date: "Mar 25", status: "Active" },
  { name: "Arjun Gupta", role: "Sales Executive", dept: "Sales", date: "Mar 22", status: "Active" },
];

const pendingApprovals = [
  { name: "Deepa Krishnan", type: "Leave Request", detail: "3 days · Apr 10–12", priority: "Normal" },
  { name: "Vikram Joshi", type: "Expense Claim", detail: "₹18,400 · Travel", priority: "High" },
  { name: "Meera Iyer", type: "WFH Request", detail: "Apr 8–9", priority: "Normal" },
  { name: "Sanjay Rao", type: "Overtime Approval", detail: "12 hrs · Mar Week 4", priority: "High" },
];

const deptData = [
  { dept: "Engineering", count: 412, pct: 32 },
  { dept: "Sales", count: 278, pct: 22 },
  { dept: "Operations", count: 215, pct: 17 },
  { dept: "Design", count: 142, pct: 11 },
  { dept: "HR & Finance", count: 237, pct: 18 },
];

const colors = ["#4f46e5","#10b981","#f59e0b","#ef4444","#8b5cf6"];

export function meta() {
  return [{ title: "PeopleOS · Dashboard" }];
}

export default function HRMSDashboard() {
  return (
    <HRMSLayout>
      <div className="page-title">Good morning, Kiran 👋</div>
      <div className="page-sub">Here's what's happening across your workforce today.</div>

      {/* Stats */}
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className={`stat-delta ${s.up ? "delta-up" : "delta-down"}`}>
              {s.up ? "↑" : "↓"} {s.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* Recent Hires */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Recent Hires</div>
            <Link to="/hrms/employees" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
          </div>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Joined</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recentHires.map((e) => (
                <tr key={e.name}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{e.dept}</div>
                  </td>
                  <td>{e.role}</td>
                  <td>{e.date}</td>
                  <td><span className={`badge ${e.status === "Active" ? "badge-green" : "badge-amber"}`}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending Approvals */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Pending Approvals</div>
            <span className="badge badge-red">{pendingApprovals.length} pending</span>
          </div>
          {pendingApprovals.map((a) => (
            <div key={a.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{a.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{a.type} · {a.detail}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}>Approve</button>
                <button className="btn btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dept Distribution */}
      <div className="card">
        <div className="card-title">Workforce by Department</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {deptData.map((d, i) => (
            <div key={d.dept} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 120, fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{d.dept}</div>
              <div style={{ flex: 1, background: "var(--surface)", borderRadius: 99, height: 10, overflow: "hidden" }}>
                <div style={{ width: `${d.pct}%`, background: colors[i], height: "100%", borderRadius: 99, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ width: 60, fontSize: 13, fontWeight: 700, color: "var(--ink)", textAlign: "right" }}>{d.count}</div>
              <div style={{ width: 36, fontSize: 12, color: "var(--ink-3)" }}>{d.pct}%</div>
            </div>
          ))}
        </div>
      </div>
    </HRMSLayout>
  );
}
