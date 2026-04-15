import { Form, useActionData, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/hrms.payroll";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { avatarColor, getInitials } from "../lib/hrms.shared";
import { getPayrollDashboard, runPayrollForMonth, type PayrollEmployee } from "../lib/payroll.server";

type Employee = PayrollEmployee;

type ActionData = {
  ok: boolean;
  message: string;
};

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

export function meta() {
  return [{ title: "JWithKP HRMS - Payroll" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) {
    return { currentUser, months: [], payrollByMonth: {} as Record<string, Employee[]> };
  }

  const payroll = await getPayrollDashboard(context.cloudflare.env.HRMS, tenantId);
  return {
    currentUser,
    months: payroll.months,
    payrollByMonth: payroll.payrollByMonth,
  };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionData> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) {
    return { ok: false, message: "Organization not found for this user." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  if (intent !== "run-payroll") {
    return { ok: false, message: "Unsupported payroll action." };
  }

  const month = String(formData.get("month") || "").trim();
  if (!month) {
    return { ok: false, message: "Payroll month is required." };
  }

  const result = await runPayrollForMonth(context.cloudflare.env.HRMS, tenantId, month);
  if (result.processed + result.pending === 0) {
    return { ok: false, message: `No employees found for payroll run (${result.month}).` };
  }

  return {
    ok: true,
    message: `Payroll generated for ${result.month}. Processed: ${result.processed}, Pending: ${result.pending}.`,
  };
}

function PayslipModal({ emp, month, onClose }: { emp: Employee; month: string; onClose: () => void }) {
  const color = avatarColor(emp.name);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Payslip — {month}
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
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>After all deductions · {month}</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--green)" }}>{fmt(emp.net)}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function exportCSV(rows: Employee[], month: string) {
  const headers = ["Employee", "ID", "Department", "Basic", "HRA", "Gross", "Deductions", "Net Pay", "Status"];
  const lines = [
    headers.join(","),
    ...rows.map((e) =>
      [e.name, e.id, e.dept, e.basic, e.hra, e.gross, e.deductions, e.net, e.status].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-${month.replace(" ", "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Payroll() {
  const { currentUser, months: loaderMonths, payrollByMonth } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const availableMonths = loaderMonths;
  const [month, setMonth] = useState(availableMonths[0] ?? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date()));
  const [selectedPayslip, setSelectedPayslip] = useState<Employee | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(month)) {
      setMonth(availableMonths[0]);
    }
  }, [availableMonths, month]);

  useEffect(() => {
    if (actionData?.message) {
      showToast(actionData.message);
    }
  }, [actionData?.message]);

  const rows = payrollByMonth[month] ?? [];

  const totalGross      = rows.reduce((a, e) => a + e.gross, 0);
  const totalNet        = rows.reduce((a, e) => a + e.net, 0);
  const totalDeductions = rows.reduce((a, e) => a + e.deductions, 0);
  const pending         = rows.filter((e) => e.status === "Pending").length;

  // Dept summary
  const deptSummary = Object.values(
    rows.reduce<Record<string, { dept: string; count: number; net: number }>>((acc, e) => {
      if (!acc[e.dept]) acc[e.dept] = { dept: e.dept, count: 0, net: 0 };
      acc[e.dept].count++;
      acc[e.dept].net += e.net;
      return acc;
    }, {})
  );

  return (
    <HRMSLayout currentUser={currentUser}>
      {toast ? (
        <div className="toast toast-success" style={{ cursor: "default" }}>{toast}</div>
      ) : null}
      {selectedPayslip ? (
        <PayslipModal emp={selectedPayslip} month={month} onClose={() => setSelectedPayslip(null)} />
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Payroll</div>
          <div className="page-sub">Process and manage monthly salary disbursements from D1 records.</div>
        </div>
        <Form method="post" style={{ display: "flex", gap: 10 }}>
          <input type="hidden" name="intent" value="run-payroll" />
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontWeight: 600 }}>
            {availableMonths.length === 0 ? <option>{month}</option> : null}
            {availableMonths.map((m) => <option key={m}>{m}</option>)}
          </select>
          <input type="hidden" name="month" value={month} />
          <button className="btn btn-primary" type="submit">▶ Run Payroll</button>
        </Form>
      </div>

      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div className="stat-label">Gross Payroll</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{fmt(totalGross)}</div>
          <div className="stat-delta">Generated from current payroll month rows</div>
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
            <div className="card-title" style={{ margin: 0 }}>Payroll Register — {month} ({rows.length} employees)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => exportCSV(rows, month)}>📥 Export CSV</button>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => window.print()}>🖨️ Print</button>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Basic</th><th>HRA</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--ink-3)" }}>
                    No payroll records available yet.
                  </td>
                </tr>
              ) : rows.map((e) => (
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
          {deptSummary.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>No department payroll data available.</div>
          ) : deptSummary.sort((a, b) => b.net - a.net).map((d, i) => {
            const pct = Math.round((d.net / totalNet) * 100);
            const COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6"];
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

