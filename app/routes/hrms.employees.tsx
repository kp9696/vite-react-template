import HRMSLayout from "../components/HRMSLayout";
import { useState } from "react";

const employees = [
  { id: "EMP001", name: "Aarav Shah", role: "Senior Engineer", dept: "Engineering", location: "Bengaluru", status: "Active", joined: "Apr 2025", salary: "₹28L" },
  { id: "EMP002", name: "Priya Nair", role: "Product Designer", dept: "Design", location: "Mumbai", status: "Active", joined: "Mar 2025", salary: "₹22L" },
  { id: "EMP003", name: "Rohan Mehta", role: "Data Analyst", dept: "Analytics", location: "Pune", status: "Onboarding", joined: "Mar 2025", salary: "₹18L" },
  { id: "EMP004", name: "Sneha Pillai", role: "HR Generalist", dept: "People Ops", location: "Bengaluru", status: "Active", joined: "Feb 2025", salary: "₹16L" },
  { id: "EMP005", name: "Arjun Gupta", role: "Sales Executive", dept: "Sales", location: "Delhi", status: "Active", joined: "Feb 2025", salary: "₹14L" },
  { id: "EMP006", name: "Deepa Krishnan", role: "Engineering Manager", dept: "Engineering", location: "Bengaluru", status: "Active", joined: "Jan 2025", salary: "₹42L" },
  { id: "EMP007", name: "Vikram Joshi", role: "DevOps Engineer", dept: "Engineering", location: "Hyderabad", status: "Active", joined: "Jan 2025", salary: "₹26L" },
  { id: "EMP008", name: "Meera Iyer", role: "Marketing Lead", dept: "Marketing", location: "Chennai", status: "On Leave", joined: "Dec 2024", salary: "₹20L" },
  { id: "EMP009", name: "Sanjay Rao", role: "Finance Analyst", dept: "Finance", location: "Mumbai", status: "Active", joined: "Nov 2024", salary: "₹17L" },
  { id: "EMP010", name: "Kavya Sharma", role: "QA Engineer", dept: "Engineering", location: "Bengaluru", status: "Active", joined: "Oct 2024", salary: "₹19L" },
];

const depts = ["All", "Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance"];
const statuses = ["All", "Active", "Onboarding", "On Leave"];

export function meta() {
  return [{ title: "PeopleOS · Employees" }];
}

export default function Employees() {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");

  const filtered = employees.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase());
    const matchDept = dept === "All" || e.dept === dept;
    const matchStatus = status === "All" || e.status === status;
    return matchSearch && matchDept && matchStatus;
  });

  return (
    <HRMSLayout>
      <div className="page-title">Employees</div>
      <div className="page-sub">Manage your entire workforce in one place.</div>

      <div className="stat-grid">
        {[
          { label: "Total", value: "1,284", color: "#4f46e5" },
          { label: "Active", value: "1,198", color: "#10b981" },
          { label: "On Leave", value: "47", color: "#f59e0b" },
          { label: "Onboarding", value: "39", color: "#8b5cf6" },
        ].map((s) => (
          <div className="stat-card" key={s.label} style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Search employees..."
            style={{ flex: 1, minWidth: 200, padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}>
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary">+ Add Employee</button>
        </div>

        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Department</th><th>Location</th><th>Joined</th><th>Salary</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {e.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{e.id} · {e.role}</div>
                    </div>
                  </div>
                </td>
                <td>{e.dept}</td>
                <td>{e.location}</td>
                <td>{e.joined}</td>
                <td style={{ fontWeight: 600 }}>{e.salary}</td>
                <td>
                  <span className={`badge ${e.status === "Active" ? "badge-green" : e.status === "Onboarding" ? "badge-blue" : "badge-amber"}`}>
                    {e.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-outline" style={{ padding: "4px 12px", fontSize: 12 }}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-3)", fontSize: 14 }}>
            No employees match your filters.
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-3)" }}>
          Showing {filtered.length} of {employees.length} employees
        </div>
      </div>
    </HRMSLayout>
  );
}
