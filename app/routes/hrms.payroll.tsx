import { Form, useFetcher, useActionData, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/hrms.payroll";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";
import { getPayrollDashboard, runPayrollForMonth, type PayrollEmployee } from "../lib/payroll.server";
import { createNotification } from "../lib/notifications.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { sendEmail, buildPayslipEmailHtml } from "../../workers/lib/email";

type Employee = PayrollEmployee;

interface SalaryConfig {
  user_id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: string;
  annual_ctc: number;
  effective_from?: string;
  salary_updated_at?: string;
}

type ActionData = {
  ok: boolean;
  message: string;
};

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

function fmtCtc(ctc: number): string {
  if (ctc <= 0) return "Not set";
  return fmt(ctc);
}

function monthlyTakeHome(annualCtc: number): number {
  if (annualCtc <= 0) return 0;
  const monthly = Math.round(annualCtc / 12);
  const basic = Math.round(monthly * 0.50);
  const hra = Math.round(monthly * 0.20);
  const conveyance = 1_600;
  const special = Math.max(0, monthly - basic - hra - conveyance);
  const gross = basic + hra + conveyance + special;
  const pfWage = Math.min(basic, 15_000);
  const pf = Math.round(pfWage * 0.12);
  const esi = gross <= 21_000 ? Math.round(gross * 0.0075) : 0;
  const pt = 200;
  // Simplified TDS: annual gross * 12, standard deduction 75k, 4% cess, slabs
  const taxable = Math.max(0, gross * 12 - 75_000);
  let tax = 0;
  if (taxable > 1_200_000) {
    const slabs = [[400_000,0],[800_000,0.05],[1_200_000,0.10],[1_600_000,0.15],[2_000_000,0.20],[2_400_000,0.25],[Infinity,0.30]] as const;
    let prev = 0;
    for (const [upto, rate] of slabs) {
      if (taxable <= prev) break;
      tax += (Math.min(taxable, upto) - prev) * rate;
      prev = upto;
    }
    tax = Math.round(tax * 1.04);
  }
  const tds = Math.round(tax / 12);
  return Math.max(gross - pf - esi - tds - pt, 0);
}

export function meta() {
  return [{ title: "JWithKP HRMS - Payroll" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) {
    return { currentUser, months: [], payrollByMonth: {} as Record<string, Employee[]>, salaryConfigs: [] as SalaryConfig[] };
  }

  const payroll = await getPayrollDashboard(context.cloudflare.env.HRMS, tenantId);

  const salaryResponse = await callCoreHrmsApi<{ configs?: SalaryConfig[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/salary-configs",
  });
  const salaryConfigs = salaryResponse?.configs ?? [];

  return {
    currentUser,
    isAdmin: isAdminRole(currentUser.role),
    months: payroll.months,
    payrollByMonth: payroll.payrollByMonth,
    salaryConfigs,
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

  if (intent === "run-payroll") {
    const month = String(formData.get("month") || "").trim();
    if (!month) {
      return { ok: false, message: "Payroll month is required." };
    }

    const result = await runPayrollForMonth(context.cloudflare.env.HRMS, tenantId, month);
    if (result.processed + result.pending === 0) {
      return { ok: false, message: `No employees found for payroll run (${result.month}).` };
    }

    // Notify all active employees (in-app + email)
    try {
      const db = context.cloudflare.env.HRMS;
      const env = context.cloudflare.env;
      const baseUrl = env.HRMS_BASE_URL ?? new URL(request.url).origin;

      // Fetch employees with their payroll items for this month
      // Note: payroll_items uses employee_id (not user_id) and month_key (not month)
      const empRows = await db
        .prepare(
          `SELECT u.id, u.name, u.email,
                  pi.gross AS gross_pay, pi.net AS net_pay, pi.deductions AS total_deductions
           FROM users u
           LEFT JOIN payroll_items pi ON pi.employee_id = u.id AND pi.month_key = ?
             AND COALESCE(pi.company_id, pi.org_id) = ?
           WHERE COALESCE(u.company_id, u.org_id) = ?
             AND u.status NOT IN ('Inactive','inactive')`,
        )
        .bind(result.monthKey, tenantId, tenantId)
        .all<{ id: string; name: string; email: string; gross_pay: number | null; net_pay: number | null; total_deductions: number | null }>();

      await Promise.all(
        empRows.results.map(async (emp) => {
          // In-app notification
          await createNotification(db, {
            companyId: tenantId,
            userId: emp.id,
            type: "payroll_processed",
            title: "💰 Payslip Ready",
            body: `Your payslip for ${result.month} has been processed. Net pay: ₹${(emp.net_pay ?? 0).toLocaleString("en-IN")}.`,
            link: "/hrms/payroll",
          });

          // Email
          if (emp.email && emp.gross_pay != null) {
            sendEmail(env, {
              to: emp.email,
              subject: `💰 Your Payslip for ${result.month} is Ready – JWithKP HRMS`,
              html: buildPayslipEmailHtml({
                employeeName: emp.name,
                month: result.month,
                grossPay: emp.gross_pay ?? 0,
                netPay: emp.net_pay ?? 0,
                totalDeductions: emp.total_deductions ?? 0,
                baseUrl,
              }),
            }).catch((e) => console.error("[email] payslip:", e));
          }
        }),
      );
    } catch {
      // Notification failure should not block payroll response
    }

    return {
      ok: true,
      message: `Payroll generated for ${result.month}. Processed: ${result.processed}, Pending: ${result.pending}.`,
    };
  }

  if (intent === "set-salary") {
    const userId = String(formData.get("userId") || "").trim();
    const annualCtc = Number(formData.get("annualCtc") || 0);
    if (!userId || annualCtc <= 0) return { ok: false, message: "User and salary are required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/salary-configs",
      method: "POST",
      body: { userId, annualCtc },
    });
    return { ok: res?.ok ?? false, message: res?.error || `Salary updated for employee.` };
  }

  return { ok: false, message: "Unsupported payroll action." };
}

function downloadPayslipPDF(emp: Employee, month: string) {
  const color = avatarColor(emp.name);
  const esiRow = emp.esi > 0
    ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">ESI (0.75%)</span><span style="font-weight:600;color:#ef4444">- ${fmt(emp.esi)}</span></div>`
    : "";
  const specialAllowance = Math.max(0, emp.gross - emp.basic - emp.hra - emp.conveyance);
  const specialRow = specialAllowance > 0
    ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">Special Allowance</span><span style="font-weight:600;color:#1e293b">${fmt(specialAllowance)}</span></div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Payslip - ${emp.name} - ${month}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #1e293b; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 16px; }
  .company { font-size: 20px; font-weight: 800; color: #6366f1; }
  .payslip-label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .emp-box { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: #f8fafc; border-radius: 10px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
  .avatar { width: 44px; height: 44px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 16px; flex-shrink: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 10px; }
  .total-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; font-weight: 800; }
  .net-box { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #ecfdf5; border-radius: 10px; border: 1px solid #a7f3d0; margin-top: 16px; }
  .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company">JWithKP HRMS</div>
    <div class="payslip-label">Pay Slip for ${month}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#94a3b8">Generated</div>
    <div style="font-size:12px;font-weight:600">${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>
</div>

<div class="emp-box">
  <div class="avatar">${getInitials(emp.name)}</div>
  <div style="flex:1">
    <div style="font-weight:700;font-size:15px">${emp.name}</div>
    <div style="font-size:12px;color:#64748b">${emp.id} &bull; ${emp.dept}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#64748b;font-weight:600">Net Pay</div>
    <div style="font-size:22px;font-weight:800;color:#10b981">${fmt(emp.net)}</div>
  </div>
</div>

<div class="grid">
  <div>
    <div class="section-label">Earnings</div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">Basic Salary</span><span style="font-weight:600;color:#1e293b">${fmt(emp.basic)}</span></div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">HRA</span><span style="font-weight:600;color:#1e293b">${fmt(emp.hra)}</span></div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">Conveyance</span><span style="font-weight:600;color:#1e293b">${fmt(emp.conveyance)}</span></div>
    ${specialRow}
    <div class="total-row"><span>Gross Earnings</span><span style="color:#6366f1">${fmt(emp.gross)}</span></div>
  </div>
  <div>
    <div class="section-label">Deductions</div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">Provident Fund (12%)</span><span style="font-weight:600;color:#ef4444">- ${fmt(emp.pf)}</span></div>
    ${esiRow}
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">TDS (New Regime)</span><span style="font-weight:600;color:#ef4444">- ${fmt(emp.tds)}</span></div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px"><span style="color:#64748b">Professional Tax</span><span style="font-weight:600;color:#ef4444">- ${fmt(emp.pt)}</span></div>
    <div class="total-row"><span>Total Deductions</span><span style="color:#ef4444">- ${fmt(emp.deductions)}</span></div>
  </div>
</div>

<div class="net-box">
  <div>
    <div style="font-size:12px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.5px">Net Pay (Take-Home)</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">After all statutory deductions &bull; ${month}</div>
  </div>
  <div style="font-size:26px;font-weight:900;color:#10b981">${fmt(emp.net)}</div>
</div>

<div class="footer">This is a system-generated payslip from JWithKP HRMS. No signature required.</div>
<script>window.print(); window.onafterprint = function() { window.close(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=700,height=900");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

function PayslipModal({ emp, month, onClose }: { emp: Employee; month: string; onClose: () => void }) {
  const color = avatarColor(emp.name);
  const specialAllowance = Math.max(0, emp.gross - emp.basic - emp.hra - emp.conveyance);
  const deductionRows: Array<[string, number]> = [
    ["Provident Fund (12%)", emp.pf],
    ...(emp.esi > 0 ? [["ESI (0.75%)", emp.esi] as [string, number]] : []),
    ["TDS (New Regime)", emp.tds],
    ["Professional Tax", emp.pt],
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
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
            {([
              ["Basic Salary", emp.basic],
              ["HRA", emp.hra],
              ["Conveyance", emp.conveyance],
              ...(specialAllowance > 0 ? [["Special Allowance", specialAllowance]] : []),
            ] as Array<[string, number]>).map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(val)}</span>
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
            {deductionRows.map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--red)" }}>- {fmt(val)}</span>
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
          <button className="btn btn-primary" onClick={() => downloadPayslipPDF(emp, month)}>
            Download PDF
          </button>
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
  const { currentUser, isAdmin, months: loaderMonths, payrollByMonth, salaryConfigs: initialSalaryConfigs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const salaryFetcher = useFetcher<ActionData>();
  const availableMonths = loaderMonths;
  const [month, setMonth] = useState(availableMonths[0] ?? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date()));
  const [selectedPayslip, setSelectedPayslip] = useState<Employee | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [payrollTab, setPayrollTab] = useState<"register" | "salary">("register");
  const [salaryConfigs, setSalaryConfigs] = useState<SalaryConfig[]>(initialSalaryConfigs);

  // Inline edit state: userId -> draft ctc string
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editCtcValue, setEditCtcValue] = useState("");

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

  useEffect(() => {
    const data = salaryFetcher.data;
    if (!data) return;
    if (data.message) showToast(data.message);
    if (data.ok && editingUserId) {
      const newCtc = Number(editCtcValue) || 0;
      setSalaryConfigs((prev) =>
        prev.map((c) => c.user_id === editingUserId ? { ...c, annual_ctc: newCtc } : c)
      );
      setEditingUserId(null);
      setEditCtcValue("");
    }
  }, [salaryFetcher.data]);

  const handleSalarySave = (userId: string) => {
    const ctc = Number(editCtcValue);
    if (!ctc || ctc <= 0) {
      showToast("Please enter a valid CTC amount.");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "set-salary");
    fd.set("userId", userId);
    fd.set("annualCtc", String(Math.round(ctc)));
    salaryFetcher.submit(fd, { method: "POST" });
  };

  const allRows = payrollByMonth[month] ?? [];
  // Employees only see their own row; admins see all
  const rows = isAdmin ? allRows : allRows.filter((e) => e.id === currentUser.id);

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
          <div className="page-sub">{isAdmin ? "Process and manage monthly salary disbursements from D1 records." : "View your payslip and salary breakdown."}</div>
        </div>
        {isAdmin && (
          <Form method="post" style={{ display: "flex", gap: 10 }}>
            <input type="hidden" name="intent" value="run-payroll" />
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontWeight: 600 }}>
              {availableMonths.length === 0 ? <option>{month}</option> : null}
              {availableMonths.map((m) => <option key={m}>{m}</option>)}
            </select>
            <input type="hidden" name="month" value={month} />
            <button className="btn btn-primary" type="submit">Run Payroll</button>
          </Form>
        )}
        {!isAdmin && (
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontWeight: 600 }}>
            {availableMonths.length === 0 ? <option>{month}</option> : null}
            {availableMonths.map((m) => <option key={m}>{m}</option>)}
          </select>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div className="stat-label">{isAdmin ? "Gross Payroll" : "Gross Salary"}</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{fmt(totalGross)}</div>
          <div className="stat-delta">{isAdmin ? "Generated from current payroll month rows" : "Your gross for this month"}</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--green)" }}>
          <div className="stat-label">{isAdmin ? "Net Disbursed" : "Net Take-Home"}</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{fmt(totalNet)}</div>
          <div className="stat-delta" style={{ color: "var(--ink-3)" }}>After all deductions</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--amber)" }}>
          <div className="stat-label">Total Deductions</div>
          <div className="stat-value" style={{ fontSize: 22, color: "var(--amber)" }}>{fmt(totalDeductions)}</div>
          <div className="stat-delta" style={{ color: "var(--ink-3)" }}>PF + ESI + TDS + PT</div>
        </div>
        {isAdmin && (
          <div className="stat-card" style={{ borderTop: `3px solid ${pending > 0 ? "var(--red)" : "var(--green)"}` }}>
            <div className="stat-label">Pending Processing</div>
            <div className="stat-value" style={{ fontSize: 22, color: pending > 0 ? "var(--red)" : "var(--green)" }}>{pending}</div>
            <div className="stat-delta delta-down">{pending > 0 ? "Requires action" : "All processed"}</div>
          </div>
        )}
        {!isAdmin && (
          <div className="stat-card" style={{ borderTop: "3px solid var(--accent)" }}>
            <div className="stat-label">Pay Status</div>
            <div className="stat-value" style={{ fontSize: 22, color: rows[0]?.status === "Processed" ? "var(--green)" : "var(--amber)" }}>
              {rows[0]?.status ?? "—"}
            </div>
            <div className="stat-delta">{month}</div>
          </div>
        )}
      </div>

      {/* Tab bar — only shown for admins (employees have a single view) */}
      {isAdmin && (
        <div className="tab-bar" style={{ marginTop: 24 }}>
          <button className={`tab-btn ${payrollTab === "register" ? "active" : ""}`} onClick={() => setPayrollTab("register")}>
            Payroll Register
          </button>
          <button className={`tab-btn ${payrollTab === "salary" ? "active" : ""}`} onClick={() => setPayrollTab("salary")}>
            Salary Setup
          </button>
        </div>
      )}
      {!isAdmin && <div style={{ marginTop: 24 }} />}

      {/* Payroll Register tab */}
      {payrollTab === "register" && (
        <>
          <div className="two-col" style={{ marginBottom: 0 }}>
            {/* Payroll register */}
            <div className="card" style={{ gridColumn: "1/-1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div className="card-title" style={{ margin: 0 }}>
                  {isAdmin ? `Payroll Register — ${month} (${rows.length} employees)` : `My Payslip — ${month}`}
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => exportCSV(rows, month)}>Export CSV</button>
                    <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => window.print()}>Print</button>
                  </div>
                )}
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
                      <td style={{ color: e.basic === 0 ? "var(--ink-3)" : undefined }}>{e.basic > 0 ? fmt(e.basic) : "—"}</td>
                      <td style={{ color: e.hra === 0 ? "var(--ink-3)" : undefined }}>{e.hra > 0 ? fmt(e.hra) : "—"}</td>
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
                          Payslip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!isAdmin && rows.some(e => e.basic === 0 && e.hra === 0) && (
                <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", marginTop: 12, marginBottom: 4 }}>
                  ⚠️ Basic and HRA show ₹0 because your Annual CTC has not been configured yet. Contact HR to set up your salary.
                </div>
              )}
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

          {/* Dept breakdown — admin only */}
          {isAdmin && <div className="card">
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
          </div>}
        </>
      )}

      {/* Salary Setup tab */}
      {payrollTab === "salary" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Employee Salary Configuration</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Set Annual CTC for each employee to enable payroll computation.
            </div>
          </div>

          {salaryConfigs.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "16px 0" }}>
              No employees found. Invite employees first.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Annual CTC</th>
                  <th>Monthly Take-Home (est.)</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaryConfigs.map((c) => {
                  const isEditing = editingUserId === c.user_id;
                  const takeHome = monthlyTakeHome(c.annual_ctc);
                  return (
                    <tr key={c.user_id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="avatar-sm" style={{ background: avatarColor(c.name) }}>
                            {getInitials(c.name)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13 }}>{c.department || "—"}</td>
                      <td style={{ fontWeight: 700, color: c.annual_ctc > 0 ? "var(--ink)" : "var(--ink-3)" }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editCtcValue}
                            onChange={(e) => setEditCtcValue(e.target.value)}
                            placeholder="Annual CTC in INR"
                            style={{
                              width: 160, padding: "6px 10px", border: "1.5px solid var(--accent)",
                              borderRadius: 7, fontSize: 13, background: "white", color: "var(--ink)",
                            }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSalarySave(c.user_id);
                              if (e.key === "Escape") { setEditingUserId(null); setEditCtcValue(""); }
                            }}
                          />
                        ) : (
                          fmtCtc(c.annual_ctc)
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: takeHome > 0 ? "var(--green)" : "var(--ink-3)" }}>
                        {takeHome > 0 ? fmt(takeHome) + "/mo" : "—"}
                      </td>
                      <td style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {c.salary_updated_at ? new Date(c.salary_updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-success"
                              style={{ padding: "4px 12px", fontSize: 12 }}
                              onClick={() => handleSalarySave(c.user_id)}
                              disabled={salaryFetcher.state !== "idle"}
                            >
                              {salaryFetcher.state !== "idle" ? "Saving..." : "Save"}
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              onClick={() => { setEditingUserId(null); setEditCtcValue(""); }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-outline"
                            style={{ padding: "4px 12px", fontSize: 12 }}
                            onClick={() => {
                              setEditingUserId(c.user_id);
                              setEditCtcValue(c.annual_ctc > 0 ? String(c.annual_ctc) : "");
                            }}
                          >
                            Edit CTC
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--surface)", borderRadius: 10, fontSize: 12, color: "var(--ink-3)" }}>
            Monthly take-home is estimated using Indian statutory deductions: PF (12% of basic, capped at ₹1,800), ESI (0.75% if gross ≤ ₹21k), TDS (New Tax Regime FY 2025-26 slabs + 4% cess), PT (₹200). Actual amounts may vary based on declarations.
          </div>
        </div>
      )}
    </HRMSLayout>
  );
}
