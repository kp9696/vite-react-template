// company.server.ts — SaaS company + saas_employees D1 queries

export interface Company {
  id: string;
  owner_id: string;
  company_name: string;
  plan: "free" | "pro" | "enterprise";
  employee_limit: number;
  created_at: string;
  updated_at: string;
}

export interface SaasEmployee {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: "Active" | "Inactive";
  joined_on: string;
  created_at: string;
}

export const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  enterprise: 999,
};

// ─── Company queries ──────────────────────────────────────────────────────────

export async function getCompanyByEmail(
  db: D1Database,
  email: string,
): Promise<Company | null> {
  return db
    .prepare(
      `SELECT c.* FROM companies c
       JOIN auth_users au ON au.email = lower(?)
       WHERE c.owner_id = au.email
       LIMIT 1`,
    )
    .bind(email.trim().toLowerCase())
    .first<Company>();
}

export async function getCompanyByOwnerId(
  db: D1Database,
  ownerEmail: string,
): Promise<Company | null> {
  return db
    .prepare(`SELECT * FROM companies WHERE owner_id = lower(?) LIMIT 1`)
    .bind(ownerEmail.trim().toLowerCase())
    .first<Company>();
}

export async function createCompany(
  db: D1Database,
  ownerEmail: string,
  companyName: string,
): Promise<Company> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = ownerEmail.trim().toLowerCase();

  await db
    .prepare(
      `INSERT INTO companies (id, owner_id, company_name, plan, employee_limit, created_at, updated_at)
       VALUES (?, ?, ?, 'free', 5, ?, ?)`,
    )
    .bind(id, email, companyName, now, now)
    .run();

  return {
    id,
    owner_id: email,
    company_name: companyName,
    plan: "free",
    employee_limit: 5,
    created_at: now,
    updated_at: now,
  };
}

/** Ensure a company row exists for the given owner. Returns the company (existing or newly created). */
export async function ensureCompany(
  db: D1Database,
  ownerEmail: string,
  companyName: string,
): Promise<Company> {
  const existing = await getCompanyByOwnerId(db, ownerEmail);
  if (existing) return existing;
  return createCompany(db, ownerEmail, companyName);
}

// ─── SaaS employee queries ────────────────────────────────────────────────────

export async function getSaasEmployees(
  db: D1Database,
  companyId: string,
): Promise<SaasEmployee[]> {
  const result = await db
    .prepare(`SELECT * FROM saas_employees WHERE company_id = ? ORDER BY created_at DESC`)
    .bind(companyId)
    .all<SaasEmployee>();
  return result.results;
}

export async function getSaasEmployeeCount(
  db: D1Database,
  companyId: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id = ?`)
    .bind(companyId)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

export interface AddSaasEmployeeInput {
  companyId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
}

export async function addSaasEmployee(
  db: D1Database,
  input: AddSaasEmployeeInput,
): Promise<{ ok: true; employee: SaasEmployee } | { ok: false; error: string }> {
  // Check limit
  const company = await db
    .prepare(`SELECT employee_limit FROM companies WHERE id = ? LIMIT 1`)
    .bind(input.companyId)
    .first<{ employee_limit: number }>();

  if (!company) return { ok: false, error: "Company not found." };

  const count = await getSaasEmployeeCount(db, input.companyId);
  if (count >= company.employee_limit) {
    return {
      ok: false,
      error: `Employee limit reached (${company.employee_limit} on your current plan). Please upgrade to add more.`,
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = input.email.trim().toLowerCase();

  try {
    await db
      .prepare(
        `INSERT INTO saas_employees (id, company_id, name, email, role, department, status, joined_on, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
      )
      .bind(
        id,
        input.companyId,
        input.name.trim(),
        email,
        input.role?.trim() || "Employee",
        input.department?.trim() || "General",
        now,
        now,
      )
      .run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return { ok: false, error: "An employee with this email already exists in your company." };
    }
    return { ok: false, error: "Failed to add employee." };
  }

  return {
    ok: true,
    employee: {
      id,
      company_id: input.companyId,
      name: input.name.trim(),
      email,
      role: input.role?.trim() || "Employee",
      department: input.department?.trim() || "General",
      status: "Active",
      joined_on: now,
      created_at: now,
    },
  };
}

export async function deleteSaasEmployee(
  db: D1Database,
  employeeId: string,
  companyId: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM saas_employees WHERE id = ? AND company_id = ?`)
    .bind(employeeId, companyId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
