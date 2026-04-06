export type UserStatus = "Active" | "Invited" | "Pending";

export interface HRMSUser {
  id: string;
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
  name: string;
  email: string;
  role: string;
  department: string;
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

export async function listUsers(db: D1Database): Promise<HRMSUser[]> {
  const result = await db
    .prepare(
      `SELECT id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at
       FROM users
       ORDER BY datetime(created_at) DESC, name ASC`,
    )
    .all<Record<string, unknown>>();

  return result.results.map(mapUser);
}

export async function getUserByEmail(db: D1Database, email: string): Promise<HRMSUser | null> {
  const result = await db
    .prepare(
      `SELECT id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`,
    )
    .bind(email.trim())
    .first<Record<string, unknown>>();

  return result ? mapUser(result) : null;
}

export async function getUserById(db: D1Database, id: string): Promise<HRMSUser | null> {
  const result = await db
    .prepare(
      `SELECT id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();

  return result ? mapUser(result) : null;
}

export async function createOrUpdateInvitedUser(
  db: D1Database,
  input: InviteUserInput,
): Promise<HRMSUser> {
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const existing = await getUserByEmail(db, email);

  if (existing) {
    await db
      .prepare(
        `UPDATE users
         SET name = ?, role = ?, department = ?, status = 'Invited', invite_sent_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.name.trim(), input.role.trim(), input.department.trim(), now, now, existing.id)
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
      `INSERT INTO users (id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Invited', ?, ?, ?, ?)`,
    )
    .bind(id, input.name.trim(), email, input.role.trim(), input.department.trim(), joinedOn, now, now, now)
    .run();

  const created = await getUserById(db, id);
  if (!created) {
    throw new Error("Created user could not be reloaded.");
  }
  return created;
}

export async function markInviteSent(db: D1Database, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE users SET invite_sent_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, id)
    .run();
}

export async function getDashboardData(db: D1Database) {
  const users = await listUsers(db);

  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.status === "Active").length;
  const invitedUsers = users.filter((user) => user.status === "Invited").length;
  const adminUsers = users.filter((user) => user.role.toLowerCase().includes("admin")).length;

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
    stats: [
      { label: "Total Users", value: String(totalUsers), delta: `${activeUsers} active`, tone: "positive" as const },
      { label: "Active Employees", value: String(activeUsers), delta: `${invitedUsers} invited`, tone: "positive" as const },
      { label: "Pending Invites", value: String(invitedUsers), delta: invitedUsers === 0 ? "All caught up" : "Awaiting setup", tone: invitedUsers === 0 ? "positive" as const : "warning" as const },
      { label: "Admins", value: String(adminUsers), delta: "Users with elevated access", tone: "neutral" as const },
    ],
    recentUsers,
    pendingInvites,
    departmentData,
  };
}
