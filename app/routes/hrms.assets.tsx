import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.assets";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";

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

interface ApiAssetRow {
  id?: string;
  asset_tag?: string;
  name?: string;
  category?: string;
  serial_no?: string;
  condition?: string;
  status?: string;
  assigned_to_name?: string;
}

function mapApiAsset(row: ApiAssetRow) {
  const isAssigned = (row.status || "").toLowerCase() === "assigned";
  return {
    id: row.id || row.asset_tag || "AST-000",
    name: row.name || "Asset",
    type: row.category || "Peripheral",
    assignedTo: isAssigned ? row.assigned_to_name || "Assigned" : null,
    dept: isAssigned ? "-" : null,
    serial: row.serial_no || "-",
    condition: row.condition || "Good",
    assignedOn: isAssigned ? "-" : null,
    value: 0,
  };
}

interface AssetActionResult {
  ok: boolean;
  message?: string;
  id?: string;
}

export function meta() {
  return [{ title: "JWithKP HRMS - Assets" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const assetResponse = await callCoreHrmsApi<{ assets?: ApiAssetRow[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/assets",
  });

  return {
    currentUser,
    apiAssets: (assetResponse?.assets || []).map(mapApiAsset),
  };
}

export async function action({ request, context }: Route.ActionArgs): Promise<AssetActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create-asset") {
    const name = String(formData.get("name") || "").trim();
    const type = String(formData.get("type") || "").trim();
    const serial = String(formData.get("serial") || "").trim();
    const condition = String(formData.get("condition") || "Good").trim();

    if (!name || !type || !serial) {
      return { ok: false, message: "Name, type, and serial are required." };
    }

    const assetTag = `AST-${Date.now().toString().slice(-6)}`;
    const response = await callCoreHrmsApi<{ ok?: boolean; id?: string; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/assets",
      method: "POST",
      body: {
        assetTag,
        name,
        category: type,
        serialNo: serial,
        condition,
      },
    });

    if (!response?.ok) {
      return { ok: false, message: response?.error || "Failed to create asset." };
    }

    return { ok: true, id: response.id };
  }

  if (intent === "assign-asset") {
    const assetId = String(formData.get("assetId") || "").trim();
    const assigneeName = String(formData.get("assigneeName") || "").trim();

    if (!assetId || !assigneeName) {
      return { ok: false, message: "Asset and assignee are required." };
    }

    const response = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/assets/${encodeURIComponent(assetId)}/assign`,
      method: "POST",
      body: { assigneeName },
    });

    if (!response?.ok) {
      return { ok: false, message: response?.error || "Failed to assign asset." };
    }

    return { ok: true, id: assetId };
  }

  if (intent === "revoke-asset") {
    const assetId = String(formData.get("assetId") || "").trim();
    if (!assetId) {
      return { ok: false, message: "Asset is required." };
    }

    const response = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/assets/${encodeURIComponent(assetId)}/revoke`,
      method: "POST",
      body: { reason: "Retrieved from UI" },
    });

    if (!response?.ok) {
      return { ok: false, message: response?.error || "Failed to retrieve asset." };
    }

    return { ok: true, id: assetId };
  }

  return { ok: false, message: "Unsupported action." };
}

export default function Assets() {
  const { currentUser, apiAssets } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<AssetActionResult>();
  const assignFetcher = useFetcher<AssetActionResult>();
  const revokeFetcher = useFetcher<AssetActionResult>();
  const [assets, setAssets] = useState(apiAssets.length > 0 ? apiAssets : initialAssets);
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "Laptop", serial: "", value: "", condition: "Good" });
  const [assignName, setAssignName] = useState("");
  const [pendingCreate, setPendingCreate] = useState<{ name: string; type: string; serial: string; value: number; condition: string } | null>(null);
  const [pendingAssign, setPendingAssign] = useState<{ assetId: string; assigneeName: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ assetId: string; name: string } | null>(null);

  const types = ["All", "Laptop", "Monitor", "Phone", "Peripheral", "Tablet"];

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!createFetcher.data || !pendingCreate) return;
    if (!createFetcher.data.ok) {
      setToast(createFetcher.data.message || "Failed to create asset.");
      setPendingCreate(null);
      return;
    }

    const newAsset = {
      id: createFetcher.data.id || `AST-${String(assets.length + 1).padStart(3, "0")}`,
      name: pendingCreate.name,
      type: pendingCreate.type,
      assignedTo: null,
      dept: null,
      serial: pendingCreate.serial,
      condition: pendingCreate.condition,
      assignedOn: null,
      value: pendingCreate.value,
    };

    setAssets((prev) => [newAsset, ...prev]);
    setForm({ name: "", type: "Laptop", serial: "", value: "", condition: "Good" });
    setShowForm(false);
    setToast(`Asset "${pendingCreate.name}" registered successfully.`);
    setPendingCreate(null);
  }, [createFetcher.data, pendingCreate, assets.length]);

  useEffect(() => {
    if (!assignFetcher.data || !pendingAssign) return;
    if (!assignFetcher.data.ok) {
      setToast(assignFetcher.data.message || "Failed to assign asset.");
      setPendingAssign(null);
      return;
    }

    setAssets((prev) => prev.map((asset) =>
      asset.id === pendingAssign.assetId
        ? { ...asset, assignedTo: pendingAssign.assigneeName, dept: "-", assignedOn: "Apr 2026", condition: "Good" }
        : asset,
    ));
    setAssignTarget(null);
    setToast(`Asset assigned to ${pendingAssign.assigneeName}.`);
    setPendingAssign(null);
  }, [assignFetcher.data, pendingAssign]);

  useEffect(() => {
    if (!revokeFetcher.data || !pendingRevoke) return;
    if (!revokeFetcher.data.ok) {
      setToast(revokeFetcher.data.message || "Failed to retrieve asset.");
      setPendingRevoke(null);
      return;
    }

    setAssets((prev) => prev.map((asset) =>
      asset.id === pendingRevoke.assetId
        ? { ...asset, assignedTo: null, dept: null, assignedOn: null, condition: "Available" }
        : asset,
    ));
    setToast(`"${pendingRevoke.name}" retrieved and marked available.`);
    setPendingRevoke(null);
  }, [revokeFetcher.data, pendingRevoke]);

  const filtered = filter === "All" ? assets : assets.filter((asset) => asset.type === filter);
  const available = assets.filter((asset) => !asset.assignedTo).length;
  const damaged = assets.filter((asset) => asset.condition === "Damaged").length;
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);

  const handleRegister = () => {
    if (!form.name || !form.serial) {
      setToast("Please fill in asset name and serial number.");
      return;
    }

    const payload = new FormData();
    payload.set("intent", "create-asset");
    payload.set("name", form.name);
    payload.set("type", form.type);
    payload.set("serial", form.serial);
    payload.set("condition", form.condition);

    setPendingCreate({
      name: form.name,
      type: form.type,
      serial: form.serial,
      value: Number(form.value) || 0,
      condition: form.condition,
    });
    createFetcher.submit(payload, { method: "POST" });
  };

  const handleAssign = () => {
    if (!assignName || !assignTarget) {
      setToast("Please enter an employee name.");
      return;
    }

    const payload = new FormData();
    payload.set("intent", "assign-asset");
    payload.set("assetId", assignTarget);
    payload.set("assigneeName", assignName.trim());

    setPendingAssign({ assetId: assignTarget, assigneeName: assignName.trim() });
    assignFetcher.submit(payload, { method: "POST" });
  };

  const handleRetrieve = (id: string, name: string) => {
    const payload = new FormData();
    payload.set("intent", "revoke-asset");
    payload.set("assetId", id);

    setPendingRevoke({ assetId: id, name });
    revokeFetcher.submit(payload, { method: "POST" });
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

