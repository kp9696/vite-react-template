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

function computePayrollFromAnnual(annualInr: number): Omit<PayrollEmployee, "name" | "id" | "dept" | "status"> {
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

  // TDS: new tax regime (annualised gross - standard deduction → slabs) / 12
  const annualTds = computeNewRegimeTDS(gross * 12);
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
): Promise<{ month: string; processed: number; pending: number }> {
  await ensurePayrollTables(db);

  const monthKey = toMonthKey(monthLabel);
  const now = new Date().toISOString();

  const runRow = await db
    .prepare(`SELECT id FROM payroll_runs WHERE COALESCE(company_id, org_id) = ? AND month_key = ? LIMIT 1`)
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
         ON es.user_id = u.id AND COALESCE(es.company_id, es.org_id) = ?
       WHERE COALESCE(u.company_id, u.org_id) = ?
       ORDER BY u.name ASC`,
    )
    .bind(companyId, companyId)
    .all<{ id: string; name: string; department: string; annual_ctc: number; status: string }>();

  let processed = 0;
  let pending = 0;

  for (const emp of employees.results) {
    const annual = Number(emp.annual_ctc ?? 0);
    const calc = computePayrollFromAnnual(annual);
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

  return {
    month: toMonthLabel(monthKey),
    monthKey,
    processed,
    pending,
  };
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
       WHERE COALESCE(company_id, org_id) = ?
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
        `SELECT employee_id, employee_name, department, basic, hra, conveyance, pf, COALESCE(esi, 0) as esi, tds, pt, gross, deductions, net, status
         FROM payroll_items
        WHERE COALESCE(company_id, org_id) = ? AND month_key = ?
         ORDER BY employee_name ASC`,
      )
      .bind(companyId, monthKey)
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
