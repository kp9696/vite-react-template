import { useLoaderData } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/hrms.payroll";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";

const payrollData = [
  { name: "Deepa Krishnan", id: "EMP006", dept: "Engineering", basic: 280000, hra: 112000, gross: 350000, deductions: 42000, net: 308000, status: "Processed" },
  { name: "Aarav Shah", id: "EMP001", dept: "Engineering", basic: 186667, hra: 74667, gross: 233333, deductions: 28000, net: 205333, status: "Processed" },
  { name: "Priya Nair", id: "EMP002", dept: "Design", basic: 146667, hra: 58667, gross: 183333, deductions: 22000, net: 161333, status: "Processed" },
  { name: "Rohan Mehta", id: "EMP003", dept: "Analytics", basic: 120000, hra: 48000, gross: 150000, deductions: 18000, net: 132000, status: "Pending" },
  { name: "Sneha Pillai", id: "EMP004", dept: "People Ops", basic: 106667, hra: 42667, gross: 133333, deductions: 16000, net: 117333, status: "Processed" },
  { name: "Arjun Gupta", id: "EMP005", dept: "Sales", basic: 93333, hra: 37333, gross: 116667, deductions: 14000, net: 102667, status: "Pending" },
];

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

export function meta() {
  return [{ title: "JWithKP HRMS - Payroll" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

export default function Payroll() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [month, setMonth] = useState("April 2026");

  const totalGross = payrollData.reduce((a, e) => a + e.gross, 0);
  const totalNet = payrollData.reduce((a, e) => a + e.net, 0);
  const totalDeductions = payrollData.reduce((a, e) => a + e.deductions, 0);
  const pending = payrollData.filter((e) => e.status === "Pending").length;

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Payroll</div>
          <div className="page-sub">Process and manage monthly salary disbursements.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontWeight: 600 }}>
            <option>April 2026</option>
            <option>March 2026</option>
            <option>February 2026</option>
          </select>
          <button className="btn btn-primary">Run Payroll</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Gross Payroll</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{fmt(totalGross)}</div>
          <div className="stat-delta delta-up">↑ 3.2% vs last month</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net Disbursed</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{fmt(totalNet)}</div>
          <div className="stat-delta">After all deductions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Deductions</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--amber)" }}>{fmt(totalDeductions)}</div>
          <div className="stat-delta">PF + TDS + PT</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Processing</div>
          <div className="stat-value" style={{ fontSize: 22, color: pending > 0 ? "var(--red)" : "var(--green)" }}>{pending}</div>
          <div className="stat-delta delta-down">{pending > 0 ? "Requires action" : "All processed"}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="card-title" style={{ margin: 0 }}>Payroll Register — {month}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" style={{ fontSize: 12 }}>📥 Export CSV</button>
            <button className="btn btn-outline" style={{ fontSize: 12 }}>🖨️ Print</button>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Department</th><th>Basic</th><th>HRA</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {payrollData.map((e) => (
              <tr key={e.id}>
                <td>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{e.id}</div>
                </td>
                <td>{e.dept}</td>
                <td>{fmt(e.basic)}</td>
                <td>{fmt(e.hra)}</td>
                <td style={{ fontWeight: 600 }}>{fmt(e.gross)}</td>
                <td style={{ color: "var(--red)" }}>- {fmt(e.deductions)}</td>
                <td style={{ fontWeight: 700, color: "var(--green)" }}>{fmt(e.net)}</td>
                <td><span className={`badge ${e.status === "Processed" ? "badge-green" : "badge-amber"}`}>{e.status}</span></td>
                <td>
                  <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>Payslip</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, padding: "16px 12px", background: "var(--surface)", borderRadius: 10, display: "flex", justifyContent: "flex-end", gap: 32 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Total Gross</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(totalGross)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Total Net</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{fmt(totalNet)}</div>
          </div>
        </div>
      </div>
    </HRMSLayout>
  );
}
