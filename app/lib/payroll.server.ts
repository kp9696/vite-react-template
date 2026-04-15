export interface PayrollEmployee {
  name: string;
  id: string;
  dept: string;
  basic: number;
  hra: number;
  conveyance: number;
  pf: number;
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

function computePayrollFromAnnual(annualInr: number): Omit<PayrollEmployee, "name" | "id" | "dept" | "status"> {
  const monthlyCtc = Math.round(annualInr / 12);
  const basic = Math.round(monthlyCtc * 0.67);
  const hra = Math.round(monthlyCtc * 0.27);
  const conveyance = 19200;
  const gross = basic + hra + conveyance;
  const pf = Math.round(basic * 0.12);
  const tds = Math.round(monthlyCtc * 0.015);
  const pt = 200;
  const deductions = pf + tds + pt;
  const net = Math.max(gross - deductions, 0);

  return { basic, hra, conveyance, pf, tds, pt, gross, deductions, net };
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
      `SELECT id, name, department, salary, status
       FROM employees
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY name ASC`,
    )
    .bind(companyId)
    .all<{ id: string; name: string; department: string; salary: string; status: string }>();

  let processed = 0;
  let pending = 0;

  for (const emp of employees.results) {
    const annual = parseAnnualSalaryInInr(emp.salary ?? "0");
    const calc = computePayrollFromAnnual(annual);
    const itemStatus: "Processed" | "Pending" = emp.status.toLowerCase() === "active" ? "Processed" : "Pending";

    if (itemStatus === "Processed") processed++;
    else pending++;

    await db
      .prepare(
        `INSERT INTO payroll_items (
           id, run_id, company_id, org_id, month_key, employee_id, employee_name, department,
           basic, hra, conveyance, pf, tds, pt, gross, deductions, net, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        `SELECT employee_id, employee_name, department, basic, hra, conveyance, pf, tds, pt, gross, deductions, net, status
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
