import HRMSLayout from "../components/HRMSLayout";
import { useState } from "react";

const leaveRequests = [
  { name: "Deepa Krishnan", type: "Annual Leave", from: "Apr 10", to: "Apr 12", days: 3, status: "Pending", reason: "Family vacation" },
  { name: "Meera Iyer", type: "Sick Leave", from: "Apr 8", to: "Apr 9", days: 2, status: "Approved", reason: "Medical appointment" },
  { name: "Vikram Joshi", type: "WFH", from: "Apr 14", to: "Apr 15", days: 2, status: "Pending", reason: "Home renovation" },
  { name: "Priya Nair", type: "Maternity Leave", from: "May 1", to: "Jul 31", days: 90, status: "Approved", reason: "Maternity" },
  { name: "Arjun Gupta", type: "Annual Leave", from: "Apr 20", to: "Apr 22", days: 3, status: "Rejected", reason: "Personal trip" },
  { name: "Kavya Sharma", type: "Sick Leave", from: "Apr 7", to: "Apr 7", days: 1, status: "Approved", reason: "Fever" },
];

const leaveBalance = [
  { type: "Annual Leave", total: 18, used: 7, remaining: 11 },
  { type: "Sick Leave", total: 12, used: 2, remaining: 10 },
  { type: "Casual Leave", total: 6, used: 3, remaining: 3 },
  { type: "Comp Off", total: 4, used: 0, remaining: 4 },
];

const colors = { "Annual Leave": "#4f46e5", "Sick Leave": "#ef4444", "Casual Leave": "#f59e0b", "Comp Off": "#10b981" };

export function meta() {
  return [{ title: "PeopleOS · Leave Management" }];
}

export default function Leave() {
  const [tab, setTab] = useState<"requests" | "balance" | "calendar">("requests");

  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Leave Management</div>
          <div className="page-sub">Track, approve, and manage all leave requests.</div>
        </div>
        <button className="btn btn-primary">+ Apply Leave</button>
      </div>

      {/* My Balance Cards */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {leaveBalance.map((l) => (
          <div className="stat-card" key={l.type} style={{ borderLeft: `4px solid ${(colors as any)[l.type]}` }}>
            <div className="stat-label">{l.type}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <div className="stat-value" style={{ color: (colors as any)[l.type] }}>{l.remaining}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>/ {l.total} days</div>
            </div>
            <div style={{ marginTop: 10, background: "var(--surface)", borderRadius: 99, height: 6 }}>
              <div style={{ width: `${(l.used / l.total) * 100}%`, background: (colors as any)[l.type], height: "100%", borderRadius: 99 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{l.used} used</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface)", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {(["requests", "balance", "calendar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, textTransform: "capitalize",
              background: tab === t ? "white" : "transparent",
              color: tab === t ? "var(--ink)" : "var(--ink-3)",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "requests" && (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Type</th><th>Duration</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {leaveRequests.map((r) => (
                <tr key={r.name + r.from}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.name}</div>
                  </td>
                  <td>{r.type}</td>
                  <td style={{ fontSize: 12 }}>{r.from} → {r.to}</td>
                  <td style={{ fontWeight: 700 }}>{r.days}d</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 140 }}>{r.reason}</td>
                  <td>
                    <span className={`badge ${r.status === "Approved" ? "badge-green" : r.status === "Pending" ? "badge-amber" : "badge-red"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === "Pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 12 }}>✓</button>
                        <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "balance" && (
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {leaveBalance.map((l) => (
              <div key={l.type} style={{ padding: 20, background: "var(--surface)", borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{l.type}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Total Entitled</span>
                  <span style={{ fontWeight: 700 }}>{l.total} days</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Used</span>
                  <span style={{ fontWeight: 700, color: "var(--red)" }}>{l.used} days</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Remaining</span>
                  <span style={{ fontWeight: 700, color: "var(--green)" }}>{l.remaining} days</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "calendar" && (
        <div className="card">
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-3)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Leave Calendar</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Visual calendar view of team leaves — coming soon.</div>
          </div>
        </div>
      )}
    </HRMSLayout>
  );
}
