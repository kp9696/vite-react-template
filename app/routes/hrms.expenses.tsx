import { useLoaderData } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/hrms.expenses";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";

const expenses = [
  { id: "EXP-1042", name: "Vikram Joshi", category: "Travel", desc: "Flight BLR → DEL (client visit)", amount: 12400, date: "Apr 3", status: "Pending", receipt: true },
  { id: "EXP-1041", name: "Arjun Gupta", category: "Meals", desc: "Client dinner — 4 pax", amount: 4800, date: "Apr 2", status: "Approved", receipt: true },
  { id: "EXP-1040", name: "Deepa Krishnan", category: "Software", desc: "Figma annual license", amount: 9600, date: "Apr 1", status: "Approved", receipt: true },
  { id: "EXP-1039", name: "Priya Nair", category: "Travel", desc: "Cab to client site (10 trips)", amount: 3200, date: "Mar 30", status: "Reimbursed", receipt: true },
  { id: "EXP-1038", name: "Rohan Mehta", category: "Office Supplies", desc: "Mechanical keyboard + mousepad", amount: 5400, date: "Mar 28", status: "Rejected", receipt: false },
  { id: "EXP-1037", name: "Sneha Pillai", category: "Training", desc: "SHRM certification fee", amount: 18000, date: "Mar 25", status: "Approved", receipt: true },
  { id: "EXP-1036", name: "Meera Iyer", category: "Travel", desc: "Hotel stay — Mumbai conf.", amount: 8700, date: "Mar 22", status: "Reimbursed", receipt: true },
];

const catColors: Record<string, string> = {
  "Travel": "#4f46e5",
  "Meals": "#f59e0b",
  "Software": "#8b5cf6",
  "Office Supplies": "#10b981",
  "Training": "#ef4444",
};

const catIcons: Record<string, string> = {
  "Travel": "✈️",
  "Meals": "🍽️",
  "Software": "💻",
  "Office Supplies": "📦",
  "Training": "🎓",
};

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

export function meta() {
  return [{ title: "JWithKP HRMS - Expenses" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

export default function Expenses() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [tab, setTab] = useState<"all" | "pending" | "mine">("all");
  const [showForm, setShowForm] = useState(false);

  const filtered = tab === "pending"
    ? expenses.filter(e => e.status === "Pending")
    : tab === "mine"
    ? expenses.filter(e => e.name === "Deepa Krishnan")
    : expenses;

  const totalPending = expenses.filter(e => e.status === "Pending").reduce((a, e) => a + e.amount, 0);
  const totalApproved = expenses.filter(e => e.status === "Approved").reduce((a, e) => a + e.amount, 0);
  const totalReimbursed = expenses.filter(e => e.status === "Reimbursed").reduce((a, e) => a + e.amount, 0);

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Expense Management</div>
          <div className="page-sub">Submit, track, and reimburse employee expenses.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Claim"}
        </button>
      </div>

      {/* New Claim Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Submit New Expense Claim</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {[
              { label: "Category", type: "select", options: ["Travel", "Meals", "Software", "Office Supplies", "Training"] },
              { label: "Amount (₹)", type: "number", placeholder: "0.00" },
              { label: "Date", type: "date" },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>{f.label}</label>
                {f.type === "select" ? (
                  <select style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                    {f.options?.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type} placeholder={f.placeholder} style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
                )}
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Description</label>
              <input placeholder="Brief description of the expense..." style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 6 }}>Upload Receipt</label>
              <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "20px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
                📎 Drag & drop receipt or <span style={{ color: "var(--accent)", cursor: "pointer" }}>browse files</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary">Submit Claim</button>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--amber)" }}>{fmt(totalPending)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{expenses.filter(e => e.status === "Pending").length} claims</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved (Apr)</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--accent)" }}>{fmt(totalApproved)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Awaiting reimbursement</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reimbursed (Apr)</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{fmt(totalReimbursed)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Paid out this month</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Category</div>
          <div className="stat-value" style={{ fontSize: 22 }}>✈️ Travel</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>62% of all claims</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="card">
        <div className="card-title">Spend by Category — April 2026</div>
        <div style={{ display: "flex", gap: 16 }}>
          {Object.entries(catColors).map(([cat, color]) => {
            const total = expenses.filter(e => e.category === cat).reduce((a, e) => a + e.amount, 0);
            const max = 25000;
            return (
              <div key={cat} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 8 }}>
                  <div style={{ width: "60%", background: color, borderRadius: "6px 6px 0 0", height: `${Math.max((total / max) * 100, 5)}%`, opacity: total ? 1 : 0.2 }} />
                </div>
                <div style={{ fontSize: 18 }}>{catIcons[cat]}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>{cat}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color }}>{total ? fmt(total) : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs + Table */}
      <div className="card">
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface)", padding: 4, borderRadius: 10, width: "fit-content" }}>
          {(["all", "pending", "mine"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, textTransform: "capitalize",
              background: tab === t ? "white" : "transparent",
              color: tab === t ? "var(--ink)" : "var(--ink-3)",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            }}>
              {t === "all" ? "All Claims" : t === "pending" ? "Pending" : "My Claims"}
            </button>
          ))}
        </div>

        <table className="table">
          <thead>
            <tr><th>ID</th><th>Employee</th><th>Category</th><th>Description</th><th>Date</th><th>Amount</th><th>Receipt</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id}>
                <td style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "monospace" }}>{e.id}</td>
                <td style={{ fontWeight: 600, color: "var(--ink)" }}>{e.name}</td>
                <td>
                  <span style={{ fontSize: 12 }}>
                    {catIcons[e.category]} {e.category}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: "var(--ink-2)", maxWidth: 180 }}>{e.desc}</td>
                <td style={{ fontSize: 12 }}>{e.date}</td>
                <td style={{ fontWeight: 700 }}>{fmt(e.amount)}</td>
                <td>
                  {e.receipt
                    ? <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }}>✓ Attached</span>
                    : <span style={{ color: "var(--red)", fontSize: 12 }}>Missing</span>}
                </td>
                <td>
                  <span className={`badge ${e.status === "Approved" || e.status === "Reimbursed" ? "badge-green" : e.status === "Pending" ? "badge-amber" : "badge-red"}`}>
                    {e.status}
                  </span>
                </td>
                <td>
                  {e.status === "Pending" && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>✓</button>
                      <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}>✕</button>
                    </div>
                  )}
                  {e.status === "Approved" && (
                    <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}>💸 Pay</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HRMSLayout>
  );
}
