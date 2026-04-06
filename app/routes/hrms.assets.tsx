import HRMSLayout from "../components/HRMSLayout";
import { useState } from "react";

const assets = [
  { id: "AST-001", name: "MacBook Pro 14\" M3", type: "Laptop", assignedTo: "Deepa Krishnan", dept: "Engineering", serial: "FVFXQ1234567", condition: "Good", assignedOn: "Jan 2025", value: 185000 },
  { id: "AST-002", name: "Dell UltraSharp 27\"", type: "Monitor", assignedTo: "Aarav Shah", dept: "Engineering", serial: "CN0X1234Y", condition: "Good", assignedOn: "Feb 2025", value: 42000 },
  { id: "AST-003", name: "iPhone 15 Pro", type: "Phone", assignedTo: "Arjun Gupta", dept: "Sales", serial: "DNPXQ7654", condition: "Good", assignedOn: "Mar 2025", value: 95000 },
  { id: "AST-004", name: "MacBook Air M2", type: "Laptop", assignedTo: "Priya Nair", dept: "Design", serial: "FVFGQ9876543", condition: "Good", assignedOn: "Mar 2025", value: 115000 },
  { id: "AST-005", name: "Logitech MX Keys", type: "Peripheral", assignedTo: "Vikram Joshi", dept: "Engineering", serial: "LGT112233", condition: "Good", assignedOn: "Jan 2025", value: 9500 },
  { id: "AST-006", name: "Dell Latitude 5540", type: "Laptop", assignedTo: null, dept: null, serial: "DXLAT5540X", condition: "Available", assignedOn: null, value: 72000 },
  { id: "AST-007", name: "iPad Pro 12.9\"", type: "Tablet", assignedTo: "Meera Iyer", dept: "Marketing", serial: "DMPXQ11122", condition: "Damaged", assignedOn: "Dec 2024", value: 88000 },
  { id: "AST-008", name: "Jabra Evolve2 85", type: "Peripheral", assignedTo: "Rohan Mehta", dept: "Analytics", serial: "JBR885566", condition: "Good", assignedOn: "Feb 2025", value: 22000 },
];

const typeIcons: Record<string, string> = {
  "Laptop": "💻", "Monitor": "🖥️", "Phone": "📱", "Peripheral": "⌨️", "Tablet": "📋"
};

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

export function meta() {
  return [{ title: "PeopleOS · Assets" }];
}

export default function Assets() {
  const [filter, setFilter] = useState("All");
  const types = ["All", "Laptop", "Monitor", "Phone", "Peripheral", "Tablet"];

  const filtered = filter === "All" ? assets : assets.filter(a => a.type === filter);
  const available = assets.filter(a => !a.assignedTo).length;
  const damaged = assets.filter(a => a.condition === "Damaged").length;
  const totalValue = assets.reduce((s, a) => s + a.value, 0);

  return (
    <HRMSLayout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">IT Assets</div>
          <div className="page-sub">Track all company hardware, devices and peripherals.</div>
        </div>
        <button className="btn btn-primary">+ Register Asset</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{assets.length}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Worth {fmt(totalValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Assigned</div>
          <div className="stat-value" style={{ color: "var(--accent)" }}>{assets.length - available}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>To {assets.length - available} employees</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Available</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{available}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Ready to assign</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Damaged / In Repair</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>{damaged}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Requires attention</div>
        </div>
      </div>

      {/* Type filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: "6px 16px", borderRadius: 20, border: "1px solid var(--border)", cursor: "pointer", fontSize: 13,
            background: filter === t ? "var(--accent)" : "white",
            color: filter === t ? "white" : "var(--ink-2)",
            fontWeight: filter === t ? 700 : 500,
          }}>
            {t !== "All" && typeIcons[t]} {t}
          </button>
        ))}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Asset</th><th>Type</th><th>Serial</th><th>Assigned To</th><th>Assigned On</th><th>Value</th><th>Condition</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.id}</div>
                </td>
                <td>{typeIcons[a.type]} {a.type}</td>
                <td style={{ fontSize: 11, fontFamily: "monospace", color: "var(--ink-3)" }}>{a.serial}</td>
                <td>
                  {a.assignedTo
                    ? <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{a.assignedTo}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.dept}</div>
                      </div>
                    : <span className="badge badge-green">Unassigned</span>}
                </td>
                <td style={{ fontSize: 12 }}>{a.assignedOn ?? "—"}</td>
                <td style={{ fontWeight: 600 }}>{fmt(a.value)}</td>
                <td>
                  <span className={`badge ${a.condition === "Good" ? "badge-green" : a.condition === "Available" ? "badge-blue" : "badge-red"}`}>
                    {a.condition}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!a.assignedTo && <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>Assign</button>}
                    {a.assignedTo && <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}>Retrieve</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HRMSLayout>
  );
}
