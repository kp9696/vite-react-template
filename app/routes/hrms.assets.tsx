import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.assets";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";

const initialAssets = [
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
  Laptop: "[L]",
  Monitor: "[M]",
  Phone: "[P]",
  Peripheral: "[A]",
  Tablet: "[T]",
};

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function meta() {
  return [{ title: "JWithKP HRMS - Assets" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  return { currentUser };
}

export default function Assets() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [assets, setAssets] = useState(initialAssets);
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "Laptop", serial: "", value: "", condition: "Good" });
  const [assignName, setAssignName] = useState("");

  const types = ["All", "Laptop", "Monitor", "Phone", "Peripheral", "Tablet"];

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const filtered = filter === "All" ? assets : assets.filter((asset) => asset.type === filter);
  const available = assets.filter((asset) => !asset.assignedTo).length;
  const damaged = assets.filter((asset) => asset.condition === "Damaged").length;
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);

  const handleRegister = () => {
    if (!form.name || !form.serial) {
      setToast("Please fill in asset name and serial number.");
      return;
    }

    const newAsset = {
      id: `AST-${String(assets.length + 1).padStart(3, "0")}`,
      name: form.name,
      type: form.type,
      assignedTo: null,
      dept: null,
      serial: form.serial,
      condition: form.condition,
      assignedOn: null,
      value: Number(form.value) || 0,
    };

    setAssets((prev) => [...prev, newAsset]);
    setForm({ name: "", type: "Laptop", serial: "", value: "", condition: "Good" });
    setShowForm(false);
    setToast(`Asset "${form.name}" registered successfully.`);
  };

  const handleAssign = () => {
    if (!assignName) {
      setToast("Please enter an employee name.");
      return;
    }

    setAssets((prev) => prev.map((asset) =>
      asset.id === assignTarget ? { ...asset, assignedTo: assignName, dept: "-", assignedOn: "Apr 2026", condition: "Good" } : asset,
    ));
    setAssignTarget(null);
    setToast(`Asset assigned to ${assignName}.`);
  };

  const handleRetrieve = (id: string, name: string) => {
    setAssets((prev) => prev.map((asset) =>
      asset.id === id ? { ...asset, assignedTo: null, dept: null, assignedOn: null, condition: "Available" } : asset,
    ));
    setToast(`"${name}" retrieved and marked available.`);
  };

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "var(--accent)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", maxWidth: 340 }}>
          {toast}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">IT Assets</div>
          <div className="page-sub">Track all company hardware, devices and peripherals.</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setAssignTarget(null); }}>+ Register Asset</button>
      </div>

      {showForm ? (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Register New Asset</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Asset Name *</label>
              <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. MacBook Pro 14 M4" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} style={fieldStyle}>
                {["Laptop", "Monitor", "Phone", "Peripheral", "Tablet"].map((type) => <option key={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Serial Number *</label>
              <input value={form.serial} onChange={(e) => setForm((prev) => ({ ...prev, serial: e.target.value }))} placeholder="e.g. FVFXQ1234567" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Value (Rs)</label>
              <input type="number" value={form.value} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} placeholder="0" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Condition</label>
              <select value={form.condition} onChange={(e) => setForm((prev) => ({ ...prev, condition: e.target.value }))} style={fieldStyle}>
                <option>Good</option>
                <option>Available</option>
                <option>Damaged</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleRegister}>Register Asset</button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {assignTarget ? (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--green)" }}>
          <div className="card-title">Assign Asset - {assets.find((asset) => asset.id === assignTarget)?.name}</div>
          <div style={{ maxWidth: 360, marginBottom: 16 }}>
            <label style={labelStyle}>Assign To (Employee Name)</label>
            <input value={assignName} onChange={(e) => setAssignName(e.target.value)} placeholder="e.g. Kavya Sharma" style={fieldStyle} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleAssign}>Confirm Assign</button>
            <button className="btn btn-outline" onClick={() => setAssignTarget(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

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

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {types.map((type) => (
          <button key={type} onClick={() => setFilter(type)} style={{
            padding: "6px 16px",
            borderRadius: 20,
            border: "1px solid var(--border)",
            cursor: "pointer",
            fontSize: 13,
            background: filter === type ? "var(--accent)" : "white",
            color: filter === type ? "white" : "var(--ink-2)",
            fontWeight: filter === type ? 700 : 500,
          }}>
            {type !== "All" ? typeIcons[type] : ""} {type}
          </button>
        ))}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Asset</th><th>Type</th><th>Serial</th><th>Assigned To</th><th>Assigned On</th><th>Value</th><th>Condition</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{asset.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{asset.id}</div>
                </td>
                <td>{typeIcons[asset.type]} {asset.type}</td>
                <td style={{ fontSize: 11, fontFamily: "monospace", color: "var(--ink-3)" }}>{asset.serial}</td>
                <td>
                  {asset.assignedTo ? (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{asset.assignedTo}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{asset.dept}</div>
                    </div>
                  ) : (
                    <span className="badge badge-green">Unassigned</span>
                  )}
                </td>
                <td style={{ fontSize: 12 }}>{asset.assignedOn ?? "-"}</td>
                <td style={{ fontWeight: 600 }}>{fmt(asset.value)}</td>
                <td>
                  <span className={`badge ${asset.condition === "Good" ? "badge-green" : asset.condition === "Available" ? "badge-blue" : "badge-red"}`}>
                    {asset.condition}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!asset.assignedTo ? <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setAssignTarget(asset.id); setShowForm(false); setAssignName(""); }}>Assign</button> : null}
                    {asset.assignedTo ? <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => handleRetrieve(asset.id, asset.name)}>Retrieve</button> : null}
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

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };

