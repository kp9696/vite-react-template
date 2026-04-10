import { useLoaderData } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/hrms.payroll";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/session.server";
import { avatarColor, getInitials } from "../lib/hrms.shared";

const payrollData = [
  { name: "Deepa Krishnan", id: "EMP006", dept: "Engineering", basic: 280000, hra: 112000, conveyance: 19200, pf: 33600, tds: 5600, pt: 2800, gross: 411200, deductions: 42000, net: 369200, status: "Processed" },
  { name: "Aarav Shah",     id: "EMP001", dept: "Engineering", basic: 186667, hra: 74667,  conveyance: 19200, pf: 22400, tds: 4200, pt: 1400, gross: 280534, deductions: 28000, net: 252534, status: "Processed" },
  { name: "Priya Nair",     id: "EMP002", dept: "Design",      basic: 146667, hra: 58667,  conveyance: 19200, pf: 17600, tds: 2800, pt: 1600, gross: 224534, deductions: 22000, net: 202534, status: "Processed" },
  { name: "Rohan Mehta",    id: "EMP003", dept: "Analytics",   basic: 120000, hra: 48000,  conveyance: 19200, pf: 14400, tds: 2100, pt: 1500, gross: 187200, deductions: 18000, net: 169200, status: "Pending" },
  { name: "Sneha Pillai",   id: "EMP004", dept: "People Ops",  basic: 106667, hra: 42667,  conveyance: 19200, pf: 12800, tds: 1680, pt: 1520, gross: 168534, deductions: 16000, net: 152534, status: "Processed" },
  { name: "Arjun Gupta",    id: "EMP005", dept: "Sales",       basic: 93333,  hra: 37333,  conveyance: 19200, pf: 11200, tds: 1400, pt: 1400, gross: 149866, deductions: 14000, net: 135866, status: "Pending" },
];

type Employee = typeof payrollData[0];

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

export function meta() {
  return [{ title: "JWithKP HRMS - Payroll" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  return { currentUser };
}

function PayslipModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const color = avatarColor(emp.name);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Payslip — April 2026
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Employee info */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--surface)", borderRadius: 12, marginBottom: 20 }}>
          <span className="avatar-sm" style={{ background: color, width: 40, height: 40, fontSize: 14 }}>
            {getInitials(emp.name)}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{emp.name}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{emp.id} · {emp.dept}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>Net Pay</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)" }}>{fmt(emp.net)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Earnings */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>Earnings</div>
            {[
              ["Basic Salary", emp.basic],
              ["HRA", emp.hra],
              ["Conveyance", emp.conveyance],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(val as number)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14, fontWeight: 800 }}>
              <span>Gross</span>
              <span style={{ color: "var(--accent)" }}>{fmt(emp.gross)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>Deductions</div>
            {[
              ["Provident Fund", emp.pf],
              ["TDS", emp.tds],
              ["Professional Tax", emp.pt],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--red)" }}>- {fmt(val as number)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14, fontWeight: 800 }}>
              <span>Total Deductions</span>
              <span style={{ color: "var(--red)" }}>- {fmt(emp.deductions)}</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "var(--green-light)", borderRadius: 12, border: "1px solid #a7f3d0" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Net Pay (Take-Home)</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>After all deductions · April 2026</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--green)" }}>{fmt(emp.net)}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onClose}>Download PDF</button>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Payroll() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [month, setMonth] = useState("April 2026");
  const [selectedPayslip, setSelectedPayslip] = useState<Employee | null>(null);

  const totalGross      = payrollData.reduce((a, e) => a + e.gross, 0);
  const totalNet        = payrollData.reduce((a, e) => a + e.net, 0);
  const totalDeductions = payrollData.reduce((a, e) => a + e.deductions, 0);
  const pending         = payrollData.filter((e) => e.status === "Pending").length;

  // Dept summary
  const deptSummary = Object.values(
    payrollData.reduce<Record<string, { dept: string; count: number; net: number }>>((acc, e) => {
      if (\!acc[e.dept]) acc[e.dept] = { dept: e.dept, count: 0, net: 0 };
      acc[e.dept].count++;
      acc[e.dept].net += e.net;
      return acc;
    }, {})
  );

  return (
    <HRMSLayout currentUser={currentUser}>
      {selectedPayslip ? (
        <PayslipModal emp={selectedPayslip} onClose={() => setSelectedPayslip(null)} />
      ) : null}

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
          <button className="btn btn-primary">▶ Run Payroll</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div className="stat-label">Gross Payroll</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{fmt(totalGross)}</div>
          <div className="stat-delta delta-up">↑ 3.2% vs last month</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--green)" }}>
          <div className="stat-label">Net Disbursed</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{fmt(totalNet)}</div>
          <div className="stat-delta" style={{ color: "var(--ink-3)" }}>After all deductions</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--amber)" }}>
          <div className="stat-label">Total Deductions</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--amber)" }}>{fmt(totalDeductions)}</div>
          <div className="stat-delta" style={{ color: "var(--ink-3)" }}>PF + TDS + PT</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${pending > 0 ? "var(--red)" : "var(--green)"}` }}>
          <div className="stat-label">Pending Processing</div>
          <div className="stat-value" style={{ fontSize: 22, color: pending > 0 ? "var(--red)" : "var(--green)" }}>{pending}</div>
          <div className="stat-delta delta-down">{pending > 0 ? "Requires action" : "All processed"}</div>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 0 }}>
        {/* Payroll register */}
        <div className="card" style={{ gridColumn: "1/-1" }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span className="avatar-sm" style={{ background: avatarColor(e.name) }}>
                        {getInitials(e.name)}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink)" }}>{e.name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{e.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.dept}</td>
                  <td>{fmt(e.basic)}</td>
                  <td>{fmt(e.hra)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(e.gross)}</td>
                  <td style={{ color: "var(--red)" }}>- {fmt(e.deductions)}</td>
                  <td style={{ fontWeight: 700, color: "var(--green)" }}>{fmt(e.net)}</td>
                  <td><span className={`badge ${e.status === "Processed" ? "badge-green" : "badge-amber"}`}>{e.status}</span></td>
                  <td>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "4px 12px", fontSize: 12 }}
                      onClick={() => setSelectedPayslip(e)}
                    >
                      Payslip ↗
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--surface)", borderRadius: 10, display: "flex", justifyContent: "flex-end", gap: 32 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Total Gross</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(totalGross)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Total Deductions</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)" }}>- {fmt(totalDeductions)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase" }}>Total Net</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{fmt(totalNet)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Dept breakdown */}
      <div className="card">
        <div className="card-title">Payroll by Department</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {deptSummary.sort((a, b) => b.net - a.net).map((d, i) => {
            const pct = Math.round((d.net / totalNet) * 100);
            const COLORS = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6"];
            const color = COLORS[i % COLORS.length];
            return (
              <div key={d.dept} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 100, fontSize: 13, fontWeight: 500, color: "var(--ink-2)", flexShrink: 0 }}>{d.dept}</div>
                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 99, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 99, transition: "width 0.4s ease" }} />
                </div>
                <div style={{ width: 80, fontSize: 13, fontWeight: 700, textAlign: "right", color: "var(--ink)" }}>{fmt(d.net)}</div>
                <div style={{ width: 32, fontSize: 12, color: "var(--ink-3)" }}>{pct}%</div>
                <span className="badge badge-blue" style={{ fontSize: 11 }}>{d.count} emp</span>
              </div>
            );
          })}
        </div>
      </div>
    </HRMSLayout>
  );
}
