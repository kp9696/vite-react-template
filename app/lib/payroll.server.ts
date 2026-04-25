/**
 * Generate Form 16 summary CSV for a given financial year.
 * This is a simplified version. For official Form 16, use a government utility or certified software.
 * Columns: Employee Name, PAN, Gross Salary, Total Deductions, Net Salary, Total TDS Deducted
 * Assumes you have PAN and other required fields in your employee/user table.
 */
export function generateForm16CSV(form16Rows: Array<{
  name: string;
  pan: string;
  gross: number;
  deductions: number;
  net: number;
  tds: number;
}>): string {
  const header = [
    "Employee Name", "PAN", "Gross Salary", "Total Deductions", "Net Salary", "Total TDS Deducted"
  ];
  const lines = [header.join(",")];
  for (const row of form16Rows) {
    lines.push([
      row.name,
      row.pan,
      row.gross,
      row.deductions,
      row.net,
      row.tds
    ].join(","));
  }
  return lines.join("\n");
}
/**
 * Generate ECR (PF) report CSV for a given month.
 * ECR format: UAN, Member Name, Gross Wages, EPF Wages, EPS Wages, EDLI Wages, EPF Contribution, EPS Contribution, NCP Days, Refund, Reason for NCP
 * This function assumes you have UAN and other required fields in your employee/user table.
 * You may need to adjust field mappings as per your schema.
 */
export function generateECRCSV(payrollRows: Array<{
  uan: string;
  name: string;
  gross: number;
  pf: number;
  basic: number;
  ncpDays?: number;
}>): string {
  const header = [
    "UAN", "Member Name", "Gross Wages", "EPF Wages", "EPS Wages", "EDLI Wages", "EPF Contribution", "EPS Contribution", "NCP Days", "Refund", "Reason for NCP"
  ];
  const lines = [header.join(",")];
  for (const row of payrollRows) {
    // For ECR, EPF/EPS/EDLI wages are usually Basic salary, contributions are split
    const epfWages = row.basic;
    const epsWages = row.basic;
    const edliWages = row.basic;
    const epfContribution = Math.round(row.pf * 0.8333); // Employee share (12%)
    const epsContribution = Math.round(row.pf * 0.0833 * 100) / 100; // Employer share (8.33%)
    const ncpDays = row.ncpDays ?? 0;
    lines.push([
      row.uan,
      row.name,
      row.gross,
      epfWages,
      epsWages,
      edliWages,
      epfContribution,
      epsContribution,
      ncpDays,
      "",
      ""
    ].join(","));
  }
  return lines.join("\n");
}
export interface PayrollEmployee {
  name: string;
  id: string;
  dept: string;
  basic: number;
  hra: number;
  conveyance: number;
  pf: number;
  esi: number;
  tds: number;
  pt: number;
  gross: number;
  deductions: number;
  net: number;
  status: "Processed" | "Pending";
}

function toMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map((v) => parseInt(v, 10));
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function toMonthKey(monthLabel: string): string {
  const date = new Date(`${monthLabel} 01`);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  const match = monthLabel.match(/^(\d{4})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}`;

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Convert a monthKey like '2026-04' to financial year string '2026-27'. */
function monthKeyToFinancialYear(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
  return `${y - 1}-${String(y).slice(2)}`;
}

function parseAnnualSalaryInInr(raw: string): number {
  const value = raw.trim();

  const lakhMatch = value.match(/([\d.]+)\s*[Ll]\b/);
  if (lakhMatch) {
    return Math.round(parseFloat(lakhMatch[1]) * 100000);
  }

  const numeric = value.replace(/[^\d.]/g, "");
  if (!numeric) return 0;
  return Math.round(parseFloat(numeric));
}

/**
 * IT Declaration fields used for TDS computation. Mirrors the it_declarations table.
 * All monetary values are in INR (annual unless noted as monthly).
 */
export interface ITDeclarationForPayroll {
  tax_regime: "new" | "old";
  // 80C (annual amounts declared)
  ppf: number; elss: number; lic: number; nsc: number; ulip: number;
  home_loan_principal: number; tuition_fees: number; other_80c: number;
  // 80D
  medical_self: number; medical_parents: number;
  // HRA
  monthly_rent: number; is_metro: number; // 0|1
  // 24(b)
  home_loan_interest: number;
  // 80CCD(1B)
  nps_80ccd1b: number;
  // other
  other_deductions: number;
}

/**
 * Compute annual income tax under New Tax Regime (FY 2025-26 / Budget 2025).
 * Standard deduction: ₹75,000.
 * Slabs: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%.
 * Rebate u/s 87A: net taxable ≤ ₹12L → full rebate (tax = 0).
 * Health & Education Cess: 4% on tax.
 */
function computeNewRegimeTDS(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 75_000);
  if (taxable === 0) return 0;

  const slabs: Array<{ upto: number; rate: number }> = [
    { upto: 400_000, rate: 0 },
    { upto: 800_000, rate: 0.05 },
    { upto: 1_200_000, rate: 0.10 },
    { upto: 1_600_000, rate: 0.15 },
    { upto: 2_000_000, rate: 0.20 },
    { upto: 2_400_000, rate: 0.25 },
    { upto: Infinity, rate: 0.30 },
  ];

  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, slab.upto) - prev) * slab.rate;
    prev = slab.upto;
  }

  // Rebate u/s 87A — if taxable income ≤ ₹12,00,000, tax = 0
  if (taxable <= 1_200_000) return 0;

  // Add 4% health & education cess
  return Math.round(tax * 1.04);
}

/**
 * Compute annual income tax under Old Tax Regime (FY 2025-26).
 * Standard deduction: ₹50,000.
 * Slabs: 0-2.5L nil, 2.5-5L 5%, 5-10L 20%, >10L 30%.
 * Rebate u/s 87A: taxable ≤ ₹5L → tax = 0.
 * Deductions: 80C (cap ₹1.5L), 80D self (cap ₹25k) + parents (cap ₹25k),
 *             HRA exemption, 24(b) home loan interest (cap ₹2L), 80CCD(1B) (cap ₹50k).
 * Health & Education Cess: 4%.
 */
export function computeOldRegimeTDS(
  annualGross: number,
  monthlyBasic: number,
  monthlyHra: number,
  decl: ITDeclarationForPayroll,
): number {
  // Standard deduction
  const stdDeduction = 50_000;

  // 80C aggregate cap ₹1,50,000
  const c80Total = decl.ppf + decl.elss + decl.lic + decl.nsc + decl.ulip
    + decl.home_loan_principal + decl.tuition_fees + decl.other_80c;
  const c80 = Math.min(c80Total, 150_000);

  // 80D caps
  const d80 = Math.min(decl.medical_self, 25_000) + Math.min(decl.medical_parents, 25_000);

  // HRA exemption (per year) — only if employee pays rent
  let hraExemption = 0;
  if (decl.monthly_rent > 0) {
    const rentPA = decl.monthly_rent * 12;
    const basicPA = monthlyBasic * 12;
    const hraPA = monthlyHra * 12;
    const hraActual = hraPA;
    const hraPercent = decl.is_metro === 1 ? 0.50 : 0.40;
    const hraPercentOfBasic = Math.round(basicPA * hraPercent);
    const hraRentBased = Math.max(0, rentPA - Math.round(basicPA * 0.10));
    hraExemption = Math.min(hraActual, hraPercentOfBasic, hraRentBased);
  }

  // Section 24(b): home loan interest cap ₹2,00,000
  const sec24b = Math.min(decl.home_loan_interest, 200_000);

  // 80CCD(1B): additional NPS cap ₹50,000
  const nps = Math.min(decl.nps_80ccd1b, 50_000);

  const totalDeductions = stdDeduction + c80 + d80 + hraExemption + sec24b + nps + decl.other_deductions;
  const taxable = Math.max(0, annualGross - totalDeductions);

  if (taxable === 0) return 0;

  const slabs: Array<{ upto: number; rate: number }> = [
    { upto: 250_000, rate: 0 },
    { upto: 500_000, rate: 0.05 },
    { upto: 1_000_000, rate: 0.20 },
    { upto: Infinity, rate: 0.30 },
  ];

  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, slab.upto) - prev) * slab.rate;
    prev = slab.upto;
  }

  // Rebate u/s 87A — if taxable ≤ ₹5,00,000, tax = 0
  if (taxable <= 500_000) return 0;

  return Math.round(tax * 1.04);
}

function computePayrollFromAnnual(
  annualInr: number,
  decl?: ITDeclarationForPayroll,
): Omit<PayrollEmployee, "name" | "id" | "dept" | "status"> {
  const monthlyCtc = Math.round(annualInr / 12);

  // Salary structure: Basic 50%, HRA 20%, Special Allowance to fill up to CTC
  const basic = Math.round(monthlyCtc * 0.50);
  const hra = Math.round(monthlyCtc * 0.20);
  const conveyance = 1_600; // ₹1,600/month fixed conveyance allowance
  const specialAllowance = Math.max(0, monthlyCtc - basic - hra - conveyance);
  const gross = basic + hra + conveyance + specialAllowance;

  // PF: 12% of basic (employee contribution), capped at ₹1,800 (PF wage ceiling ₹15,000)
  const pfWage = Math.min(basic, 15_000);
  const pf = Math.round(pfWage * 0.12);

  // ESI: 0.75% of gross — only if gross ≤ ₹21,000/month
  const esi = gross <= 21_000 ? Math.round(gross * 0.0075) : 0;

  // Professional Tax: ₹200/month flat (Karnataka / common states)
  const pt = 200;

  // TDS: use declared regime and investments if available, else default to new regime
  let annualTds: number;
  if (decl?.tax_regime === "old") {
    annualTds = computeOldRegimeTDS(gross * 12, basic, hra, decl);
  } else {
    annualTds = computeNewRegimeTDS(gross * 12);
  }
  const tds = Math.round(annualTds / 12);

  const deductions = pf + esi + tds + pt;
  const net = Math.max(gross - deductions, 0);

  return { basic, hra, conveyance, pf, esi, tds, pt, gross, deductions, net };
}

async function ensurePayrollTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS payroll_runs (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        org_id TEXT NOT NULL,
        month_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processed',
        processed_count INTEGER NOT NULL DEFAULT 0,
        total_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(org_id, month_key)
      )`,
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS payroll_items (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        company_id TEXT,
        org_id TEXT NOT NULL,
        month_key TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        department TEXT NOT NULL,
        basic INTEGER NOT NULL,
        hra INTEGER NOT NULL,
        conveyance INTEGER NOT NULL,
        pf INTEGER NOT NULL,
        esi INTEGER NOT NULL DEFAULT 0,
        tds INTEGER NOT NULL,
        pt INTEGER NOT NULL,
        gross INTEGER NOT NULL,
        deductions INTEGER NOT NULL,
        net INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'processed',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(org_id, month_key, employee_id)
      )`,
    )
    .run();

  // Add esi column to existing tables (no-op if already exists)
  try {
    await db.prepare(`ALTER TABLE payroll_items ADD COLUMN esi INTEGER NOT NULL DEFAULT 0`).run();
  } catch {
    // Column already exists — ignore
  }
}

export async function runPayrollForMonth(
  db: D1Database,
  companyId: string,
  monthLabel: string,
): Promise<{ month: string; monthKey: string; processed: number; pending: number }> {
  await ensurePayrollTables(db);

  const monthKey = toMonthKey(monthLabel);
  const now = new Date().toISOString();

  const runRow = await db
    .prepare(`SELECT id FROM payroll_runs WHERE company_id = ? AND month_key = ? LIMIT 1`)
    .bind(companyId, monthKey)
    .first<{ id: string }>();

  const runId = runRow?.id ?? crypto.randomUUID();

  if (runRow) {
    await db
      .prepare(`UPDATE payroll_runs SET updated_at = ? WHERE id = ?`)
      .bind(now, runId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO payroll_runs (id, company_id, org_id, month_key, status, processed_count, total_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'processed', 0, 0, ?, ?)`,
      )
      .bind(runId, companyId, companyId, monthKey, now, now)
      .run();
  }

  const employees = await db
    .prepare(
      `SELECT u.id, u.name, COALESCE(u.department, 'General') as department,
              COALESCE(es.annual_ctc, 0) as annual_ctc, COALESCE(u.status, 'Active') as status
       FROM users u
       LEFT JOIN employee_salaries es
         ON es.user_id = u.id AND es.company_id = ?
       WHERE u.company_id = ?
       ORDER BY u.name ASC`,
    )
    .bind(companyId, companyId)
    .all<{ id: string; name: string; department: string; annual_ctc: number; status: string }>();

  // Fetch IT declarations (submitted or approved) for this financial year
  const fy = monthKeyToFinancialYear(monthKey);
  let declMap = new Map<string, ITDeclarationForPayroll>();
  try {
    const declRows = await db
      .prepare(
        `SELECT user_id, tax_regime, ppf, elss, lic, nsc, ulip,
                home_loan_principal, tuition_fees, other_80c,
                medical_self, medical_parents, monthly_rent, is_metro,
                home_loan_interest, nps_80ccd1b, other_deductions
         FROM it_declarations
         WHERE company_id = ? AND financial_year = ?
           AND status IN ('submitted', 'approved')`,
      )
      .bind(companyId, fy)
      .all<{ user_id: string } & Omit<ITDeclarationForPayroll, never>>();
    for (const d of declRows.results) {
      declMap.set(d.user_id, {
        tax_regime: (d.tax_regime === "old" ? "old" : "new") as "new" | "old",
        ppf: d.ppf, elss: d.elss, lic: d.lic, nsc: d.nsc, ulip: d.ulip,
        home_loan_principal: d.home_loan_principal, tuition_fees: d.tuition_fees, other_80c: d.other_80c,
        medical_self: d.medical_self, medical_parents: d.medical_parents,
        monthly_rent: d.monthly_rent, is_metro: d.is_metro,
        home_loan_interest: d.home_loan_interest, nps_80ccd1b: d.nps_80ccd1b,
        other_deductions: d.other_deductions,
      });
    }
  } catch {
    // it_declarations table may not exist yet; proceed with default TDS
  }

  let processed = 0;
  let pending = 0;

  for (const emp of employees.results) {
    const annual = Number(emp.annual_ctc ?? 0);
    const decl = declMap.get(emp.id);
    const calc = computePayrollFromAnnual(annual, decl);
    const itemStatus: "Processed" | "Pending" = emp.status.toLowerCase() === "active" ? "Processed" : "Pending";

    if (itemStatus === "Processed") processed++;
    else pending++;

    await db
      .prepare(
        `INSERT INTO payroll_items (
           id, run_id, company_id, org_id, month_key, employee_id, employee_name, department,
           basic, hra, conveyance, pf, esi, tds, pt, gross, deductions, net, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, month_key, employee_id)
         DO UPDATE SET
           run_id = excluded.run_id,
           company_id = excluded.company_id,
           employee_name = excluded.employee_name,
           department = excluded.department,
           basic = excluded.basic,
           hra = excluded.hra,
           conveyance = excluded.conveyance,
           pf = excluded.pf,
           esi = excluded.esi,
           tds = excluded.tds,
           pt = excluded.pt,
           gross = excluded.gross,
           deductions = excluded.deductions,
           net = excluded.net,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        runId,
        companyId,
        companyId,
        monthKey,
        emp.id,
        emp.name,
        emp.department,
        calc.basic,
        calc.hra,
        calc.conveyance,
        calc.pf,
        calc.esi,
        calc.tds,
        calc.pt,
        calc.gross,
        calc.deductions,
        calc.net,
        itemStatus.toLowerCase(),
        now,
        now,
      )
      .run();
  }

  await db
    .prepare(
      `UPDATE payroll_runs
       SET processed_count = ?, total_count = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(processed, processed + pending, now, runId)
    .run();

  // Auto-create pending statutory filings for this payroll month
  await upsertPendingFilingsForMonth(db, companyId, monthKey);

  return {
    month: toMonthLabel(monthKey),
    monthKey,
    processed,
    pending,
  };
}

/**
 * Upserts pending statutory filing placeholders for ECR, TDS, and PT
 * for the given month. Runs after payroll so the compliance dashboard
 * pre-populates automatically. Uses ON CONFLICT DO NOTHING so existing
 * filed/failed records are never overwritten.
 */
async function upsertPendingFilingsForMonth(
  db: D1Database,
  companyId: string,
  monthKey: string,
): Promise<void> {
  // Ensure table exists (idempotent)
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS statutory_filings (
         id TEXT PRIMARY KEY,
         company_id TEXT NOT NULL,
         filing_type TEXT NOT NULL,
         period TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'pending',
         file_path TEXT,
         filed_by TEXT,
         filed_at TEXT,
         error_message TEXT,
         created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(company_id, filing_type, period)
       )`,
    )
    .run();

  const now = new Date().toISOString();
  for (const filingType of ["ECR", "TDS", "PT"] as const) {
    const id = `SF${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    await db
      .prepare(
        `INSERT INTO statutory_filings (id, company_id, filing_type, period, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(company_id, filing_type, period) DO NOTHING`,
      )
      .bind(id, companyId, filingType, monthKey, now, now)
      .run();
  }
}

export async function getPayrollDashboard(
  db: D1Database,
  companyId: string,
): Promise<{ months: string[]; payrollByMonth: Record<string, PayrollEmployee[]> }> {
  await ensurePayrollTables(db);

  const runs = await db
    .prepare(
      `SELECT month_key
       FROM payroll_runs
       WHERE company_id = ?
       ORDER BY month_key DESC`,
    )
    .bind(companyId)
    .all<{ month_key: string }>();

  const monthKeys = runs.results.map((r) => r.month_key);
  if (monthKeys.length === 0) {
    const month = toMonthLabel(currentMonthKey());
    return { months: [month], payrollByMonth: { [month]: [] } };
  }

  const payrollByMonth: Record<string, PayrollEmployee[]> = {};

  for (const monthKey of monthKeys) {
    const rows = await db
      .prepare(
        `SELECT pi.employee_id, pi.employee_name, pi.department, pi.basic, pi.hra, pi.conveyance, pi.pf, COALESCE(pi.esi, 0) as esi, pi.tds, pi.pt, pi.gross, pi.deductions, pi.net, pi.status
         FROM payroll_items pi
         INNER JOIN users u ON u.id = pi.employee_id AND u.company_id = ?
         WHERE pi.company_id = ? AND pi.month_key = ?
         ORDER BY pi.employee_name ASC`,
      )
      .bind(companyId, companyId, monthKey)
      .all<{
        employee_id: string;
        employee_name: string;
        department: string;
        basic: number;
        hra: number;
        conveyance: number;
        pf: number;
        esi: number;
        tds: number;
        pt: number;
        gross: number;
        deductions: number;
        net: number;
        status: string;
      }>();

    const label = toMonthLabel(monthKey);
    payrollByMonth[label] = rows.results.map((row) => ({
      id: row.employee_id,
      name: row.employee_name,
      dept: row.department,
      basic: Number(row.basic ?? 0),
      hra: Number(row.hra ?? 0),
      conveyance: Number(row.conveyance ?? 0),
      pf: Number(row.pf ?? 0),
      esi: Number(row.esi ?? 0),
      tds: Number(row.tds ?? 0),
      pt: Number(row.pt ?? 0),
      gross: Number(row.gross ?? 0),
      deductions: Number(row.deductions ?? 0),
      net: Number(row.net ?? 0),
      status: String(row.status).toLowerCase() === "processed" ? "Processed" : "Pending",
    }));
  }

  return {
    months: monthKeys.map(toMonthLabel),
    payrollByMonth,
  };
}
