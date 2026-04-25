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

interface SalaryHistoryRow {
  id: string;
  user_id?: string;
  employee_name?: string;
  annual_ctc: number;
  effective_from: string;
  reason: string | null;
  changed_by_name: string | null;
  created_at: string;
}

// ── Payslip history & breakdown types ────────────────────────────────────────

interface BreakdownJson {
  grossBeforeLop: number;
  grossAfterLop: number;
  netPay: number;
  totalEmployeeDeductions: number;
  totalEmployerCost: number;
  pf: {
    employeeContribution: number;
    employerEpfContribution: number;
    totalEmployerContribution: number;
    employerEpsContribution: number;
    pfWage: number;
  };
  esi: {
    applicable: boolean;
    grossWage: number;
    employeeContribution: number;
    employerContribution: number;
  };
  pt: { state: string; monthlyPt: number };
  tds: {
    monthlyTds: number;
    annualTax: number;
    annualTaxBeforeCess: number;
    annualTaxableIncome: number;
  };
  lwf: { annual: number; employee: number; employer: number; prorated: number };
  lop: { days: number; workingDays: number; deductionAmount: number };
  components: {
    basic: number;
    hra: number;
    conveyanceAllowance: number;
    medicalAllowance: number;
    lta: number;
    specialAllowance: number;
    otherAllowances: number;
  };
}

interface PayslipHistoryItem {
  month_key: string;
  gross: number;
  deductions: number;
  net: number;
  status: string;
  basic: number;
  hra: number;
  conveyance: number;
  pf: number;
  esi: number;
  tds: number;
  pt: number;
  breakdown_json: string | null;
  esi_employee: number;
  lwf_employee: number;
  lop_days: number;
  lop_deduction: number;
  pf_employer: number;
  esi_employer: number;
  lwf_employer: number;
  name: string;
  dept: string;
}

interface SalaryStructure {
  id: string;
  user_id: string;
  user_name: string;
  basic_pct: number;
  hra_pct: number;
  conveyance: number;
  lta: number;
  medical_allowance: number;
  special_allowance_pct: number;
  effective_from: string;
}

interface PayrollRunStatus {
  monthKey: string;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  finalized: boolean;
  finalized_by: string | null;
  finalized_at: string | null;
  disbursed: boolean;
  disbursed_by: string | null;
  disbursed_at: string | null;
  status: string;
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
    return { currentUser, isAdmin: isAdminRole(currentUser.role), months: [], payrollByMonth: {} as Record<string, Employee[]>, salaryConfigs: [] as SalaryConfig[], salaryStructures: [] as SalaryStructure[] };
  }

  const payroll = await getPayrollDashboard(context.cloudflare.env.HRMS, tenantId);

  const salaryResponse = await callCoreHrmsApi<{ configs?: SalaryConfig[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/salary-configs",
  });
  const salaryConfigs = salaryResponse?.configs ?? [];

  const structRes = await callCoreHrmsApi<{ structures?: SalaryStructure[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/salary-structures",
  });
  const salaryStructures = structRes?.structures ?? [];

  return {
    currentUser,
    isAdmin: isAdminRole(currentUser.role),
    months: payroll.months,
    payrollByMonth: payroll.payrollByMonth,
    salaryConfigs,
    salaryStructures,
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
        empRows.results.map(async (emp: { id: string; name: string; email: string; gross_pay: number | null; net_pay: number | null; total_deductions: number | null }) => {
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

    // Notify HR managers about upcoming statutory filing deadlines
    try {
      const db = context.cloudflare.env.HRMS;
      const [y, m] = result.monthKey.split("-").map(Number);
      const nextMonth = new Date(Date.UTC(y, m, 1));
      const yyyy = nextMonth.getUTCFullYear();
      const mm = String(nextMonth.getUTCMonth() + 1).padStart(2, "0");
      const ecrDue = `${yyyy}-${mm}-15`;
      const tdsDue = `${yyyy}-${mm}-07`;
      const ptDue  = `${yyyy}-${mm}-15`;

      const hrManagers = await db
        .prepare(
          `SELECT id FROM users
           WHERE COALESCE(company_id, org_id) = ?
             AND LOWER(role) IN ('admin','hr admin','hr_admin','hr manager','hr_manager','finance','payroll manager')
             AND LOWER(COALESCE(status,'active')) NOT IN ('inactive','disabled')`,
        )
        .bind(tenantId)
        .all<{ id: string }>();

      await Promise.all(
        hrManagers.results.map((hr: { id: string }) =>
          createNotification(db, {
            companyId: tenantId,
            userId: hr.id,
            type: "compliance_reminder",
            title: "📋 Statutory Filing Deadlines Approaching",
            body: `Payroll for ${result.month} is processed. File ECR by ${ecrDue}, TDS by ${tdsDue}, PT by ${ptDue}.`,
            link: "/hrms/settings",
          }),
        ),
      );
    } catch {
      // Compliance notification failure should not block payroll response
    }

    return {
      ok: true,
      message: `Payroll generated for ${result.month}. Processed: ${result.processed}, Pending: ${result.pending}.`,
    };
  }

  if (intent === "set-salary") {
    const userId = String(formData.get("userId") || "").trim();
    const annualCtc = Number(formData.get("annualCtc") || 0);
    const reason = String(formData.get("reason") || "").trim();
    if (!userId || annualCtc <= 0) return { ok: false, message: "User and salary are required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/salary-configs",
      method: "POST",
      body: { userId, annualCtc, reason: reason || undefined },
    });
    return { ok: res?.ok ?? false, message: res?.error || `Salary updated for employee.` };
  }

  if (intent === "lock-payroll") {
    const monthKey = String(formData.get("monthKey") || "").trim();
    if (!monthKey) return { ok: false, message: "Month key required." };
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/payroll/lock", method: "POST", body: { monthKey },
    });
    return { ok: res?.ok ?? false, message: res?.error ?? "Payroll locked." };
  }

  if (intent === "unlock-payroll") {
    const monthKey = String(formData.get("monthKey") || "").trim();
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/payroll/unlock", method: "POST", body: { monthKey },
    });
    return { ok: res?.ok ?? false, message: res?.error ?? "Payroll unlocked." };
  }

  if (intent === "finalize-payroll") {
    const monthKey = String(formData.get("monthKey") || "").trim();
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/payroll/finalize", method: "POST", body: { monthKey },
    });
    return { ok: res?.ok ?? false, message: res?.error ?? "Payroll finalized." };
  }

  if (intent === "disburse-payroll") {
    const monthKey = String(formData.get("monthKey") || "").trim();
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/payroll/disburse", method: "POST", body: { monthKey },
    });
    return { ok: res?.ok ?? false, message: res?.error ?? "Payroll disbursed." };
  }

  if (intent === "set-salary-structure") {
    const userId = String(formData.get("userId") || "").trim();
    const basicPct = Number(formData.get("basicPct") || 50);
    const hraPct = Number(formData.get("hraPct") || 20);
    const conveyance = Number(formData.get("conveyance") || 1600);
    const lta = Number(formData.get("lta") || 0);
    const medicalAllowance = Number(formData.get("medicalAllowance") || 0);
    const specialAllowancePct = Number(formData.get("specialAllowancePct") || 0);
    const effectiveFrom = String(formData.get("effectiveFrom") || new Date().toISOString().slice(0, 10));
    if (!userId) return { ok: false, message: "User required." };
    const res = await callCoreHrmsApi<{ ok: boolean; error?: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/salary-structures", method: "POST",
      body: { userId, basicPct, hraPct, conveyance, lta, medicalAllowance, specialAllowancePct, effectiveFrom },
    });
    return { ok: res?.ok ?? false, message: res?.error ?? "Salary structure updated." };
  }

  return { ok: false, message: "Unsupported payroll action." };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseBreakdown(json: string | null | undefined): BreakdownJson | null {
  if (!json) return null;
  try { return JSON.parse(json) as BreakdownJson; } catch { return null; }
}

function formatMonthKey(key: string): string {
  try {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  } catch { return key; }
}

// ── Rich payslip PDF using breakdown_json ──────────────────────────────────

function downloadPayslipRich(item: PayslipHistoryItem) {
  const breakdown = parseBreakdown(item.breakdown_json);
  const monthLabel = formatMonthKey(item.month_key);
  const color = avatarColor(item.name);
  const generatedDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  // Build earnings rows from breakdown.components when available
  const components = breakdown?.components;
  const earningRows: Array<[string, number]> = components ? [
    ["Basic Salary", components.basic],
    ...(components.hra > 0 ? [["HRA", components.hra] as [string, number]] : []),
    ...(components.conveyanceAllowance > 0 ? [["Conveyance Allowance", components.conveyanceAllowance] as [string, number]] : []),
    ...(components.medicalAllowance > 0 ? [["Medical Allowance", components.medicalAllowance] as [string, number]] : []),
    ...(components.lta > 0 ? [["LTA", components.lta] as [string, number]] : []),
    ...(components.specialAllowance > 0 ? [["Special Allowance", components.specialAllowance] as [string, number]] : []),
    ...(components.otherAllowances > 0 ? [["Other Allowances", components.otherAllowances] as [string, number]] : []),
  ] : [
    ["Basic Salary", item.basic],
    ...(item.hra > 0 ? [["HRA", item.hra] as [string, number]] : []),
    ...(item.conveyance > 0 ? [["Conveyance", item.conveyance] as [string, number]] : []),
    ...(Math.max(0, item.gross - item.basic - item.hra - item.conveyance) > 0 ? [["Special Allowance", Math.max(0, item.gross - item.basic - item.hra - item.conveyance)] as [string, number]] : []),
  ];

  const lopDays = breakdown?.lop.days ?? item.lop_days ?? 0;
  const grossBeforeLop = breakdown?.grossBeforeLop ?? item.gross;
  const grossAfterLop = breakdown?.grossAfterLop ?? item.gross;

  const deductionRows: Array<[string, number]> = [
    ...(lopDays > 0 ? [[`LOP Deduction (${lopDays} day${lopDays > 1 ? "s" : ""})`, breakdown?.lop.deductionAmount ?? item.lop_deduction ?? 0] as [string, number]] : []),
    ["Provident Fund (12%)", breakdown?.pf.employeeContribution ?? item.pf],
    ...(((breakdown?.esi.employeeContribution ?? item.esi_employee ?? item.esi) > 0) ? [["ESI (0.75%)", breakdown?.esi.employeeContribution ?? item.esi_employee ?? item.esi] as [string, number]] : []),
    ...(((breakdown?.tds.monthlyTds ?? item.tds) > 0) ? [["Income Tax (TDS)", breakdown?.tds.monthlyTds ?? item.tds] as [string, number]] : []),
    ...(((breakdown?.pt.monthlyPt ?? item.pt) > 0) ? [["Professional Tax", breakdown?.pt.monthlyPt ?? item.pt] as [string, number]] : []),
    ...(((breakdown?.lwf.employee ?? item.lwf_employee ?? 0) > 0) ? [["LWF (Employee)", breakdown?.lwf.employee ?? item.lwf_employee ?? 0] as [string, number]] : []),
  ];

  const pfEmployer = breakdown?.pf.totalEmployerContribution ?? item.pf_employer ?? 0;
  const esiEmployer = breakdown?.esi.employerContribution ?? item.esi_employer ?? 0;
  const lwfEmployer = breakdown?.lwf.employer ?? item.lwf_employer ?? 0;
  const totalEmployerContrib = pfEmployer + esiEmployer + lwfEmployer;

  const rowHtml = (label: string, val: number, isDeduction = false, dimmed = false) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:${dimmed ? "#94a3b8" : "#475569"}">${label}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:${isDeduction ? "#dc2626" : "#0f172a"};text-align:right">${isDeduction ? "− " : ""}${fmt(val)}</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Payslip — ${item.name} — ${monthLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f0f4f8; min-height: 100vh; padding: 32px 24px; color: #0f172a; }
  .page { background: white; max-width: 720px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.12); }
  .header-band { background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); padding: 28px 36px; position: relative; overflow: hidden; }
  .header-band::before { content: ''; position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: rgba(99,102,241,0.15); }
  .brand { font-size: 22px; font-weight: 800; color: white; letter-spacing: -0.5px; }
  .brand span { color: #818cf8; }
  .payslip-meta { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 3px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 2px; }
  .header-right .value { font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 600; }
  .emp-card { padding: 24px 36px; background: white; border-bottom: 1px solid #e8edf5; display: flex; align-items: center; gap: 18px; }
  .avatar { width: 52px; height: 52px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px; flex-shrink: 0; border: 3px solid #e8edf5; }
  .emp-name { font-size: 18px; font-weight: 800; color: #0f172a; }
  .emp-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
  .net-highlight { margin-left: auto; text-align: right; }
  .net-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 3px; }
  .net-amount { font-size: 28px; font-weight: 900; color: #059669; letter-spacing: -1px; }
  .stats-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-bottom: 1px solid #e8edf5; }
  .stat-item { padding: 16px 24px; text-align: center; border-right: 1px solid #e8edf5; }
  .stat-item:last-child { border-right: none; }
  .stat-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #94a3b8; margin-bottom: 4px; }
  .stat-val { font-size: 16px; font-weight: 800; }
  .breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 28px 36px; }
  .col-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; padding: 6px 12px; border-radius: 6px; display: inline-block; }
  .earnings-title { background: #eff6ff; color: #2563eb; }
  .deductions-title { background: #fef2f2; color: #dc2626; }
  .breakdown-col:first-child { border-right: 1px solid #e8edf5; padding-right: 28px; }
  .breakdown-col:last-child { padding-left: 28px; }
  table.items { width: 100%; border-collapse: collapse; }
  .subtotal-row td { padding: 11px 0 0 0; font-size: 14px; font-weight: 800; }
  .net-box { margin: 0 36px 20px; padding: 20px 24px; background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-radius: 14px; border: 1.5px solid #a7f3d0; display: flex; justify-content: space-between; align-items: center; }
  .net-box-label { font-size: 14px; font-weight: 800; color: #065f46; }
  .net-box-sub { font-size: 11px; color: #6ee7b7; margin-top: 3px; }
  .net-box-amount { font-size: 32px; font-weight: 900; color: #059669; letter-spacing: -1.5px; }
  .employer-box { margin: 0 36px 24px; padding: 16px 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
  .employer-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #64748b; margin-bottom: 12px; }
  .employer-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid #e8edf5; }
  .employer-row:last-child { border-bottom: none; font-weight: 700; }
  .footer { padding: 16px 36px; background: #f8fafc; border-top: 1px solid #e8edf5; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 11px; color: #94a3b8; }
  .footer-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: #eff6ff; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; }
  @media print { body { background: white; padding: 0; } .page { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header-band" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div class="brand">JWith<span>KP</span> HRMS</div>
      <div class="payslip-meta">Payslip for ${monthLabel}</div>
    </div>
    <div class="header-right" style="position:relative;z-index:1">
      <div class="label">Generated on</div>
      <div class="value">${generatedDate}</div>
      <div class="label" style="margin-top:10px">Period</div>
      <div class="value">${monthLabel}</div>
    </div>
  </div>
  <div class="emp-card">
    <div class="avatar">${getInitials(item.name)}</div>
    <div>
      <div class="emp-name">${item.name}</div>
      <div class="emp-meta">${item.dept}</div>
    </div>
    <div class="net-highlight">
      <div class="net-label">Net Take-Home</div>
      <div class="net-amount">${fmt(item.net)}</div>
    </div>
  </div>
  <div class="stats-row">
    <div class="stat-item">
      <div class="stat-lbl">Gross${lopDays > 0 ? " (before LOP)" : ""}</div>
      <div class="stat-val" style="color:#6366f1">${fmt(lopDays > 0 ? grossBeforeLop : item.gross)}</div>
    </div>
    <div class="stat-item">
      <div class="stat-lbl">Total Deductions</div>
      <div class="stat-val" style="color:#ef4444">− ${fmt(item.deductions)}</div>
    </div>
    <div class="stat-item">
      <div class="stat-lbl">Net Pay</div>
      <div class="stat-val" style="color:#059669">${fmt(item.net)}</div>
    </div>
  </div>
  <div class="breakdown">
    <div class="breakdown-col">
      <div><span class="col-title earnings-title">📈 Earnings</span></div>
      <table class="items">
        ${lopDays > 0 ? `
        ${earningRows.map(([l, v]) => rowHtml(l, v)).join("")}
        <tr style="background:#fffbeb"><td style="padding:7px 0;border-bottom:1px solid #fde68a;font-size:12px;color:#92400e">LOP Deduction (${lopDays} day${lopDays > 1 ? "s" : ""})</td><td style="padding:7px 0;border-bottom:1px solid #fde68a;font-size:12px;font-weight:600;color:#dc2626;text-align:right">− ${fmt(breakdown?.lop.deductionAmount ?? item.lop_deduction ?? 0)}</td></tr>
        <tr class="subtotal-row"><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#0f172a">Gross (after LOP)</td><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#6366f1;text-align:right">${fmt(grossAfterLop)}</td></tr>
        ` : `
        ${earningRows.map(([l, v]) => rowHtml(l, v)).join("")}
        <tr class="subtotal-row"><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#0f172a">Gross Earnings</td><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#6366f1;text-align:right">${fmt(item.gross)}</td></tr>
        `}
      </table>
    </div>
    <div class="breakdown-col">
      <div><span class="col-title deductions-title">📉 Deductions</span></div>
      <table class="items">
        ${deductionRows.filter(([, v]) => v > 0).map(([l, v]) => rowHtml(l, v, true)).join("")}
        <tr class="subtotal-row"><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#0f172a">Total Deductions</td><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#dc2626;text-align:right">− ${fmt(item.deductions)}</td></tr>
      </table>
    </div>
  </div>
  <div class="net-box">
    <div>
      <div class="net-box-label">💸 Net Pay (Take-Home)</div>
      <div class="net-box-sub">After all statutory deductions · ${monthLabel}</div>
    </div>
    <div class="net-box-amount">${fmt(item.net)}</div>
  </div>
  ${totalEmployerContrib > 0 ? `
  <div class="employer-box">
    <div class="employer-title">Employer Contributions (not deducted from your salary)</div>
    ${pfEmployer > 0 ? `<div class="employer-row"><span style="color:#475569">Employer PF (EPF + EPS)</span><span style="color:#0f172a;font-weight:600">${fmt(pfEmployer)}</span></div>` : ""}
    ${esiEmployer > 0 ? `<div class="employer-row"><span style="color:#475569">Employer ESI (3.25%)</span><span style="color:#0f172a;font-weight:600">${fmt(esiEmployer)}</span></div>` : ""}
    ${lwfEmployer > 0 ? `<div class="employer-row"><span style="color:#475569">LWF (Employer)</span><span style="color:#0f172a;font-weight:600">${fmt(lwfEmployer)}</span></div>` : ""}
    <div class="employer-row"><span>Total Employer Cost</span><span style="color:#0f172a">${fmt(item.net + item.deductions + totalEmployerContrib)}</span></div>
  </div>
  ` : ""}
  <div class="footer">
    <div class="footer-left">This is a computer-generated payslip and does not require a signature.</div>
    <div class="footer-badge">JWithKP HRMS</div>
  </div>
</div>
<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 300); }); window.onafterprint = function() { window.close(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=780,height=1000");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

// ── Rich payslip detail modal (for history view) ───────────────────────────

function PayslipDetailModal({ item, onClose }: { item: PayslipHistoryItem; onClose: () => void }) {
  const breakdown = parseBreakdown(item.breakdown_json);
  const monthLabel = formatMonthKey(item.month_key);
  const color = avatarColor(item.name);

  const components = breakdown?.components;
  const lopDays = breakdown?.lop.days ?? item.lop_days ?? 0;
  const grossAfterLop = breakdown?.grossAfterLop ?? item.gross;
  const grossBeforeLop = breakdown?.grossBeforeLop ?? item.gross;

  const earningRows: Array<[string, number]> = components ? [
    ["Basic Salary", components.basic],
    ...(components.hra > 0 ? [["HRA", components.hra] as [string, number]] : []),
    ...(components.conveyanceAllowance > 0 ? [["Conveyance Allowance", components.conveyanceAllowance] as [string, number]] : []),
    ...(components.medicalAllowance > 0 ? [["Medical Allowance", components.medicalAllowance] as [string, number]] : []),
    ...(components.lta > 0 ? [["LTA", components.lta] as [string, number]] : []),
    ...(components.specialAllowance > 0 ? [["Special Allowance", components.specialAllowance] as [string, number]] : []),
  ] : [
    ["Basic Salary", item.basic],
    ...(item.hra > 0 ? [["HRA", item.hra] as [string, number]] : []),
    ...(item.conveyance > 0 ? [["Conveyance", item.conveyance] as [string, number]] : []),
    ...(Math.max(0, item.gross - item.basic - item.hra - item.conveyance) > 0 ? [["Special Allowance", Math.max(0, item.gross - item.basic - item.hra - item.conveyance)] as [string, number]] : []),
  ];

  const pfEmployee = breakdown?.pf.employeeContribution ?? item.pf;
  const esiEmployee = breakdown?.esi.employeeContribution ?? item.esi_employee ?? item.esi;
  const tdsAmount = breakdown?.tds.monthlyTds ?? item.tds;
  const ptAmount = breakdown?.pt.monthlyPt ?? item.pt;
  const lwfEmployee = breakdown?.lwf.employee ?? item.lwf_employee ?? 0;
  const pfEmployer = breakdown?.pf.totalEmployerContribution ?? item.pf_employer ?? 0;
  const esiEmployer = breakdown?.esi.employerContribution ?? item.esi_employer ?? 0;
  const lwfEmployer = breakdown?.lwf.employer ?? item.lwf_employer ?? 0;
  const totalEmployerContrib = pfEmployer + esiEmployer + lwfEmployer;

  const deductionRows: Array<[string, number]> = [
    ...(lopDays > 0 ? [[`LOP (${lopDays} day${lopDays > 1 ? "s" : ""})`, breakdown?.lop.deductionAmount ?? item.lop_deduction ?? 0] as [string, number]] : []),
    ...(pfEmployee > 0 ? [["Provident Fund (12%)", pfEmployee] as [string, number]] : []),
    ...(esiEmployee > 0 ? [["ESI (0.75%)", esiEmployee] as [string, number]] : []),
    ...(tdsAmount > 0 ? [["Income Tax (TDS)", tdsAmount] as [string, number]] : []),
    ...(ptAmount > 0 ? [["Professional Tax", ptAmount] as [string, number]] : []),
    ...(lwfEmployee > 0 ? [["LWF (Employee)", lwfEmployee] as [string, number]] : []),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 560, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Payslip — {monthLabel}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Employee info */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "var(--surface)", borderRadius: 12, marginBottom: 18 }}>
          <span className="avatar-sm" style={{ background: color, width: 40, height: 40, fontSize: 14 }}>
            {getInitials(item.name)}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{item.name}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{item.dept} · {monthLabel}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>Net Pay</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)" }}>{fmt(item.net)}</div>
          </div>
        </div>

        {/* LOP notice */}
        {lopDays > 0 && (
          <div style={{ padding: "8px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 14 }}>
            ⚠️ LOP applied: {lopDays} day{lopDays > 1 ? "s" : ""} unpaid leave — gross reduced from {fmt(grossBeforeLop)} to {fmt(grossAfterLop)}
          </div>
        )}

        {/* Earnings & Deductions grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>Earnings</div>
            {earningRows.map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(val)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", fontSize: 14, fontWeight: 800 }}>
              <span>Gross{lopDays > 0 ? " (after LOP)" : ""}</span>
              <span style={{ color: "var(--accent)" }}>{fmt(grossAfterLop)}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)", marginBottom: 10 }}>Deductions</div>
            {deductionRows.map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>{label}</span>
                <span style={{ fontWeight: 600, color: "var(--red)" }}>- {fmt(val)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", fontSize: 14, fontWeight: 800 }}>
              <span>Total Deductions</span>
              <span style={{ color: "var(--red)" }}>- {fmt(item.deductions)}</span>
            </div>
          </div>
        </div>

        {/* Net Pay box */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "var(--green-light)", borderRadius: 12, border: "1px solid #a7f3d0", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Net Pay (Take-Home)</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>After all deductions · {monthLabel}</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--green)" }}>{fmt(item.net)}</div>
        </div>

        {/* Employer contributions */}
        {totalEmployerContrib > 0 && (
          <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b", marginBottom: 10 }}>
              Employer Contributions (not deducted from salary)
            </div>
            {pfEmployer > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #e8edf5" }}>
                <span style={{ color: "#475569" }}>Employer PF (EPF + EPS)</span>
                <span style={{ fontWeight: 600 }}>{fmt(pfEmployer)}</span>
              </div>
            )}
            {esiEmployer > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #e8edf5" }}>
                <span style={{ color: "#475569" }}>Employer ESI (3.25%)</span>
                <span style={{ fontWeight: 600 }}>{fmt(esiEmployer)}</span>
              </div>
            )}
            {lwfEmployer > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #e8edf5" }}>
                <span style={{ color: "#475569" }}>LWF (Employer)</span>
                <span style={{ fontWeight: 600 }}>{fmt(lwfEmployer)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0 0", fontWeight: 700 }}>
              <span>Total CTC Cost (est.)</span>
              <span style={{ color: "var(--ink)" }}>{fmt(item.net + item.deductions + totalEmployerContrib)}</span>
            </div>
          </div>
        )}

        {/* TDS annualized detail */}
        {breakdown && breakdown.tds.annualTaxableIncome > 0 && (
          <div style={{ padding: "10px 14px", background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe", marginBottom: 14, fontSize: 12, color: "#1e40af" }}>
            <span style={{ fontWeight: 700 }}>TDS detail:</span> Annual taxable income ₹{breakdown.tds.annualTaxableIncome.toLocaleString("en-IN")} · Annual tax ₹{breakdown.tds.annualTax.toLocaleString("en-IN")} · Monthly TDS ₹{breakdown.tds.monthlyTds.toLocaleString("en-IN")}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button className="btn btn-primary" onClick={() => downloadPayslipRich(item)}>Download PDF</button>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Original basic payslip PDF (for payroll register view) ─────────────────

function downloadPayslipPDF(emp: Employee, month: string) {
  const color = avatarColor(emp.name);
  const esiRow = emp.esi > 0
    ? `<tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">ESI (0.75%)</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#dc2626;text-align:right">− ${fmt(emp.esi)}</td></tr>`
    : "";
  const specialAllowance = Math.max(0, emp.gross - emp.basic - emp.hra - emp.conveyance);
  const specialRow = specialAllowance > 0
    ? `<tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">Special Allowance</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#0f172a;text-align:right">${fmt(specialAllowance)}</td></tr>`
    : "";
  const generatedDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Payslip — ${emp.name} — ${month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f0f4f8; min-height: 100vh; padding: 32px 24px; color: #0f172a; }
  .page { background: white; max-width: 720px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.12); }

  /* Header band */
  .header-band { background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); padding: 28px 36px; position: relative; overflow: hidden; }
  .header-band::before { content: ''; position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: rgba(99,102,241,0.15); }
  .header-band::after { content: ''; position: absolute; bottom: -60px; right: 60px; width: 120px; height: 120px; border-radius: 50%; background: rgba(16,185,129,0.1); }
  .brand { font-size: 22px; font-weight: 800; color: white; letter-spacing: -0.5px; }
  .brand span { color: #818cf8; }
  .payslip-meta { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 3px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 2px; }
  .header-right .value { font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 600; }

  /* Employee card */
  .emp-card { padding: 24px 36px; background: white; border-bottom: 1px solid #e8edf5; display: flex; align-items: center; gap: 18px; }
  .avatar { width: 52px; height: 52px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px; flex-shrink: 0; border: 3px solid #e8edf5; }
  .emp-name { font-size: 18px; font-weight: 800; color: #0f172a; }
  .emp-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
  .net-highlight { margin-left: auto; text-align: right; }
  .net-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 3px; }
  .net-amount { font-size: 28px; font-weight: 900; color: #059669; letter-spacing: -1px; }

  /* Stats row */
  .stats-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-bottom: 1px solid #e8edf5; }
  .stat-item { padding: 16px 24px; text-align: center; border-right: 1px solid #e8edf5; }
  .stat-item:last-child { border-right: none; }
  .stat-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #94a3b8; margin-bottom: 4px; }
  .stat-val { font-size: 16px; font-weight: 800; }

  /* Breakdown */
  .breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 28px 36px; }
  .col-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; padding: 6px 12px; border-radius: 6px; display: inline-block; }
  .earnings-title { background: #eff6ff; color: #2563eb; }
  .deductions-title { background: #fef2f2; color: #dc2626; }
  .breakdown-col:first-child { border-right: 1px solid #e8edf5; padding-right: 28px; }
  .breakdown-col:last-child { padding-left: 28px; }
  table.items { width: 100%; border-collapse: collapse; }
  .subtotal-row td { padding: 11px 0 0 0; font-size: 14px; font-weight: 800; }

  /* Net Pay Box */
  .net-box { margin: 0 36px 28px; padding: 20px 24px; background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-radius: 14px; border: 1.5px solid #a7f3d0; display: flex; justify-content: space-between; align-items: center; }
  .net-box-label { font-size: 14px; font-weight: 800; color: #065f46; letter-spacing: -0.2px; }
  .net-box-sub { font-size: 11px; color: #6ee7b7; margin-top: 3px; }
  .net-box-amount { font-size: 32px; font-weight: 900; color: #059669; letter-spacing: -1.5px; }

  /* Footer */
  .footer { padding: 16px 36px; background: #f8fafc; border-top: 1px solid #e8edf5; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 11px; color: #94a3b8; }
  .footer-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: #eff6ff; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; }

  @media print {
    body { background: white; padding: 0; }
    .page { box-shadow: none; border-radius: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header-band" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div class="brand">JWith<span>KP</span> HRMS</div>
      <div class="payslip-meta">Payslip for ${month}</div>
    </div>
    <div class="header-right" style="position:relative;z-index:1">
      <div class="label">Generated on</div>
      <div class="value">${generatedDate}</div>
      <div class="label" style="margin-top:10px">Period</div>
      <div class="value">${month}</div>
    </div>
  </div>

  <!-- Employee -->
  <div class="emp-card">
    <div class="avatar">${getInitials(emp.name)}</div>
    <div>
      <div class="emp-name">${emp.name}</div>
      <div class="emp-meta">${emp.id} &nbsp;·&nbsp; ${emp.dept}</div>
    </div>
    <div class="net-highlight">
      <div class="net-label">Net Take-Home</div>
      <div class="net-amount">${fmt(emp.net)}</div>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-row">
    <div class="stat-item">
      <div class="stat-lbl">Gross Earnings</div>
      <div class="stat-val" style="color:#6366f1">${fmt(emp.gross)}</div>
    </div>
    <div class="stat-item">
      <div class="stat-lbl">Total Deductions</div>
      <div class="stat-val" style="color:#ef4444">− ${fmt(emp.deductions)}</div>
    </div>
    <div class="stat-item">
      <div class="stat-lbl">Net Pay</div>
      <div class="stat-val" style="color:#059669">${fmt(emp.net)}</div>
    </div>
  </div>

  <!-- Breakdown -->
  <div class="breakdown">
    <div class="breakdown-col">
      <div><span class="col-title earnings-title">📈 Earnings</span></div>
      <table class="items">
        <tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">Basic Salary</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#0f172a;text-align:right">${fmt(emp.basic)}</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">HRA</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#0f172a;text-align:right">${fmt(emp.hra)}</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">Conveyance</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#0f172a;text-align:right">${fmt(emp.conveyance)}</td></tr>
        ${specialRow}
        <tr class="subtotal-row"><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#0f172a">Gross Earnings</td><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#6366f1;text-align:right">${fmt(emp.gross)}</td></tr>
      </table>
    </div>
    <div class="breakdown-col">
      <div><span class="col-title deductions-title">📉 Deductions</span></div>
      <table class="items">
        <tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">Provident Fund (12%)</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#dc2626;text-align:right">− ${fmt(emp.pf)}</td></tr>
        ${esiRow}
        <tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">Income Tax (TDS)</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#dc2626;text-align:right">− ${fmt(emp.tds)}</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;color:#475569">Professional Tax</td><td style="padding:9px 0;border-bottom:1px solid #e8edf5;font-size:13px;font-weight:600;color:#dc2626;text-align:right">− ${fmt(emp.pt)}</td></tr>
        <tr class="subtotal-row"><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#0f172a">Total Deductions</td><td style="padding:11px 0 0;font-size:14px;font-weight:800;color:#dc2626;text-align:right">− ${fmt(emp.deductions)}</td></tr>
      </table>
    </div>
  </div>

  <!-- Net Pay -->
  <div class="net-box">
    <div>
      <div class="net-box-label">💸 Net Pay (Take-Home)</div>
      <div class="net-box-sub">After all statutory deductions &nbsp;·&nbsp; ${month}</div>
    </div>
    <div class="net-box-amount">${fmt(emp.net)}</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">This is a computer-generated payslip and does not require a signature.</div>
    <div class="footer-badge">JWithKP HRMS</div>
  </div>
</div>
<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 300); }); window.onafterprint = function() { window.close(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=780,height=950");
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
    ["Income Tax (TDS)", emp.tds],
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
  const { currentUser, isAdmin, months: loaderMonths, payrollByMonth, salaryConfigs: initialSalaryConfigs, salaryStructures: initialSalaryStructures } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const salaryFetcher = useFetcher<ActionData>();
  const lifecycleFetcher = useFetcher<ActionData>();
  const structureFetcher = useFetcher<ActionData>();
  const runStatusFetcher = useFetcher<{ run?: PayrollRunStatus }>();
  const availableMonths = loaderMonths;
  const [month, setMonth] = useState(availableMonths[0] ?? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date()));
  const [selectedPayslip, setSelectedPayslip] = useState<Employee | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [payrollTab, setPayrollTab] = useState<"register" | "salary" | "structure" | "history" | "payslips">("register");
  const [salaryConfigs, setSalaryConfigs] = useState<SalaryConfig[]>(initialSalaryConfigs);
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>(initialSalaryStructures ?? []);
  const [payrollRunStatus, setPayrollRunStatus] = useState<PayrollRunStatus | null>(null);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [structureForm, setStructureForm] = useState({ basicPct: 50, hraPct: 20, conveyance: 1600, lta: 0, medicalAllowance: 0, specialAllowancePct: 0, effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);

  // Employee self-service payslip history
  const [myPayslips, setMyPayslips] = useState<PayslipHistoryItem[]>([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [selectedHistoryPayslip, setSelectedHistoryPayslip] = useState<PayslipHistoryItem | null>(null);

  // Inline edit state: userId -> draft ctc string
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editCtcValue, setEditCtcValue] = useState("");
  const [editReasonValue, setEditReasonValue] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Export ECR handler
  const handleExportECR = async () => {
    try {
      const res = await fetch(`/api/reports/ecr?month=${month}`);
      if (!res.ok) throw new Error("Failed to export ECR");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ECR-${month}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      showToast("ECR export failed");
    }
  };

  // Export Form 16 handler
  const handleExportForm16 = async () => {
    try {
      const year = month.slice(0, 4);
      const res = await fetch(`/api/reports/form16?year=${year}`);
      if (!res.ok) throw new Error("Failed to export Form 16");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Form16-${year}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      showToast("Form 16 export failed");
    }
  };

  function monthLabelToKey(label: string): string {
    try {
      const d = new Date(label + " 1");
      if (isNaN(d.getTime())) return "";
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } catch { return ""; }
  }

  useEffect(() => {
    if (availableMonths.length > 0 && !(availableMonths as string[]).includes(month)) {
      setMonth(availableMonths[0]);
    }
  }, [availableMonths, month]);

  // Load payroll run status when month changes
  useEffect(() => {
    const key = monthLabelToKey(month);
    if (!key || !isAdmin) return;
    runStatusFetcher.load(`/api/payroll/run-status?monthKey=${key}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, isAdmin]);

  useEffect(() => {
    const data = runStatusFetcher.data;
    if (data?.run) setPayrollRunStatus(data.run);
  }, [runStatusFetcher.data]);

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
      setEditReasonValue("");
      // Refresh history if on history tab
      if (payrollTab === "history") loadHistory(historyUserId ?? undefined);
    }
  }, [salaryFetcher.data]);

  useEffect(() => {
    const data = lifecycleFetcher.data;
    if (!data) return;
    if (data.message) showToast(data.message);
    if (data.ok) {
      const key = monthLabelToKey(month);
      if (key) runStatusFetcher.load(`/api/payroll/run-status?monthKey=${key}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleFetcher.data]);

  useEffect(() => {
    const data = structureFetcher.data;
    if (!data) return;
    if (data.message) showToast(data.message);
    if (data.ok) {
      setEditingStructureId(null);
      // Refresh structure list
      runStatusFetcher.load(`/api/salary-structures`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureFetcher.data]);

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
    if (editReasonValue.trim()) fd.set("reason", editReasonValue.trim());
    salaryFetcher.submit(fd, { method: "POST" });
  };

  const loadHistory = async (userId?: string) => {
    setHistoryLoading(true);
    setHistoryUserId(userId ?? null);
    try {
      const url = userId ? `/api/salary-history?userId=${userId}` : "/api/salary-history";
      const res = await fetch(url);
      const data = await res.json() as { history?: SalaryHistoryRow[] };
      setSalaryHistory(data.history ?? []);
    } catch {
      setSalaryHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadMyPayslips = async () => {
    setPayslipsLoading(true);
    try {
      const res = await fetch("/api/payroll/my-payslips?limit=24");
      const data = await res.json() as { payslips?: PayslipHistoryItem[] };
      setMyPayslips(data.payslips ?? []);
    } catch {
      setMyPayslips([]);
    } finally {
      setPayslipsLoading(false);
    }
  };

  // Load history when switching to history tab
  const handleTabChange = (tab: "register" | "salary" | "structure" | "history" | "payslips") => {
    setPayrollTab(tab);
    if (tab === "history" && salaryHistory.length === 0) {
      loadHistory();
    }
    if (tab === "payslips" && myPayslips.length === 0) {
      loadMyPayslips();
    }
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
      {selectedHistoryPayslip ? (
        <PayslipDetailModal item={selectedHistoryPayslip} onClose={() => setSelectedHistoryPayslip(null)} />
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
            <button
              className="btn btn-primary"
              type="submit"
              disabled={payrollRunStatus?.locked || payrollRunStatus?.finalized}
              title={payrollRunStatus?.locked ? "Unlock payroll before re-running" : undefined}
            >
              Run Payroll
            </button>
          </Form>
        )}
        {!isAdmin && (
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", fontWeight: 600 }}>
            {availableMonths.length === 0 ? <option>{month}</option> : null}
            {availableMonths.map((m) => <option key={m}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Payroll Lifecycle Bar — admin only */}
      {isAdmin && payrollRunStatus && (
        <div style={{
          background: "white", border: "1px solid #e2e8f0", borderRadius: 12,
          padding: "16px 20px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", flexShrink: 0 }}>
            Payroll Lifecycle — {month}
          </div>
          {/* Steps */}
          {[
            { label: "Run", done: true, icon: "▶" },
            { label: "Lock", done: payrollRunStatus.locked, icon: "🔒" },
            { label: "Finalize", done: payrollRunStatus.finalized, icon: "✅" },
            { label: "Disburse", done: payrollRunStatus.disbursed, icon: "💸" },
          ].map((step, i, arr) => (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <div style={{ width: 24, height: 2, background: step.done ? "#10b981" : "#e2e8f0" }} />}
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 20,
                background: step.done ? "#ecfdf5" : "#f8fafc",
                border: `1px solid ${step.done ? "#a7f3d0" : "#e2e8f0"}`,
                fontSize: 11, fontWeight: 700,
                color: step.done ? "#059669" : "#94a3b8",
              }}>
                <span>{step.icon}</span>
                <span>{step.label}</span>
              </div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {!payrollRunStatus.locked && !payrollRunStatus.finalized && (
              <lifecycleFetcher.Form method="post">
                <input type="hidden" name="intent" value="lock-payroll" />
                <input type="hidden" name="monthKey" value={monthLabelToKey(month)} />
                <button type="submit" disabled={lifecycleFetcher.state !== "idle"} style={{
                  padding: "7px 14px", borderRadius: 8, border: "none",
                  background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  🔒 Lock
                </button>
              </lifecycleFetcher.Form>
            )}
            {payrollRunStatus.locked && !payrollRunStatus.finalized && (
              <>
                <lifecycleFetcher.Form method="post">
                  <input type="hidden" name="intent" value="unlock-payroll" />
                  <input type="hidden" name="monthKey" value={monthLabelToKey(month)} />
                  <button type="submit" disabled={lifecycleFetcher.state !== "idle"} style={{
                    padding: "7px 14px", borderRadius: 8, border: "none",
                    background: "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>
                    🔓 Unlock
                  </button>
                </lifecycleFetcher.Form>
                <lifecycleFetcher.Form method="post">
                  <input type="hidden" name="intent" value="finalize-payroll" />
                  <input type="hidden" name="monthKey" value={monthLabelToKey(month)} />
                  <button type="submit" disabled={lifecycleFetcher.state !== "idle"} style={{
                    padding: "7px 14px", borderRadius: 8, border: "none",
                    background: "#eff6ff", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>
                    ✅ Finalize
                  </button>
                </lifecycleFetcher.Form>
              </>
            )}
            {payrollRunStatus.finalized && !payrollRunStatus.disbursed && (
              <lifecycleFetcher.Form method="post">
                <input type="hidden" name="intent" value="disburse-payroll" />
                <input type="hidden" name="monthKey" value={monthLabelToKey(month)} />
                <button type="submit" disabled={lifecycleFetcher.state !== "idle"} style={{
                  padding: "7px 14px", borderRadius: 8, border: "none",
                  background: "#ecfdf5", color: "#059669", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  💸 Mark Disbursed
                </button>
              </lifecycleFetcher.Form>
            )}
            {payrollRunStatus.disbursed && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", padding: "7px 0" }}>
                ✓ Disbursed on {payrollRunStatus.disbursed_at?.slice(0, 10) ?? ""}
              </span>
            )}
          </div>
        </div>
      )}

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
          <button className={`tab-btn ${payrollTab === "register" ? "active" : ""}`} onClick={() => handleTabChange("register")}>
            Payroll Register
          </button>
          <button className={`tab-btn ${payrollTab === "salary" ? "active" : ""}`} onClick={() => handleTabChange("salary")}>
            Salary Setup
          </button>
          <button className={`tab-btn ${payrollTab === "structure" ? "active" : ""}`} onClick={() => handleTabChange("structure")}>
            Salary Structure
          </button>
          <button className={`tab-btn ${payrollTab === "history" ? "active" : ""}`} onClick={() => handleTabChange("history")}>
            Salary History
          </button>
        </div>
      )}
      {!isAdmin && (
        <div style={{ marginTop: 24 }}>
          <div className="tab-bar">
            <button className={`tab-btn ${payrollTab === "register" ? "active" : ""}`} onClick={() => handleTabChange("register")}>
              Current Month
            </button>
            <button className={`tab-btn ${payrollTab === "payslips" ? "active" : ""}`} onClick={() => handleTabChange("payslips")}>
              Payslip History
            </button>
            <button className={`tab-btn ${payrollTab === "history" ? "active" : ""}`} onClick={() => handleTabChange("history")}>
              Salary History
            </button>
          </div>
        </div>
      )}

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
                    <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={handleExportECR}>Export ECR</button>
                    <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={handleExportForm16}>Export Form 16</button>
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
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input
                              type="text"
                              value={editReasonValue}
                              onChange={(e) => setEditReasonValue(e.target.value)}
                              placeholder="Reason (e.g. Annual Appraisal)"
                              style={{ width: 220, padding: "5px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 12 }}
                            />
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
                                onClick={() => { setEditingUserId(null); setEditCtcValue(""); setEditReasonValue(""); }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-outline"
                              style={{ padding: "4px 12px", fontSize: 12 }}
                              onClick={() => {
                                setEditingUserId(c.user_id);
                                setEditCtcValue(c.annual_ctc > 0 ? String(c.annual_ctc) : "");
                                setEditReasonValue("");
                              }}
                            >
                              Edit CTC
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              onClick={() => { loadHistory(c.user_id); handleTabChange("history"); }}
                            >
                              History
                            </button>
                          </div>
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

      {/* Salary Structure tab */}
      {payrollTab === "structure" && isAdmin && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Salary Structure Components</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Configure basic %, HRA %, allowances per employee. Applied during payroll computation.
            </div>
          </div>
          {salaryConfigs.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "16px 0" }}>No employees found. Invite employees first.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Basic %</th>
                  <th>HRA %</th>
                  <th>Conveyance</th>
                  <th>LTA</th>
                  <th>Medical</th>
                  <th>Effective From</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaryConfigs.map((c) => {
                  const struct = salaryStructures.find((s) => s.user_id === c.user_id);
                  const isEditing = editingStructureId === c.user_id;
                  return (
                    <tr key={c.user_id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="avatar-sm" style={{ background: avatarColor(c.name) }}>
                            {getInitials(c.name)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.department || "—"}</div>
                          </div>
                        </div>
                      </td>
                      {isEditing ? (
                        <>
                          <td>
                            <input type="number" value={structureForm.basicPct} min={10} max={80}
                              onChange={(e) => setStructureForm((p) => ({ ...p, basicPct: Number(e.target.value) }))}
                              style={{ width: 64, padding: "4px 8px", border: "1.5px solid var(--accent)", borderRadius: 6, fontSize: 12 }} />
                          </td>
                          <td>
                            <input type="number" value={structureForm.hraPct} min={0} max={50}
                              onChange={(e) => setStructureForm((p) => ({ ...p, hraPct: Number(e.target.value) }))}
                              style={{ width: 64, padding: "4px 8px", border: "1.5px solid var(--accent)", borderRadius: 6, fontSize: 12 }} />
                          </td>
                          <td>
                            <input type="number" value={structureForm.conveyance} min={0}
                              onChange={(e) => setStructureForm((p) => ({ ...p, conveyance: Number(e.target.value) }))}
                              style={{ width: 80, padding: "4px 8px", border: "1.5px solid var(--accent)", borderRadius: 6, fontSize: 12 }} />
                          </td>
                          <td>
                            <input type="number" value={structureForm.lta} min={0}
                              onChange={(e) => setStructureForm((p) => ({ ...p, lta: Number(e.target.value) }))}
                              style={{ width: 72, padding: "4px 8px", border: "1.5px solid var(--accent)", borderRadius: 6, fontSize: 12 }} />
                          </td>
                          <td>
                            <input type="number" value={structureForm.medicalAllowance} min={0}
                              onChange={(e) => setStructureForm((p) => ({ ...p, medicalAllowance: Number(e.target.value) }))}
                              style={{ width: 80, padding: "4px 8px", border: "1.5px solid var(--accent)", borderRadius: 6, fontSize: 12 }} />
                          </td>
                          <td>
                            <input type="date" value={structureForm.effectiveFrom}
                              onChange={(e) => setStructureForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                              style={{ width: 130, padding: "4px 8px", border: "1.5px solid var(--accent)", borderRadius: 6, fontSize: 12 }} />
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <structureFetcher.Form method="post">
                                <input type="hidden" name="intent" value="set-salary-structure" />
                                <input type="hidden" name="userId" value={c.user_id} />
                                <input type="hidden" name="basicPct" value={structureForm.basicPct} />
                                <input type="hidden" name="hraPct" value={structureForm.hraPct} />
                                <input type="hidden" name="conveyance" value={structureForm.conveyance} />
                                <input type="hidden" name="lta" value={structureForm.lta} />
                                <input type="hidden" name="medicalAllowance" value={structureForm.medicalAllowance} />
                                <input type="hidden" name="specialAllowancePct" value={structureForm.specialAllowancePct} />
                                <input type="hidden" name="effectiveFrom" value={structureForm.effectiveFrom} />
                                <button type="submit" className="btn btn-success" style={{ padding: "4px 12px", fontSize: 12 }}
                                  disabled={structureFetcher.state !== "idle"}>
                                  {structureFetcher.state !== "idle" ? "Saving…" : "Save"}
                                </button>
                              </structureFetcher.Form>
                              <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}
                                onClick={() => setEditingStructureId(null)}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontSize: 13 }}>{struct ? `${struct.basic_pct}%` : "50%"}</td>
                          <td style={{ fontSize: 13 }}>{struct ? `${struct.hra_pct}%` : "20%"}</td>
                          <td style={{ fontSize: 13 }}>{struct ? fmt(struct.conveyance) : "₹1,600"}</td>
                          <td style={{ fontSize: 13 }}>{struct && struct.lta > 0 ? fmt(struct.lta) : "—"}</td>
                          <td style={{ fontSize: 13 }}>{struct && struct.medical_allowance > 0 ? fmt(struct.medical_allowance) : "—"}</td>
                          <td style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {struct ? new Date(struct.effective_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td>
                            <button className="btn btn-outline" style={{ padding: "4px 12px", fontSize: 12 }}
                              onClick={() => {
                                setEditingStructureId(c.user_id);
                                setStructureForm({
                                  basicPct: struct?.basic_pct ?? 50,
                                  hraPct: struct?.hra_pct ?? 20,
                                  conveyance: struct?.conveyance ?? 1600,
                                  lta: struct?.lta ?? 0,
                                  medicalAllowance: struct?.medical_allowance ?? 0,
                                  specialAllowancePct: struct?.special_allowance_pct ?? 0,
                                  effectiveFrom: new Date().toISOString().slice(0, 10),
                                });
                              }}>
                              Edit Structure
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--surface)", borderRadius: 10, fontSize: 12, color: "var(--ink-3)" }}>
            Structure components define how CTC is split into Basic, HRA, and allowances. Basic + HRA must not exceed 90%. Special allowance fills the remainder automatically.
          </div>
        </div>
      )}

      {/* Salary History tab */}
      {payrollTab === "history" && isAdmin && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div className="card-title" style={{ margin: 0 }}>Salary Revision History</div>
              {historyUserId && (
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                  Showing history for one employee ·{" "}
                  <button style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, padding: 0 }}
                    onClick={() => loadHistory()}>
                    Show all employees
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => loadHistory(historyUserId ?? undefined)}>
              {historyLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>

          {historyLoading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Loading history…</div>
          ) : salaryHistory.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              No salary revisions recorded yet. History is created automatically when you save a CTC change.
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Timeline line */}
              <div style={{ position: "absolute", left: 20, top: 0, bottom: 0, width: 2, background: "var(--border)", zIndex: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {salaryHistory.map((h, i) => (
                  <div key={h.id} style={{ display: "flex", gap: 16, paddingBottom: 20, position: "relative" }}>
                    {/* dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: i === 0 ? "var(--accent)" : "#cbd5e1",
                      border: "2px solid white",
                      boxShadow: "0 0 0 2px " + (i === 0 ? "var(--accent)" : "#cbd5e1"),
                      flexShrink: 0, marginTop: 5, marginLeft: 16, zIndex: 1, position: "relative",
                    }} />
                    <div style={{
                      flex: 1, background: i === 0 ? "#eef2ff" : "var(--surface)",
                      borderRadius: 10, padding: "12px 16px",
                      border: i === 0 ? "1px solid #c7d2fe" : "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          {h.employee_name && (
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 2 }}>{h.employee_name}</div>
                          )}
                          <div style={{ fontSize: 18, fontWeight: 800, color: i === 0 ? "var(--accent)" : "var(--ink)" }}>
                            {fmt(h.annual_ctc)}
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)", marginLeft: 6 }}>per annum</span>
                          </div>
                          {h.reason && (
                            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>📝 {h.reason}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>
                            Effective: {new Date(h.effective_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                          {h.changed_by_name && (
                            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>by {h.changed_by_name}</div>
                          )}
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Employee payslip history tab */}
      {payrollTab === "payslips" && !isAdmin && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>My Payslip History</div>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={loadMyPayslips}>
              {payslipsLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
          {payslipsLoading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Loading payslips…</div>
          ) : myPayslips.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              No payslips found yet. Payslips appear here once payroll is run for any month.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myPayslips.map((p) => {
                const breakdown = parseBreakdown(p.breakdown_json);
                const monthLabel = formatMonthKey(p.month_key);
                const hasLop = (breakdown?.lop.days ?? p.lop_days ?? 0) > 0;
                return (
                  <div key={p.month_key} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "14px 18px",
                    background: "var(--surface)", borderRadius: 12,
                    border: "1px solid var(--border)",
                    flexWrap: "wrap",
                  }}>
                    {/* Month badge */}
                    <div style={{
                      minWidth: 110, padding: "6px 14px",
                      background: "#eff6ff", borderRadius: 8,
                      fontSize: 13, fontWeight: 700, color: "#2563eb",
                      flexShrink: 0, textAlign: "center",
                    }}>
                      {monthLabel}
                    </div>
                    {/* Figures */}
                    <div style={{ display: "flex", gap: 28, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)" }}>Gross</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{fmt(p.gross)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)" }}>Deductions</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--red)" }}>- {fmt(p.deductions)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--ink-3)" }}>Net Pay</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--green)" }}>{fmt(p.net)}</div>
                      </div>
                      {hasLop && (
                        <div style={{ padding: "3px 10px", background: "#fef3c7", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                          LOP: {breakdown?.lop.days ?? p.lop_days} day{((breakdown?.lop.days ?? p.lop_days) > 1) ? "s" : ""}
                        </div>
                      )}
                    </div>
                    {/* Status + actions */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <span className={`badge ${p.status === "Processed" ? "badge-green" : "badge-amber"}`}>{p.status}</span>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "5px 13px", fontSize: 12 }}
                        onClick={() => setSelectedHistoryPayslip(p)}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ padding: "5px 13px", fontSize: 12 }}
                        onClick={() => downloadPayslipRich(p)}
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Employee self-service salary history */}
      {payrollTab === "history" && !isAdmin && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>My Salary History</div>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => loadHistory()}>
              {historyLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
          {historyLoading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
          ) : salaryHistory.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              No salary revisions on record yet.
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 20, top: 0, bottom: 0, width: 2, background: "var(--border)", zIndex: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {salaryHistory.map((h, i) => (
                  <div key={h.id} style={{ display: "flex", gap: 16, paddingBottom: 20, position: "relative" }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: i === 0 ? "var(--accent)" : "#cbd5e1",
                      border: "2px solid white",
                      boxShadow: "0 0 0 2px " + (i === 0 ? "var(--accent)" : "#cbd5e1"),
                      flexShrink: 0, marginTop: 5, marginLeft: 16, zIndex: 1, position: "relative",
                    }} />
                    <div style={{
                      flex: 1, background: i === 0 ? "#eef2ff" : "var(--surface)",
                      borderRadius: 10, padding: "12px 16px",
                      border: i === 0 ? "1px solid #c7d2fe" : "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: i === 0 ? "var(--accent)" : "var(--ink)" }}>
                            {fmt(h.annual_ctc)}
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)", marginLeft: 6 }}>per annum</span>
                          </div>
                          {h.reason && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>📝 {h.reason}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>
                            Effective: {new Date(h.effective_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </HRMSLayout>
  );
}
