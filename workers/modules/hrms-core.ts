import { hashPassword, requireAuth } from "../security/auth";
import { withCors } from "../security/cors";
import { sendEmail, buildLeaveDecisionHtml, buildExpenseDecisionHtml } from "../lib/email";

interface ApiUser {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
}

type JsonMap = Record<string, unknown>;

type LeaveStatus = "pending" | "approved" | "rejected";

const HR_ROLES = new Set(["Admin", "HR", "HR Admin", "HR Manager", "Manager", "Payroll Manager", "Finance", "admin", "hr_admin", "hr_manager"]);
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

async function usersTableHasCompanyId(db: D1Database): Promise<boolean> {
  try {
    const column = await db
      .prepare("SELECT 1 AS has_col FROM pragma_table_info('users') WHERE name = 'company_id' LIMIT 1")
      .first<{ has_col: number }>();
    return Boolean(column?.has_col);
  } catch {
    return false;
  }
}

async function getEmployeeCount(db: D1Database, companyId: string): Promise<number> {
  // Primary source: users table (invited + active employees)
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE COALESCE(company_id, org_id) = ?")
    .bind(companyId)
    .first<{ cnt: number }>();

  return row?.cnt ?? 0;
}

async function handleDashboardSummary(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const date = todayIsoDate();

  const [employees, present, pendingLeaves, assetsAssigned] = await Promise.all([
    getEmployeeCount(env.HRMS, user.tenantId),
    env.HRMS
      .prepare("SELECT COUNT(*) as cnt FROM attendance WHERE COALESCE(company_id, org_id) = ? AND attendance_date = ? AND status IN ('present','wfh','half_day')")
      .bind(user.tenantId, date)
      .first<{ cnt: number }>(),
    env.HRMS
      .prepare("SELECT COUNT(*) as cnt FROM leaves WHERE COALESCE(company_id, org_id) = ? AND status = 'pending'")
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

// ── Notifications helper ──────────────────────────────────────────────────────

export async function createNotification(
  db: D1Database,
  opts: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
  },
): Promise<void> {
  const id = `NOTIF${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await db
    .prepare(
      `INSERT INTO notifications (id, company_id, org_id, user_id, type, title, body, link, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, opts.companyId, opts.companyId, opts.userId, opts.type, opts.title, opts.body ?? null, opts.link ?? null, nowIso())
    .run();
}

async function handleListNotifications(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT id, type, title, body, read, link, created_at
       FROM notifications
       WHERE user_id = ? AND COALESCE(company_id, org_id) = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(user.userId, user.tenantId)
    .all<{ id: string; type: string; title: string; body: string | null; read: number; link: string | null; created_at: string }>();

  const unreadCount = rows.results.filter((r) => r.read === 0).length;
  return json(request, env, {
    notifications: rows.results.map((r) => ({ ...r, read: r.read === 1 })),
    unreadCount,
  });
}

async function handleMarkAllRead(request: Request, env: Env, user: ApiUser): Promise<Response> {
  await env.HRMS
    .prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND COALESCE(company_id, org_id) = ? AND read = 0`)
    .bind(user.userId, user.tenantId)
    .run();
  return json(request, env, { ok: true });
}

async function handleMarkOneRead(notifId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  await env.HRMS
    .prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
    .bind(notifId, user.userId)
    .run();
  return json(request, env, { ok: true });
}

// ── Analytics handlers ────────────────────────────────────────────────────────

async function handleAnalyticsHeadcount(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const [deptRows, exitRows] = await Promise.all([
    env.HRMS
      .prepare(
        `SELECT department, COUNT(*) as headcount
         FROM users
         WHERE COALESCE(company_id, org_id) = ?
           AND status NOT IN ('Inactive', 'inactive')
           AND department IS NOT NULL AND department != ''
         GROUP BY department ORDER BY headcount DESC`,
      )
      .bind(user.tenantId)
      .all<{ department: string; headcount: number }>(),
    env.HRMS
      .prepare(
        `SELECT department, COUNT(*) as exits
         FROM exit_processes
         WHERE COALESCE(company_id, org_id) = ?
         GROUP BY department`,
      )
      .bind(user.tenantId)
      .all<{ department: string; exits: number }>(),
  ]);

  const exitByDept = Object.fromEntries(exitRows.results.map((r) => [r.department, r.exits]));
  const depts = deptRows.results.map((r) => {
    const exits = exitByDept[r.department] ?? 0;
    const total = r.headcount + exits;
    const rate = total > 0 ? Math.round((exits / total) * 1000) / 10 : 0;
    return { dept: r.department, headcount: r.headcount, exits, rate };
  });

  return json(request, env, { depts });
}

async function handleAnalyticsHiringTrend(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  // Last 7 months of joiners from users table
  const rows = await env.HRMS
    .prepare(
      `SELECT strftime('%Y-%m', joined_on) as month_key, COUNT(*) as hired
       FROM users
       WHERE COALESCE(company_id, org_id) = ?
         AND joined_on IS NOT NULL
         AND joined_on >= date('now', '-7 months')
       GROUP BY month_key ORDER BY month_key ASC`,
    )
    .bind(user.tenantId)
    .all<{ month_key: string; hired: number }>();

  // Exits by month
  const exitRows = await env.HRMS
    .prepare(
      `SELECT strftime('%Y-%m', last_day) as month_key, COUNT(*) as left_count
       FROM exit_processes
       WHERE COALESCE(company_id, org_id) = ?
         AND last_day >= date('now', '-7 months')
       GROUP BY month_key ORDER BY month_key ASC`,
    )
    .bind(user.tenantId)
    .all<{ month_key: string; left_count: number }>();

  // Merge into a map
  const months: Record<string, { hired: number; left: number }> = {};
  for (const r of rows.results) {
    months[r.month_key] = { hired: r.hired, left: 0 };
  }
  for (const r of exitRows.results) {
    if (!months[r.month_key]) months[r.month_key] = { hired: 0, left: 0 };
    months[r.month_key].left = r.left_count;
  }

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const trend = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [, mm] = key.split("-");
      return { month: MONTH_LABELS[parseInt(mm, 10) - 1], hired: v.hired, left: v.left };
    });

  return json(request, env, { trend });
}

async function handleAnalyticsSalary(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  // Get most recent month_key that has payroll data
  const latestRun = await env.HRMS
    .prepare(
      `SELECT month_key FROM payroll_items
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY month_key DESC LIMIT 1`,
    )
    .bind(user.tenantId)
    .first<{ month_key: string }>();

  if (!latestRun) {
    return json(request, env, { depts: [], month: null });
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT department,
              COUNT(*) as count,
              AVG(net) as avg_net,
              MIN(net) as min_net,
              MAX(net) as max_net
       FROM payroll_items
       WHERE COALESCE(company_id, org_id) = ? AND month_key = ?
       GROUP BY department ORDER BY avg_net DESC`,
    )
    .bind(user.tenantId, latestRun.month_key)
    .all<{ department: string; count: number; avg_net: number; min_net: number; max_net: number }>();

  const depts = rows.results.map((r) => ({
    dept: r.department,
    count: r.count,
    avg: Math.round(r.avg_net),
    min: r.min_net,
    max: r.max_net,
  }));

  return json(request, env, { depts, month: latestRun.month_key });
}

async function handleAnalyticsLeaveUtilization(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const year = new Date().getFullYear();
  const rows = await env.HRMS
    .prepare(
      `SELECT leave_type,
              SUM(total) as total_entitled,
              SUM(used) as total_used,
              COUNT(*) as employee_count
       FROM leave_balances
       WHERE COALESCE(company_id, org_id) = ? AND year = ?
       GROUP BY leave_type ORDER BY total_used DESC`,
    )
    .bind(user.tenantId, year)
    .all<{ leave_type: string; total_entitled: number; total_used: number; employee_count: number }>();

  const types = rows.results.map((r) => ({
    type: r.leave_type,
    entitled: r.total_entitled,
    used: r.total_used,
    pct: r.total_entitled > 0 ? Math.round((r.total_used / r.total_entitled) * 100) : 0,
    employees: r.employee_count,
  }));

  return json(request, env, { types, year });
}

async function handleAnalyticsAttendanceSummary(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const rows = await env.HRMS
    .prepare(
      `SELECT status, COUNT(*) as cnt
       FROM attendance
       WHERE COALESCE(company_id, org_id) = ?
         AND attendance_date >= date('now', '-30 days')
       GROUP BY status`,
    )
    .bind(user.tenantId)
    .all<{ status: string; cnt: number }>();

  const summary = Object.fromEntries(rows.results.map((r) => [r.status, r.cnt]));
  const total = rows.results.reduce((s, r) => s + r.cnt, 0);

  return json(request, env, { summary, total, days: 30 });
}

async function handleAttendanceCheckIn(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const payload = await readJsonBody<{ geo?: string }>(request);
  const date = todayIsoDate();
  const now = nowIso();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const geo = payload?.geo?.trim() || null;

  const existing = await env.HRMS
    .prepare("SELECT id, check_in_at FROM attendance WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND attendance_date = ? LIMIT 1")
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
        `INSERT INTO attendance (id, company_id, org_id, user_id, attendance_date, check_in_at, check_in_ip, check_in_geo, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'present', ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.tenantId, user.tenantId, user.userId, date, now, ip, geo, now, now)
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
    .prepare("SELECT id, check_in_at, check_out_at FROM attendance WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND attendance_date = ? LIMIT 1")
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
      WHERE COALESCE(attendance.company_id, attendance.org_id) = ? AND attendance.attendance_date = ?
       ORDER BY attendance.check_in_at DESC`,
    )
    .bind(user.tenantId, date)
    .all();

  return json(request, env, { date, records: rows.results });
}

async function handleAttendanceMy(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "60", 10), 120);

  const rows = await env.HRMS
    .prepare(
      `SELECT id, attendance_date, check_in_at, check_out_at, status
       FROM attendance
       WHERE COALESCE(company_id, org_id) = ? AND user_id = ?
       ORDER BY attendance_date DESC
       LIMIT ?`,
    )
    .bind(user.tenantId, user.userId, limit)
    .all();

  return json(request, env, { records: rows.results });
}

async function upsertLeaveBalance(
  db: D1Database,
  companyId: string,
  userId: string,
  leaveType: string,
  year: number,
): Promise<void> {
  const total = DEFAULT_LEAVE_TOTALS[leaveType] ?? 12;
  await db
    .prepare(
      `INSERT INTO leave_balances (id, company_id, org_id, user_id, leave_type, year, total, used, pending, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
       ON CONFLICT(org_id, user_id, leave_type, year)
       DO NOTHING`,
    )
    .bind(crypto.randomUUID(), companyId, companyId, userId, leaveType, year, total, nowIso())
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

  // Validate end date >= start date
  if (new Date(body.endDate) < new Date(body.startDate)) {
    return json(request, env, { error: "End date cannot be before start date." }, 400);
  }

  await upsertLeaveBalance(env.HRMS, user.tenantId, effectiveUserId, body.leaveType.trim(), year);

  // Check available balance before applying — allow admin bypass
  if (!isHrManager(user.role)) {
    const bal = await env.HRMS
      .prepare(
        `SELECT total, used, pending FROM leave_balances
         WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND leave_type = ? AND year = ?`,
      )
      .bind(user.tenantId, effectiveUserId, body.leaveType.trim(), year)
      .first<{ total: number; used: number; pending: number }>();

    if (bal) {
      const available = Number(bal.total) - Number(bal.used) - Number(bal.pending);
      if (totalDays > available) {
        return json(request, env, {
          error: `Insufficient ${body.leaveType} balance. You have ${available} day${available !== 1 ? "s" : ""} available.`,
        }, 400);
      }
    }
  }

  await env.HRMS
    .prepare(
      `INSERT INTO leaves (
         id, company_id, org_id, user_id, leave_type, start_date, end_date, total_days, reason,
         status, approver_user_id, decision_note, decided_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
    )
    .bind(
      leaveId,
      user.tenantId,
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
        WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND leave_type = ? AND year = ?`,
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
    WHERE COALESCE(leaves.company_id, leaves.org_id) = ?`;

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
      `SELECT l.id, l.company_id, l.org_id, l.user_id, l.leave_type, l.start_date, l.end_date, l.total_days, l.status,
              u.name AS employee_name, u.email AS employee_email
       FROM leaves l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.id = ? AND COALESCE(l.company_id, l.org_id) = ? LIMIT 1`,
    )
    .bind(leaveId, user.tenantId)
     .first<{ id: string; company_id: string | null; org_id: string; user_id: string; leave_type: string; start_date: string; end_date: string; total_days: number; status: string; employee_name: string | null; employee_email: string | null }>();

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
         WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND leave_type = ? AND year = ?`,
      )
      .bind(leave.total_days, leave.total_days, leave.total_days, now, user.tenantId, leave.user_id, leave.leave_type, year)
      .run();
  } else {
    await env.HRMS
      .prepare(
        `UPDATE leave_balances
         SET pending = CASE WHEN pending >= ? THEN pending - ? ELSE 0 END,
             updated_at = ?
         WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND leave_type = ? AND year = ?`,
      )
      .bind(leave.total_days, leave.total_days, now, user.tenantId, leave.user_id, leave.leave_type, year)
      .run();
  }

  // In-app notification
  const emoji = body.status === "approved" ? "✅" : "❌";
  const verb  = body.status === "approved" ? "Approved" : "Rejected";
  await createNotification(env.HRMS, {
    companyId: user.tenantId,
    userId: leave.user_id,
    type: body.status === "approved" ? "leave_approved" : "leave_rejected",
    title: `${emoji} Leave ${verb}`,
    body: `Your ${leave.leave_type} leave (${leave.total_days} day${leave.total_days !== 1 ? "s" : ""}) from ${leave.start_date} has been ${body.status}.${body.note ? ` Note: ${body.note}` : ""}`,
    link: "/hrms/leave",
  });

  // Email notification (fire-and-forget — don't block the response)
  if (leave.employee_email) {
    const baseUrl = env.HRMS_BASE_URL ?? new URL(request.url).origin;
    sendEmail(env, {
      to: leave.employee_email,
      subject: `${emoji} Your Leave Request has been ${verb} – JWithKP HRMS`,
      html: buildLeaveDecisionHtml({
        employeeName: leave.employee_name ?? "there",
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        totalDays: leave.total_days,
        status: body.status as "approved" | "rejected",
        note: body.note?.trim() || undefined,
        baseUrl,
      }),
    }).catch((e) => console.error("[email] leave decision:", e));
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
        WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND year = ?
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
       WHERE COALESCE(assets.company_id, assets.org_id) = ?
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
        `INSERT INTO assets (id, company_id, org_id, asset_tag, name, category, serial_no, purchase_date, status, condition, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`,
      )
      .bind(
        id,
        user.tenantId,
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
        WHERE COALESCE(company_id, org_id) = ? AND lower(name) = lower(?)
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
    .prepare("SELECT id, status FROM assets WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1")
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
      `INSERT INTO asset_assignments (id, company_id, org_id, asset_id, user_id, assigned_by, assigned_at, revoked_at, revoke_reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'assigned')`,
    )
    .bind(crypto.randomUUID(), user.tenantId, user.tenantId, assetId, targetUserId, user.userId, now)
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
       WHERE asset_id = ? AND COALESCE(company_id, org_id) = ? AND status = 'assigned'
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

  // ── SaaS free-plan employee-limit enforcement ──
  const company = await env.HRMS
    .prepare(
      `SELECT id, plan, employee_limit, subscription_status
       FROM companies WHERE owner_id = ? LIMIT 1`,
    )
    .bind(user.email)
    .first<{ id: string; plan: string; employee_limit: number; subscription_status: string }>();

  if (company) {
    if (company.subscription_status !== "active") {
      return json(request, env, { error: "Subscription inactive. Please renew to invite employees." }, 400);
    }

    const countRow = await env.HRMS
      .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id = ?`)
      .bind(company.id)
      .first<{ cnt: number }>();

    const current = countRow?.cnt ?? 0;
    if (company.plan === "free" && current >= company.employee_limit) {
      return json(
        request,
        env,
        { error: "Employee limit reached. Upgrade to add more employees." },
        400,
      );
    }
  }
  // ── end enforcement ──

  const role = body?.role?.trim() || "Employee";
  const department = body?.department?.trim() || "General";
  const expiresHours = Math.min(Math.max(Math.floor(body?.expiresHours ?? 24), 1), 168);
  const nowEpoch = Math.floor(Date.now() / 1000);
  const expiresAt = nowEpoch + expiresHours * 60 * 60;

  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  const tokenHash = await sha256Hex(rawToken);
  const now = nowIso();

  try {
    await env.HRMS
      .prepare(
        `INSERT INTO invitations (
           id, company_id, org_id, email, role, department, token_hash, expires_at, accepted_at, status, invited_by, created_at, updated_at
         ) VALUES (?, ?, ?, lower(?), ?, ?, ?, ?, NULL, 'pending', ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.tenantId, user.tenantId, email, role, department, tokenHash, expiresAt, user.userId, now, now)
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
      `SELECT id, company_id, org_id, email, role, department, expires_at, status
       FROM invitations
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{ id: string; company_id: string | null; org_id: string; email: string; role: string; department: string; expires_at: number; status: string }>();

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
  const hasCompanyId = await usersTableHasCompanyId(env.HRMS);
  const hasOrgId = await usersTableHasOrgId(env.HRMS);

  if (hasCompanyId || hasOrgId) {
    await env.HRMS
      .prepare(
        `INSERT INTO users (id, company_id, org_id, name, email, role, department, status, joined_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, lower(?), ?, ?, 'Active', ?, ?, ?)`,
      )
      .bind(userId, invite.company_id ?? invite.org_id, invite.org_id, name, email, invite.role, invite.department, now, now, now)
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
      `INSERT INTO notification_webhooks (id, company_id, org_id, provider, webhook_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(crypto.randomUUID(), user.tenantId, user.tenantId, provider, webhookUrl, now, now)
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
       WHERE COALESCE(company_id, org_id) = ?
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
       WHERE id = ? AND COALESCE(company_id, org_id) = ?
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

// ── Expense Claims handlers ────────────────────────────────────────────────────

async function handleListExpenses(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const isManager = isHrManager(user.role);

  let query: string;
  let bindings: unknown[];

  if (isManager) {
    // HR sees all claims for the tenant, optionally filtered by status
    if (status) {
      query = `SELECT * FROM expense_claims WHERE COALESCE(company_id, org_id) = ? AND status = ? ORDER BY created_at DESC LIMIT 200`;
      bindings = [user.tenantId, status];
    } else {
      query = `SELECT * FROM expense_claims WHERE COALESCE(company_id, org_id) = ? ORDER BY created_at DESC LIMIT 200`;
      bindings = [user.tenantId];
    }
  } else {
    // Employee sees only their own claims
    if (status) {
      query = `SELECT * FROM expense_claims WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100`;
      bindings = [user.tenantId, user.userId, status];
    } else {
      query = `SELECT * FROM expense_claims WHERE COALESCE(company_id, org_id) = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100`;
      bindings = [user.tenantId, user.userId];
    }
  }

  const stmt = env.HRMS.prepare(query);
  const rows = await stmt.bind(...bindings).all();
  return json(request, env, { claims: rows.results });
}

async function handleCreateExpense(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    category?: string;
    description?: string;
    amount?: number;
    claimDate?: string;
    hasReceipt?: boolean;
  }>(request);

  const category = body?.category?.trim() || "";
  const description = body?.description?.trim() || "";
  const amount = Number(body?.amount ?? 0);
  const claimDate = body?.claimDate?.trim() || todayIsoDate();
  const hasReceipt = body?.hasReceipt ? 1 : 0;

  if (!category || !description || amount <= 0) {
    return json(request, env, { error: "Category, description, and amount are required." }, 400);
  }

  const id = `EXP-${Date.now().toString().slice(-6)}`;
  const now = nowIso();

  await env.HRMS
    .prepare(
      `INSERT INTO expense_claims
         (id, company_id, org_id, user_id, user_name, category, description, amount, claim_date, has_receipt, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, user.userId, user.name, category, description, amount, claimDate, hasReceipt, now, now)
    .run();

  return json(request, env, { ok: true, id });
}

async function handleExpenseDecision(
  claimId: string,
  request: Request,
  env: Env,
  user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ status?: string; notes?: string }>(request);
  const newStatus = (body?.status || "").toLowerCase();

  if (!["approved", "rejected", "reimbursed"].includes(newStatus)) {
    return json(request, env, { error: "Invalid status. Use: approved, rejected, reimbursed." }, 400);
  }

  // Fetch claim + employee info before updating (needed for email)
  const claim = await env.HRMS
    .prepare(
      `SELECT ec.id, ec.category, ec.description, ec.amount, ec.user_id,
              u.name AS employee_name, u.email AS employee_email
       FROM expense_claims ec
       LEFT JOIN users u ON u.id = ec.user_id
       WHERE ec.id = ? AND COALESCE(ec.company_id, ec.org_id) = ? LIMIT 1`,
    )
    .bind(claimId, user.tenantId)
    .first<{ id: string; category: string; description: string; amount: number; user_id: string; employee_name: string | null; employee_email: string | null }>();

  const now = nowIso();
  const result = await env.HRMS
    .prepare(
      `UPDATE expense_claims
       SET status = ?, reviewed_by = ?, reviewed_at = ?, notes = ?, updated_at = ?
       WHERE id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(newStatus, user.userId, now, body?.notes?.trim() || null, now, claimId, user.tenantId)
    .run();

  if (!result.meta.changes) {
    return json(request, env, { error: "Claim not found." }, 404);
  }

  // In-app notification
  if (claim) {
    const notifEmoji = newStatus === "approved" ? "✅" : newStatus === "reimbursed" ? "💰" : "❌";
    const notifVerb  = newStatus === "approved" ? "Approved" : newStatus === "reimbursed" ? "Reimbursed" : "Rejected";
    await createNotification(env.HRMS, {
      companyId: user.tenantId,
      userId: claim.user_id,
      type: "general",
      title: `${notifEmoji} Expense ${notifVerb}`,
      body: `Your expense claim "${claim.description}" (₹${claim.amount.toLocaleString("en-IN")}) has been ${newStatus}.${body?.notes ? ` Note: ${body.notes}` : ""}`,
      link: "/hrms/expenses",
    });

    // Email notification (fire-and-forget)
    if (claim.employee_email) {
      const baseUrl = env.HRMS_BASE_URL ?? new URL(request.url).origin;
      sendEmail(env, {
        to: claim.employee_email,
        subject: `${notifEmoji} Your Expense Claim has been ${notifVerb} – JWithKP HRMS`,
        html: buildExpenseDecisionHtml({
          employeeName: claim.employee_name ?? "there",
          category: claim.category,
          description: claim.description,
          amount: claim.amount,
          status: newStatus as "approved" | "rejected" | "reimbursed",
          notes: body?.notes?.trim() || undefined,
          baseUrl,
        }),
      }).catch((e) => console.error("[email] expense decision:", e));
    }
  }

  return json(request, env, { ok: true, id: claimId, status: newStatus });
}

async function handleSubmitRegularisation(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    attendanceDate?: string;
    requestedCheckIn?: string;
    requestedCheckOut?: string;
    reason?: string;
  }>(request);

  if (!body?.attendanceDate || !body.reason?.trim()) {
    return json(request, env, { error: "attendanceDate and reason are required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = nowIso();

  try {
    await env.HRMS
      .prepare(
        `INSERT INTO attendance_regularisations
          (id, org_id, company_id, user_id, attendance_date, requested_check_in, requested_check_out, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(id, user.tenantId, user.tenantId, user.userId, body.attendanceDate, body.requestedCheckIn || null, body.requestedCheckOut || null, body.reason.trim(), now, now)
      .run();
  } catch {
    return json(request, env, { error: "Failed to submit regularisation request." }, 500);
  }

  return json(request, env, { ok: true, id }, 201);
}

async function handleListRegularisations(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const isManager = isHrManager(user.role);

  let sql = `SELECT ar.id, ar.user_id, ar.attendance_date, ar.requested_check_in, ar.requested_check_out,
                    ar.reason, ar.status, ar.reviewed_by, ar.reviewed_at, ar.review_note, ar.created_at,
                    u.name, u.email
             FROM attendance_regularisations ar
             LEFT JOIN users u ON u.id = ar.user_id
             WHERE COALESCE(ar.company_id, ar.org_id) = ?`;
  const binds: Array<string | number> = [user.tenantId];

  if (!isManager) {
    sql += " AND ar.user_id = ?";
    binds.push(user.userId);
  }
  if (status) {
    sql += " AND ar.status = ?";
    binds.push(status);
  }

  sql += " ORDER BY datetime(ar.created_at) DESC";

  const rows = await env.HRMS.prepare(sql).bind(...binds).all();
  return json(request, env, { regularisations: rows.results });
}

async function handleRegularisationDecision(id: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ status?: string; note?: string }>(request);
  if (!body?.status || !["approved", "rejected"].includes(body.status)) {
    return json(request, env, { error: "status must be approved or rejected." }, 400);
  }

  const reg = await env.HRMS
    .prepare(`SELECT id, user_id, attendance_date, requested_check_in, requested_check_out, status FROM attendance_regularisations WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(id, user.tenantId)
    .first<{ id: string; user_id: string; attendance_date: string; requested_check_in: string | null; requested_check_out: string | null; status: string }>();

  if (!reg) return json(request, env, { error: "Regularisation request not found." }, 404);
  if (reg.status !== "pending") return json(request, env, { error: "Only pending requests can be decided." }, 409);

  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE attendance_regularisations SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?`)
    .bind(body.status, user.userId, now, body.note?.trim() || null, now, id)
    .run();

  if (body.status === "approved") {
    const existing = await env.HRMS
      .prepare(`SELECT id FROM attendance WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND attendance_date = ? LIMIT 1`)
      .bind(user.tenantId, reg.user_id, reg.attendance_date)
      .first<{ id: string }>();

    if (existing) {
      await env.HRMS
        .prepare(`UPDATE attendance SET check_in_at = COALESCE(?, check_in_at), check_out_at = COALESCE(?, check_out_at), status = 'present', updated_at = ? WHERE id = ?`)
        .bind(reg.requested_check_in, reg.requested_check_out, now, existing.id)
        .run();
    } else {
      await env.HRMS
        .prepare(`INSERT INTO attendance (id, company_id, org_id, user_id, attendance_date, check_in_at, check_out_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'present', ?, ?)`)
        .bind(crypto.randomUUID(), user.tenantId, user.tenantId, reg.user_id, reg.attendance_date, reg.requested_check_in, reg.requested_check_out, now, now)
        .run();
    }
  }

  return json(request, env, { ok: true, id, status: body.status });
}

async function handleListSalaryConfigs(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT u.id as user_id, u.name, u.email, u.department, u.role, u.status,
              COALESCE(es.annual_ctc, 0) as annual_ctc, es.effective_from, es.updated_at as salary_updated_at
       FROM users u
       LEFT JOIN employee_salaries es ON es.user_id = u.id AND COALESCE(es.company_id, es.org_id) = ?
       WHERE COALESCE(u.company_id, u.org_id) = ?
       ORDER BY u.name ASC`,
    )
    .bind(user.tenantId, user.tenantId)
    .all();

  return json(request, env, { configs: rows.results });
}

async function handleUpsertSalaryConfig(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{ userId?: string; annualCtc?: number; effectiveFrom?: string }>(request);
  if (!body?.userId?.trim() || !body.annualCtc || body.annualCtc <= 0) {
    return json(request, env, { error: "userId and annualCtc (>0) are required." }, 400);
  }

  const now = nowIso();
  await env.HRMS
    .prepare(
      `INSERT INTO employee_salaries (id, org_id, company_id, user_id, annual_ctc, effective_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id, user_id) DO UPDATE SET
         annual_ctc = excluded.annual_ctc,
         effective_from = excluded.effective_from,
         updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), user.tenantId, user.tenantId, body.userId.trim(), Math.round(body.annualCtc), body.effectiveFrom?.trim() || now.slice(0, 10), now, now)
    .run();

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

  if (method === "GET" && pathname === "/api/analytics/headcount") {
    return handleAnalyticsHeadcount(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/analytics/hiring-trend") {
    return handleAnalyticsHiringTrend(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/analytics/salary") {
    return handleAnalyticsSalary(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/analytics/leave-utilization") {
    return handleAnalyticsLeaveUtilization(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/analytics/attendance-summary") {
    return handleAnalyticsAttendanceSummary(request, env, user!);
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

  if (method === "GET" && pathname === "/api/attendance/my") {
    return handleAttendanceMy(request, env, user!);
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

  if (method === "GET" && pathname === "/api/expenses") {
    return handleListExpenses(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/expenses") {
    return handleCreateExpense(request, env, user!);
  }

  const expenseDecisionMatch = pathname.match(/^\/api\/expenses\/([^/]+)\/decision$/);
  if (method === "POST" && expenseDecisionMatch) {
    return handleExpenseDecision(expenseDecisionMatch[1], request, env, user!);
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

  if (method === "POST" && pathname === "/api/attendance/regularise") {
    return handleSubmitRegularisation(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/attendance/regularisations") {
    return handleListRegularisations(request, env, user!);
  }
  const regularisationDecisionMatch = pathname.match(/^\/api\/attendance\/regularisations\/([^/]+)\/decision$/);
  if (method === "POST" && regularisationDecisionMatch) {
    return handleRegularisationDecision(regularisationDecisionMatch[1], request, env, user!);
  }

  if (method === "GET" && pathname === "/api/salary-configs") {
    return handleListSalaryConfigs(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/salary-configs") {
    return handleUpsertSalaryConfig(request, env, user!);
  }

  if (method === "POST" && pathname === "/api/hrbot/chat") {
    return handleHRBotChat(request, env, user!);
  }

  // ── Recruitment: Applicants ──────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/recruitment/applicants") {
    return handleListApplicants(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/recruitment/applicants") {
    return handleAddApplicant(request, env, user!);
  }
  const applicantStageMatch = pathname.match(/^\/api\/recruitment\/applicants\/([^/]+)\/stage$/);
  if (method === "PATCH" && applicantStageMatch) {
    return handleMoveApplicantStage(applicantStageMatch[1], request, env, user!);
  }
  if (method === "DELETE" && pathname.match(/^\/api\/recruitment\/applicants\/([^/]+)$/)) {
    const id = pathname.match(/^\/api\/recruitment\/applicants\/([^/]+)$/)![1];
    return handleDeleteApplicant(id, request, env, user!);
  }
  if (method === "PATCH" && pathname.match(/^\/api\/recruitment\/jobs\/([^/]+)\/close$/)) {
    const id = pathname.match(/^\/api\/recruitment\/jobs\/([^/]+)\/close$/)![1];
    return handleCloseJob(id, request, env, user!);
  }
  if (method === "PATCH" && pathname.match(/^\/api\/recruitment\/jobs\/([^/]+)\/stage$/)) {
    const id = pathname.match(/^\/api\/recruitment\/jobs\/([^/]+)\/stage$/)![1];
    return handleUpdateJobStage(id, request, env, user!);
  }

  // ── Notifications ────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/notifications") {
    return handleListNotifications(request, env, user!);
  }
  if (method === "PATCH" && pathname === "/api/notifications/read-all") {
    return handleMarkAllRead(request, env, user!);
  }
  const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (method === "PATCH" && notifReadMatch) {
    return handleMarkOneRead(notifReadMatch[1], request, env, user!);
  }

  // ── Performance ──────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/performance/cycles") {
    return handleListCycles(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/performance/cycles") {
    return handleCreateCycle(request, env, user!);
  }
  const cycleReviewsMatch = pathname.match(/^\/api\/performance\/cycles\/([^/]+)\/reviews$/);
  if (method === "GET" && cycleReviewsMatch) {
    return handleListReviews(cycleReviewsMatch[1], request, env, user!);
  }
  if (method === "POST" && pathname === "/api/performance/reviews/submit") {
    return handleSubmitReview(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/performance/okrs") {
    return handleListOKRs(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/performance/okrs") {
    return handleCreateOKR(request, env, user!);
  }
  const okrProgressMatch = pathname.match(/^\/api\/performance\/okrs\/([^/]+)\/progress$/);
  if (method === "PATCH" && okrProgressMatch) {
    return handleUpdateOKRProgress(okrProgressMatch[1], request, env, user!);
  }

  // ── Learning ─────────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/learning/courses") {
    return handleListCourses(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/learning/courses") {
    return handleCreateCourse(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/learning/enroll") {
    return handleEnrollCourse(request, env, user!);
  }
  if (method === "PATCH" && pathname === "/api/learning/progress") {
    return handleUpdateCourseProgress(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/learning/my-courses") {
    return handleMyEnrollments(request, env, user!);
  }

  // ── Announcements ────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/announcements") {
    return handleListAnnouncements(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/announcements") {
    return handleCreateAnnouncement(request, env, user!);
  }
  const announcementDeleteMatch = pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (method === "DELETE" && announcementDeleteMatch) {
    return handleDeleteAnnouncement(announcementDeleteMatch[1], request, env, user!);
  }
  const announcementReadMatch = pathname.match(/^\/api\/announcements\/([^/]+)\/read$/);
  if (method === "POST" && announcementReadMatch) {
    return handleMarkAnnouncementRead(announcementReadMatch[1], request, env, user!);
  }
  const announcementPinMatch = pathname.match(/^\/api\/announcements\/([^/]+)\/pin$/);
  if (method === "PATCH" && announcementPinMatch) {
    return handleToggleAnnouncementPin(announcementPinMatch[1], request, env, user!);
  }

  // ── Documents ────────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/documents") {
    return handleListDocuments(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/documents/presign") {
    return handlePresignUpload(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/documents") {
    return handleSaveDocument(request, env, user!);
  }
  const docDeleteMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (method === "DELETE" && docDeleteMatch) {
    return handleDeleteDocument(docDeleteMatch[1], request, env, user!);
  }
  const docDownloadMatch = pathname.match(/^\/api\/documents\/([^/]+)\/download$/);
  if (method === "GET" && docDownloadMatch) {
    return handleDownloadDocument(docDownloadMatch[1], request, env, user!);
  }

  // ── Shifts & Roster ──────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/shifts") {
    return handleListShifts(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/shifts") {
    return handleCreateShift(request, env, user!);
  }
  const shiftDeleteMatch = pathname.match(/^\/api\/shifts\/([^/]+)$/);
  if (method === "DELETE" && shiftDeleteMatch) {
    return handleDeleteShift(shiftDeleteMatch[1], request, env, user!);
  }
  if (method === "GET" && pathname === "/api/roster") {
    return handleListRoster(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/roster") {
    return handleAssignShift(request, env, user!);
  }
  const rosterDeleteMatch = pathname.match(/^\/api\/roster\/([^/]+)$/);
  if (method === "DELETE" && rosterDeleteMatch) {
    return handleRemoveRosterEntry(rosterDeleteMatch[1], request, env, user!);
  }

  // ── Reports ───────────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/reports/payroll") {
    return handleReportPayroll(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/reports/attendance") {
    return handleReportAttendance(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/reports/leave") {
    return handleReportLeave(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/reports/headcount") {
    return handleReportHeadcount(request, env, user!);
  }

  // ── Company Settings ─────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/tenant/settings") {
    return handleGetTenantSettings(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/tenant/settings") {
    return handleSaveTenantSettings(request, env, user!);
  }

  // ── Departments ──────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/departments") {
    return handleListDepartments(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/departments") {
    return handleCreateDepartment(request, env, user!);
  }
  const deptDeleteMatch = pathname.match(/^\/api\/departments\/([^/]+)$/);
  if (method === "DELETE" && deptDeleteMatch) {
    return handleDeleteDepartment(deptDeleteMatch[1], request, env, user!);
  }

  return null;
}

// ── Recruitment Handlers ──────────────────────────────────────────────────────

async function handleListApplicants(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return json(request, env, { error: "jobId is required." }, 400);

  const rows = await env.HRMS
    .prepare(
      `SELECT id, job_id, name, email, phone, resume_url, stage, notes, applied_at, updated_at
       FROM job_applicants
       WHERE COALESCE(company_id, org_id) = ? AND job_id = ?
       ORDER BY applied_at DESC`,
    )
    .bind(user.tenantId, jobId)
    .all<{
      id: string; job_id: string; name: string; email: string; phone: string | null;
      resume_url: string | null; stage: string; notes: string | null;
      applied_at: string; updated_at: string;
    }>();

  return json(request, env, { applicants: rows.results });
}

async function handleAddApplicant(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    jobId?: string; name?: string; email?: string; phone?: string; resumeUrl?: string;
  }>(request);

  if (!body?.jobId || !body.name?.trim() || !body.email?.trim()) {
    return json(request, env, { error: "jobId, name, and email are required." }, 400);
  }

  const now = nowIso();
  const id = `APL${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await env.HRMS
    .prepare(
      `INSERT INTO job_applicants (id, company_id, org_id, job_id, name, email, phone, resume_url, stage, applied_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Applied', ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, body.jobId, body.name.trim(), body.email.trim(),
      body.phone?.trim() || null, body.resumeUrl?.trim() || null, now, now)
    .run();

  // Increment applicant_count on job_openings
  await env.HRMS
    .prepare(`UPDATE job_openings SET applicant_count = applicant_count + 1, updated_at = ? WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(now, body.jobId, user.tenantId)
    .run();

  return json(request, env, { ok: true, id }, 201);
}

async function handleMoveApplicantStage(
  applicantId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{ stage?: string; notes?: string }>(request);
  const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
  if (!body?.stage || !STAGES.includes(body.stage)) {
    return json(request, env, { error: `stage must be one of: ${STAGES.join(", ")}` }, 400);
  }

  const now = nowIso();
  await env.HRMS
    .prepare(
      `UPDATE job_applicants SET stage = ?, notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(body.stage, body.notes || null, now, applicantId, user.tenantId)
    .run();

  return json(request, env, { ok: true, id: applicantId, stage: body.stage });
}

async function handleDeleteApplicant(
  applicantId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  // Get job_id first so we can decrement count
  const apl = await env.HRMS
    .prepare(`SELECT job_id FROM job_applicants WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(applicantId, user.tenantId)
    .first<{ job_id: string }>();

  if (!apl) return json(request, env, { error: "Applicant not found." }, 404);

  await env.HRMS.prepare(`DELETE FROM job_applicants WHERE id = ?`).bind(applicantId).run();

  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE job_openings SET applicant_count = MAX(0, applicant_count - 1), updated_at = ? WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(now, apl.job_id, user.tenantId)
    .run();

  return json(request, env, { ok: true });
}

async function handleCloseJob(
  jobId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE job_openings SET stage = 'Closed', updated_at = ? WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(now, jobId, user.tenantId)
    .run();
  return json(request, env, { ok: true });
}

async function handleUpdateJobStage(
  jobId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await request.json<{ stage: string }>();
  const VALID_STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Closed"];
  if (!VALID_STAGES.includes(body.stage)) {
    return json(request, env, { error: "Invalid stage." }, 400);
  }
  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE job_openings SET stage = ?, updated_at = ? WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(body.stage, now, jobId, user.tenantId)
    .run();
  return json(request, env, { ok: true, stage: body.stage });
}

// ── Performance Handlers ──────────────────────────────────────────────────────

async function handleListCycles(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT id, name, review_type, start_date, end_date, status, created_by, created_at
       FROM review_cycles
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY created_at DESC`,
    )
    .bind(user.tenantId)
    .all();
  return json(request, env, { cycles: rows.results });
}

async function handleCreateCycle(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    name?: string; reviewType?: string; startDate?: string; endDate?: string;
  }>(request);

  if (!body?.name?.trim()) return json(request, env, { error: "name is required." }, 400);

  const now = nowIso();
  const id = `CYC${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await env.HRMS
    .prepare(
      `INSERT INTO review_cycles (id, company_id, org_id, name, review_type, start_date, end_date, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, body.name.trim(),
      body.reviewType || "360", body.startDate || null, body.endDate || null,
      user.userId, now, now)
    .run();

  // Auto-create reviews for all employees in this org (manager → employee)
  const employees = await env.HRMS
    .prepare(`SELECT id FROM users WHERE COALESCE(company_id, org_id) = ? AND status = 'Active'`)
    .bind(user.tenantId)
    .all<{ id: string }>();

  const reviewType = body.reviewType || "360";
  const insertBatch: Promise<unknown>[] = [];

  for (const emp of employees.results) {
    // Self review
    if (reviewType === "360" || reviewType === "self") {
      const rid = `REV${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      insertBatch.push(
        env.HRMS.prepare(
          `INSERT OR IGNORE INTO performance_reviews (id, company_id, org_id, cycle_id, reviewee_id, reviewer_id, reviewer_type, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'self', 'pending', ?, ?)`,
        ).bind(rid, user.tenantId, user.tenantId, id, emp.id, emp.id, now, now).run(),
      );
    }
    // Manager review (admin/HR reviewing employee)
    if (reviewType === "360" || reviewType === "manager") {
      const rid = `REV${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      insertBatch.push(
        env.HRMS.prepare(
          `INSERT OR IGNORE INTO performance_reviews (id, company_id, org_id, cycle_id, reviewee_id, reviewer_id, reviewer_type, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'manager', 'pending', ?, ?)`,
        ).bind(rid, user.tenantId, user.tenantId, id, emp.id, user.userId, now, now).run(),
      );
    }
  }

  await Promise.all(insertBatch);

  return json(request, env, { ok: true, id }, 201);
}

async function handleListReviews(
  cycleId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  const url = new URL(request.url);
  const revieweeId = isHrManager(user.role) ? (url.searchParams.get("revieweeId") || null) : user.userId;

  const baseQuery = isHrManager(user.role)
    ? `SELECT pr.id, pr.cycle_id, pr.reviewee_id, u1.name as reviewee_name,
              pr.reviewer_id, u2.name as reviewer_name,
              pr.reviewer_type, pr.rating, pr.comments, pr.status, pr.submitted_at
       FROM performance_reviews pr
       LEFT JOIN users u1 ON u1.id = pr.reviewee_id
       LEFT JOIN users u2 ON u2.id = pr.reviewer_id
       WHERE pr.cycle_id = ? AND COALESCE(pr.company_id, pr.org_id) = ?
       ORDER BY u1.name, pr.reviewer_type`
    : `SELECT pr.id, pr.cycle_id, pr.reviewee_id, u1.name as reviewee_name,
              pr.reviewer_id, u2.name as reviewer_name,
              pr.reviewer_type, pr.rating, pr.comments, pr.status, pr.submitted_at
       FROM performance_reviews pr
       LEFT JOIN users u1 ON u1.id = pr.reviewee_id
       LEFT JOIN users u2 ON u2.id = pr.reviewer_id
       WHERE pr.cycle_id = ? AND COALESCE(pr.company_id, pr.org_id) = ?
         AND (pr.reviewee_id = ? OR pr.reviewer_id = ?)
       ORDER BY pr.reviewer_type`;

  const stmt = isHrManager(user.role)
    ? env.HRMS.prepare(baseQuery).bind(cycleId, user.tenantId)
    : env.HRMS.prepare(baseQuery).bind(cycleId, user.tenantId, user.userId, user.userId);

  const rows = await stmt.all();
  return json(request, env, { reviews: rows.results });
}

async function handleSubmitReview(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    reviewId?: string; rating?: number; comments?: string;
  }>(request);

  if (!body?.reviewId || !body.rating || body.rating < 1 || body.rating > 5) {
    return json(request, env, { error: "reviewId and rating (1-5) are required." }, 400);
  }

  const now = nowIso();
  const result = await env.HRMS
    .prepare(
      `UPDATE performance_reviews
       SET rating = ?, comments = ?, status = 'submitted', submitted_at = ?, updated_at = ?
       WHERE id = ? AND reviewer_id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(body.rating, body.comments || null, now, now, body.reviewId, user.userId, user.tenantId)
    .run();

  if (!result.meta.changes) return json(request, env, { error: "Review not found or not authorized." }, 404);
  return json(request, env, { ok: true });
}

async function handleListOKRs(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const userId = isHrManager(user.role) ? (url.searchParams.get("userId") || null) : user.userId;
  const cycleId = url.searchParams.get("cycleId");

  let q = `SELECT id, user_id, cycle_id, objective, key_results, progress, status, due_date, created_at
           FROM okrs WHERE COALESCE(company_id, org_id) = ?`;
  const binds: unknown[] = [user.tenantId];
  if (userId) { q += ` AND user_id = ?`; binds.push(userId); }
  if (cycleId) { q += ` AND cycle_id = ?`; binds.push(cycleId); }
  q += ` ORDER BY created_at DESC`;

  const rows = await env.HRMS.prepare(q).bind(...binds).all();
  return json(request, env, { okrs: rows.results });
}

async function handleCreateOKR(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    objective?: string; keyResults?: Array<{ title: string; target: number; current: number; unit: string }>;
    cycleId?: string; dueDate?: string;
  }>(request);

  if (!body?.objective?.trim()) return json(request, env, { error: "objective is required." }, 400);

  const now = nowIso();
  const id = `OKR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const keyResults = JSON.stringify(body.keyResults || []);

  await env.HRMS
    .prepare(
      `INSERT INTO okrs (id, company_id, org_id, user_id, cycle_id, objective, key_results, progress, status, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, user.userId, body.cycleId || null,
      body.objective.trim(), keyResults, body.dueDate || null, now, now)
    .run();

  return json(request, env, { ok: true, id }, 201);
}

async function handleUpdateOKRProgress(
  okrId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  const body = await readJsonBody<{ progress?: number; keyResults?: unknown[]; status?: string }>(request);

  if (body?.progress === undefined) return json(request, env, { error: "progress is required." }, 400);
  const progress = Math.max(0, Math.min(100, Math.round(Number(body.progress))));

  const now = nowIso();
  const status = body.status || (progress === 100 ? "completed" : "active");
  const krJson = body.keyResults ? JSON.stringify(body.keyResults) : null;

  const result = await env.HRMS
    .prepare(
      `UPDATE okrs SET progress = ?, status = ?, ${krJson ? "key_results = ?," : ""} updated_at = ?
       WHERE id = ? AND user_id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(...(krJson ? [progress, status, krJson, now] : [progress, status, now]), okrId, user.userId, user.tenantId)
    .run();

  if (!result.meta.changes) return json(request, env, { error: "OKR not found or not authorized." }, 404);
  return json(request, env, { ok: true, progress });
}

// ── Learning Handlers ─────────────────────────────────────────────────────────

async function handleListCourses(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const level = url.searchParams.get("level");

  let q = `SELECT id, title, category, level, duration, provider, description, is_mandatory, created_at
           FROM courses WHERE COALESCE(company_id, org_id) = ?`;
  const binds: unknown[] = [user.tenantId];
  if (category) { q += ` AND category = ?`; binds.push(category); }
  if (level && level !== "All") { q += ` AND level = ?`; binds.push(level); }
  q += ` ORDER BY is_mandatory DESC, created_at DESC`;

  const rows = await env.HRMS.prepare(q).bind(...binds).all();
  return json(request, env, { courses: rows.results });
}

async function handleCreateCourse(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    title?: string; category?: string; level?: string; duration?: string;
    provider?: string; description?: string; isMandatory?: boolean;
  }>(request);

  if (!body?.title?.trim()) return json(request, env, { error: "title is required." }, 400);

  const now = nowIso();
  const id = `CRS${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await env.HRMS
    .prepare(
      `INSERT INTO courses (id, company_id, org_id, title, category, level, duration, provider, description, is_mandatory, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, body.title.trim(),
      body.category || "Technical", body.level || "All",
      body.duration?.trim() || null, body.provider?.trim() || null,
      body.description?.trim() || null, body.isMandatory ? 1 : 0,
      user.userId, now, now)
    .run();

  return json(request, env, { ok: true, id }, 201);
}

async function handleEnrollCourse(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{ courseId?: string; userId?: string }>(request);
  if (!body?.courseId) return json(request, env, { error: "courseId is required." }, 400);

  const targetUserId = (body.userId && isHrManager(user.role)) ? body.userId : user.userId;
  const now = nowIso();
  const id = `ENR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await env.HRMS
    .prepare(
      `INSERT INTO course_enrollments (id, company_id, org_id, course_id, user_id, status, progress, enrolled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'enrolled', 0, ?, ?)
       ON CONFLICT(org_id, course_id, user_id) DO NOTHING`,
    )
    .bind(id, user.tenantId, user.tenantId, body.courseId, targetUserId, now, now)
    .run();

  return json(request, env, { ok: true, id });
}

async function handleUpdateCourseProgress(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{ courseId?: string; progress?: number }>(request);
  if (!body?.courseId || body.progress === undefined) {
    return json(request, env, { error: "courseId and progress are required." }, 400);
  }

  const progress = Math.max(0, Math.min(100, Math.round(Number(body.progress))));
  const now = nowIso();
  const status = progress === 100 ? "completed" : progress > 0 ? "in_progress" : "enrolled";
  const completedAt = progress === 100 ? now : null;

  await env.HRMS
    .prepare(
      `UPDATE course_enrollments
       SET progress = ?, status = ?, completed_at = COALESCE(completed_at, ?), updated_at = ?
       WHERE course_id = ? AND user_id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(progress, status, completedAt, now, body.courseId, user.userId, user.tenantId)
    .run();

  return json(request, env, { ok: true, progress, status });
}

async function handleMyEnrollments(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT e.id, e.course_id, c.title, c.category, c.level, c.duration, c.provider, c.is_mandatory,
              e.status, e.progress, e.enrolled_at, e.completed_at
       FROM course_enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ? AND COALESCE(e.company_id, e.org_id) = ?
       ORDER BY e.enrolled_at DESC`,
    )
    .bind(user.userId, user.tenantId)
    .all();
  return json(request, env, { enrollments: rows.results });
}

// ── HRBot AI Chat (OpenRouter / Claude) ───────────────────────────────────────
async function handleHRBotChat(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const apiKey = (env as unknown as Record<string, string>).OPENROUTER_API_KEY;
  if (!apiKey) {
    return json(request, env, { error: "AI not configured." }, 503);
  }

  const body = await readJsonBody<{
    messages?: Array<{ role: string; content: string }>;
    context?: {
      leaveBalanceSummary?: string;
      presentCount?: number;
      employeeName?: string;
      department?: string;
      designation?: string;
      grossSalary?: number;
    };
  }>(request);

  if (!body?.messages?.length) {
    return json(request, env, { error: "messages required." }, 400);
  }

  const ctx = body.context ?? {};
  const systemPrompt = `You are HRBot, an intelligent HR assistant for JWithKP HRMS platform. You help employees with HR queries in a friendly, concise, and professional manner.

Employee context:
- Name: ${ctx.employeeName ?? user.name}
- Department: ${ctx.department ?? "Not specified"}
- Designation: ${ctx.designation ?? "Not specified"}
- Leave balances: ${ctx.leaveBalanceSummary ?? "Not available"}
- Present days this month: ${ctx.presentCount ?? "Unknown"}
- Monthly gross salary: ${ctx.grossSalary ? `₹${ctx.grossSalary.toLocaleString("en-IN")}` : "Not disclosed"}

Company policies:
- Annual Leave: 18 days/year, Sick Leave: 12 days/year, Casual Leave: 6 days/year
- Leave year: April to March
- WFH: up to 3 days/week for eligible roles (manager approval required)
- PF: 12% of Basic salary (employee), matched by employer up to ₹1800/month
- ESI: 0.75% employee, 3.25% employer (applicable if gross ≤ ₹21,000/month)
- Professional Tax: ₹200/month (income > ₹10,000)
- Travel reimbursement: flights on actuals, hotels up to ₹2000/day (metro), meals ₹500/day
- Expense claims: submit within 30 days with receipts
- Performance reviews: bi-annual (April & October)
- Probation: 3 months for new joiners

Answer helpfully and concisely. Use bullet points when listing items. If you don't know specific company-level details, acknowledge it and suggest contacting HR. Always be warm and professional.`;

  const openRouterMessages = [
    { role: "system", content: systemPrompt },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vite-react-template.keshavpandit9696.workers.dev",
      "X-Title": "JWithKP HRMS HRBot",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3-haiku",
      messages: openRouterMessages,
      stream: true,
      max_tokens: 1024,
    }),
  });

  if (!orResponse.ok) {
    const err = await orResponse.text();
    return json(request, env, { error: `AI service error: ${err.slice(0, 200)}` }, 502);
  }

  // Stream SSE back to client
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = orResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch {
      // stream ended
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...withCors(request, env),
    },
  });
}

// ── Company Settings Handlers ────────────────────────────────────────────────

async function handleGetTenantSettings(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const row = await env.HRMS
    .prepare(
      `SELECT id, timezone, date_format, currency, office_lat, office_lng,
              geo_fence_radius, office_checkin_required, wfh_enabled,
              payroll_day, company_logo_url, setup_completed
       FROM tenant_settings
       WHERE COALESCE(company_id, org_id) = ?
       LIMIT 1`,
    )
    .bind(user.tenantId)
    .first<{
      id: string;
      timezone: string;
      date_format: string;
      currency: string;
      office_lat: number | null;
      office_lng: number | null;
      geo_fence_radius: number;
      office_checkin_required: number;
      wfh_enabled: number;
      payroll_day: number;
      company_logo_url: string | null;
      setup_completed: number;
    }>();

  if (!row) {
    // Return defaults when no settings row exists yet
    return json(request, env, {
      settings: {
        timezone: "Asia/Kolkata",
        dateFormat: "DD/MM/YYYY",
        currency: "INR",
        officeLat: null,
        officeLng: null,
        geoFenceRadius: 200,
        officeCheckinRequired: false,
        wfhEnabled: true,
        payrollDay: 1,
        companyLogoUrl: null,
        setupCompleted: false,
      },
    });
  }

  return json(request, env, {
    settings: {
      timezone: row.timezone,
      dateFormat: row.date_format,
      currency: row.currency,
      officeLat: row.office_lat,
      officeLng: row.office_lng,
      geoFenceRadius: row.geo_fence_radius,
      officeCheckinRequired: Boolean(row.office_checkin_required),
      wfhEnabled: Boolean(row.wfh_enabled),
      payrollDay: row.payroll_day,
      companyLogoUrl: row.company_logo_url,
      setupCompleted: Boolean(row.setup_completed),
    },
  });
}

async function handleSaveTenantSettings(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    timezone?: string;
    dateFormat?: string;
    currency?: string;
    officeLat?: number | null;
    officeLng?: number | null;
    geoFenceRadius?: number;
    officeCheckinRequired?: boolean;
    wfhEnabled?: boolean;
    payrollDay?: number;
    companyLogoUrl?: string | null;
    setupCompleted?: boolean;
  }>(request);

  if (!body) return json(request, env, { error: "Invalid request body." }, 400);

  const now = nowIso();
  const existing = await env.HRMS
    .prepare(`SELECT id FROM tenant_settings WHERE COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(user.tenantId)
    .first<{ id: string }>();

  const id = existing?.id ?? crypto.randomUUID();

  if (existing) {
    await env.HRMS
      .prepare(
        `UPDATE tenant_settings
         SET timezone = COALESCE(?, timezone),
             date_format = COALESCE(?, date_format),
             currency = COALESCE(?, currency),
             office_lat = ?,
             office_lng = ?,
             geo_fence_radius = COALESCE(?, geo_fence_radius),
             office_checkin_required = COALESCE(?, office_checkin_required),
             wfh_enabled = COALESCE(?, wfh_enabled),
             payroll_day = COALESCE(?, payroll_day),
             company_logo_url = COALESCE(?, company_logo_url),
             setup_completed = COALESCE(?, setup_completed),
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        body.timezone ?? null,
        body.dateFormat ?? null,
        body.currency ?? null,
        body.officeLat ?? null,
        body.officeLng ?? null,
        body.geoFenceRadius ?? null,
        body.officeCheckinRequired != null ? (body.officeCheckinRequired ? 1 : 0) : null,
        body.wfhEnabled != null ? (body.wfhEnabled ? 1 : 0) : null,
        body.payrollDay ?? null,
        body.companyLogoUrl ?? null,
        body.setupCompleted != null ? (body.setupCompleted ? 1 : 0) : null,
        now,
        id,
      )
      .run();
  } else {
    await env.HRMS
      .prepare(
        `INSERT INTO tenant_settings
           (id, company_id, org_id, timezone, date_format, currency,
            office_lat, office_lng, geo_fence_radius, office_checkin_required,
            wfh_enabled, payroll_day, company_logo_url, setup_completed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.tenantId,
        user.tenantId,
        body.timezone ?? "Asia/Kolkata",
        body.dateFormat ?? "DD/MM/YYYY",
        body.currency ?? "INR",
        body.officeLat ?? null,
        body.officeLng ?? null,
        body.geoFenceRadius ?? 200,
        body.officeCheckinRequired ? 1 : 0,
        body.wfhEnabled !== false ? 1 : 0,
        body.payrollDay ?? 1,
        body.companyLogoUrl ?? null,
        body.setupCompleted ? 1 : 0,
        now,
        now,
      )
      .run();
  }

  return json(request, env, { ok: true });
}

// ── Department Handlers ──────────────────────────────────────────────────────

async function handleListDepartments(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT d.id, d.name, d.description, d.head_user_id,
              u.name AS head_name,
              (SELECT COUNT(*) FROM users WHERE COALESCE(company_id, org_id) = d.company_id
                AND department = d.name AND COALESCE(status,'Active') = 'Active') AS member_count
       FROM departments d
       LEFT JOIN users u ON u.id = d.head_user_id
       WHERE COALESCE(d.company_id, d.org_id) = ?
       ORDER BY d.name ASC`,
    )
    .bind(user.tenantId)
    .all<{
      id: string;
      name: string;
      description: string | null;
      head_user_id: string | null;
      head_name: string | null;
      member_count: number;
    }>();

  return json(request, env, { departments: rows.results });
}

async function handleCreateDepartment(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    name?: string;
    description?: string;
    headUserId?: string;
  }>(request);

  if (!body?.name?.trim()) return json(request, env, { error: "Department name is required." }, 400);

  const now = nowIso();
  const id = crypto.randomUUID();

  await env.HRMS
    .prepare(
      `INSERT INTO departments (id, company_id, org_id, name, description, head_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.tenantId,
      user.tenantId,
      body.name.trim(),
      body.description?.trim() || null,
      body.headUserId?.trim() || null,
      now,
      now,
    )
    .run();

  return json(request, env, { ok: true, id });
}

async function handleDeleteDepartment(deptId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  await env.HRMS
    .prepare(`DELETE FROM departments WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(deptId, user.tenantId)
    .run();

  return json(request, env, { ok: true });
}

function isAdminUser(role: string): boolean {
  return role.toLowerCase().includes("admin");
}

// ── Announcement Handlers ────────────────────────────────────────────────────

function canPostAnnouncement(role: string): boolean {
  const r = role.toLowerCase();
  return r.includes("admin") || r.includes("hr");
}

async function handleListAnnouncements(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT a.id, a.title, a.body, a.priority, a.pinned, a.author_id, a.author_name, a.created_at,
              CASE WHEN ar.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
       FROM announcements a
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
       WHERE COALESCE(a.company_id, a.org_id) = ?
       ORDER BY a.pinned DESC, a.created_at DESC
       LIMIT 50`,
    )
    .bind(user.userId, user.tenantId)
    .all<{
      id: string;
      title: string;
      body: string;
      priority: string;
      pinned: number;
      author_id: string;
      author_name: string;
      created_at: string;
      is_read: number;
    }>();

  const unreadCount = rows.results.filter((r) => !r.is_read).length;

  return json(request, env, {
    announcements: rows.results.map((r) => ({
      ...r,
      pinned: Boolean(r.pinned),
      isRead: Boolean(r.is_read),
    })),
    unreadCount,
  });
}

async function handleCreateAnnouncement(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!canPostAnnouncement(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    title?: string;
    body?: string;
    priority?: string;
    pinned?: boolean;
  }>(request);

  if (!body?.title?.trim() || !body.body?.trim()) {
    return json(request, env, { error: "Title and body are required." }, 400);
  }

  const validPriorities = ["normal", "important", "urgent"];
  const priority = validPriorities.includes(body.priority ?? "") ? (body.priority ?? "normal") : "normal";

  const now = nowIso();
  const id = crypto.randomUUID();

  await env.HRMS
    .prepare(
      `INSERT INTO announcements (id, company_id, org_id, title, body, priority, pinned, author_id, author_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.tenantId,
      user.tenantId,
      body.title.trim(),
      body.body.trim(),
      priority,
      body.pinned ? 1 : 0,
      user.userId,
      user.name,
      now,
      now,
    )
    .run();

  // Broadcast in-app notification to all active employees in the tenant
  try {
    const employees = await env.HRMS
      .prepare(`SELECT id FROM users WHERE COALESCE(company_id, org_id) = ? AND id != ? AND COALESCE(status, 'Active') = 'Active' LIMIT 200`)
      .bind(user.tenantId, user.userId)
      .all<{ id: string }>();

    const notifInserts = employees.results.map((emp) =>
      env.HRMS
        .prepare(
          `INSERT OR IGNORE INTO notifications (id, user_id, company_id, org_id, type, title, body, link, created_at)
           VALUES (?, ?, ?, ?, 'announcement', ?, ?, '/hrms/announcements', ?)`,
        )
        .bind(
          crypto.randomUUID(),
          emp.id,
          user.tenantId,
          user.tenantId,
          body.title!.trim(),
          body.body!.trim().slice(0, 120),
          now,
        )
    );

    // D1 batch — fire and forget
    if (notifInserts.length > 0) {
      await env.HRMS.batch(notifInserts);
    }
  } catch {
    // Notification failure should not block announcement creation
  }

  return json(request, env, { ok: true, id });
}

async function handleDeleteAnnouncement(announcementId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!canPostAnnouncement(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  await env.HRMS
    .prepare(`DELETE FROM announcements WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(announcementId, user.tenantId)
    .run();

  // Clean up reads too
  await env.HRMS
    .prepare(`DELETE FROM announcement_reads WHERE announcement_id = ?`)
    .bind(announcementId)
    .run();

  return json(request, env, { ok: true });
}

async function handleMarkAnnouncementRead(announcementId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  const now = nowIso();

  await env.HRMS
    .prepare(
      `INSERT OR IGNORE INTO announcement_reads (id, announcement_id, user_id, read_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), announcementId, user.userId, now)
    .run();

  return json(request, env, { ok: true });
}

async function handleToggleAnnouncementPin(announcementId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!canPostAnnouncement(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const current = await env.HRMS
    .prepare(`SELECT pinned FROM announcements WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(announcementId, user.tenantId)
    .first<{ pinned: number }>();

  if (!current) return json(request, env, { error: "Not found." }, 404);

  const newPinned = current.pinned ? 0 : 1;

  await env.HRMS
    .prepare(`UPDATE announcements SET pinned = ?, updated_at = ? WHERE id = ?`)
    .bind(newPinned, nowIso(), announcementId)
    .run();

  return json(request, env, { ok: true, pinned: Boolean(newPinned) });
}

// ── Shift & Roster Handlers ──────────────────────────────────────────────────

async function handleListShifts(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT id, name, start_time, end_time, color, created_at
       FROM shifts
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY name ASC`,
    )
    .bind(user.tenantId)
    .all<{ id: string; name: string; start_time: string; end_time: string; color: string; created_at: string }>();

  return json(request, env, { shifts: rows.results });
}

async function handleCreateShift(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    name?: string;
    startTime?: string;
    endTime?: string;
    color?: string;
  }>(request);

  if (!body?.name?.trim() || !body.startTime || !body.endTime) {
    return json(request, env, { error: "name, startTime, and endTime are required." }, 400);
  }

  const now = nowIso();
  const id = crypto.randomUUID();

  await env.HRMS
    .prepare(
      `INSERT INTO shifts (id, company_id, org_id, name, start_time, end_time, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, body.name.trim(), body.startTime, body.endTime, body.color ?? "#4f46e5", now, now)
    .run();

  return json(request, env, { ok: true, id });
}

async function handleDeleteShift(shiftId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  await env.HRMS
    .prepare(`DELETE FROM shifts WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(shiftId, user.tenantId)
    .run();
  // cascade roster entries
  await env.HRMS.prepare(`DELETE FROM employee_shifts WHERE shift_id = ? AND COALESCE(company_id, org_id) = ?`).bind(shiftId, user.tenantId).run();

  return json(request, env, { ok: true });
}

async function handleListRoster(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT es.id, es.employee_id, es.employee_name, es.shift_id, es.shift_name,
              s.start_time, s.end_time, s.color,
              es.effective_from, es.effective_to
       FROM employee_shifts es
       LEFT JOIN shifts s ON s.id = es.shift_id
       WHERE COALESCE(es.company_id, es.org_id) = ?
       ORDER BY es.effective_from DESC, es.employee_name ASC`,
    )
    .bind(user.tenantId)
    .all<{
      id: string; employee_id: string; employee_name: string;
      shift_id: string; shift_name: string; start_time: string; end_time: string; color: string;
      effective_from: string; effective_to: string | null;
    }>();

  return json(request, env, { roster: rows.results });
}

async function handleAssignShift(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    employeeId?: string;
    shiftId?: string;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  }>(request);

  if (!body?.employeeId || !body.shiftId || !body.effectiveFrom) {
    return json(request, env, { error: "employeeId, shiftId, effectiveFrom are required." }, 400);
  }

  const emp = await env.HRMS
    .prepare(`SELECT id, name FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(body.employeeId, user.tenantId)
    .first<{ id: string; name: string }>();
  if (!emp) return json(request, env, { error: "Employee not found." }, 404);

  const shift = await env.HRMS
    .prepare(`SELECT id, name FROM shifts WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(body.shiftId, user.tenantId)
    .first<{ id: string; name: string }>();
  if (!shift) return json(request, env, { error: "Shift not found." }, 404);

  const now = nowIso();
  const id = crypto.randomUUID();

  await env.HRMS
    .prepare(
      `INSERT INTO employee_shifts (id, company_id, org_id, employee_id, employee_name, shift_id, shift_name, effective_from, effective_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, emp.id, emp.name, shift.id, shift.name, body.effectiveFrom, body.effectiveTo ?? null, now, now)
    .run();

  return json(request, env, { ok: true, id });
}

async function handleRemoveRosterEntry(entryId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  await env.HRMS
    .prepare(`DELETE FROM employee_shifts WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(entryId, user.tenantId)
    .run();

  return json(request, env, { ok: true });
}

// ── Report Handlers ──────────────────────────────────────────────────────────

async function handleReportPayroll(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const url = new URL(request.url);
  const monthKey = url.searchParams.get("month") ?? "";

  let query = `SELECT employee_name, department, basic, hra, conveyance, pf, esi, tds, pt, gross, deductions, net, status, month_key
               FROM payroll_items
               WHERE COALESCE(company_id, org_id) = ?`;
  const binds: unknown[] = [user.tenantId];

  if (monthKey) {
    query += ` AND month_key = ?`;
    binds.push(monthKey);
  }
  query += ` ORDER BY month_key DESC, employee_name ASC`;

  const rows = await env.HRMS.prepare(query).bind(...binds).all<{
    employee_name: string; department: string; basic: number; hra: number; conveyance: number;
    pf: number; esi: number; tds: number; pt: number; gross: number; deductions: number; net: number;
    status: string; month_key: string;
  }>();

  // Monthly totals
  const totalsMap: Record<string, { gross: number; deductions: number; net: number; count: number }> = {};
  for (const r of rows.results) {
    if (!totalsMap[r.month_key]) totalsMap[r.month_key] = { gross: 0, deductions: 0, net: 0, count: 0 };
    totalsMap[r.month_key].gross += r.gross;
    totalsMap[r.month_key].deductions += r.deductions;
    totalsMap[r.month_key].net += r.net;
    totalsMap[r.month_key].count++;
  }

  return json(request, env, { rows: rows.results, totals: totalsMap });
}

async function handleReportAttendance(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  let query = `SELECT u.name AS employee_name, COALESCE(u.department, 'General') AS department,
                      a.attendance_date, a.status, a.check_in, a.check_out,
                      CASE
                        WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
                        THEN ROUND((JULIANDAY(a.check_out) - JULIANDAY(a.check_in)) * 24, 2)
                        ELSE NULL
                      END AS hours_worked
               FROM attendance a
               JOIN users u ON u.id = a.user_id
               WHERE COALESCE(a.company_id, a.org_id) = ?`;
  const binds: unknown[] = [user.tenantId];

  if (from) { query += ` AND a.attendance_date >= ?`; binds.push(from); }
  if (to)   { query += ` AND a.attendance_date <= ?`; binds.push(to); }

  query += ` ORDER BY a.attendance_date DESC, u.name ASC LIMIT 2000`;

  const rows = await env.HRMS.prepare(query).bind(...binds).all<{
    employee_name: string; department: string; attendance_date: string;
    status: string; check_in: string | null; check_out: string | null; hours_worked: number | null;
  }>();

  // Per-employee summary
  const summaryMap: Record<string, { present: number; absent: number; half_day: number; late: number; wfh: number; total_hours: number }> = {};
  for (const r of rows.results) {
    if (!summaryMap[r.employee_name]) summaryMap[r.employee_name] = { present: 0, absent: 0, half_day: 0, late: 0, wfh: 0, total_hours: 0 };
    const s = summaryMap[r.employee_name];
    const st = (r.status ?? "").toLowerCase();
    if (st === "present") s.present++;
    else if (st === "absent") s.absent++;
    else if (st === "half_day" || st === "half-day") s.half_day++;
    else if (st === "late") s.late++;
    else if (st === "wfh") s.wfh++;
    s.total_hours += r.hours_worked ?? 0;
  }

  return json(request, env, { rows: rows.results, summary: summaryMap });
}

async function handleReportLeave(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const url = new URL(request.url);
  const year = url.searchParams.get("year") ?? new Date().getFullYear().toString();

  const rows = await env.HRMS
    .prepare(
      `SELECT u.name AS employee_name, COALESCE(u.department, 'General') AS department,
              l.leave_type, l.status, l.start_date, l.end_date, l.days,
              l.reason, l.applied_at
       FROM leaves l
       JOIN users u ON u.id = l.user_id
       WHERE COALESCE(l.company_id, l.org_id) = ?
         AND strftime('%Y', l.start_date) = ?
       ORDER BY l.applied_at DESC LIMIT 2000`,
    )
    .bind(user.tenantId, year)
    .all<{
      employee_name: string; department: string; leave_type: string; status: string;
      start_date: string; end_date: string; days: number; reason: string | null; applied_at: string;
    }>();

  // Type-wise totals
  const typeMap: Record<string, { approved: number; pending: number; rejected: number; days: number }> = {};
  for (const r of rows.results) {
    if (!typeMap[r.leave_type]) typeMap[r.leave_type] = { approved: 0, pending: 0, rejected: 0, days: 0 };
    const t = typeMap[r.leave_type];
    if (r.status === "approved") { t.approved++; t.days += r.days ?? 0; }
    else if (r.status === "pending") t.pending++;
    else if (r.status === "rejected") t.rejected++;
  }

  return json(request, env, { rows: rows.results, typeBreakdown: typeMap, year: Number(year) });
}

async function handleReportHeadcount(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const rows = await env.HRMS
    .prepare(
      `SELECT COALESCE(department, 'General') AS department,
              role,
              COALESCE(employment_type, 'Full-time') AS employment_type,
              COALESCE(status, 'Active') AS status,
              COUNT(*) AS count
       FROM users
       WHERE COALESCE(company_id, org_id) = ?
       GROUP BY department, role, employment_type, status
       ORDER BY department, role`,
    )
    .bind(user.tenantId)
    .all<{ department: string; role: string; employment_type: string; status: string; count: number }>();

  const byDept: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let total = 0;

  for (const r of rows.results) {
    byDept[r.department] = (byDept[r.department] ?? 0) + r.count;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + r.count;
    byType[r.employment_type] = (byType[r.employment_type] ?? 0) + r.count;
    total += r.count;
  }

  return json(request, env, { rows: rows.results, byDept, byStatus, byType, total });
}

// ── Document Handlers ────────────────────────────────────────────────────────

const DOC_CATEGORIES = ["offer-letter", "id-proof", "address-proof", "certificate", "payslip", "contract", "other"] as const;

async function handleListDocuments(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");

  // Employees can only see their own docs; admins/HR can filter by employee or see all
  const isAdmin = canPostAnnouncement(user.role);
  const targetId = isAdmin && employeeId ? employeeId : user.userId;

  const rows = await env.HRMS
    .prepare(
      `SELECT id, employee_id, employee_name, category, name, file_key, file_size, mime_type,
              uploaded_by, uploaded_by_name, created_at
       FROM documents
       WHERE COALESCE(company_id, org_id) = ?
         ${isAdmin && !employeeId ? "" : "AND employee_id = ?"}
       ORDER BY created_at DESC
       LIMIT 200`,
    )
    .bind(...(isAdmin && !employeeId ? [user.tenantId] : [user.tenantId, targetId]))
    .all<{
      id: string; employee_id: string; employee_name: string; category: string;
      name: string; file_key: string; file_size: number | null; mime_type: string | null;
      uploaded_by: string; uploaded_by_name: string; created_at: string;
    }>();

  return json(request, env, { documents: rows.results });
}

async function handlePresignUpload(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!env.DOCS) return json(request, env, { error: "R2 storage not configured." }, 503);

  const body = await readJsonBody<{
    fileName?: string;
    mimeType?: string;
    employeeId?: string;
  }>(request);

  if (!body?.fileName?.trim() || !body.employeeId) {
    return json(request, env, { error: "fileName and employeeId are required." }, 400);
  }

  // Only admins/HR can upload for other employees; employees can upload for themselves
  const isAdmin = canPostAnnouncement(user.role);
  if (!isAdmin && body.employeeId !== user.userId) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const ext = body.fileName.includes(".") ? body.fileName.split(".").pop() : "";
  const fileKey = `${user.tenantId}/${body.employeeId}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;

  // Generate presigned PUT URL — valid for 15 minutes
  const presignedUrl = await env.DOCS.createMultipartUpload(fileKey);

  // Actually for simple uploads we use presigned URL via R2 HTTP API
  // Cloudflare R2 Workers binding doesn't support presigned URLs directly —
  // We use a signed token approach instead: the Worker acts as an upload proxy
  // Return a short-lived upload token that the frontend exchanges via /api/documents/upload-proxy

  return json(request, env, {
    uploadToken: await signUploadToken({ fileKey, employeeId: body.employeeId, fileName: body.fileName, mimeType: body.mimeType ?? "application/octet-stream" }, env),
    fileKey,
  });
}

async function signUploadToken(
  payload: { fileKey: string; employeeId: string; fileName: string; mimeType: string },
  env: Env,
): Promise<string> {
  const secret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "fallback";
  const data = JSON.stringify({ ...payload, exp: Date.now() + 15 * 60 * 1000 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return btoa(data) + "." + sigB64;
}

async function verifyUploadToken(token: string, env: Env): Promise<{ fileKey: string; employeeId: string; fileName: string; mimeType: string } | null> {
  try {
    const [dataB64, sigB64] = token.split(".");
    const data = atob(dataB64);
    const secret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET ?? "fallback";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
    if (!valid) return null;
    const parsed = JSON.parse(data);
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Upload proxy — receives the file from the browser and streams it to R2
export async function handleR2UploadProxy(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== "PUT") return null;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/documents/upload/")) return null;

  const token = url.pathname.replace("/api/documents/upload/", "");
  const payload = await verifyUploadToken(decodeURIComponent(token), env);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Invalid or expired upload token." }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  if (!env.DOCS) {
    return new Response(JSON.stringify({ error: "R2 not configured." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const body = request.body;
  if (!body) return new Response(JSON.stringify({ error: "No body." }), { status: 400, headers: { "Content-Type": "application/json" } });

  await env.DOCS.put(payload.fileKey, body, {
    httpMetadata: { contentType: payload.mimeType },
    customMetadata: { originalName: payload.fileName, employeeId: payload.employeeId },
  });

  return new Response(JSON.stringify({ ok: true, fileKey: payload.fileKey }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function handleSaveDocument(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    employeeId?: string;
    employeeName?: string;
    category?: string;
    name?: string;
    fileKey?: string;
    fileSize?: number;
    mimeType?: string;
  }>(request);

  if (!body?.employeeId || !body.fileKey || !body.name?.trim()) {
    return json(request, env, { error: "employeeId, fileKey, and name are required." }, 400);
  }

  const isAdmin = canPostAnnouncement(user.role);
  if (!isAdmin && body.employeeId !== user.userId) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const validCategory = DOC_CATEGORIES.includes(body.category as typeof DOC_CATEGORIES[number])
    ? body.category!
    : "other";

  // Resolve employee name if not provided
  let employeeName = body.employeeName?.trim();
  if (!employeeName) {
    const emp = await env.HRMS
      .prepare(`SELECT name FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
      .bind(body.employeeId, user.tenantId)
      .first<{ name: string }>();
    employeeName = emp?.name ?? "Unknown";
  }

  const now = nowIso();
  const id = crypto.randomUUID();

  await env.HRMS
    .prepare(
      `INSERT INTO documents (id, company_id, org_id, employee_id, employee_name, category, name, file_key, file_size, mime_type, uploaded_by, uploaded_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, user.tenantId, user.tenantId,
      body.employeeId, employeeName, validCategory,
      body.name.trim(), body.fileKey,
      body.fileSize ?? null, body.mimeType ?? null,
      user.userId, user.name,
      now, now,
    )
    .run();

  return json(request, env, { ok: true, id });
}

async function handleDeleteDocument(docId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  const doc = await env.HRMS
    .prepare(`SELECT file_key, employee_id FROM documents WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(docId, user.tenantId)
    .first<{ file_key: string; employee_id: string }>();

  if (!doc) return json(request, env, { error: "Not found." }, 404);

  const isAdmin = canPostAnnouncement(user.role);
  if (!isAdmin && doc.employee_id !== user.userId) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  // Delete from R2
  if (env.DOCS) {
    await env.DOCS.delete(doc.file_key);
  }

  await env.HRMS
    .prepare(`DELETE FROM documents WHERE id = ?`)
    .bind(docId)
    .run();

  return json(request, env, { ok: true });
}

async function handleDownloadDocument(docId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  const doc = await env.HRMS
    .prepare(`SELECT file_key, name, mime_type, employee_id FROM documents WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(docId, user.tenantId)
    .first<{ file_key: string; name: string; mime_type: string | null; employee_id: string }>();

  if (!doc) return json(request, env, { error: "Not found." }, 404);

  const isAdmin = canPostAnnouncement(user.role);
  if (!isAdmin && doc.employee_id !== user.userId) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  if (!env.DOCS) return json(request, env, { error: "R2 not configured." }, 503);

  const object = await env.DOCS.get(doc.file_key);
  if (!object) return json(request, env, { error: "File not found in storage." }, 404);

  const headers = new Headers();
  headers.set("Content-Type", doc.mime_type ?? "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.name)}"`);
  headers.set("Cache-Control", "private, max-age=300");
  object.writeHttpMetadata(headers);

  return new Response(object.body, { headers });
}
