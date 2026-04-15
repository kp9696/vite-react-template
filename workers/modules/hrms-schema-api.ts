import { hashPassword, requireAuth } from "../security/auth";
import { withCors } from "../security/cors";

interface ApiUser {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
}

type JsonMap = Record<string, unknown>;

const ADMIN_ROLES = new Set(["admin", "hr", "hr admin"]);

function apiJson(request: Request, env: Env, payload: JsonMap, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
    request,
    env,
  );
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function requireApiUser(request: Request, env: Env): Promise<ApiUser | Response> {
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;
  if (!accessSecret) {
    return apiJson(request, env, { error: "JWT access secret is not configured." }, 500);
  }

  const auth = await requireAuth(request, accessSecret);
  if (!auth) {
    return apiJson(request, env, { error: "Unauthorized." }, 401);
  }

  return auth;
}

function isAdminLike(role: string): boolean {
  return ADMIN_ROLES.has(role.trim().toLowerCase());
}

async function ensureSupportTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS payroll (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        base_salary INTEGER NOT NULL,
        bonus INTEGER NOT NULL DEFAULT 0,
        deductions INTEGER NOT NULL DEFAULT 0,
        net_salary INTEGER NOT NULL,
        pay_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_user_id ON payroll(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_payroll_pay_date ON payroll(pay_date)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`).run();
}

async function logAudit(
  db: D1Database,
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString(),
    )
    .run();
}

async function handleCoreUsersList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT users.id, users.email, users.role, users.status, users.name, users.department, users.created_at,
              auth_users.is_verified
       FROM users
       LEFT JOIN auth_users ON lower(auth_users.email) = lower(users.email)
       WHERE COALESCE(users.company_id, users.org_id) = ?
       ORDER BY datetime(users.created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return apiJson(request, env, { users: rows.results });
}

async function handleCoreUsersCreate(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ email?: string; password?: string; role?: string; name?: string; department?: string }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  const password = (body?.password || "").trim();
  const role = (body?.role || "employee").trim();
  const name = (body?.name || "Employee").trim();
  const department = (body?.department || "General").trim();

  if (!email || !password || password.length < 8) {
    return apiJson(request, env, { error: "Valid email and password (min 8 chars) are required." }, 400);
  }

  const exists = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (exists) {
    return apiJson(request, env, { error: "Email already exists." }, 409);
  }

  const now = new Date().toISOString();
  const userId = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const passwordHash = await hashPassword(password);

  await env.HRMS
    .prepare(`INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, lower(?), ?, 1)`)
    .bind(name, email, passwordHash)
    .run();

  await env.HRMS
    .prepare(
      `INSERT INTO users (id, company_id, org_id, name, email, role, department, status, joined_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, lower(?), ?, ?, 'Active', ?, ?, ?)`,
    )
    .bind(userId, user.tenantId, user.tenantId, name, email, role, department, now, now, now)
    .run();

  await logAudit(env.HRMS, user.userId, "user.create", "users", userId, { email, role, department });

  return apiJson(request, env, { ok: true, id: userId }, 201);
}

async function handleCoreDepartmentsList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS.prepare(`SELECT id, name, created_at, updated_at FROM departments ORDER BY name ASC`).all();
  return apiJson(request, env, { departments: rows.results });
}

async function handleCoreDepartmentsCreate(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ name?: string }>(request);
  const name = (body?.name || "").trim();
  if (!name) {
    return apiJson(request, env, { error: "Department name is required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.HRMS
      .prepare(`INSERT INTO departments (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(id, name, now, now)
      .run();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("UNIQUE")) {
      return apiJson(request, env, { error: "Department already exists." }, 409);
    }
    return apiJson(request, env, { error: "Failed to create department." }, 500);
  }

  await logAudit(env.HRMS, user.userId, "department.create", "departments", id, { name });
  return apiJson(request, env, { ok: true, id }, 201);
}

async function handleCoreEmployeesList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT id, COALESCE(company_id, org_id) AS company_id, org_id, name, email, role, department, status, joined_on, created_at, updated_at
       FROM users
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return apiJson(request, env, { employees: rows.results });
}

async function handleCoreEmployeesCreate(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ name?: string; email?: string; role?: string; department?: string; password?: string }>(request);
  const name = (body?.name || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const role = (body?.role || "Employee").trim();
  const department = (body?.department || "General").trim();
  const password = (body?.password || "TempPass@123").trim();

  if (!name || !email) {
    return apiJson(request, env, { error: "name and email are required." }, 400);
  }

  const exists = await env.HRMS.prepare(`SELECT id FROM auth_users WHERE lower(email)=lower(?) LIMIT 1`).bind(email).first<{ id: number }>();
  if (exists) {
    return apiJson(request, env, { error: "Email already exists." }, 409);
  }

  const now = new Date().toISOString();
  const userId = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await env.HRMS
    .prepare(`INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, lower(?), ?, 1)`)
    .bind(name, email, await hashPassword(password))
    .run();

  await env.HRMS
    .prepare(
      `INSERT INTO users (id, company_id, org_id, name, email, role, department, status, joined_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, lower(?), ?, ?, 'Active', ?, ?, ?)`,
    )
    .bind(userId, user.tenantId, user.tenantId, name, email, role, department, now, now, now)
    .run();

  await logAudit(env.HRMS, user.userId, "employee.create", "employees", userId, { email, role, department });
  return apiJson(request, env, { ok: true, id: userId }, 201);
}

async function handleCoreInvitationsList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT id, email, role, department, status, expires_at, accepted_at, created_at, updated_at
       FROM invitations
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return apiJson(request, env, { invitations: rows.results });
}

async function handleCoreAttendanceList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const date = params.get("date") || new Date().toISOString().slice(0, 10);

  const rows = await env.HRMS
    .prepare(
      `SELECT attendance.id, attendance.user_id, attendance.attendance_date, attendance.check_in_at, attendance.check_out_at,
              attendance.status, users.name, users.email
       FROM attendance
       LEFT JOIN users ON users.id = attendance.user_id
       WHERE COALESCE(attendance.company_id, attendance.org_id) = ? AND attendance.attendance_date = ?
       ORDER BY datetime(attendance.created_at) DESC`,
    )
    .bind(user.tenantId, date)
    .all();

  return apiJson(request, env, { date, attendance: rows.results });
}

async function handleCoreLeavesList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT leaves.id, leaves.user_id, leaves.leave_type, leaves.start_date, leaves.end_date, leaves.total_days,
              leaves.reason, leaves.status, leaves.approver_user_id, leaves.decided_at,
              users.name, users.email
       FROM leaves
       LEFT JOIN users ON users.id = leaves.user_id
       WHERE COALESCE(leaves.company_id, leaves.org_id) = ?
       ORDER BY datetime(leaves.created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return apiJson(request, env, { leaves: rows.results });
}

async function handleCoreLeavesApproveOrReject(
  leaveId: string,
  request: Request,
  env: Env,
  user: ApiUser,
  nextStatus: "approved" | "rejected",
): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const now = new Date().toISOString();
  const result = await env.HRMS
    .prepare(
      `UPDATE leaves
       SET status = ?, approver_user_id = ?, decided_at = ?, updated_at = ?
       WHERE id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(nextStatus, user.userId, now, now, leaveId, user.tenantId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return apiJson(request, env, { error: "Leave request not found." }, 404);
  }

  await logAudit(env.HRMS, user.userId, `leave.${nextStatus}`, "leaves", leaveId);
  return apiJson(request, env, { ok: true, id: leaveId, status: nextStatus });
}

async function handleCorePayrollList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT payroll.id, payroll.user_id, payroll.base_salary, payroll.bonus, payroll.deductions,
              payroll.net_salary, payroll.pay_date, payroll.created_at,
              users.name, users.email
       FROM payroll
       LEFT JOIN users ON users.id = payroll.user_id
       WHERE COALESCE(users.company_id, users.org_id) = ? OR payroll.user_id = ?
       ORDER BY datetime(payroll.created_at) DESC`,
    )
    .bind(user.tenantId, user.userId)
    .all();

  return apiJson(request, env, { payroll: rows.results });
}

async function handleCorePayrollCreate(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{
    userId?: string;
    baseSalary?: number;
    bonus?: number;
    deductions?: number;
    payDate?: string;
  }>(request);

  const userId = (body?.userId || "").trim();
  const baseSalary = Number(body?.baseSalary ?? 0);
  const bonus = Number(body?.bonus ?? 0);
  const deductions = Number(body?.deductions ?? 0);
  const payDate = (body?.payDate || new Date().toISOString().slice(0, 10)).trim();

  if (!userId || baseSalary <= 0) {
    return apiJson(request, env, { error: "userId and positive baseSalary are required." }, 400);
  }

  const netSalary = Math.max(baseSalary + bonus - deductions, 0);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.HRMS
    .prepare(
      `INSERT INTO payroll (id, user_id, base_salary, bonus, deductions, net_salary, pay_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, baseSalary, bonus, deductions, netSalary, payDate, now, now)
    .run();

  await logAudit(env.HRMS, user.userId, "payroll.create", "payroll", id, { userId, baseSalary, bonus, deductions, netSalary });

  return apiJson(request, env, { ok: true, id, netSalary }, 201);
}

async function handleCoreAssetsList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT assets.id, assets.asset_tag, assets.name, assets.category, assets.serial_no,
              assets.status, assets.condition, users.name AS assigned_to_name
       FROM assets
       LEFT JOIN asset_assignments ON asset_assignments.asset_id = assets.id AND asset_assignments.status = 'assigned'
       LEFT JOIN users ON users.id = asset_assignments.user_id
       WHERE COALESCE(assets.company_id, assets.org_id) = ?
       ORDER BY datetime(assets.created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return apiJson(request, env, { assets: rows.results });
}

async function handleCoreRefreshTokensList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT id, user_id, expires_at, revoked, created_at
       FROM refresh_tokens
       ORDER BY created_at DESC
       LIMIT 500`,
    )
    .all();

  return apiJson(request, env, { refreshTokens: rows.results });
}

async function handleCoreAuditLogsList(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminLike(user.role)) {
    return apiJson(request, env, { error: "Forbidden." }, 403);
  }

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit") || 100), 1), 500);

  const rows = await env.HRMS
    .prepare(
      `SELECT id, user_id, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all();

  return apiJson(request, env, { auditLogs: rows.results });
}

export async function handleSchemaCoreApi(request: Request, env: Env): Promise<Response | null> {
  const { method } = request;
  const { pathname } = new URL(request.url);

  if (!pathname.startsWith("/api/core/")) {
    return null;
  }

  await ensureSupportTables(env.HRMS);

  const auth = await requireApiUser(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const user = auth;

  if (method === "GET" && pathname === "/api/core/users") {
    return handleCoreUsersList(request, env, user);
  }

  if (method === "POST" && pathname === "/api/core/users") {
    return handleCoreUsersCreate(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/departments") {
    return handleCoreDepartmentsList(request, env, user);
  }

  if (method === "POST" && pathname === "/api/core/departments") {
    return handleCoreDepartmentsCreate(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/employees") {
    return handleCoreEmployeesList(request, env, user);
  }

  if (method === "POST" && pathname === "/api/core/employees") {
    return handleCoreEmployeesCreate(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/invitations") {
    return handleCoreInvitationsList(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/attendance") {
    return handleCoreAttendanceList(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/leaves") {
    return handleCoreLeavesList(request, env, user);
  }

  const leaveApprove = pathname.match(/^\/api\/core\/leaves\/([^/]+)\/approve$/);
  if (method === "POST" && leaveApprove) {
    return handleCoreLeavesApproveOrReject(leaveApprove[1], request, env, user, "approved");
  }

  const leaveReject = pathname.match(/^\/api\/core\/leaves\/([^/]+)\/reject$/);
  if (method === "POST" && leaveReject) {
    return handleCoreLeavesApproveOrReject(leaveReject[1], request, env, user, "rejected");
  }

  if (method === "GET" && pathname === "/api/core/payroll") {
    return handleCorePayrollList(request, env, user);
  }

  if (method === "POST" && pathname === "/api/core/payroll") {
    return handleCorePayrollCreate(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/assets") {
    return handleCoreAssetsList(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/refresh-tokens") {
    return handleCoreRefreshTokensList(request, env, user);
  }

  if (method === "GET" && pathname === "/api/core/audit-logs") {
    return handleCoreAuditLogsList(request, env, user);
  }

  return apiJson(request, env, { error: "Not found." }, 404);
}
