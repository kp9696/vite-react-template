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
  orgId: string | null;
  organizationName: string | null;
  name: string;
  email: string;
  role: string;
  department: string;
  status: UserStatus;
  joinedOn: string;
  inviteSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InviteUserInput {
  orgId: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

export interface RegisterOrganizationInput {
  organizationName: string;
  adminName: string;
  email: string;
  department: string;
}

export const DEMO_ORG_ID = "ORGDEMOUI";
export const DEMO_EMAIL = "__demo__";

export const DEMO_USER: HRMSUser = {
  id: "USRDEMO01",
  orgId: DEMO_ORG_ID,
  organizationName: "JWithKP Demo Workspace",
  name: "Demo Admin",
  email: "demo@jwithkp.demo",
  role: "HR Admin",
  department: "Operations",
  status: "Active",
  joinedOn: "Apr 2026",
  inviteSentAt: null,
  createdAt: "2026-04-01T09:00:00.000Z",
  updatedAt: "2026-04-01T09:00:00.000Z",
};

export const DEMO_ORGANIZATION: Organization = {
  id: DEMO_ORG_ID,
  name: "JWithKP Demo Workspace",
  domain: "jwithkp.demo",
  inviteLimit: 5,
  createdAt: "2026-04-01T09:00:00.000Z",
};

export const DEMO_USERS: HRMSUser[] = [
  DEMO_USER,
  {
    id: "USRDEMO02",
    orgId: DEMO_ORG_ID,
    organizationName: "JWithKP Demo Workspace",
    name: "Aarav Shah",
    email: "aarav@jwithkp.demo",
    role: "Employee",
    department: "Engineering",
    status: "Active",
    joinedOn: "Apr 2026",
    inviteSentAt: null,
    createdAt: "2026-04-02T09:00:00.000Z",
    updatedAt: "2026-04-02T09:00:00.000Z",
  },
  {
    id: "USRDEMO03",
    orgId: DEMO_ORG_ID,
    organizationName: "JWithKP Demo Workspace",
    name: "Priya Nair",
    email: "priya@jwithkp.demo",
    role: "Manager",
    department: "Design",
    status: "Active",
    joinedOn: "Apr 2026",
    inviteSentAt: null,
    createdAt: "2026-04-03T09:00:00.000Z",
    updatedAt: "2026-04-03T09:00:00.000Z",
  },
  {
    id: "USRDEMO04",
    orgId: DEMO_ORG_ID,
    organizationName: "JWithKP Demo Workspace",
    name: "Rohan Mehta",
    email: "rohan@jwithkp.demo",
    role: "Employee",
    department: "Analytics",
    status: "Invited",
    joinedOn: "Apr 2026",
    inviteSentAt: "2026-04-04T09:00:00.000Z",
    createdAt: "2026-04-04T09:00:00.000Z",
    updatedAt: "2026-04-04T09:00:00.000Z",
  },
  {
    id: "USRDEMO05",
    orgId: DEMO_ORG_ID,
    organizationName: "JWithKP Demo Workspace",
    name: "Sneha Pillai",
    email: "sneha@jwithkp.demo",
    role: "HR Manager",
    department: "People Ops",
    status: "Active",
    joinedOn: "Apr 2026",
    inviteSentAt: null,
    createdAt: "2026-04-05T09:00:00.000Z",
    updatedAt: "2026-04-05T09:00:00.000Z",
  },
];

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
  return {
    id: String(row.id),
    orgId: row.org_id ? String(row.org_id) : null,
    organizationName: row.organization_name ? String(row.organization_name) : null,
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
    department: String(row.department),
    status: String(row.status) as UserStatus,
    joinedOn: normalizeMonthYear(row.joined_on as string | null | undefined),
    inviteSentAt: row.invite_sent_at ? String(row.invite_sent_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
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
      `SELECT id, NULL AS org_id, NULL AS organization_name, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at
       FROM users
       ORDER BY datetime(created_at) DESC, name ASC`,
    )
    .all<Record<string, unknown>>();

  return result.results.map(mapUser);
}

export async function listUsers(db: D1Database, orgId?: string): Promise<HRMSUser[]> {
  if (!(await supportsOrganizations(db))) {
    return listUsersLegacy(db);
  }

  const statement = orgId
    ? db.prepare(
        `SELECT users.id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at
         FROM users
         LEFT JOIN organizations ON organizations.id = users.org_id
         WHERE users.org_id = ?
         ORDER BY datetime(users.created_at) DESC, users.name ASC`,
      ).bind(orgId)
    : db.prepare(
        `SELECT users.id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at
         FROM users
         LEFT JOIN organizations ON organizations.id = users.org_id
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
      `SELECT users.id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at
       FROM users
       LEFT JOIN organizations ON organizations.id = users.org_id
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
      `SELECT users.id, users.org_id, organizations.name AS organization_name, users.name, users.email, users.role, users.department, users.status, users.joined_on, users.invite_sent_at, users.created_at, users.updated_at
       FROM users
       LEFT JOIN organizations ON organizations.id = users.org_id
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

export async function getOrganizationMemberUsage(db: D1Database, orgId: string): Promise<number> {
  if (!(await supportsOrganizations(db))) {
    const users = await listUsersLegacy(db);
    return users.filter((user) => !isAdminRole(user.role)).length;
  }

  const result = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM users
       WHERE org_id = ?
       AND lower(role) NOT LIKE '%admin%'`,
    )
    .bind(orgId)
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

  if (existing) {
    await db
      .prepare(
        `UPDATE users
         SET org_id = ?, name = ?, role = ?, department = ?, status = 'Invited', invite_sent_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.orgId, input.name.trim(), input.role.trim(), input.department.trim(), now, now, existing.id)
      .run();

    const updated = await getUserById(db, existing.id);
    if (!updated) {
      throw new Error("Updated user could not be reloaded.");
    }
    return updated;
  }

  const id = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const joinedOn = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, org_id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Invited', ?, ?, ?, ?)`,
    )
    .bind(id, input.orgId, input.name.trim(), email, input.role.trim(), input.department.trim(), joinedOn, now, now, now)
    .run();

  const created = await getUserById(db, id);
  if (!created) {
    throw new Error("Created user could not be reloaded.");
  }
  return created;
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

  if (!isWorkEmail(email)) {
    throw new Error("Please use your work email address.");
  }

  const existingUser = await getUserByEmail(db, email);
  if (existingUser) {
    throw new Error("This email is already registered. Please use Google SSO to sign in.");
  }

  const existingOrganization = await getOrganizationByDomain(db, domain);
  if (existingOrganization) {
    throw new Error("This company domain is already registered. Please use Google SSO to sign in.");
  }

  const orgId = `ORG${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const userId = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO organizations (id, name, domain, invite_limit, created_at, updated_at)
       VALUES (?, ?, ?, 10, ?, ?)`,
    )
    .bind(orgId, input.organizationName.trim(), domain, now, now)
    .run();

  await db
    .prepare(
      `INSERT INTO users (id, org_id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Admin', ?, 'Active', ?, ?, ?, ?)`,
    )
    .bind(userId, orgId, input.adminName.trim(), email, input.department.trim(), now, now, now, now)
    .run();

  const organization = await getOrganizationById(db, orgId);
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

export async function getDashboardData(db: D1Database, orgId?: string) {
  const orgSupport = await supportsOrganizations(db);
  const users = await listUsers(db, orgId);
  const organization = orgSupport && orgId ? await getOrganizationById(db, orgId) : null;

  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.status === "Active").length;
  const invitedUsers = users.filter((user) => user.status === "Invited").length;
  const adminUsers = users.filter((user) => isAdminRole(user.role)).length;
  const memberUsage = orgSupport && orgId
    ? await getOrganizationMemberUsage(db, orgId)
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

export function getDemoDashboardData() {
  const users = DEMO_USERS;
  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.status === "Active").length;
  const invitedUsers = users.filter((user) => user.status === "Invited").length;
  const adminUsers = users.filter((user) => isAdminRole(user.role)).length;
  const memberUsage = users.filter((user) => !isAdminRole(user.role)).length;

  const departmentCounts = new Map<string, number>();
  for (const user of users) {
    departmentCounts.set(user.department, (departmentCounts.get(user.department) ?? 0) + 1);
  }

  return {
    organization: DEMO_ORGANIZATION,
    stats: [
      { label: "Total Users", value: String(totalUsers), delta: `${activeUsers} active`, tone: "positive" as const },
      { label: "Active Employees", value: String(activeUsers), delta: `${invitedUsers} invited`, tone: "positive" as const },
      { label: "Pending Invites", value: String(invitedUsers), delta: "Awaiting setup", tone: "warning" as const },
      { label: "Invite Capacity", value: `${memberUsage}/${DEMO_ORGANIZATION.inviteLimit}`, delta: `${Math.max(DEMO_ORGANIZATION.inviteLimit - memberUsage, 0)} seats left`, tone: "neutral" as const },
      { label: "Admins", value: String(adminUsers), delta: "Users with elevated access", tone: "neutral" as const },
    ],
    recentUsers: users.slice(0, 5),
    pendingInvites: users.filter((user) => user.status === "Invited").map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      department: user.department,
      detail: "Invite sent 4 Apr",
    })),
    departmentData: Array.from(departmentCounts.entries()).map(([department, count]) => ({
      department,
      count,
      percent: Math.round((count / totalUsers) * 100),
    })),
  };
}
