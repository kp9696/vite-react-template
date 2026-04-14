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

type LeaveStatus = "pending" | "approved" | "rejected";

const HR_ROLES = new Set(["Admin", "HR", "HR Admin"]);
const DEFAULT_LEAVE_TOTALS: Record<string, number> = {
  "Annual Leave": 18,
  "Sick Leave": 12,
  "Casual Leave": 6,
  "Comp Off": 4,
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(request: Request, env: Env, payload: JsonMap, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }),
    request,
    env,
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function isHrManager(role: string): boolean {
  return HR_ROLES.has(role);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    return json(request, env, { error: "JWT access secret is not configured." }, 500);
  }

  const auth = await requireAuth(request, accessSecret);
  if (!auth) {
    return json(request, env, { error: "Unauthorized." }, 401);
  }

  if (!auth.tenantId || auth.tenantId === "NO_TENANT") {
    return json(request, env, { error: "Tenant context missing." }, 403);
  }

  return auth;
}

async function usersTableHasOrgId(db: D1Database): Promise<boolean> {
  try {
    const column = await db
      .prepare("SELECT 1 AS has_col FROM pragma_table_info('users') WHERE name = 'org_id' LIMIT 1")
      .first<{ has_col: number }>();
    return Boolean(column?.has_col);
  } catch {
    return false;
  }
}

async function getEmployeeCount(db: D1Database, orgId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM employees WHERE org_id = ?")
    .bind(orgId)
    .first<{ cnt: number }>();

  if (typeof row?.cnt === "number") {
    return row.cnt;
  }

  const fallback = await db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE org_id = ?")
    .bind(orgId)
    .first<{ cnt: number }>();

  return fallback?.cnt ?? 0;
}

async function handleDashboardSummary(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const date = todayIsoDate();

  const [employees, present, pendingLeaves, assetsAssigned] = await Promise.all([
    getEmployeeCount(env.HRMS, user.tenantId),
    env.HRMS
      .prepare("SELECT COUNT(*) as cnt FROM attendance WHERE org_id = ? AND attendance_date = ?")
      .bind(user.tenantId, date)
      .first<{ cnt: number }>(),
    env.HRMS
      .prepare("SELECT COUNT(*) as cnt FROM leaves WHERE org_id = ? AND status = 'pending'")
      .bind(user.tenantId)
      .first<{ cnt: number }>(),
    env.HRMS
      .prepare("SELECT COUNT(*) as cnt FROM assets WHERE org_id = ? AND status = 'assigned'")
      .bind(user.tenantId)
      .first<{ cnt: number }>(),
  ]);

  return json(request, env, {
    totalEmployees: employees,
    attendanceSummary: {
      date,
      present: present?.cnt ?? 0,
    },
    pendingApprovals: pendingLeaves?.cnt ?? 0,
    assignedAssets: assetsAssigned?.cnt ?? 0,
  });
}

async function handleAttendanceCheckIn(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const payload = await readJsonBody<{ geo?: string }>(request);
  const date = todayIsoDate();
  const now = nowIso();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const geo = payload?.geo?.trim() || null;

  const existing = await env.HRMS
    .prepare("SELECT id, check_in_at FROM attendance WHERE org_id = ? AND user_id = ? AND attendance_date = ? LIMIT 1")
    .bind(user.tenantId, user.userId, date)
    .first<{ id: string; check_in_at: string | null }>();

  if (existing?.check_in_at) {
    return json(request, env, { error: "Check-in already recorded for today." }, 409);
  }

  if (existing?.id) {
    await env.HRMS
      .prepare(
        `UPDATE attendance
         SET check_in_at = ?, check_in_ip = ?, check_in_geo = ?, status = 'present', updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, ip, geo, now, existing.id)
      .run();
  } else {
    await env.HRMS
      .prepare(
        `INSERT INTO attendance (id, org_id, user_id, attendance_date, check_in_at, check_in_ip, check_in_geo, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'present', ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.tenantId, user.userId, date, now, ip, geo, now, now)
      .run();
  }

  return json(request, env, { ok: true, attendanceDate: date, checkInAt: now });
}

async function handleAttendanceCheckOut(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const payload = await readJsonBody<{ geo?: string }>(request);
  const date = todayIsoDate();
  const now = nowIso();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const geo = payload?.geo?.trim() || null;

  const existing = await env.HRMS
    .prepare("SELECT id, check_in_at, check_out_at FROM attendance WHERE org_id = ? AND user_id = ? AND attendance_date = ? LIMIT 1")
    .bind(user.tenantId, user.userId, date)
    .first<{ id: string; check_in_at: string | null; check_out_at: string | null }>();

  if (!existing?.check_in_at) {
    return json(request, env, { error: "Check-in is required before check-out." }, 400);
  }

  if (existing.check_out_at) {
    return json(request, env, { error: "Check-out already recorded for today." }, 409);
  }

  await env.HRMS
    .prepare(
      `UPDATE attendance
       SET check_out_at = ?, check_out_ip = ?, check_out_geo = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, ip, geo, now, existing.id)
    .run();

  return json(request, env, { ok: true, attendanceDate: date, checkOutAt: now });
}

async function handleAttendanceToday(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const date = todayIsoDate();
  const rows = await env.HRMS
    .prepare(
      `SELECT attendance.id, attendance.user_id, attendance.attendance_date, attendance.check_in_at, attendance.check_out_at,
              attendance.check_in_ip, attendance.check_out_ip, attendance.status,
              users.name, users.email
       FROM attendance
       LEFT JOIN users ON users.id = attendance.user_id
       WHERE attendance.org_id = ? AND attendance.attendance_date = ?
       ORDER BY attendance.check_in_at DESC`,
    )
    .bind(user.tenantId, date)
    .all();

  return json(request, env, { date, records: rows.results });
}

async function upsertLeaveBalance(
  db: D1Database,
  orgId: string,
  userId: string,
  leaveType: string,
  year: number,
): Promise<void> {
  const total = DEFAULT_LEAVE_TOTALS[leaveType] ?? 12;
  await db
    .prepare(
      `INSERT INTO leave_balances (id, org_id, user_id, leave_type, year, total, used, pending, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
       ON CONFLICT(org_id, user_id, leave_type, year)
       DO NOTHING`,
    )
    .bind(crypto.randomUUID(), orgId, userId, leaveType, year, total, nowIso())
    .run();
}

async function handleApplyLeave(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    userId?: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    totalDays?: number;
    reason?: string;
  }>(request);

  if (!body?.leaveType || !body.startDate || !body.endDate || !body.reason?.trim()) {
    return json(request, env, { error: "leaveType, startDate, endDate, and reason are required." }, 400);
  }

  const requestedUserId = body.userId?.trim();
  const effectiveUserId = requestedUserId && isHrManager(user.role) ? requestedUserId : user.userId;

  const computedDays = calculateLeaveDays(body.startDate, body.endDate);
  const totalDays = body.totalDays && body.totalDays > 0 ? Math.floor(body.totalDays) : computedDays;

  if (totalDays <= 0) {
    return json(request, env, { error: "Invalid leave duration." }, 400);
  }

  const now = nowIso();
  const leaveId = crypto.randomUUID();
  const year = new Date(body.startDate).getUTCFullYear();

  await upsertLeaveBalance(env.HRMS, user.tenantId, effectiveUserId, body.leaveType.trim(), year);

  await env.HRMS
    .prepare(
      `INSERT INTO leaves (
         id, org_id, user_id, leave_type, start_date, end_date, total_days, reason,
         status, approver_user_id, decision_note, decided_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
    )
    .bind(
      leaveId,
      user.tenantId,
      effectiveUserId,
      body.leaveType.trim(),
      body.startDate,
      body.endDate,
      totalDays,
      body.reason.trim(),
      now,
      now,
    )
    .run();

  await env.HRMS
    .prepare(
      `UPDATE leave_balances
       SET pending = pending + ?, updated_at = ?
       WHERE org_id = ? AND user_id = ? AND leave_type = ? AND year = ?`,
    )
    .bind(totalDays, now, user.tenantId, effectiveUserId, body.leaveType.trim(), year)
    .run();

  return json(request, env, { ok: true, id: leaveId, status: "pending" }, 201);
}

async function handleListLeaves(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const requestedUserId = url.searchParams.get("userId")?.trim();

  const userFilter = isHrManager(user.role) ? requestedUserId : user.userId;

  let sql =
    `SELECT leaves.id, leaves.user_id, leaves.leave_type, leaves.start_date, leaves.end_date, leaves.total_days,
            leaves.reason, leaves.status, leaves.approver_user_id, leaves.decision_note, leaves.decided_at,
            leaves.created_at, users.name, users.email
     FROM leaves
     LEFT JOIN users ON users.id = leaves.user_id
     WHERE leaves.org_id = ?`;

  const binds: Array<string | number> = [user.tenantId];

  if (status) {
    sql += " AND leaves.status = ?";
    binds.push(status);
  }

  if (userFilter) {
    sql += " AND leaves.user_id = ?";
    binds.push(userFilter);
  }

  sql += " ORDER BY datetime(leaves.created_at) DESC";

  const stmt = env.HRMS.prepare(sql).bind(...binds);
  const rows = await stmt.all();

  return json(request, env, { leaves: rows.results });
}

async function handleLeaveDecision(
  leaveId: string,
  request: Request,
  env: Env,
  user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ status?: LeaveStatus; note?: string }>(request);
  if (!body?.status || (body.status !== "approved" && body.status !== "rejected")) {
    return json(request, env, { error: "status must be approved or rejected." }, 400);
  }

  const leave = await env.HRMS
    .prepare(
      `SELECT id, org_id, user_id, leave_type, start_date, total_days, status
       FROM leaves
       WHERE id = ? AND org_id = ? LIMIT 1`,
    )
    .bind(leaveId, user.tenantId)
    .first<{ id: string; org_id: string; user_id: string; leave_type: string; start_date: string; total_days: number; status: string }>();

  if (!leave) {
    return json(request, env, { error: "Leave request not found." }, 404);
  }

  if (leave.status !== "pending") {
    return json(request, env, { error: "Only pending requests can be decided." }, 409);
  }

  const now = nowIso();
  await env.HRMS
    .prepare(
      `UPDATE leaves
       SET status = ?, approver_user_id = ?, decision_note = ?, decided_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(body.status, user.userId, body.note?.trim() || null, now, now, leave.id)
    .run();

  const year = new Date(leave.start_date).getUTCFullYear();
  await upsertLeaveBalance(env.HRMS, user.tenantId, leave.user_id, leave.leave_type, year);

  if (body.status === "approved") {
    await env.HRMS
      .prepare(
        `UPDATE leave_balances
         SET pending = CASE WHEN pending >= ? THEN pending - ? ELSE 0 END,
             used = used + ?,
             updated_at = ?
         WHERE org_id = ? AND user_id = ? AND leave_type = ? AND year = ?`,
      )
      .bind(leave.total_days, leave.total_days, leave.total_days, now, user.tenantId, leave.user_id, leave.leave_type, year)
      .run();
  } else {
    await env.HRMS
      .prepare(
        `UPDATE leave_balances
         SET pending = CASE WHEN pending >= ? THEN pending - ? ELSE 0 END,
             updated_at = ?
         WHERE org_id = ? AND user_id = ? AND leave_type = ? AND year = ?`,
      )
      .bind(leave.total_days, leave.total_days, now, user.tenantId, leave.user_id, leave.leave_type, year)
      .run();
  }

  return json(request, env, { ok: true, id: leave.id, status: body.status });
}

async function handleLeaveBalance(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const requestedUserId = new URL(request.url).searchParams.get("userId")?.trim();
  const targetUserId = requestedUserId && isHrManager(user.role) ? requestedUserId : user.userId;

  const year = new Date().getUTCFullYear();
  const rows = await env.HRMS
    .prepare(
      `SELECT leave_type, total, used, pending, (total - used - pending) AS remaining
       FROM leave_balances
       WHERE org_id = ? AND user_id = ? AND year = ?
       ORDER BY leave_type ASC`,
    )
    .bind(user.tenantId, targetUserId, year)
    .all();

  return json(request, env, { userId: targetUserId, year, balances: rows.results });
}

async function handleListAssets(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT assets.id, assets.asset_tag, assets.name, assets.category, assets.serial_no, assets.purchase_date,
              assets.status, assets.condition, assets.created_at, assets.updated_at,
              users.name AS assigned_to_name
       FROM assets
       LEFT JOIN asset_assignments
         ON asset_assignments.asset_id = assets.id
        AND asset_assignments.status = 'assigned'
       LEFT JOIN users
         ON users.id = asset_assignments.user_id
       WHERE assets.org_id = ?
       ORDER BY datetime(assets.created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return json(request, env, { assets: rows.results });
}

async function handleCreateAsset(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{
    assetTag?: string;
    name?: string;
    category?: string;
    serialNo?: string;
    purchaseDate?: string;
    condition?: string;
  }>(request);

  if (!body?.assetTag || !body.name || !body.category) {
    return json(request, env, { error: "assetTag, name and category are required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = nowIso();

  try {
    await env.HRMS
      .prepare(
        `INSERT INTO assets (id, org_id, asset_tag, name, category, serial_no, purchase_date, status, condition, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`,
      )
      .bind(
        id,
        user.tenantId,
        body.assetTag.trim(),
        body.name.trim(),
        body.category.trim(),
        body.serialNo?.trim() || null,
        body.purchaseDate?.trim() || null,
        body.condition?.trim() || "Good",
        now,
        now,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      return json(request, env, { error: "Asset tag or serial already exists." }, 409);
    }
    return json(request, env, { error: "Failed to create asset." }, 500);
  }

  return json(request, env, { ok: true, id }, 201);
}

async function handleAssignAsset(assetId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ userId?: string; assigneeName?: string }>(request);
  let targetUserId = body?.userId?.trim();

  if (!targetUserId && body?.assigneeName?.trim()) {
    const userRow = await env.HRMS
      .prepare(
        `SELECT id
         FROM users
         WHERE org_id = ? AND lower(name) = lower(?)
         LIMIT 1`,
      )
      .bind(user.tenantId, body.assigneeName.trim())
      .first<{ id: string }>();
    targetUserId = userRow?.id;
  }

  if (!targetUserId) {
    return json(request, env, { error: "Valid assignee is required." }, 400);
  }

  const now = nowIso();
  const asset = await env.HRMS
    .prepare("SELECT id, status FROM assets WHERE id = ? AND org_id = ? LIMIT 1")
    .bind(assetId, user.tenantId)
    .first<{ id: string; status: string }>();

  if (!asset) {
    return json(request, env, { error: "Asset not found." }, 404);
  }

  if (asset.status === "assigned") {
    return json(request, env, { error: "Asset is already assigned." }, 409);
  }

  await env.HRMS
    .prepare(
      `INSERT INTO asset_assignments (id, org_id, asset_id, user_id, assigned_by, assigned_at, revoked_at, revoke_reason, status)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'assigned')`,
    )
    .bind(crypto.randomUUID(), user.tenantId, assetId, targetUserId, user.userId, now)
    .run();

  await env.HRMS
    .prepare("UPDATE assets SET status = 'assigned', updated_at = ? WHERE id = ?")
    .bind(now, assetId)
    .run();

  return json(request, env, { ok: true, assetId, userId: targetUserId });
}

async function handleRevokeAsset(assetId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ reason?: string }>(request);
  const now = nowIso();

  const assignment = await env.HRMS
    .prepare(
      `SELECT id
       FROM asset_assignments
       WHERE asset_id = ? AND org_id = ? AND status = 'assigned'
       ORDER BY datetime(assigned_at) DESC
       LIMIT 1`,
    )
    .bind(assetId, user.tenantId)
    .first<{ id: string }>();

  if (!assignment) {
    return json(request, env, { error: "No active assignment found for this asset." }, 404);
  }

  await env.HRMS
    .prepare(
      `UPDATE asset_assignments
       SET revoked_at = ?, revoke_reason = ?, status = 'revoked'
       WHERE id = ?`,
    )
    .bind(now, body?.reason?.trim() || "Revoked by HR", assignment.id)
    .run();

  await env.HRMS
    .prepare("UPDATE assets SET status = 'available', updated_at = ? WHERE id = ?")
    .bind(now, assetId)
    .run();

  return json(request, env, { ok: true, assetId, status: "available" });
}

async function handleCreateInvitation(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ email?: string; role?: string; department?: string; expiresHours?: number }>(request);
  const email = normalizeEmail(body?.email || "");

  if (!email || !isValidEmail(email)) {
    return json(request, env, { error: "Valid email is required." }, 400);
  }

  const role = body?.role?.trim() || "Employee";
  const department = body?.department?.trim() || "General";
  const expiresHours = Math.min(Math.max(Math.floor(body?.expiresHours ?? 48), 1), 168);
  const nowEpoch = Math.floor(Date.now() / 1000);
  const expiresAt = nowEpoch + expiresHours * 60 * 60;

  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  const tokenHash = await sha256Hex(rawToken);
  const now = nowIso();

  try {
    await env.HRMS
      .prepare(
        `INSERT INTO invitations (
           id, org_id, email, role, department, token_hash, expires_at, accepted_at, status, invited_by, created_at, updated_at
         ) VALUES (?, ?, lower(?), ?, ?, ?, ?, NULL, 'pending', ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.tenantId, email, role, department, tokenHash, expiresAt, user.userId, now, now)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      return json(request, env, { error: "A pending invitation already exists for this email." }, 409);
    }
    return json(request, env, { error: "Failed to create invitation." }, 500);
  }

  const inviteLink = `${new URL(request.url).origin}/register?invite=${encodeURIComponent(rawToken)}`;
  return json(request, env, { ok: true, email, role, department, inviteToken: rawToken, inviteLink }, 201);
}

async function handleAcceptInvitation(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody<{ token?: string; name?: string; password?: string }>(request);

  const rawToken = body?.token?.trim() || "";
  const name = body?.name?.trim() || "";
  const password = body?.password?.trim() || "";

  if (!rawToken || !name || password.length < 8) {
    return json(request, env, { error: "token, name and password (min 8 chars) are required." }, 400);
  }

  const tokenHash = await sha256Hex(rawToken);
  const invite = await env.HRMS
    .prepare(
      `SELECT id, org_id, email, role, department, expires_at, status
       FROM invitations
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{ id: string; org_id: string; email: string; role: string; department: string; expires_at: number; status: string }>();

  if (!invite || invite.status !== "pending") {
    return json(request, env, { error: "Invitation is invalid or already used." }, 400);
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  if (invite.expires_at < nowEpoch) {
    await env.HRMS.prepare("UPDATE invitations SET status = 'expired', updated_at = ? WHERE id = ?").bind(nowIso(), invite.id).run();
    return json(request, env, { error: "Invitation has expired." }, 400);
  }

  const email = normalizeEmail(invite.email);
  const now = nowIso();
  const passwordHash = await hashPassword(password);

  const existingAuth = await env.HRMS
    .prepare("SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email)
    .first<{ id: number }>();

  if (existingAuth) {
    return json(request, env, { error: "Email already registered. Please sign in." }, 409);
  }

  await env.HRMS
    .prepare("INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, lower(?), ?, 1)")
    .bind(name, email, passwordHash)
    .run();

  const userId = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const hasOrgId = await usersTableHasOrgId(env.HRMS);

  if (hasOrgId) {
    await env.HRMS
      .prepare(
        `INSERT INTO users (id, org_id, name, email, role, department, status, joined_on, created_at, updated_at)
         VALUES (?, ?, ?, lower(?), ?, ?, 'Active', ?, ?, ?)`,
      )
      .bind(userId, invite.org_id, name, email, invite.role, invite.department, now, now, now)
      .run();
  } else {
    await env.HRMS
      .prepare(
        `INSERT INTO users (id, name, email, role, department, status, joined_on, created_at, updated_at)
         VALUES (?, ?, lower(?), ?, ?, 'Active', ?, ?, ?)`,
      )
      .bind(userId, name, email, invite.role, invite.department, now, now, now)
      .run();
  }

  await env.HRMS
    .prepare(
      `UPDATE invitations
       SET status = 'accepted', accepted_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nowEpoch, now, invite.id)
    .run();

  return json(request, env, { ok: true, email, userId, role: invite.role }, 201);
}

async function handleCreateWebhook(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ provider?: string; webhookUrl?: string }>(request);
  const provider = body?.provider?.trim();
  const webhookUrl = body?.webhookUrl?.trim();

  if (!provider || !webhookUrl) {
    return json(request, env, { error: "provider and webhookUrl are required." }, 400);
  }

  try {
    new URL(webhookUrl);
  } catch {
    return json(request, env, { error: "Invalid webhookUrl." }, 400);
  }

  const now = nowIso();
  await env.HRMS
    .prepare(
      `INSERT INTO notification_webhooks (id, org_id, provider, webhook_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(crypto.randomUUID(), user.tenantId, provider, webhookUrl, now, now)
    .run();

  return json(request, env, { ok: true }, 201);
}

async function handleListWebhooks(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT id, provider, webhook_url, is_active, created_at, updated_at
       FROM notification_webhooks
       WHERE org_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .bind(user.tenantId)
    .all();

  return json(request, env, { webhooks: rows.results });
}

async function handleTestWebhook(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ webhookId?: string; message?: string }>(request);
  if (!body?.webhookId) {
    return json(request, env, { error: "webhookId is required." }, 400);
  }

  const webhook = await env.HRMS
    .prepare(
      `SELECT provider, webhook_url, is_active
       FROM notification_webhooks
       WHERE id = ? AND org_id = ?
       LIMIT 1`,
    )
    .bind(body.webhookId, user.tenantId)
    .first<{ provider: string; webhook_url: string; is_active: number }>();

  if (!webhook || webhook.is_active !== 1) {
    return json(request, env, { error: "Active webhook not found." }, 404);
  }

  const payload = {
    text: body.message?.trim() || "HRMS webhook test notification",
    source: "hrms-worker",
    provider: webhook.provider,
    tenantId: user.tenantId,
    timestamp: nowIso(),
  };

  const response = await fetch(webhook.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response?.ok) {
    return json(request, env, { error: "Webhook delivery failed." }, 502);
  }

  return json(request, env, { ok: true });
}

export async function handleCoreHrmsApi(request: Request, env: Env): Promise<Response | null> {
  const { method } = request;
  const { pathname } = new URL(request.url);

  // Only API requests should be handled here; let SSR routes pass through.
  if (!pathname.startsWith("/api/")) {
    return null;
  }

  const needsAuth = !(
    method === "POST" && pathname === "/api/invitations/accept"
  );

  let user: ApiUser | null = null;
  if (needsAuth) {
    const auth = await requireApiUser(request, env);
    if (auth instanceof Response) {
      return auth;
    }
    user = auth;
  }

  if (method === "GET" && pathname === "/api/dashboard/summary") {
    return handleDashboardSummary(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/attendance/check-in") {
    return handleAttendanceCheckIn(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/attendance/check-out") {
    return handleAttendanceCheckOut(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/attendance/today") {
    return handleAttendanceToday(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/leaves") {
    return handleApplyLeave(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/leaves") {
    return handleListLeaves(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/leaves/balance") {
    return handleLeaveBalance(request, env, user!);
  }

  const leaveDecisionMatch = pathname.match(/^\/api\/leaves\/([^/]+)\/decision$/);
  if (method === "POST" && leaveDecisionMatch) {
    return handleLeaveDecision(leaveDecisionMatch[1], request, env, user!);
  }

  if (method === "GET" && pathname === "/api/assets") {
    return handleListAssets(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/assets") {
    return handleCreateAsset(request, env, user!);
  }

  const assignMatch = pathname.match(/^\/api\/assets\/([^/]+)\/assign$/);
  if (method === "POST" && assignMatch) {
    return handleAssignAsset(assignMatch[1], request, env, user!);
  }

  const revokeMatch = pathname.match(/^\/api\/assets\/([^/]+)\/revoke$/);
  if (method === "POST" && revokeMatch) {
    return handleRevokeAsset(revokeMatch[1], request, env, user!);
  }

  if (method === "POST" && pathname === "/api/invitations") {
    return handleCreateInvitation(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/invitations/accept") {
    return handleAcceptInvitation(request, env);
  }

  if (method === "POST" && pathname === "/api/notifications/webhooks") {
    return handleCreateWebhook(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/notifications/webhooks") {
    return handleListWebhooks(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/notifications/webhooks/test") {
    return handleTestWebhook(request, env, user!);
  }

  return null;
}
