import { isAdminRole, isWorkEmail, normalizeDomain } from "./hrms.shared";

export type UserStatus = "Active" | "Invited" | "Pending";

export interface Organization {
  id: string;
  name: string;
  domain: string;
  inviteLimit: number;
  createdAt: string;
}

export interface HRMSUser {
  id: string;
  companyId: string | null;
  organizationName: string | null;
  name: string;
  email: string;
  role: string;
  department: string;
  designation: string | null;
  phone: string | null;
  gender: string | null;
  dob: string | null;
  employmentType: string | null;
  status: UserStatus;
  joinedOn: string;
  inviteSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Bank details
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankAccountType: string | null;
  // Emergency contact
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
}

export interface InviteUserInput {
  companyId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  designation?: string;
  phone?: string;
  gender?: string;
  dob?: string;
  employmentType?: string;
  joinedOn?: string;
}

export interface RegisterOrganizationInput {
  organizationName: string;
  adminName: string;
  email: string;
  department: string;
}

let supportsOrganizationsCache: boolean | null = null;

async function supportsOrganizations(db: D1Database): Promise<boolean> {
  if (supportsOrganizationsCache !== null) {
    return supportsOrganizationsCache;
  }

  try {
    const orgTable = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'organizations'`)
      .first<{ name: string }>();
    const orgColumn = await db
      .prepare(`SELECT 1 AS exists_flag FROM pragma_table_info('users') WHERE name = 'org_id' LIMIT 1`)
      .first<{ exists_flag: number }>();

    supportsOrganizationsCache = Boolean(orgTable?.name && orgColumn?.exists_flag);
  } catch {
    supportsOrganizationsCache = false;
  }

  return supportsOrganizationsCache;
}

function normalizeMonthYear(value: string | null | undefined): string {
  if (!value) {
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date());
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(asDate);
}

function mapUser(row: Record<string, unknown>): HRMSUser {
  const companyId = row.company_id ? String(row.company_id) : row.org_id ? String(row.org_id) : null;
  return {
    id: String(row.id),
    companyId,
    organizationName: row.organization_name ? String(row.organization_name) : null,
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
    department: String(row.department),
    designation: row.designation ? String(row.designation) : null,
    phone: row.phone ? String(row.phone) : null,
    gender: row.gender ? String(row.gender) : null,
    dob: row.dob ? String(row.dob) : null,
    employmentType: row.employment_type ? String(row.employment_type) : null,
    status: String(row.status) as UserStatus,
    joinedOn: normalizeMonthYear(row.joined_on as string | null | undefined),
    inviteSentAt: row.invite_sent_at ? String(row.invite_sent_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    bankName: row.bank_name ? String(row.bank_name) : null,
    bankAccount: row.bank_account ? String(row.bank_account) : null,
    bankIfsc: row.bank_ifsc ? String(row.bank_ifsc) : null,
    bankAccountType: row.bank_account_type ? String(row.bank_account_type) : null,
    emergencyContactName: row.emergency_contact_name ? String(row.emergency_contact_name) : null,
    emergencyContactPhone: row.emergency_contact_phone ? String(row.emergency_contact_phone) : null,
    emergencyContactRelation: row.emergency_contact_relation ? String(row.emergency_contact_relation) : null,
  };
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id),
    name: String(row.name),
    domain: String(row.domain),
    inviteLimit: Number(row.invite_limit),
    createdAt: String(row.created_at),
  };
}

async function listUsersLegacy(db: D1Database): Promise<HRMSUser[]> {
  const result = await db
    .prepare(
      `SELECT id, NULL AS company_id, NULL AS org_id, NULL AS organization_name, name, email, role, department, designation, phone, gender, dob, employment_type, status, joined_on, invite_sent_at, created_at, updated_at
       FROM users
       ORDER BY datetime(created_at) DESC, name ASC`,
    )
    .all<Record<string, unknown>>();

  return result.results.map(mapUser);
}

export async function listUsers(db: D1Database, companyId?: string): Promise<HRMSUser[]> {
  if (!(await supportsOrganizations(db))) {
    return listUsersLegacy(db);
  }

  const statement = companyId
    ? db.prepare(
        `SELECT users.id, COALESCE(users.company_id, users.org_id) AS company_id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.designation, users.phone, users.gender, users.dob, users.employment_type, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at
         FROM users
         LEFT JOIN organizations ON organizations.id = COALESCE(users.company_id, users.org_id)
         WHERE COALESCE(users.company_id, users.org_id) = ?
         ORDER BY datetime(users.created_at) DESC, users.name ASC`,
      ).bind(companyId)
    : db.prepare(
        `SELECT users.id, COALESCE(users.company_id, users.org_id) AS company_id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.designation, users.phone, users.gender, users.dob, users.employment_type, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at
         FROM users
         LEFT JOIN organizations ON organizations.id = COALESCE(users.company_id, users.org_id)
         ORDER BY datetime(users.created_at) DESC, users.name ASC`,
      );

  const result = await statement.all<Record<string, unknown>>();
  return result.results.map(mapUser);
}

export async function getUserByEmail(db: D1Database, email: string): Promise<HRMSUser | null> {
  if (!(await supportsOrganizations(db))) {
    const legacyResult = await db
      .prepare(
        `SELECT id, NULL AS org_id, NULL AS organization_name, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at
         FROM users
         WHERE lower(email) = lower(?)
         LIMIT 1`,
      )
      .bind(email.trim())
      .first<Record<string, unknown>>();

    return legacyResult ? mapUser(legacyResult) : null;
  }

  const result = await db
    .prepare(
      `SELECT users.id, COALESCE(users.company_id, users.org_id) AS company_id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.designation, users.phone, users.gender, users.dob, users.employment_type, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at,
              users.bank_name, users.bank_account, users.bank_ifsc, users.bank_account_type,
              users.emergency_contact_name, users.emergency_contact_phone, users.emergency_contact_relation
       FROM users
        LEFT JOIN organizations ON organizations.id = COALESCE(users.company_id, users.org_id)
       WHERE lower(users.email) = lower(?)
       LIMIT 1`,
    )
    .bind(email.trim())
    .first<Record<string, unknown>>();

  return result ? mapUser(result) : null;
}

export async function getUserById(db: D1Database, id: string): Promise<HRMSUser | null> {
  if (!(await supportsOrganizations(db))) {
    const legacyResult = await db
      .prepare(
        `SELECT id, NULL AS org_id, NULL AS organization_name, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(id)
      .first<Record<string, unknown>>();

    return legacyResult ? mapUser(legacyResult) : null;
  }

  const result = await db
    .prepare(
      `SELECT users.id, COALESCE(users.company_id, users.org_id) AS company_id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.designation, users.phone, users.gender, users.dob, users.employment_type, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at,
              users.bank_name, users.bank_account, users.bank_ifsc, users.bank_account_type,
              users.emergency_contact_name, users.emergency_contact_phone, users.emergency_contact_relation
       FROM users
        LEFT JOIN organizations ON organizations.id = COALESCE(users.company_id, users.org_id)
       WHERE users.id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();

  return result ? mapUser(result) : null;
}

export async function getOrganizationById(db: D1Database, id: string): Promise<Organization | null> {
  if (!(await supportsOrganizations(db))) {
    return null;
  }

  const result = await db
    .prepare(`SELECT id, name, domain, invite_limit, created_at FROM organizations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<Record<string, unknown>>();

  return result ? mapOrganization(result) : null;
}

export async function getOrganizationByDomain(db: D1Database, domain: string): Promise<Organization | null> {
  if (!(await supportsOrganizations(db))) {
    return null;
  }

  const result = await db
    .prepare(`SELECT id, name, domain, invite_limit, created_at FROM organizations WHERE lower(domain) = lower(?) LIMIT 1`)
    .bind(domain)
    .first<Record<string, unknown>>();

  return result ? mapOrganization(result) : null;
}

export async function getOrganizationMemberUsage(db: D1Database, companyId: string): Promise<number> {
  if (!(await supportsOrganizations(db))) {
    const users = await listUsersLegacy(db);
    return users.filter((user) => !isAdminRole(user.role)).length;
  }

  const result = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM users
       WHERE COALESCE(company_id, org_id) = ?
       AND lower(role) NOT LIKE '%admin%'`,
    )
    .bind(companyId)
    .first<{ count: number | string }>();

  return Number(result?.count ?? 0);
}

export async function createOrUpdateInvitedUser(
  db: D1Database,
  input: InviteUserInput,
): Promise<HRMSUser> {
  if (!(await supportsOrganizations(db))) {
    throw new Error("Please apply the latest D1 migrations before inviting users.");
  }

  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const existing = await getUserByEmail(db, email);

  const desig = input.designation?.trim() || null;
  const phone = input.phone?.trim() || null;
  const gender = input.gender?.trim() || null;
  const dob = input.dob?.trim() || null;
  const empType = input.employmentType?.trim() || "Full-time";

  if (existing) {
    await db
      .prepare(
        `UPDATE users
         SET company_id = ?, org_id = COALESCE(org_id, ?), name = ?, role = ?, department = ?,
             designation = ?, phone = ?, gender = ?, dob = ?, employment_type = ?,
             status = 'Invited', invite_sent_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.companyId, input.companyId, input.name.trim(), input.role.trim(), input.department.trim(),
            desig, phone, gender, dob, empType, now, now, existing.id)
      .run();

    const updated = await getUserById(db, existing.id);
    if (!updated) throw new Error("Updated user could not be reloaded.");
    return updated;
  }

  const id = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const joinedOn = input.joinedOn?.trim() || new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, company_id, org_id, name, email, role, department,
                          designation, phone, gender, dob, employment_type,
                          status, joined_on, invite_sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Invited', ?, ?, ?, ?)`,
    )
    .bind(id, input.companyId, input.companyId, input.name.trim(), email,
          input.role.trim(), input.department.trim(),
          desig, phone, gender, dob, empType,
          joinedOn, now, now, now)
    .run();

  const created = await getUserById(db, id);
  if (!created) throw new Error("Created user could not be reloaded.");
  return created;
}

export async function updateUserDetails(
  db: D1Database,
  userId: string,
  tenantId: string,
  updates: Partial<{
    name: string; role: string; department: string; designation: string;
    phone: string; gender: string; dob: string; employmentType: string; joinedOn: string;
    bankName: string; bankAccount: string; bankIfsc: string; bankAccountType: string;
    emergencyContactName: string; emergencyContactPhone: string; emergencyContactRelation: string;
  }>,
): Promise<void> {
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  const map: Record<string, string> = {
    name: "name", role: "role", department: "department", designation: "designation",
    phone: "phone", gender: "gender", dob: "dob", employmentType: "employment_type", joinedOn: "joined_on",
    bankName: "bank_name", bankAccount: "bank_account", bankIfsc: "bank_ifsc", bankAccountType: "bank_account_type",
    emergencyContactName: "emergency_contact_name", emergencyContactPhone: "emergency_contact_phone",
    emergencyContactRelation: "emergency_contact_relation",
  };

  for (const [key, col] of Object.entries(map)) {
    if (key in updates && updates[key as keyof typeof updates] !== undefined) {
      fields.push(`${col} = ?`);
      values.push((updates[key as keyof typeof updates] as string)?.trim() || null);
    }
  }

  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(now, userId, tenantId);

  await db
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(...values)
    .run();
}

export async function deleteUser(
  db: D1Database,
  userId: string,
  tenantId: string,
): Promise<void> {
  // Look up email first for auth_users cleanup
  const user = await db
    .prepare(`SELECT email FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(userId, tenantId)
    .first<{ email: string }>();

  if (!user) throw new Error("User not found.");

  await db.batch([
    db.prepare(`DELETE FROM invite_tokens WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM auth_users WHERE lower(email) = lower(?)`).bind(user.email),
    db.prepare(`DELETE FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ?`).bind(userId, tenantId),
  ]);
}

// ── Bulk CSV import ──────────────────────────────────────────────────────────

export interface ImportEmployeeRow {
  name: string;
  email: string;
  role?: string;
  department?: string;
  designation?: string;
  phone?: string;
  gender?: string;
  dob?: string;
  employmentType?: string;
  joinedOn?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export async function bulkImportEmployees(
  db: D1Database,
  companyId: string,
  rows: ImportEmployeeRow[],
  skipDuplicates: boolean,
  seatLimit: number,
): Promise<ImportResult> {
  const VALID_ROLES = new Set(["Employee", "Manager", "HR Manager", "HR Admin"]);
  const errors: ImportResult["errors"] = [];
  const seenEmails = new Set<string>();
  const validRows: Array<ImportEmployeeRow & { email: string; role: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    if (!r.name?.trim()) {
      errors.push({ row: rowNum, email: r.email || "", error: "Name is required." });
      continue;
    }
    if (!r.email?.trim()) {
      errors.push({ row: rowNum, email: "", error: "Email is required." });
      continue;
    }
    const email = r.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: rowNum, email: r.email, error: "Invalid email format." });
      continue;
    }
    if (seenEmails.has(email)) {
      errors.push({ row: rowNum, email, error: "Duplicate email within the CSV." });
      continue;
    }
    const role = r.role?.trim() || "Employee";
    if (!VALID_ROLES.has(role)) {
      errors.push({ row: rowNum, email, error: `Unknown role "${role}". Use: Employee, Manager, HR Manager, HR Admin.` });
      continue;
    }
    seenEmails.add(email);
    validRows.push({ ...r, email, role });
  }

  if (validRows.length === 0) {
    return { imported: 0, skipped: 0, errors };
  }

  // Find which emails already exist in this tenant
  const existingResult = await db
    .prepare(`SELECT lower(email) as email FROM users WHERE COALESCE(company_id, org_id) = ?`)
    .bind(companyId)
    .all<{ email: string }>();
  const existingEmails = new Set(existingResult.results.map((r) => r.email));

  let skipped = 0;
  const toInsert: typeof validRows = [];

  for (const r of validRows) {
    if (existingEmails.has(r.email)) {
      if (skipDuplicates) {
        skipped++;
      } else {
        errors.push({ row: 0, email: r.email, error: "Email already exists in the system." });
      }
    } else {
      toInsert.push(r);
    }
  }

  if (toInsert.length === 0) {
    return { imported: 0, skipped, errors };
  }

  // Verify seat headroom
  const currentCount = await db
    .prepare(`SELECT COUNT(*) as cnt FROM users WHERE COALESCE(company_id, org_id) = ?`)
    .bind(companyId)
    .first<{ cnt: number }>();
  const currentMembers = currentCount?.cnt ?? 0;
  const slotsAvailable = seatLimit - currentMembers;
  if (toInsert.length > slotsAvailable) {
    throw new Error(
      `Import would exceed seat limit. ${slotsAvailable} slot(s) available, ${toInsert.length} new employee(s) to add.`,
    );
  }

  const now = new Date().toISOString();
  const statements = toInsert.map((r) => {
    const id = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    return db
      .prepare(
        `INSERT OR IGNORE INTO users
           (id, company_id, org_id, name, email, role, department,
            designation, phone, gender, dob, employment_type,
            status, joined_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Invited', ?, ?, ?)`,
      )
      .bind(
        id, companyId, companyId,
        r.name.trim(), r.email,
        r.role,
        r.department?.trim() || "General",
        r.designation?.trim() || null,
        r.phone?.trim() || null,
        r.gender?.trim() || null,
        r.dob?.trim() || null,
        r.employmentType?.trim() || "Full-time",
        r.joinedOn?.trim() || now,
        now, now,
      );
  });

  // Batch in chunks of 100 (D1 limit)
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }

  return { imported: toInsert.length, skipped, errors };
}

export async function registerOrganization(
  db: D1Database,
  input: RegisterOrganizationInput,
): Promise<{ organization: Organization; adminUser: HRMSUser }> {
  if (!(await supportsOrganizations(db))) {
    throw new Error("Please apply the latest D1 migrations before registering a company.");
  }

  const email = input.email.trim().toLowerCase();
  const domain = normalizeDomain(email);
  const organizationDomain = domain === "gmail.com" ? `gmail:${email}` : domain;

  if (!isWorkEmail(email)) {
    throw new Error("Please use a Gmail or company email address.");
  }

  const existingUser = await getUserByEmail(db, email);
  if (existingUser) {
    throw new Error("This email is already registered. Please sign in or contact your admin.");
  }

  const existingOrganization = await getOrganizationByDomain(db, organizationDomain);
  if (existingOrganization) {
    throw new Error(
      domain === "gmail.com"
        ? "This Gmail account is already linked to a workspace. Please sign in with the same email."
        : "This company domain is already registered. Please contact your existing admin to get invited.",
    );
  }

  const companyId = `ORG${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const userId = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO organizations (id, name, domain, invite_limit, created_at, updated_at)
       VALUES (?, ?, ?, 10, ?, ?)`,
    )
    .bind(companyId, input.organizationName.trim(), organizationDomain, now, now)
    .run();

  await db
    .prepare(
      `INSERT INTO users (id, company_id, org_id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Admin', ?, 'Active', ?, ?, ?, ?)`,
    )
    .bind(userId, companyId, companyId, input.adminName.trim(), email, input.department.trim(), now, now, now, now)
    .run();

  const organization = await getOrganizationById(db, companyId);
  const adminUser = await getUserById(db, userId);

  if (!organization || !adminUser) {
    throw new Error("Registration completed partially and could not be reloaded.");
  }

  return { organization, adminUser };
}

export async function markInviteSent(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE users SET invite_sent_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, id)
    .run();
}

export async function activateInvitedUser(db: D1Database, id: string): Promise<HRMSUser> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE users
       SET status = 'Active', updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, id)
    .run();

  const user = await getUserById(db, id);
  if (!user) {
    throw new Error("Invited user could not be loaded.");
  }

  return user;
}

export async function getDashboardData(db: D1Database, companyId?: string) {
  const orgSupport = await supportsOrganizations(db);
  const users = await listUsers(db, companyId);
  const organization = orgSupport && companyId ? await getOrganizationById(db, companyId) : null;

  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.status === "Active").length;
  const invitedUsers = users.filter((user) => user.status === "Invited").length;
  const adminUsers = users.filter((user) => isAdminRole(user.role)).length;
  const memberUsage = orgSupport && companyId
    ? await getOrganizationMemberUsage(db, companyId)
    : users.filter((user) => !isAdminRole(user.role)).length;
  const inviteLimit = organization?.inviteLimit ?? 0;

  const recentUsers = users.slice(0, 5);
  const pendingInvites = users
    .filter((user) => user.status === "Invited")
    .slice(0, 5)
    .map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      department: user.department,
      detail: user.inviteSentAt
        ? `Invite sent ${new Date(user.inviteSentAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}`
        : "Invite pending",
    }));

  const departmentCounts = new Map<string, number>();
  for (const user of users) {
    departmentCounts.set(user.department, (departmentCounts.get(user.department) ?? 0) + 1);
  }

  const departmentData = Array.from(departmentCounts.entries())
    .map(([department, count]) => ({
      department,
      count,
      percent: totalUsers === 0 ? 0 : Math.round((count / totalUsers) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    organization,
    stats: [
      { label: "Total Users", value: String(totalUsers), delta: `${activeUsers} active`, tone: "positive" as const },
      { label: "Active Employees", value: String(activeUsers), delta: `${invitedUsers} invited`, tone: "positive" as const },
      { label: "Pending Invites", value: String(invitedUsers), delta: invitedUsers === 0 ? "All caught up" : "Awaiting setup", tone: invitedUsers === 0 ? "positive" as const : "warning" as const },
      { label: "Invite Capacity", value: inviteLimit ? `${memberUsage}/${inviteLimit}` : String(memberUsage), delta: inviteLimit ? `${Math.max(inviteLimit - memberUsage, 0)} seats left` : "Apply org migration to unlock invite limits", tone: "neutral" as const },
      { label: "Admins", value: String(adminUsers), delta: "Users with elevated access", tone: "neutral" as const },
    ],
    recentUsers,
    pendingInvites,
    departmentData,
  };
}

