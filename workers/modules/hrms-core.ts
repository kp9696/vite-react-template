import { generateECRCSV, generateForm16CSV } from "../../app/lib/payroll.server";
import { hashPassword, requireAuth } from "../security/auth";
import { withCors } from "../security/cors";
import { sendEmail, buildLeaveDecisionHtml, buildExpenseDecisionHtml } from "../lib/email";

// ── Form 16 Export Handler ─────────────────────────────────────────────────

async function handleExportForm16(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(request.url);
  const year = url.searchParams.get("year") ?? "";
  // Fetch payroll_items and join with users to get PAN
  const rows = await env.HRMS.prepare(`
    SELECT u.name, u.pan, SUM(pi.gross) as gross, SUM(pi.deductions) as deductions, SUM(pi.net) as net, SUM(pi.tds) as tds
    FROM payroll_items pi
    JOIN users u ON u.id = pi.employee_id
    WHERE pi.month_key LIKE ? AND COALESCE(pi.company_id, pi.org_id) = ?
    GROUP BY u.id, u.name, u.pan
  `).bind(`${year}-%`, user.tenantId).all<{ name: string; pan: string; gross: number; deductions: number; net: number; tds: number }>();
  const csv = generateForm16CSV(rows.results);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=Form16-${year}.csv`,
    },
  });
}
// ── ECR Export Handler ─────────────────────────────────────────────────────

async function handleExportECR(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(request.url);
  const monthKey = url.searchParams.get("month") ?? "";
  // Fetch payroll_items and join with users to get UAN
  const rows = await env.HRMS.prepare(`
    SELECT u.uan, u.name, pi.gross, pi.pf, pi.basic
    FROM payroll_items pi
    JOIN users u ON u.id = pi.employee_id
    WHERE pi.month_key = ? AND COALESCE(pi.company_id, pi.org_id) = ?
  `).bind(monthKey, user.tenantId).all<{ uan: string; name: string; gross: number; pf: number; basic: number }>();
  const csv = generateECRCSV(rows.results);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=ECR-${monthKey}.csv`,
    },
  });
}

interface ApiUser {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
}

type JsonMap = Record<string, unknown>;

interface StatutoryFilingRow {
  id: string;
  filing_type: string;
  period: string;
  status: string;
  file_path: string | null;
  filed_by: string | null;
  filed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

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

  const body = await readJsonBody<{ userId?: string; annualCtc?: number; effectiveFrom?: string; reason?: string }>(request);
  if (!body?.userId?.trim() || !body.annualCtc || body.annualCtc <= 0) {
    return json(request, env, { error: "userId and annualCtc (>0) are required." }, 400);
  }

  const now = nowIso();
  const effectiveFrom = body.effectiveFrom?.trim() || now.slice(0, 10);
  const newCtc = Math.round(body.annualCtc);
  const userId = body.userId.trim();

  // Read current CTC before update to detect actual change
  const existing = await env.HRMS
    .prepare(`SELECT annual_ctc FROM employee_salaries WHERE COALESCE(company_id, org_id) = ? AND user_id = ? LIMIT 1`)
    .bind(user.tenantId, userId)
    .first<{ annual_ctc: number }>();

  await env.HRMS
    .prepare(
      `INSERT INTO employee_salaries (id, org_id, company_id, user_id, annual_ctc, effective_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id, user_id) DO UPDATE SET
         annual_ctc = excluded.annual_ctc,
         effective_from = excluded.effective_from,
         updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), user.tenantId, user.tenantId, userId, newCtc, effectiveFrom, now, now)
    .run();

  // Record history row only when CTC actually changes (or it's the first set)
  if (!existing || existing.annual_ctc !== newCtc) {
    await env.HRMS
      .prepare(
        `INSERT INTO salary_history (id, company_id, user_id, annual_ctc, effective_from, reason, changed_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.tenantId, userId, newCtc, effectiveFrom, body.reason?.trim() || null, user.userId, now)
      .run();
  }

  return json(request, env, { ok: true });
}

async function handleListSalaryHistory(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");

  // Employees can only see their own history
  if (!isHrManager(user.role)) {
    const rows = await env.HRMS
      .prepare(
        `SELECT sh.id, sh.annual_ctc, sh.effective_from, sh.reason, sh.created_at,
                u.name as changed_by_name
         FROM salary_history sh
         LEFT JOIN users u ON u.id = sh.changed_by
         WHERE sh.company_id = ? AND sh.user_id = ?
         ORDER BY sh.effective_from DESC, sh.created_at DESC`,
      )
      .bind(user.tenantId, user.userId)
      .all();
    return json(request, env, { history: rows.results });
  }

  // HR sees all employees or a specific employee
  if (targetUserId) {
    const rows = await env.HRMS
      .prepare(
        `SELECT sh.id, sh.annual_ctc, sh.effective_from, sh.reason, sh.created_at,
                u.name as changed_by_name, eu.name as employee_name
         FROM salary_history sh
         LEFT JOIN users u  ON u.id  = sh.changed_by
         LEFT JOIN users eu ON eu.id = sh.user_id
         WHERE sh.company_id = ? AND sh.user_id = ?
         ORDER BY sh.effective_from DESC, sh.created_at DESC`,
      )
      .bind(user.tenantId, targetUserId)
      .all();
    return json(request, env, { history: rows.results });
  }

  // All employees' history (latest per employee for the salary-setup table)
  const rows = await env.HRMS
    .prepare(
      `SELECT sh.id, sh.user_id, sh.annual_ctc, sh.effective_from, sh.reason, sh.created_at,
              u.name as changed_by_name, eu.name as employee_name
       FROM salary_history sh
       LEFT JOIN users u  ON u.id  = sh.changed_by
       LEFT JOIN users eu ON eu.id = sh.user_id
       WHERE sh.company_id = ?
       ORDER BY sh.effective_from DESC, sh.created_at DESC`,
    )
    .bind(user.tenantId)
    .all();
  return json(request, env, { history: rows.results });
}

async function handleGetPayslipData(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const monthKey = url.searchParams.get("monthKey");
  const targetUserId = url.searchParams.get("userId");

  if (!monthKey) return json(request, env, { error: "monthKey is required." }, 400);

  // Employees can only fetch their own payslip
  const resolvedUserId = isHrManager(user.role) && targetUserId ? targetUserId : user.userId;

  const row = await env.HRMS
    .prepare(
      `SELECT pi.employee_id as id, u.name, COALESCE(u.department,'General') as dept,
              pi.basic, pi.hra, pi.conveyance, pi.pf, pi.esi, pi.tds, pi.pt,
              pi.gross, pi.deductions, pi.net, pi.status,
              pi.month_key
       FROM payroll_items pi
       JOIN users u ON u.id = pi.employee_id
       WHERE COALESCE(pi.company_id, pi.org_id) = ?
         AND pi.employee_id = ?
         AND pi.month_key = ?
       LIMIT 1`,
    )
    .bind(user.tenantId, resolvedUserId, monthKey)
    .first<{
      id: string; name: string; dept: string;
      basic: number; hra: number; conveyance: number;
      pf: number; esi: number; tds: number; pt: number;
      gross: number; deductions: number; net: number;
      status: string; month_key: string;
    }>();

  if (!row) return json(request, env, { error: "Payslip not found." }, 404);

  // Fetch tax regime from IT declaration for correct label on payslip
  const declRow = await env.HRMS
    .prepare(`SELECT tax_regime FROM it_declarations WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(user.tenantId, resolvedUserId)
    .first<{ tax_regime: string }>();

  return json(request, env, { payslip: { ...row, tax_regime: declRow?.tax_regime ?? "new" } });
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
  if (method === "GET" && pathname === "/api/salary-history") {
    return handleListSalaryHistory(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/payslip") {
    return handleGetPayslipData(request, env, user!);
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
  if (method === "GET" && pathname === "/api/reports/ecr") {
    return handleExportECR(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/reports/form16") {
    return handleExportForm16(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/reports/leave") {
    return handleReportLeave(request, env, user!);
  }
  if (method === "GET" && pathname === "/api/reports/headcount") {
    return handleReportHeadcount(request, env, user!);
  }

  if (method === "GET" && pathname === "/api/statutory-filings") {
    return handleListStatutoryFilings(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/statutory-filings") {
    return handleUpsertStatutoryFiling(request, env, user!);
  }

  // ── IT Declarations ───────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/it-declarations") {
    return handleGetITDeclarations(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/it-declarations") {
    return handleUpsertITDeclaration(request, env, user!);
  }
  const itDeclApproveMatch = pathname.match(/^\/api\/it-declarations\/([^/]+)\/approve$/);
  if (method === "PATCH" && itDeclApproveMatch) {
    return handleApproveITDeclaration(itDeclApproveMatch[1], request, env, user!);
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

  // ── Holiday Calendar ─────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/holidays") {
    return handleListHolidays(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/holidays") {
    return handleCreateHoliday(request, env, user!);
  }
  const holidayDeleteMatch = pathname.match(/^\/api\/holidays\/([^/]+)$/);
  if (method === "DELETE" && holidayDeleteMatch) {
    return handleDeleteHoliday(holidayDeleteMatch[1], request, env, user!);
  }

  // ── Salary Structure ─────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/salary-structures") {
    return handleListSalaryStructures(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/salary-structures") {
    return handleUpsertSalaryStructure(request, env, user!);
  }

  // ── Payroll Lock / Finalize / Disburse ───────────────────────────────────────
  if (method === "POST" && pathname === "/api/payroll/lock") {
    return handlePayrollLock(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/payroll/unlock") {
    return handlePayrollUnlock(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/payroll/finalize") {
    return handlePayrollFinalize(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/payroll/disburse") {
    return handlePayrollDisburse(request, env, user!);
  }
  // NOTE: GET /api/payroll/run-status is intentionally NOT handled here.
  // The browser's useFetcher sends cookies (not a Bearer token), so handling it
  // here would return 401. It falls through to the React Router resource route
  // (app/routes/api.payroll.run-status.ts) which uses cookie-based auth.

  // ── Resignation Self-Service ─────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/resignations") {
    return handleListResignations(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/resignations") {
    return handleCreateResignation(request, env, user!);
  }
  const resignDecisionMatch = pathname.match(/^\/api\/resignations\/([^/]+)\/decision$/);
  if (method === "PATCH" && resignDecisionMatch) {
    return handleResignationDecision(resignDecisionMatch[1], request, env, user!);
  }
  const resignWithdrawMatch = pathname.match(/^\/api\/resignations\/([^/]+)\/withdraw$/);
  if (method === "PATCH" && resignWithdrawMatch) {
    return handleResignationWithdraw(resignWithdrawMatch[1], request, env, user!);
  }

  // ── Leave Policies ───────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/leave-policies") {
    return handleListLeavePolicies(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/leave-policies") {
    return handleUpsertLeavePolicy(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/leave-policies/credit") {
    return handleCreditLeaveBalances(request, env, user!);
  }

  // ── WFH Requests ─────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wfh-requests") {
    return handleListWfhRequests(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/wfh-requests") {
    return handleCreateWfhRequest(request, env, user!);
  }
  const wfhDecisionMatch = pathname.match(/^\/api\/wfh-requests\/([^/]+)\/decision$/);
  if (method === "PATCH" && wfhDecisionMatch) {
    return handleWfhDecision(wfhDecisionMatch[1], request, env, user!);
  }

  // ── Expense Reimbursement + Policy ───────────────────────────────────────────
  const expReimburseMatch = pathname.match(/^\/api\/expenses\/([^/]+)\/reimburse$/);
  if (method === "POST" && expReimburseMatch) {
    return handleReimburseExpense(expReimburseMatch[1], request, env, user!);
  }
  if (method === "GET" && pathname === "/api/expense-policies") {
    return handleListExpensePolicies(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/expense-policies") {
    return handleUpsertExpensePolicy(request, env, user!);
  }

  // ── Employee Loans & Advances ────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/loans") {
    return handleListLoans(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/loans") {
    return handleApplyLoan(request, env, user!);
  }
  const loanDecisionMatch = pathname.match(/^\/api\/loans\/([^/]+)\/decision$/);
  if (method === "PATCH" && loanDecisionMatch) {
    return handleLoanDecision(loanDecisionMatch[1], request, env, user!);
  }
  const loanCloseMatch = pathname.match(/^\/api\/loans\/([^/]+)\/close$/);
  if (method === "POST" && loanCloseMatch) {
    return handleCloseLoan(loanCloseMatch[1], request, env, user!);
  }
  const loanEmiMatch = pathname.match(/^\/api\/loans\/([^/]+)\/emi$/);
  if (method === "POST" && loanEmiMatch) {
    return handleRecordLoanEmi(loanEmiMatch[1], request, env, user!);
  }

  // ── Full & Final Settlements ──────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/fnf") {
    return handleListFnf(request, env, user!);
  }
  const fnfComputeMatch = pathname.match(/^\/api\/fnf\/compute\/([^/]+)$/);
  if (method === "GET" && fnfComputeMatch) {
    return handleComputeFnf(fnfComputeMatch[1], request, env, user!);
  }
  if (method === "POST" && pathname === "/api/fnf") {
    return handleCreateFnf(request, env, user!);
  }
  const fnfApproveMatch = pathname.match(/^\/api\/fnf\/([^/]+)\/approve$/);
  if (method === "PATCH" && fnfApproveMatch) {
    return handleFnfAction(fnfApproveMatch[1], "approve", request, env, user!);
  }
  const fnfDisburseMatch = pathname.match(/^\/api\/fnf\/([^/]+)\/disburse$/);
  if (method === "PATCH" && fnfDisburseMatch) {
    return handleFnfAction(fnfDisburseMatch[1], "disburse", request, env, user!);
  }

  // ── Help Desk ─────────────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/helpdesk/tickets") {
    return handleListHelpdeskTickets(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/helpdesk/tickets") {
    return handleCreateHelpdeskTicket(request, env, user!);
  }
  const helpdeskTicketMatch = pathname.match(/^\/api\/helpdesk\/tickets\/([^/]+)$/);
  if (method === "PATCH" && helpdeskTicketMatch) {
    return handleUpdateHelpdeskTicket(helpdeskTicketMatch[1], request, env, user!);
  }
  const helpdeskCommentsMatch = pathname.match(/^\/api\/helpdesk\/tickets\/([^/]+)\/comments$/);
  if (method === "GET" && helpdeskCommentsMatch) {
    return handleListHelpdeskComments(helpdeskCommentsMatch[1], request, env, user!);
  }
  if (method === "POST" && helpdeskCommentsMatch) {
    return handleAddHelpdeskComment(helpdeskCommentsMatch[1], request, env, user!);
  }

  // ── Offer Letters ─────────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/offer-letters") {
    return handleListOfferLetters(request, env, user!);
  }
  if (method === "POST" && pathname === "/api/offer-letters") {
    return handleCreateOfferLetter(request, env, user!);
  }
  const offerLetterMatch = pathname.match(/^\/api\/offer-letters\/([^/]+)$/);
  if (method === "GET" && offerLetterMatch) {
    return handleGetOfferLetter(offerLetterMatch[1], request, env, user!);
  }
  if (method === "PATCH" && offerLetterMatch) {
    return handleUpdateOfferLetter(offerLetterMatch[1], request, env, user!);
  }
  if (method === "DELETE" && offerLetterMatch) {
    return handleDeleteOfferLetter(offerLetterMatch[1], request, env, user!);
  }

  return null;
}

// ── Help Desk Handlers ───────────────────────────────────────────────────────

async function nextHelpdeskTicketNo(db: D1Database, companyId: string): Promise<string> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM helpdesk_tickets WHERE company_id = ?`,
    )
    .bind(companyId)
    .first<{ cnt: number }>();
  const seq = (row?.cnt ?? 0) + 1;
  return `TKT-${String(seq).padStart(5, "0")}`;
}

async function handleListHelpdeskTickets(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const isManager = isHrManager(user.role);

  let sql = `SELECT id, ticket_no, title, category, priority, status,
                    created_by_id, created_by_name, assigned_to_id, assigned_to_name,
                    resolved_at, created_at, updated_at
             FROM helpdesk_tickets
             WHERE company_id = ?`;
  const binds: Array<string | number> = [user.tenantId];

  if (!isManager) {
    sql += " AND created_by_id = ?";
    binds.push(user.userId);
  }
  if (status) {
    sql += " AND status = ?";
    binds.push(status);
  }
  if (category) {
    sql += " AND category = ?";
    binds.push(category);
  }

  sql += " ORDER BY datetime(created_at) DESC LIMIT 200";

  const rows = await env.HRMS.prepare(sql).bind(...binds).all();
  return json(request, env, { tickets: rows.results });
}

async function handleCreateHelpdeskTicket(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    title?: string;
    description?: string;
    category?: string;
    priority?: string;
  }>(request);

  const title = body?.title?.trim() || "";
  const description = body?.description?.trim() || "";
  const category = body?.category?.trim() || "Other";
  const priority = body?.priority?.trim() || "medium";

  if (!title || !description) {
    return json(request, env, { error: "title and description are required." }, 400);
  }

  const VALID_CATEGORIES = ["Payroll", "Leave", "IT", "Facilities", "Other"];
  const VALID_PRIORITIES = ["low", "medium", "high"];
  if (!VALID_CATEGORIES.includes(category)) {
    return json(request, env, { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}.` }, 400);
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return json(request, env, { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}.` }, 400);
  }

  const id = crypto.randomUUID();
  const ticketNo = await nextHelpdeskTicketNo(env.HRMS, user.tenantId);
  const now = nowIso();

  await env.HRMS
    .prepare(
      `INSERT INTO helpdesk_tickets
         (id, company_id, org_id, ticket_no, title, description, category, priority, status,
          created_by_id, created_by_name, assigned_to_id, assigned_to_name, resolved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL, NULL, ?, ?)`,
    )
    .bind(id, user.tenantId, user.tenantId, ticketNo, title, description, category, priority,
          user.userId, user.name, now, now)
    .run();

  return json(request, env, { ok: true, id, ticketNo }, 201);
}

async function handleUpdateHelpdeskTicket(
  ticketId: string,
  request: Request,
  env: Env,
  user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const body = await readJsonBody<{
    status?: string;
    assignedToId?: string;
    assignedToName?: string;
    priority?: string;
  }>(request);

  const VALID_STATUSES = ["open", "in-progress", "resolved", "closed"];
  if (body?.status && !VALID_STATUSES.includes(body.status)) {
    return json(request, env, { error: `status must be one of: ${VALID_STATUSES.join(", ")}.` }, 400);
  }

  const ticket = await env.HRMS
    .prepare(
      `SELECT id, status, created_by_id FROM helpdesk_tickets WHERE id = ? AND company_id = ? LIMIT 1`,
    )
    .bind(ticketId, user.tenantId)
    .first<{ id: string; status: string; created_by_id: string }>();

  if (!ticket) {
    return json(request, env, { error: "Ticket not found." }, 404);
  }

  const now = nowIso();
  const newStatus = body?.status?.trim() || ticket.status;
  const resolvedAt = newStatus === "resolved" && ticket.status !== "resolved" ? now : null;

  // Build dynamic SET clause
  const sets: string[] = ["status = ?", "updated_at = ?"];
  const binds: Array<string | null> = [newStatus, now];

  if (body?.assignedToId !== undefined) {
    sets.push("assigned_to_id = ?");
    binds.push(body.assignedToId?.trim() || null);
  }
  if (body?.assignedToName !== undefined) {
    sets.push("assigned_to_name = ?");
    binds.push(body.assignedToName?.trim() || null);
  }
  if (body?.priority !== undefined) {
    sets.push("priority = ?");
    binds.push(body.priority.trim());
  }
  if (resolvedAt) {
    sets.push("resolved_at = ?");
    binds.push(resolvedAt);
  }

  binds.push(ticketId, user.tenantId);
  await env.HRMS
    .prepare(`UPDATE helpdesk_tickets SET ${sets.join(", ")} WHERE id = ? AND company_id = ?`)
    .bind(...binds)
    .run();

  // Notify the ticket creator when status changes
  if (body?.status && body.status !== ticket.status) {
    await createNotification(env.HRMS, {
      companyId: user.tenantId,
      userId: ticket.created_by_id,
      type: "general",
      title: `🎫 Ticket ${newStatus === "resolved" ? "Resolved" : "Updated"}`,
      body: `Your help desk ticket status has been updated to "${newStatus}".`,
      link: "/hrms/helpdesk",
    });
  }

  return json(request, env, { ok: true, id: ticketId, status: newStatus });
}

async function handleListHelpdeskComments(
  ticketId: string,
  request: Request,
  env: Env,
  user: ApiUser,
): Promise<Response> {
  // Check ticket belongs to tenant; employees can view their own tickets' comments
  const ticket = await env.HRMS
    .prepare(`SELECT id, created_by_id FROM helpdesk_tickets WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(ticketId, user.tenantId)
    .first<{ id: string; created_by_id: string }>();

  if (!ticket) {
    return json(request, env, { error: "Ticket not found." }, 404);
  }

  if (!isHrManager(user.role) && ticket.created_by_id !== user.userId) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  const rows = await env.HRMS
    .prepare(
      `SELECT id, author_id, author_name, author_role, body, created_at
       FROM helpdesk_comments
       WHERE ticket_id = ? AND company_id = ?
       ORDER BY datetime(created_at) ASC`,
    )
    .bind(ticketId, user.tenantId)
    .all();

  return json(request, env, { comments: rows.results });
}

async function handleAddHelpdeskComment(
  ticketId: string,
  request: Request,
  env: Env,
  user: ApiUser,
): Promise<Response> {
  const ticket = await env.HRMS
    .prepare(`SELECT id, created_by_id, status FROM helpdesk_tickets WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(ticketId, user.tenantId)
    .first<{ id: string; created_by_id: string; status: string }>();

  if (!ticket) {
    return json(request, env, { error: "Ticket not found." }, 404);
  }

  if (!isHrManager(user.role) && ticket.created_by_id !== user.userId) {
    return json(request, env, { error: "Forbidden." }, 403);
  }

  if (ticket.status === "closed") {
    return json(request, env, { error: "Cannot comment on a closed ticket." }, 409);
  }

  const body = await readJsonBody<{ body?: string }>(request);
  const commentBody = body?.body?.trim() || "";
  if (!commentBody) {
    return json(request, env, { error: "Comment body is required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = nowIso();

  await env.HRMS
    .prepare(
      `INSERT INTO helpdesk_comments (id, ticket_id, company_id, author_id, author_name, author_role, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ticketId, user.tenantId, user.userId, user.name, user.role, commentBody, now)
    .run();

  // Update ticket's updated_at and auto-set to in-progress if it was open
  const newStatus = ticket.status === "open" && isHrManager(user.role) ? "in-progress" : ticket.status;
  await env.HRMS
    .prepare(`UPDATE helpdesk_tickets SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(newStatus, now, ticketId)
    .run();

  // Notify the other party
  const notifyUserId = isHrManager(user.role) ? ticket.created_by_id : null;
  if (notifyUserId) {
    await createNotification(env.HRMS, {
      companyId: user.tenantId,
      userId: notifyUserId,
      type: "general",
      title: "💬 New reply on your ticket",
      body: `HR has replied to your help desk ticket.`,
      link: "/hrms/helpdesk",
    });
  }

  return json(request, env, { ok: true, id }, 201);
}

// ── Holiday Calendar Handlers ────────────────────────────────────────────────

async function handleListHolidays(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const year = url.searchParams.get("year") ?? new Date().getFullYear().toString();
  const rows = await env.HRMS
    .prepare(
      `SELECT id, name, date, type, description, created_at
       FROM holidays
       WHERE company_id = ? AND strftime('%Y', date) = ?
       ORDER BY date ASC`,
    )
    .bind(user.tenantId, year)
    .all<{ id: string; name: string; date: string; type: string; description: string | null; created_at: string }>();
  return json(request, env, { holidays: rows.results, year });
}

async function handleCreateHoliday(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{
    name?: string; date?: string; type?: string; description?: string;
  }>(request);
  if (!body?.name?.trim() || !body.date?.trim()) {
    return json(request, env, { error: "name and date are required." }, 400);
  }
  const validTypes = ["national", "restricted", "optional"];
  const type = validTypes.includes(body.type ?? "") ? (body.type ?? "national") : "national";
  const now = nowIso();
  const id = `HOL${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  await env.HRMS
    .prepare(
      `INSERT INTO holidays (id, company_id, name, date, type, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, date, name) DO UPDATE SET
         type = excluded.type,
         description = excluded.description`,
    )
    .bind(id, user.tenantId, body.name.trim(), body.date.trim(), type,
      body.description?.trim() || null, user.userId, now)
    .run();
  return json(request, env, { ok: true, id }, 201);
}

async function handleDeleteHoliday(holidayId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  await env.HRMS
    .prepare(`DELETE FROM holidays WHERE id = ? AND company_id = ?`)
    .bind(holidayId, user.tenantId)
    .run();
  return json(request, env, { ok: true });
}

// ── Salary Structure Handlers ────────────────────────────────────────────────

interface SalaryStructureRow {
  id: string;
  company_id: string;
  user_id: string;
  basic_pct: number;
  hra_pct: number;
  conveyance: number;
  lta: number;
  medical_allowance: number;
  special_allowance_pct: number;
  effective_from: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
}

async function handleListSalaryStructures(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (userId) {
    const row = await env.HRMS
      .prepare(
        `SELECT ss.*, u.name as employee_name
         FROM salary_structures ss
         LEFT JOIN users u ON u.id = ss.user_id
         WHERE ss.company_id = ? AND ss.user_id = ? LIMIT 1`,
      )
      .bind(user.tenantId, userId)
      .first<SalaryStructureRow>();
    return json(request, env, { structure: row ?? null });
  }
  const rows = await env.HRMS
    .prepare(
      `SELECT ss.*, u.name as employee_name
       FROM salary_structures ss
       LEFT JOIN users u ON u.id = ss.user_id
       WHERE ss.company_id = ?
       ORDER BY u.name ASC`,
    )
    .bind(user.tenantId)
    .all<SalaryStructureRow>();
  return json(request, env, { structures: rows.results });
}

async function handleUpsertSalaryStructure(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{
    userId?: string;
    basicPct?: number;
    hraPct?: number;
    conveyance?: number;
    lta?: number;
    medicalAllowance?: number;
    specialAllowancePct?: number;
    effectiveFrom?: string;
  }>(request);
  if (!body?.userId?.trim()) return json(request, env, { error: "userId is required." }, 400);

  // Validate percentages
  const basicPct = Math.max(10, Math.min(80, Number(body.basicPct ?? 50)));
  const hraPct = Math.max(0, Math.min(50, Number(body.hraPct ?? 20)));
  if (basicPct + hraPct > 90) {
    return json(request, env, { error: "basic% + hra% cannot exceed 90%." }, 400);
  }

  const now = nowIso();
  const id = `SS${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  await env.HRMS
    .prepare(
      `INSERT INTO salary_structures
         (id, company_id, user_id, basic_pct, hra_pct, conveyance, lta, medical_allowance,
          special_allowance_pct, effective_from, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, user_id) DO UPDATE SET
         basic_pct = excluded.basic_pct,
         hra_pct = excluded.hra_pct,
         conveyance = excluded.conveyance,
         lta = excluded.lta,
         medical_allowance = excluded.medical_allowance,
         special_allowance_pct = excluded.special_allowance_pct,
         effective_from = excluded.effective_from,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id, user.tenantId, body.userId.trim(),
      basicPct, hraPct,
      Number(body.conveyance ?? 1600),
      Number(body.lta ?? 0),
      Number(body.medicalAllowance ?? 0),
      Number(body.specialAllowancePct ?? 0),
      body.effectiveFrom?.trim() || todayIsoDate(),
      user.userId, now, now,
    )
    .run();
  return json(request, env, { ok: true });
}

// ── Payroll Lock / Finalize / Disburse Handlers ──────────────────────────────

async function handlePayrollRunStatus(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const url = new URL(request.url);
  const monthKey = url.searchParams.get("monthKey");
  if (!monthKey) return json(request, env, { error: "monthKey is required." }, 400);
  const row = await env.HRMS
    .prepare(
      `SELECT id, month_key, status, processed_count, total_count,
              locked, locked_by, locked_at,
              finalized, finalized_by, finalized_at,
              disbursed, disbursed_by, disbursed_at
       FROM payroll_runs
       WHERE COALESCE(company_id, org_id) = ? AND month_key = ?
       LIMIT 1`,
    )
    .bind(user.tenantId, monthKey)
    .first<{
      id: string; month_key: string; status: string;
      processed_count: number; total_count: number;
      locked: number; locked_by: string | null; locked_at: string | null;
      finalized: number; finalized_by: string | null; finalized_at: string | null;
      disbursed: number; disbursed_by: string | null; disbursed_at: string | null;
    }>();
  if (!row) return json(request, env, { run: null });
  return json(request, env, {
    run: {
      ...row,
      locked: Boolean(row.locked),
      finalized: Boolean(row.finalized),
      disbursed: Boolean(row.disbursed),
    },
  });
}

async function handlePayrollLock(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ monthKey?: string }>(request);
  if (!body?.monthKey) return json(request, env, { error: "monthKey is required." }, 400);
  const run = await env.HRMS
    .prepare(`SELECT id, locked FROM payroll_runs WHERE COALESCE(company_id, org_id) = ? AND month_key = ? LIMIT 1`)
    .bind(user.tenantId, body.monthKey)
    .first<{ id: string; locked: number }>();
  if (!run) return json(request, env, { error: "Payroll run not found for this month." }, 404);
  if (run.locked) return json(request, env, { error: "Payroll is already locked." }, 409);
  await env.HRMS
    .prepare(`UPDATE payroll_runs SET locked = 1, locked_by = ?, locked_at = ?, updated_at = ? WHERE id = ?`)
    .bind(user.userId, nowIso(), nowIso(), run.id)
    .run();
  return json(request, env, { ok: true, monthKey: body.monthKey, locked: true });
}

async function handlePayrollUnlock(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Only admins can unlock payroll." }, 403);
  const body = await readJsonBody<{ monthKey?: string }>(request);
  if (!body?.monthKey) return json(request, env, { error: "monthKey is required." }, 400);
  const run = await env.HRMS
    .prepare(`SELECT id, finalized FROM payroll_runs WHERE COALESCE(company_id, org_id) = ? AND month_key = ? LIMIT 1`)
    .bind(user.tenantId, body.monthKey)
    .first<{ id: string; finalized: number }>();
  if (!run) return json(request, env, { error: "Payroll run not found." }, 404);
  if (run.finalized) return json(request, env, { error: "Finalized payroll cannot be unlocked." }, 409);
  await env.HRMS
    .prepare(`UPDATE payroll_runs SET locked = 0, locked_by = NULL, locked_at = NULL, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), run.id)
    .run();
  return json(request, env, { ok: true, monthKey: body.monthKey, locked: false });
}

async function handlePayrollFinalize(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Only admins can finalize payroll." }, 403);
  const body = await readJsonBody<{ monthKey?: string }>(request);
  if (!body?.monthKey) return json(request, env, { error: "monthKey is required." }, 400);
  const run = await env.HRMS
    .prepare(`SELECT id, locked, finalized FROM payroll_runs WHERE COALESCE(company_id, org_id) = ? AND month_key = ? LIMIT 1`)
    .bind(user.tenantId, body.monthKey)
    .first<{ id: string; locked: number; finalized: number }>();
  if (!run) return json(request, env, { error: "Payroll run not found." }, 404);
  if (!run.locked) return json(request, env, { error: "Lock payroll before finalizing." }, 400);
  if (run.finalized) return json(request, env, { error: "Already finalized." }, 409);
  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE payroll_runs SET finalized = 1, finalized_by = ?, finalized_at = ?, status = 'finalized', updated_at = ? WHERE id = ?`)
    .bind(user.userId, now, now, run.id)
    .run();
  return json(request, env, { ok: true, monthKey: body.monthKey, finalized: true });
}

async function handlePayrollDisburse(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isAdminUser(user.role)) return json(request, env, { error: "Only admins can mark disbursement." }, 403);
  const body = await readJsonBody<{ monthKey?: string }>(request);
  if (!body?.monthKey) return json(request, env, { error: "monthKey is required." }, 400);
  const run = await env.HRMS
    .prepare(`SELECT id, finalized, disbursed FROM payroll_runs WHERE COALESCE(company_id, org_id) = ? AND month_key = ? LIMIT 1`)
    .bind(user.tenantId, body.monthKey)
    .first<{ id: string; finalized: number; disbursed: number }>();
  if (!run) return json(request, env, { error: "Payroll run not found." }, 404);
  if (!run.finalized) return json(request, env, { error: "Finalize payroll before disbursing." }, 400);
  if (run.disbursed) return json(request, env, { error: "Already marked as disbursed." }, 409);
  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE payroll_runs SET disbursed = 1, disbursed_by = ?, disbursed_at = ?, status = 'disbursed', updated_at = ? WHERE id = ?`)
    .bind(user.userId, now, now, run.id)
    .run();
  return json(request, env, { ok: true, monthKey: body.monthKey, disbursed: true });
}

// ── Resignation Self-Service Handlers ────────────────────────────────────────

async function handleListResignations(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const isAdmin = isHrManager(user.role);
  if (isAdmin) {
    const rows = await env.HRMS
      .prepare(
        `SELECT r.*, u.name as user_name_live, u.department, u.role as user_role
         FROM resignations r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.company_id = ?
         ORDER BY r.created_at DESC`,
      )
      .bind(user.tenantId)
      .all<{
        id: string; user_id: string; user_name: string; department: string | null;
        role: string | null; last_working_day: string; notice_period_days: number;
        reason: string; status: string; manager_note: string | null;
        decided_by: string | null; decided_at: string | null;
        withdrawal_reason: string | null; withdrawn_at: string | null;
        created_at: string; updated_at: string;
      }>();
    return json(request, env, { resignations: rows.results });
  }
  // Employee: own resignation only
  const row = await env.HRMS
    .prepare(`SELECT * FROM resignations WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(user.tenantId, user.userId)
    .first<{
      id: string; user_id: string; user_name: string; department: string | null;
      last_working_day: string; notice_period_days: number; reason: string;
      status: string; manager_note: string | null; decided_at: string | null;
      created_at: string;
    }>();
  return json(request, env, { resignation: row ?? null });
}

async function handleCreateResignation(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    lastWorkingDay?: string;
    reason?: string;
    noticePeriodDays?: number;
  }>(request);
  if (!body?.lastWorkingDay || !body.reason?.trim()) {
    return json(request, env, { error: "lastWorkingDay and reason are required." }, 400);
  }
  // Check no active resignation already exists
  const existing = await env.HRMS
    .prepare(`SELECT id, status FROM resignations WHERE company_id = ? AND user_id = ? AND status IN ('pending', 'accepted') LIMIT 1`)
    .bind(user.tenantId, user.userId)
    .first<{ id: string; status: string }>();
  if (existing) {
    return json(request, env, { error: `You already have a ${existing.status} resignation on record.` }, 409);
  }
  // Fetch employee details
  const emp = await env.HRMS
    .prepare(`SELECT name, department, role FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(user.userId, user.tenantId)
    .first<{ name: string; department: string | null; role: string | null }>();
  const now = nowIso();
  const id = `RES${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  await env.HRMS
    .prepare(
      `INSERT INTO resignations
         (id, company_id, user_id, user_name, department, role,
          last_working_day, notice_period_days, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      id, user.tenantId, user.userId,
      emp?.name ?? user.name,
      emp?.department ?? null,
      emp?.role ?? null,
      body.lastWorkingDay,
      Number(body.noticePeriodDays ?? 30),
      body.reason.trim(),
      now, now,
    )
    .run();

  // Notify HR managers
  try {
    const hrManagers = await env.HRMS
      .prepare(`SELECT id FROM users WHERE COALESCE(company_id, org_id) = ? AND LOWER(role) IN ('admin','hr admin','hr_admin','hr manager','hr_manager') LIMIT 20`)
      .bind(user.tenantId)
      .all<{ id: string }>();
    await Promise.all(hrManagers.results.map((hr) =>
      createNotification(env.HRMS, {
        companyId: user.tenantId,
        userId: hr.id,
        type: "resignation",
        title: `📋 Resignation Submitted: ${emp?.name ?? user.name}`,
        body: `Last working day: ${body.lastWorkingDay}. Reason: ${body.reason!.trim().slice(0, 80)}`,
        link: "/hrms/resignation",
      }),
    ));
  } catch { /* notification failure is non-blocking */ }

  return json(request, env, { ok: true, id }, 201);
}

async function handleResignationDecision(
  resignId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ decision?: string; note?: string }>(request);
  const decision = body?.decision;
  if (decision !== "accepted" && decision !== "rejected") {
    return json(request, env, { error: "decision must be accepted or rejected." }, 400);
  }
  const now = nowIso();
  const result = await env.HRMS
    .prepare(
      `UPDATE resignations
       SET status = ?, manager_note = ?, decided_by = ?, decided_at = ?, updated_at = ?
       WHERE id = ? AND company_id = ? AND status = 'pending'`,
    )
    .bind(decision, body?.note?.trim() || null, user.userId, now, now, resignId, user.tenantId)
    .run();
  if (!result.meta.changes) return json(request, env, { error: "Resignation not found or already decided." }, 404);

  // Notify employee
  try {
    const resign = await env.HRMS
      .prepare(`SELECT user_id, last_working_day FROM resignations WHERE id = ? LIMIT 1`)
      .bind(resignId)
      .first<{ user_id: string; last_working_day: string }>();
    if (resign) {
      await createNotification(env.HRMS, {
        companyId: user.tenantId,
        userId: resign.user_id,
        type: "resignation_decision",
        title: decision === "accepted" ? "✅ Resignation Accepted" : "❌ Resignation Rejected",
        body: decision === "accepted"
          ? `Your resignation has been accepted. Last working day: ${resign.last_working_day}.`
          : `Your resignation has been rejected by HR. ${body?.note ? "Note: " + body.note : ""}`,
        link: "/hrms/resignation",
      });
    }
  } catch { /* non-blocking */ }

  return json(request, env, { ok: true, id: resignId, status: decision });
}

async function handleResignationWithdraw(
  resignId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  const body = await readJsonBody<{ reason?: string }>(request);
  const now = nowIso();
  // Employees can only withdraw their own pending resignation
  const result = await env.HRMS
    .prepare(
      `UPDATE resignations
       SET status = 'withdrawn', withdrawal_reason = ?, withdrawn_at = ?, updated_at = ?
       WHERE id = ? AND company_id = ? AND user_id = ? AND status = 'pending'`,
    )
    .bind(body?.reason?.trim() || null, now, now, resignId, user.tenantId, user.userId)
    .run();
  if (!result.meta.changes) return json(request, env, { error: "Resignation not found, not yours, or not pending." }, 404);
  return json(request, env, { ok: true, id: resignId, status: "withdrawn" });
}

// ── Leave Policy Handlers ─────────────────────────────────────────────────────

async function handleListLeavePolicies(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(
      `SELECT id, leave_type, accrual_type, accrual_days, max_balance,
              carry_forward_max, encashment_eligible, probation_lock_months, requires_approval,
              created_at, updated_at
       FROM leave_policies
       WHERE company_id = ?
       ORDER BY leave_type ASC`,
    )
    .bind(user.tenantId)
    .all();
  return json(request, env, { policies: rows.results });
}

async function handleUpsertLeavePolicy(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{
    leaveType?: string;
    accrualType?: string;
    accrualDays?: number;
    maxBalance?: number;
    carryForwardMax?: number;
    encashmentEligible?: boolean;
    probationLockMonths?: number;
    requiresApproval?: boolean;
  }>(request);
  if (!body?.leaveType?.trim()) return json(request, env, { error: "leaveType is required." }, 400);

  const id = crypto.randomUUID();
  const now = nowIso();
  await env.HRMS
    .prepare(
      `INSERT INTO leave_policies
         (id, company_id, leave_type, accrual_type, accrual_days, max_balance,
          carry_forward_max, encashment_eligible, probation_lock_months, requires_approval,
          created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, leave_type) DO UPDATE SET
         accrual_type = excluded.accrual_type,
         accrual_days = excluded.accrual_days,
         max_balance = excluded.max_balance,
         carry_forward_max = excluded.carry_forward_max,
         encashment_eligible = excluded.encashment_eligible,
         probation_lock_months = excluded.probation_lock_months,
         requires_approval = excluded.requires_approval,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id, user.tenantId, body.leaveType.trim(),
      body.accrualType ?? "yearly",
      body.accrualDays ?? 18,
      body.maxBalance ?? 45,
      body.carryForwardMax ?? 15,
      (body.encashmentEligible ?? false) ? 1 : 0,
      body.probationLockMonths ?? 0,
      (body.requiresApproval ?? true) ? 1 : 0,
      user.userId, now, now,
    )
    .run();
  return json(request, env, { ok: true });
}

async function handleCreditLeaveBalances(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ leaveType?: string; year?: number }>(request);
  if (!body?.leaveType) return json(request, env, { error: "leaveType is required." }, 400);

  const year = body.year ?? new Date().getFullYear();
  const policy = await env.HRMS
    .prepare(`SELECT * FROM leave_policies WHERE company_id = ? AND leave_type = ? LIMIT 1`)
    .bind(user.tenantId, body.leaveType)
    .first<{ accrual_days: number; max_balance: number }>();
  if (!policy) return json(request, env, { error: "No policy found for this leave type." }, 404);

  const users = await env.HRMS
    .prepare(`SELECT id FROM users WHERE COALESCE(company_id, org_id) = ? AND LOWER(status) NOT IN ('inactive','disabled')`)
    .bind(user.tenantId)
    .all<{ id: string }>();

  const now = nowIso();
  let credited = 0;
  for (const emp of users.results) {
    const existing = await env.HRMS
      .prepare(`SELECT id, total FROM leave_balances WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND leave_type = ? AND year = ?`)
      .bind(user.tenantId, emp.id, body.leaveType, year)
      .first<{ id: string; total: number }>();
    if (existing) {
      const newTotal = Math.min(existing.total + policy.accrual_days, policy.max_balance);
      await env.HRMS
        .prepare(`UPDATE leave_balances SET total = ?, remaining = ? - used - pending, updated_at = ? WHERE id = ?`)
        .bind(newTotal, newTotal, now, existing.id)
        .run();
    } else {
      await env.HRMS
        .prepare(
          `INSERT INTO leave_balances (id, company_id, org_id, user_id, leave_type, year, total, used, pending, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        )
        .bind(crypto.randomUUID(), user.tenantId, user.tenantId, emp.id, body.leaveType, year,
          Math.min(policy.accrual_days, policy.max_balance), now, now)
        .run();
    }
    credited++;
  }
  return json(request, env, { ok: true, credited, year, leaveType: body.leaveType });
}

// ── WFH Request Handlers ──────────────────────────────────────────────────────

async function handleListWfhRequests(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  if (isHrManager(user.role)) {
    let sql = `SELECT w.id, w.user_id, w.user_name, w.wfh_date, w.reason, w.status,
                      w.decided_by, w.decided_at, w.decision_note, w.created_at
               FROM wfh_requests w
               WHERE w.company_id = ?`;
    const params: (string | number)[] = [user.tenantId];
    if (statusFilter) { sql += ` AND w.status = ?`; params.push(statusFilter); }
    sql += ` ORDER BY w.wfh_date DESC LIMIT 200`;
    const rows = await env.HRMS.prepare(sql).bind(...params).all();
    return json(request, env, { wfhRequests: rows.results });
  } else {
    const rows = await env.HRMS
      .prepare(
        `SELECT id, wfh_date, reason, status, decided_at, decision_note, created_at
         FROM wfh_requests WHERE company_id = ? AND user_id = ? ORDER BY wfh_date DESC LIMIT 60`,
      )
      .bind(user.tenantId, user.userId)
      .all();
    return json(request, env, { wfhRequests: rows.results });
  }
}

async function handleCreateWfhRequest(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{ wfhDate?: string; reason?: string }>(request);
  if (!body?.wfhDate || !body.reason?.trim()) {
    return json(request, env, { error: "wfhDate and reason are required." }, 400);
  }
  const userName = await env.HRMS
    .prepare(`SELECT name FROM users WHERE id = ? LIMIT 1`)
    .bind(user.userId)
    .first<{ name: string }>();
  const now = nowIso();
  const id = crypto.randomUUID();
  try {
    await env.HRMS
      .prepare(
        `INSERT INTO wfh_requests (id, company_id, user_id, user_name, wfh_date, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(id, user.tenantId, user.userId, userName?.name ?? user.userId,
        body.wfhDate, body.reason.trim(), now, now)
      .run();
  } catch {
    return json(request, env, { error: "A WFH request for that date already exists." }, 409);
  }

  // Notify HR managers
  const managers = await env.HRMS
    .prepare(`SELECT id FROM users WHERE COALESCE(company_id, org_id) = ? AND LOWER(role) IN ('admin','hr admin','hr_admin','hr manager','hr_manager') AND LOWER(COALESCE(status,'active')) NOT IN ('inactive','disabled')`)
    .bind(user.tenantId)
    .all<{ id: string }>();
  await Promise.all(managers.results.map((m) =>
    createNotification(env.HRMS, {
      companyId: user.tenantId, userId: m.id, type: "wfh_request",
      title: "🏠 WFH Request",
      body: `${userName?.name ?? "An employee"} requested WFH on ${body.wfhDate}.`,
      link: "/hrms/attendance",
    }),
  ));

  return json(request, env, { ok: true, id }, 201);
}

async function handleWfhDecision(
  wfhId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ decision?: string; note?: string }>(request);
  if (!body?.decision || !["approved", "rejected"].includes(body.decision)) {
    return json(request, env, { error: "decision must be approved or rejected." }, 400);
  }
  const wfh = await env.HRMS
    .prepare(`SELECT id, user_id, wfh_date, status FROM wfh_requests WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(wfhId, user.tenantId)
    .first<{ id: string; user_id: string; wfh_date: string; status: string }>();
  if (!wfh) return json(request, env, { error: "WFH request not found." }, 404);
  if (wfh.status !== "pending") return json(request, env, { error: "Only pending requests can be decided." }, 409);

  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE wfh_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?`)
    .bind(body.decision, user.userId, now, body.note?.trim() || null, now, wfhId)
    .run();

  // If approved → upsert attendance record as WFH
  if (body.decision === "approved") {
    const existing = await env.HRMS
      .prepare(`SELECT id FROM attendance WHERE COALESCE(company_id, org_id) = ? AND user_id = ? AND attendance_date = ? LIMIT 1`)
      .bind(user.tenantId, wfh.user_id, wfh.wfh_date)
      .first<{ id: string }>();
    if (existing) {
      await env.HRMS
        .prepare(`UPDATE attendance SET status = 'wfh', updated_at = ? WHERE id = ?`)
        .bind(now, existing.id)
        .run();
    } else {
      await env.HRMS
        .prepare(`INSERT INTO attendance (id, company_id, org_id, user_id, attendance_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'wfh', ?, ?)`)
        .bind(crypto.randomUUID(), user.tenantId, user.tenantId, wfh.user_id, wfh.wfh_date, now, now)
        .run();
    }
  }

  // Notify employee
  await createNotification(env.HRMS, {
    companyId: user.tenantId, userId: wfh.user_id, type: "wfh_decision",
    title: body.decision === "approved" ? "✅ WFH Approved" : "❌ WFH Rejected",
    body: `Your WFH request for ${wfh.wfh_date} was ${body.decision}.`,
    link: "/hrms/attendance",
  });

  return json(request, env, { ok: true, id: wfhId, status: body.decision });
}

// ── Expense Reimbursement + Policy Handlers ───────────────────────────────────

async function handleReimburseExpense(
  claimId: string, request: Request, env: Env, user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ paymentRef?: string }>(request);
  const claim = await env.HRMS
    .prepare(`SELECT id, status, user_id, amount FROM expense_claims WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(claimId, user.tenantId)
    .first<{ id: string; status: string; user_id: string; amount: number }>();
  if (!claim) return json(request, env, { error: "Claim not found." }, 404);
  if (claim.status !== "approved") return json(request, env, { error: "Only approved claims can be reimbursed." }, 409);

  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE expense_claims SET status = 'reimbursed', reimbursed_at = ?, reimbursed_by = ?, payment_ref = ?, updated_at = ? WHERE id = ?`)
    .bind(now, user.userId, body?.paymentRef?.trim() || null, now, claimId)
    .run();

  await createNotification(env.HRMS, {
    companyId: user.tenantId, userId: claim.user_id, type: "expense_reimbursed",
    title: "💵 Expense Reimbursed",
    body: `Your expense claim of ₹${claim.amount.toLocaleString("en-IN")} has been reimbursed.`,
    link: "/hrms/expenses",
  });

  return json(request, env, { ok: true, id: claimId, status: "reimbursed" });
}

async function handleListExpensePolicies(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const rows = await env.HRMS
    .prepare(`SELECT id, category, max_amount, requires_receipt_above, created_at, updated_at FROM expense_policies WHERE company_id = ? ORDER BY category`)
    .bind(user.tenantId)
    .all();
  return json(request, env, { policies: rows.results });
}

async function handleUpsertExpensePolicy(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ category?: string; maxAmount?: number; requiresReceiptAbove?: number }>(request);
  if (!body?.category?.trim()) return json(request, env, { error: "category is required." }, 400);
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.HRMS
    .prepare(
      `INSERT INTO expense_policies (id, company_id, category, max_amount, requires_receipt_above, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, category) DO UPDATE SET
         max_amount = excluded.max_amount,
         requires_receipt_above = excluded.requires_receipt_above,
         updated_at = excluded.updated_at`,
    )
    .bind(id, user.tenantId, body.category.trim(), body.maxAmount ?? 0, body.requiresReceiptAbove ?? 500, user.userId, now, now)
    .run();
  return json(request, env, { ok: true });
}

// ── Loan & Advance Handlers ───────────────────────────────────────────────────

async function handleListLoans(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  if (isHrManager(user.role)) {
    let sql = `SELECT id, user_id, user_name, loan_type, amount, emi_amount, emi_months,
                      emis_paid, outstanding, purpose, status, approved_by, approved_at,
                      rejection_note, disburse_ref, disbursed_at, created_at
               FROM employee_loans
               WHERE company_id = ?`;
    const params: (string | number)[] = [user.tenantId];
    if (statusFilter) { sql += ` AND status = ?`; params.push(statusFilter); }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const rows = await env.HRMS.prepare(sql).bind(...params).all();
    return json(request, env, { loans: rows.results });
  } else {
    const rows = await env.HRMS
      .prepare(
        `SELECT id, loan_type, amount, emi_amount, emi_months, emis_paid, outstanding,
                purpose, status, approved_at, rejection_note, disburse_ref, disbursed_at, created_at
         FROM employee_loans WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC`,
      )
      .bind(user.tenantId, user.userId)
      .all();
    return json(request, env, { loans: rows.results });
  }
}

async function handleApplyLoan(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const body = await readJsonBody<{
    loanType?: string;
    amount?: number;
    emiMonths?: number;
    purpose?: string;
  }>(request);
  if (!body?.amount || body.amount <= 0) return json(request, env, { error: "Amount is required." }, 400);
  const loanType = body.loanType?.trim() || "salary_advance";
  const emiMonths = Math.max(1, body.emiMonths ?? 1);
  const emiAmount = Math.ceil(body.amount / emiMonths);

  const userName = await env.HRMS
    .prepare(`SELECT name FROM users WHERE id = ? LIMIT 1`)
    .bind(user.userId)
    .first<{ name: string }>();

  const id = crypto.randomUUID();
  const now = nowIso();
  await env.HRMS
    .prepare(
      `INSERT INTO employee_loans
         (id, company_id, user_id, user_name, loan_type, amount, emi_amount, emi_months,
          emis_paid, outstanding, purpose, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      id, user.tenantId, user.userId, userName?.name ?? user.userId,
      loanType, body.amount, emiAmount, emiMonths,
      body.amount, body.purpose?.trim() || null, now, now,
    )
    .run();

  const managers = await env.HRMS
    .prepare(
      `SELECT id FROM users
       WHERE COALESCE(company_id, org_id) = ?
         AND LOWER(role) IN ('admin','hr admin','hr_admin','hr manager','hr_manager')
         AND LOWER(COALESCE(status,'active')) NOT IN ('inactive','disabled')`,
    )
    .bind(user.tenantId)
    .all<{ id: string }>();
  await Promise.all(managers.results.map((m) =>
    createNotification(env.HRMS, {
      companyId: user.tenantId, userId: m.id, type: "loan_request",
      title: "💰 Loan Application",
      body: `${userName?.name ?? "An employee"} applied for a ${loanType.replace(/_/g, " ")} of ₹${body.amount!.toLocaleString("en-IN")}.`,
      link: "/hrms/loans",
    }),
  ));

  return json(request, env, { ok: true, id }, 201);
}

async function handleLoanDecision(loanId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ decision?: string; rejectionNote?: string; disburseRef?: string }>(request);
  if (!body?.decision || !["approved", "rejected"].includes(body.decision)) {
    return json(request, env, { error: "decision must be approved or rejected." }, 400);
  }
  const loan = await env.HRMS
    .prepare(`SELECT id, user_id, amount, user_name, status FROM employee_loans WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(loanId, user.tenantId)
    .first<{ id: string; user_id: string; amount: number; user_name: string; status: string }>();
  if (!loan) return json(request, env, { error: "Loan not found." }, 404);
  if (loan.status !== "pending") return json(request, env, { error: "Only pending loans can be decided." }, 409);

  const now = nowIso();
  if (body.decision === "approved") {
    await env.HRMS
      .prepare(
        `UPDATE employee_loans
         SET status = 'active', approved_by = ?, approved_at = ?, disburse_ref = ?, disbursed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(user.userId, now, body.disburseRef?.trim() || null, now, now, loanId)
      .run();
  } else {
    await env.HRMS
      .prepare(
        `UPDATE employee_loans
         SET status = 'rejected', approved_by = ?, approved_at = ?, rejection_note = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(user.userId, now, body.rejectionNote?.trim() || null, now, loanId)
      .run();
  }

  await createNotification(env.HRMS, {
    companyId: user.tenantId, userId: loan.user_id, type: "loan_decision",
    title: body.decision === "approved" ? "✅ Loan Approved" : "❌ Loan Rejected",
    body: body.decision === "approved"
      ? `Your loan of ₹${loan.amount.toLocaleString("en-IN")} has been approved and disbursed.`
      : `Your loan application was rejected.${body.rejectionNote ? ` Reason: ${body.rejectionNote}` : ""}`,
    link: "/hrms/loans",
  });

  return json(request, env, { ok: true, id: loanId, status: body.decision === "approved" ? "active" : "rejected" });
}

async function handleCloseLoan(loanId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const loan = await env.HRMS
    .prepare(`SELECT id, user_id, status FROM employee_loans WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(loanId, user.tenantId)
    .first<{ id: string; user_id: string; status: string }>();
  if (!loan) return json(request, env, { error: "Loan not found." }, 404);
  if (loan.status !== "active") return json(request, env, { error: "Only active loans can be closed." }, 409);

  const now = nowIso();
  await env.HRMS
    .prepare(`UPDATE employee_loans SET status = 'closed', outstanding = 0, updated_at = ? WHERE id = ?`)
    .bind(now, loanId)
    .run();
  await createNotification(env.HRMS, {
    companyId: user.tenantId, userId: loan.user_id, type: "loan_closed",
    title: "🎉 Loan Closed",
    body: "Your loan has been fully repaid and closed.",
    link: "/hrms/loans",
  });
  return json(request, env, { ok: true, id: loanId, status: "closed" });
}

async function handleRecordLoanEmi(loanId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{ monthKey?: string; emiAmount?: number }>(request);
  if (!body?.monthKey) return json(request, env, { error: "monthKey (YYYY-MM) is required." }, 400);

  const loan = await env.HRMS
    .prepare(
      `SELECT id, user_id, emi_amount, emi_months, emis_paid, outstanding, status
       FROM employee_loans WHERE id = ? AND company_id = ? LIMIT 1`,
    )
    .bind(loanId, user.tenantId)
    .first<{ id: string; user_id: string; emi_amount: number; emi_months: number; emis_paid: number; outstanding: number; status: string }>();
  if (!loan) return json(request, env, { error: "Loan not found." }, 404);
  if (loan.status !== "active") return json(request, env, { error: "Loan is not active." }, 409);

  const deductAmount = body.emiAmount ?? loan.emi_amount;
  const now = nowIso();
  try {
    await env.HRMS
      .prepare(
        `INSERT INTO loan_emis (id, loan_id, company_id, user_id, month_key, emi_amount, status, deducted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'deducted', ?, ?)`,
      )
      .bind(crypto.randomUUID(), loanId, user.tenantId, loan.user_id, body.monthKey, deductAmount, now, now)
      .run();
  } catch {
    return json(request, env, { error: "EMI already recorded for this month." }, 409);
  }

  const newOutstanding = Math.max(0, loan.outstanding - deductAmount);
  const newEmisPaid = loan.emis_paid + 1;
  const newStatus = newOutstanding === 0 || newEmisPaid >= loan.emi_months ? "closed" : "active";

  await env.HRMS
    .prepare(`UPDATE employee_loans SET emis_paid = ?, outstanding = ?, status = ?, updated_at = ? WHERE id = ?`)
    .bind(newEmisPaid, newOutstanding, newStatus, now, loanId)
    .run();

  return json(request, env, { ok: true, outstanding: newOutstanding, status: newStatus, emisPaid: newEmisPaid });
}

// ── Full & Final Settlement Handlers ─────────────────────────────────────────

async function handleListFnf(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const rows = await env.HRMS
    .prepare(
      `SELECT id, user_id, user_name, last_working_day, pending_salary, leave_encashment,
              gratuity, bonus, other_earnings, loan_recovery, tds_recovery, other_deductions,
              gross_payable, total_deductions, net_payable, status,
              approved_at, disbursed_at, payment_ref, notes, created_at
       FROM fnf_settlements WHERE company_id = ? ORDER BY created_at DESC`,
    )
    .bind(user.tenantId)
    .all();
  return json(request, env, { settlements: rows.results });
}

async function handleComputeFnf(targetUserId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const emp = await env.HRMS
    .prepare(`SELECT id, name, COALESCE(joined_on, created_at) as joined_on FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(targetUserId, user.tenantId)
    .first<{ id: string; name: string; joined_on: string }>();
  if (!emp) return json(request, env, { error: "Employee not found." }, 404);

  const salRow = await env.HRMS
    .prepare(`SELECT annual_ctc FROM employee_salaries WHERE COALESCE(company_id, org_id) = ? AND user_id = ? LIMIT 1`)
    .bind(user.tenantId, targetUserId)
    .first<{ annual_ctc: number }>();
  const annualCtc = salRow?.annual_ctc ?? 0;
  const monthlySalary = Math.round(annualCtc / 12);

  const structRow = await env.HRMS
    .prepare(`SELECT basic_pct FROM salary_structures WHERE company_id = ? AND user_id = ? LIMIT 1`)
    .bind(user.tenantId, targetUserId)
    .first<{ basic_pct: number }>();
  const basicPct = structRow?.basic_pct ?? 50;
  const monthlyBasic = Math.round(monthlySalary * basicPct / 100);

  // Gratuity: statutory (Payment of Gratuity Act) — eligible after 5 years
  const joinDate = new Date(emp.joined_on);
  const today = new Date();
  const yearsOfService = (today.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const completeYears = Math.floor(yearsOfService);
  const gratuity = yearsOfService >= 5
    ? Math.round((15 * monthlyBasic * completeYears) / 26)
    : 0;

  // Leave encashment: only encashment-eligible leave types
  const currentYear = today.getFullYear();
  const balances = await env.HRMS
    .prepare(
      `SELECT lb.leave_type, lb.remaining, lp.encashment_eligible
       FROM leave_balances lb
       LEFT JOIN leave_policies lp
         ON lp.company_id = COALESCE(lb.company_id, lb.org_id) AND lp.leave_type = lb.leave_type
       WHERE COALESCE(lb.company_id, lb.org_id) = ? AND lb.user_id = ? AND lb.year = ?`,
    )
    .bind(user.tenantId, targetUserId, currentYear)
    .all<{ leave_type: string; remaining: number; encashment_eligible: number }>();
  const perDayRate = annualCtc > 0 ? Math.round(annualCtc / 365) : 0;
  let leaveEncashment = 0;
  for (const b of balances.results) {
    if (b.encashment_eligible) leaveEncashment += (b.remaining ?? 0) * perDayRate;
  }
  leaveEncashment = Math.round(leaveEncashment);

  // Outstanding loan recovery
  const loansRow = await env.HRMS
    .prepare(`SELECT COALESCE(SUM(outstanding), 0) as total FROM employee_loans WHERE company_id = ? AND user_id = ? AND status = 'active'`)
    .bind(user.tenantId, targetUserId)
    .first<{ total: number }>();
  const loanRecovery = loansRow?.total ?? 0;

  const grossPayable = monthlySalary + leaveEncashment + gratuity;
  const totalDeductions = loanRecovery;
  const netPayable = Math.max(0, grossPayable - totalDeductions);

  return json(request, env, {
    userId: targetUserId,
    name: emp.name,
    annualCtc,
    monthlySalary,
    yearsOfService: parseFloat(yearsOfService.toFixed(2)),
    completeYears,
    gratuityEligible: yearsOfService >= 5,
    computed: {
      pendingSalary: monthlySalary,
      leaveEncashment,
      gratuity,
      bonus: 0,
      otherEarnings: 0,
      loanRecovery,
      tdsRecovery: 0,
      otherDeductions: 0,
      grossPayable,
      totalDeductions,
      netPayable,
    },
  });
}

async function handleCreateFnf(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const body = await readJsonBody<{
    userId?: string;
    exitId?: string;
    lastWorkingDay?: string;
    pendingSalary?: number;
    leaveEncashment?: number;
    gratuity?: number;
    bonus?: number;
    otherEarnings?: number;
    loanRecovery?: number;
    tdsRecovery?: number;
    otherDeductions?: number;
    notes?: string;
  }>(request);
  if (!body?.userId || !body.lastWorkingDay) {
    return json(request, env, { error: "userId and lastWorkingDay are required." }, 400);
  }

  const emp = await env.HRMS
    .prepare(`SELECT name FROM users WHERE id = ? AND COALESCE(company_id, org_id) = ? LIMIT 1`)
    .bind(body.userId, user.tenantId)
    .first<{ name: string }>();
  if (!emp) return json(request, env, { error: "Employee not found." }, 404);

  const pendingSalary  = body.pendingSalary    ?? 0;
  const leaveEncash    = body.leaveEncashment  ?? 0;
  const gratuity       = body.gratuity         ?? 0;
  const bonus          = body.bonus            ?? 0;
  const otherEarnings  = body.otherEarnings    ?? 0;
  const loanRecovery   = body.loanRecovery     ?? 0;
  const tdsRecovery    = body.tdsRecovery      ?? 0;
  const otherDed       = body.otherDeductions  ?? 0;
  const grossPayable   = pendingSalary + leaveEncash + gratuity + bonus + otherEarnings;
  const totalDed       = loanRecovery + tdsRecovery + otherDed;
  const netPayable     = Math.max(0, grossPayable - totalDed);

  const id = crypto.randomUUID();
  const now = nowIso();
  await env.HRMS
    .prepare(
      `INSERT INTO fnf_settlements
         (id, company_id, user_id, user_name, exit_id, last_working_day,
          pending_salary, leave_encashment, gratuity, bonus, other_earnings,
          loan_recovery, tds_recovery, other_deductions,
          gross_payable, total_deductions, net_payable, notes, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
    .bind(
      id, user.tenantId, body.userId, emp.name, body.exitId || null, body.lastWorkingDay,
      pendingSalary, leaveEncash, gratuity, bonus, otherEarnings,
      loanRecovery, tdsRecovery, otherDed,
      grossPayable, totalDed, netPayable,
      body.notes?.trim() || null, user.userId, now, now,
    )
    .run();

  return json(request, env, { ok: true, id }, 201);
}

async function handleFnfAction(
  fnfId: string,
  action: "approve" | "disburse",
  request: Request,
  env: Env,
  user: ApiUser,
): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  const fnf = await env.HRMS
    .prepare(`SELECT id, user_id, status, net_payable FROM fnf_settlements WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(fnfId, user.tenantId)
    .first<{ id: string; user_id: string; status: string; net_payable: number }>();
  if (!fnf) return json(request, env, { error: "Settlement not found." }, 404);

  const now = nowIso();
  if (action === "approve") {
    if (fnf.status !== "draft") return json(request, env, { error: "Only draft settlements can be approved." }, 409);
    await env.HRMS
      .prepare(`UPDATE fnf_settlements SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`)
      .bind(user.userId, now, now, fnfId)
      .run();
    await createNotification(env.HRMS, {
      companyId: user.tenantId, userId: fnf.user_id, type: "fnf_approved",
      title: "✅ F&F Approved",
      body: `Your Full & Final settlement of ₹${fnf.net_payable.toLocaleString("en-IN")} has been approved.`,
      link: "/hrms/exit",
    });
  } else {
    if (fnf.status !== "approved") return json(request, env, { error: "Only approved settlements can be disbursed." }, 409);
    const body = await readJsonBody<{ paymentRef?: string }>(request);
    await env.HRMS
      .prepare(`UPDATE fnf_settlements SET status = 'disbursed', disbursed_by = ?, disbursed_at = ?, payment_ref = ?, updated_at = ? WHERE id = ?`)
      .bind(user.userId, now, body?.paymentRef?.trim() || null, now, fnfId)
      .run();
    await createNotification(env.HRMS, {
      companyId: user.tenantId, userId: fnf.user_id, type: "fnf_disbursed",
      title: "💰 F&F Disbursed",
      body: `Your Full & Final settlement of ₹${fnf.net_payable.toLocaleString("en-IN")} has been disbursed.`,
      link: "/hrms/exit",
    });
  }
  return json(request, env, { ok: true, id: fnfId, status: action === "approve" ? "approved" : "disbursed" });
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

  const refererBase = env.HRMS_BASE_URL ?? new URL(request.url).origin;

  const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": refererBase,
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

  return withCors(
    new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    }),
    request,
    env,
  );
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

  // Fetch company display name with backward-compatible fallback:
  // some tenants map to organizations.id while others map to companies.id.
  const company = await env.HRMS
    .prepare(`SELECT company_name FROM companies WHERE id = ? LIMIT 1`)
    .bind(user.tenantId)
    .first<{ company_name: string | null }>();

  const organization = await env.HRMS
    .prepare(`SELECT name FROM organizations WHERE id = ? LIMIT 1`)
    .bind(user.tenantId)
    .first<{ name: string | null }>();

  const companyName = company?.company_name ?? organization?.name ?? null;

  if (!row) {
    // Return defaults when no settings row exists yet
    return json(request, env, {
      settings: {
        companyName,
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
      companyName,
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
    companyName?: string | null;
  }>(request);


  if (!body) return json(request, env, { error: "Invalid request body." }, 400);

  // Update company display name in both tables for compatibility.
  if (body.companyName != null && body.companyName.trim().length > 0) {
    const trimmedCompanyName = body.companyName.trim();
    const now = nowIso();

    await env.HRMS
      .prepare(`UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?`)
      .bind(trimmedCompanyName, now, user.tenantId)
      .run();

    await env.HRMS
      .prepare(`UPDATE companies SET company_name = ?, updated_at = ? WHERE id = ? OR lower(owner_id) = lower(?)`)
      .bind(trimmedCompanyName, now, user.tenantId, user.email)
      .run();
  }

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

async function ensureStatutoryFilingsTable(db: D1Database): Promise<void> {
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
}

async function handleListStatutoryFilings(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  await ensureStatutoryFilingsTable(env.HRMS);
  const rows = await env.HRMS
    .prepare(
      `SELECT id, filing_type, period, status, file_path, filed_by, filed_at, error_message, created_at, updated_at
       FROM statutory_filings
       WHERE company_id = ?
       ORDER BY period DESC, filing_type ASC`,
    )
    .bind(user.tenantId)
    .all<StatutoryFilingRow>();

  return json(request, env, { filings: rows.results });
}

async function handleUpsertStatutoryFiling(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);

  const body = await readJsonBody<{
    filingType?: string;
    period?: string;
    status?: "pending" | "filed" | "failed";
    filePath?: string;
    errorMessage?: string;
  }>(request);

  const filingType = body?.filingType?.trim().toUpperCase() ?? "";
  const period = body?.period?.trim() ?? "";
  const status = body?.status ?? "filed";

  if (!filingType || !period) {
    return json(request, env, { error: "filingType and period are required." }, 400);
  }
  if (!["pending", "filed", "failed"].includes(status)) {
    return json(request, env, { error: "status must be pending, filed, or failed." }, 400);
  }

  await ensureStatutoryFilingsTable(env.HRMS);
  const now = nowIso();
  await env.HRMS
    .prepare(
      `INSERT INTO statutory_filings (id, company_id, filing_type, period, status, file_path, filed_by, filed_at, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, filing_type, period)
       DO UPDATE SET
         status = excluded.status,
         file_path = excluded.file_path,
         filed_by = excluded.filed_by,
         filed_at = excluded.filed_at,
         error_message = excluded.error_message,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      user.tenantId,
      filingType,
      period,
      status,
      body?.filePath?.trim() || null,
      user.userId,
      status === "pending" ? null : now,
      body?.errorMessage?.trim() || null,
      now,
      now,
    )
    .run();

  return json(request, env, { ok: true });
}

// ── IT Declaration Handlers ───────────────────────────────────────────────────

interface ITDeclarationRow {
  id: string;
  company_id: string;
  user_id: string;
  financial_year: string;
  tax_regime: "new" | "old";
  ppf: number;
  elss: number;
  lic: number;
  nsc: number;
  ulip: number;
  home_loan_principal: number;
  tuition_fees: number;
  other_80c: number;
  medical_self: number;
  medical_parents: number;
  monthly_rent: number;
  is_metro: number;
  home_loan_interest: number;
  nps_80ccd1b: number;
  other_deductions: number;
  status: "draft" | "submitted" | "approved";
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  user_name?: string;
  created_at: string;
  updated_at: string;
}

async function ensureITDeclarationsTable(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS it_declarations (
       id TEXT PRIMARY KEY,
       company_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       financial_year TEXT NOT NULL,
       tax_regime TEXT NOT NULL DEFAULT 'new',
       ppf INTEGER NOT NULL DEFAULT 0,
       elss INTEGER NOT NULL DEFAULT 0,
       lic INTEGER NOT NULL DEFAULT 0,
       nsc INTEGER NOT NULL DEFAULT 0,
       ulip INTEGER NOT NULL DEFAULT 0,
       home_loan_principal INTEGER NOT NULL DEFAULT 0,
       tuition_fees INTEGER NOT NULL DEFAULT 0,
       other_80c INTEGER NOT NULL DEFAULT 0,
       medical_self INTEGER NOT NULL DEFAULT 0,
       medical_parents INTEGER NOT NULL DEFAULT 0,
       monthly_rent INTEGER NOT NULL DEFAULT 0,
       is_metro INTEGER NOT NULL DEFAULT 0,
       home_loan_interest INTEGER NOT NULL DEFAULT 0,
       nps_80ccd1b INTEGER NOT NULL DEFAULT 0,
       other_deductions INTEGER NOT NULL DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'draft',
       submitted_at TEXT,
       approved_by TEXT,
       approved_at TEXT,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE(company_id, user_id, financial_year)
     )`,
  ).run();
}

function currentFinancialYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-indexed
  // FY starts April 1: if month >= 4, FY is y-(y+1), else (y-1)-y
  if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
  return `${y - 1}-${String(y).slice(2)}`;
}

async function handleGetITDeclarations(request: Request, env: Env, user: ApiUser): Promise<Response> {
  await ensureITDeclarationsTable(env.HRMS);
  const url = new URL(request.url);
  const fy = url.searchParams.get("fy") ?? currentFinancialYear();
  const isAdmin = isHrManager(user.role);

  if (isAdmin) {
    // HR view: all declarations for company, join with user name
    const rows = await env.HRMS.prepare(
      `SELECT d.*, u.name AS user_name
       FROM it_declarations d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.company_id = ? AND d.financial_year = ?
       ORDER BY u.name ASC`,
    ).bind(user.tenantId, fy).all<ITDeclarationRow>();
    return json(request, env, { declarations: rows.results, financialYear: fy });
  }

  // Employee view: own declaration only
  const row = await env.HRMS.prepare(
    `SELECT * FROM it_declarations
     WHERE company_id = ? AND user_id = ? AND financial_year = ?`,
  ).bind(user.tenantId, user.userId, fy).first<ITDeclarationRow>();
  return json(request, env, { declaration: row ?? null, financialYear: fy });
}

async function handleUpsertITDeclaration(request: Request, env: Env, user: ApiUser): Promise<Response> {
  await ensureITDeclarationsTable(env.HRMS);

  const body = await readJsonBody<{
    financialYear?: string;
    taxRegime?: string;
    ppf?: number; elss?: number; lic?: number; nsc?: number; ulip?: number;
    homeLoanPrincipal?: number; tuitionFees?: number; other80c?: number;
    medicalSelf?: number; medicalParents?: number;
    monthlyRent?: number; isMetro?: boolean;
    homeLoanInterest?: number; nps80ccd1b?: number; otherDeductions?: number;
    submit?: boolean;
  }>(request);

  if (!body) return json(request, env, { error: "Invalid request body." }, 400);

  const fy = body.financialYear?.trim() ?? currentFinancialYear();
  const regime = body.taxRegime === "old" ? "old" : "new";
  const status = body.submit ? "submitted" : "draft";
  const now = nowIso();

  // Employees can only upsert their own; HR can upsert for any employee
  const targetUserId = user.userId;

  const id = `ITD${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;

  await env.HRMS.prepare(
    `INSERT INTO it_declarations (
       id, company_id, user_id, financial_year, tax_regime,
       ppf, elss, lic, nsc, ulip, home_loan_principal, tuition_fees, other_80c,
       medical_self, medical_parents, monthly_rent, is_metro,
       home_loan_interest, nps_80ccd1b, other_deductions,
       status, submitted_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id, user_id, financial_year) DO UPDATE SET
       tax_regime = excluded.tax_regime,
       ppf = excluded.ppf, elss = excluded.elss, lic = excluded.lic,
       nsc = excluded.nsc, ulip = excluded.ulip,
       home_loan_principal = excluded.home_loan_principal,
       tuition_fees = excluded.tuition_fees, other_80c = excluded.other_80c,
       medical_self = excluded.medical_self, medical_parents = excluded.medical_parents,
       monthly_rent = excluded.monthly_rent, is_metro = excluded.is_metro,
       home_loan_interest = excluded.home_loan_interest,
       nps_80ccd1b = excluded.nps_80ccd1b, other_deductions = excluded.other_deductions,
       status = CASE WHEN it_declarations.status = 'approved' THEN 'approved' ELSE excluded.status END,
       submitted_at = CASE WHEN excluded.status = 'submitted' AND it_declarations.status != 'approved'
                           THEN excluded.submitted_at ELSE it_declarations.submitted_at END,
       updated_at = excluded.updated_at`,
  ).bind(
    id, user.tenantId, targetUserId, fy, regime,
    body.ppf ?? 0, body.elss ?? 0, body.lic ?? 0, body.nsc ?? 0, body.ulip ?? 0,
    body.homeLoanPrincipal ?? 0, body.tuitionFees ?? 0, body.other80c ?? 0,
    body.medicalSelf ?? 0, body.medicalParents ?? 0,
    body.monthlyRent ?? 0, body.isMetro ? 1 : 0,
    body.homeLoanInterest ?? 0, body.nps80ccd1b ?? 0, body.otherDeductions ?? 0,
    status, status === "submitted" ? now : null,
    now, now,
  ).run();

  return json(request, env, { ok: true, status });
}

async function handleApproveITDeclaration(declId: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!isHrManager(user.role)) return json(request, env, { error: "Forbidden." }, 403);
  await ensureITDeclarationsTable(env.HRMS);

  const now = nowIso();
  const result = await env.HRMS.prepare(
    `UPDATE it_declarations
     SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
     WHERE id = ? AND company_id = ? AND status = 'submitted'`,
  ).bind(user.userId, now, now, declId, user.tenantId).run();

  if (result.meta.changes === 0) {
    return json(request, env, { error: "Declaration not found or not in submitted state." }, 404);
  }
  return json(request, env, { ok: true });
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

// ── Offer Letters ─────────────────────────────────────────────────────────────

interface OfferLetterRow {
  id: string;
  company_id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  department: string | null;
  start_date: string | null;
  annual_ctc: number | null;
  reporting_manager: string | null;
  probation_days: number;
  work_location: string | null;
  expires_at: string | null;
  status: string;
  letter_body: string;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

function generateOfferLetterBody(params: {
  companyName: string;
  candidateName: string;
  position: string;
  department: string | null;
  startDate: string | null;
  annualCtc: number | null;
  reportingManager: string | null;
  probationDays: number;
  workLocation: string | null;
  expiresAt: string | null;
}): string {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const startStr = params.startDate
    ? new Date(params.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "[Start Date TBD]";
  const ctcStr = params.annualCtc
    ? `₹${Number(params.annualCtc).toLocaleString("en-IN")} per annum (CTC)`
    : "[Salary TBD]";
  const expiryStr = params.expiresAt
    ? new Date(params.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "[Expiry Date]";

  return `${params.companyName}
Date: ${today}

To,
${params.candidateName}

Subject: Offer of Employment – ${params.position}${params.department ? ` (${params.department})` : ""}

Dear ${params.candidateName},

We are delighted to extend this offer of employment for the position of ${params.position}${params.department ? ` in the ${params.department} department` : ""} at ${params.companyName}.

TERMS OF EMPLOYMENT
───────────────────────────────────────
Position:           ${params.position}
${params.department ? `Department:         ${params.department}\n` : ""}Start Date:         ${startStr}
Compensation:       ${ctcStr}
Work Location:      ${params.workLocation ?? "Company premises / Remote as agreed"}
Reporting To:       ${params.reportingManager ?? "As designated by management"}
Probation Period:   ${params.probationDays} days

TERMS AND CONDITIONS
───────────────────────────────────────
1. This offer is contingent upon successful completion of background verification and submission of all required documents.
2. During the probation period of ${params.probationDays} days, either party may terminate the employment with 7 days' written notice.
3. After confirmation, the applicable notice period as per company policy will apply.
4. This offer is strictly confidential and is intended solely for the addressee.
5. This offer expires on ${expiryStr}. Please sign and return a copy by this date to confirm your acceptance.

We look forward to you joining our team and believe you will make a valuable contribution to ${params.companyName}.

Please confirm your acceptance of this offer by signing below and returning a copy to us.

Yours sincerely,

___________________________
Authorized Signatory
${params.companyName}


ACCEPTANCE
───────────────────────────────────────
I, ${params.candidateName}, accept the offer of employment for the position of ${params.position} at ${params.companyName} on the terms and conditions set out above.

Signature: ___________________________    Date: ___________________________`;
}

async function handleListOfferLetters(request: Request, env: Env, user: ApiUser): Promise<Response> {
  const isAdmin = HR_ROLES.has(user.role);
  let rows: OfferLetterRow[];
  if (isAdmin) {
    const result = await env.HRMS
      .prepare(`SELECT * FROM offer_letters WHERE company_id = ? ORDER BY created_at DESC`)
      .bind(user.tenantId)
      .all<OfferLetterRow>();
    rows = result.results;
  } else {
    const result = await env.HRMS
      .prepare(`SELECT * FROM offer_letters WHERE company_id = ? AND candidate_email = ? ORDER BY created_at DESC`)
      .bind(user.tenantId, user.email)
      .all<OfferLetterRow>();
    rows = result.results;
  }
  return json(request, env, { offerLetters: rows });
}

async function handleCreateOfferLetter(request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!HR_ROLES.has(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }
  const body = await request.json() as Record<string, unknown>;
  const candidateName = String(body.candidateName ?? "").trim();
  const candidateEmail = String(body.candidateEmail ?? "").trim().toLowerCase();
  const position = String(body.position ?? "").trim();
  if (!candidateName || !candidateEmail || !position) {
    return json(request, env, { error: "candidateName, candidateEmail and position are required." }, 400);
  }

  // Fetch company name for the letter
  const companyRow = await env.HRMS
    .prepare(`SELECT name FROM organizations WHERE id = ? LIMIT 1`)
    .bind(user.tenantId)
    .first<{ name: string }>();
  const companyName = companyRow?.name ?? "Our Company";

  const department = body.department ? String(body.department) : null;
  const startDate = body.startDate ? String(body.startDate) : null;
  const annualCtc = body.annualCtc != null ? Number(body.annualCtc) : null;
  const reportingManager = body.reportingManager ? String(body.reportingManager) : null;
  const probationDays = body.probationDays != null ? Number(body.probationDays) : 90;
  const workLocation = body.workLocation ? String(body.workLocation) : null;
  const expiresAt = body.expiresAt ? String(body.expiresAt) : null;

  const letterBody = generateOfferLetterBody({
    companyName,
    candidateName,
    position,
    department,
    startDate,
    annualCtc,
    reportingManager,
    probationDays,
    workLocation,
    expiresAt,
  });

  const id = crypto.randomUUID();
  const now = nowIso();
  await env.HRMS
    .prepare(`INSERT INTO offer_letters
      (id, company_id, candidate_name, candidate_email, position, department, start_date,
       annual_ctc, reporting_manager, probation_days, work_location, expires_at, status,
       letter_body, created_by_id, created_by_name, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)`)
    .bind(id, user.tenantId, candidateName, candidateEmail, position, department, startDate,
      annualCtc, reportingManager, probationDays, workLocation, expiresAt,
      letterBody, user.userId, user.name, now, now)
    .run();

  const row = await env.HRMS
    .prepare(`SELECT * FROM offer_letters WHERE id = ?`)
    .bind(id)
    .first<OfferLetterRow>();
  return json(request, env, { offerLetter: row }, 201);
}

async function handleGetOfferLetter(id: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  const row = await env.HRMS
    .prepare(`SELECT * FROM offer_letters WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(id, user.tenantId)
    .first<OfferLetterRow>();
  if (!row) return json(request, env, { error: "Not found." }, 404);
  const isAdmin = HR_ROLES.has(user.role);
  if (!isAdmin && row.candidate_email !== user.email) {
    return json(request, env, { error: "Forbidden." }, 403);
  }
  return json(request, env, { offerLetter: row });
}

async function handleUpdateOfferLetter(id: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  const row = await env.HRMS
    .prepare(`SELECT * FROM offer_letters WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(id, user.tenantId)
    .first<OfferLetterRow>();
  if (!row) return json(request, env, { error: "Not found." }, 404);

  const isAdmin = HR_ROLES.has(user.role);
  const body = await request.json() as Record<string, unknown>;
  const now = nowIso();

  // Employee can only accept/reject their own offer
  if (!isAdmin) {
    if (row.candidate_email !== user.email) {
      return json(request, env, { error: "Forbidden." }, 403);
    }
    const action = String(body.action ?? "");
    if (action === "accept") {
      await env.HRMS.prepare(`UPDATE offer_letters SET status='accepted', accepted_at=?, updated_at=? WHERE id=?`)
        .bind(now, now, id).run();
    } else if (action === "reject") {
      await env.HRMS.prepare(`UPDATE offer_letters SET status='rejected', rejected_at=?, updated_at=? WHERE id=?`)
        .bind(now, now, id).run();
    } else {
      return json(request, env, { error: "Employees may only accept or reject an offer." }, 400);
    }
    const updated = await env.HRMS.prepare(`SELECT * FROM offer_letters WHERE id=?`).bind(id).first<OfferLetterRow>();
    return json(request, env, { offerLetter: updated });
  }

  // Admin updates
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.action === "send") {
    sets.push("status='sent'", "sent_at=?");
    vals.push(now);
  } else if (body.action === "withdraw") {
    sets.push("status='withdrawn'");
  } else if (body.action === "draft") {
    sets.push("status='draft'");
  }

  // Field edits
  if (body.candidateName !== undefined) { sets.push("candidate_name=?"); vals.push(String(body.candidateName)); }
  if (body.candidateEmail !== undefined) { sets.push("candidate_email=?"); vals.push(String(body.candidateEmail).toLowerCase()); }
  if (body.position !== undefined) { sets.push("position=?"); vals.push(String(body.position)); }
  if (body.department !== undefined) { sets.push("department=?"); vals.push(body.department ? String(body.department) : null); }
  if (body.startDate !== undefined) { sets.push("start_date=?"); vals.push(body.startDate ? String(body.startDate) : null); }
  if (body.annualCtc !== undefined) { sets.push("annual_ctc=?"); vals.push(body.annualCtc != null ? Number(body.annualCtc) : null); }
  if (body.reportingManager !== undefined) { sets.push("reporting_manager=?"); vals.push(body.reportingManager ? String(body.reportingManager) : null); }
  if (body.probationDays !== undefined) { sets.push("probation_days=?"); vals.push(Number(body.probationDays)); }
  if (body.workLocation !== undefined) { sets.push("work_location=?"); vals.push(body.workLocation ? String(body.workLocation) : null); }
  if (body.expiresAt !== undefined) { sets.push("expires_at=?"); vals.push(body.expiresAt ? String(body.expiresAt) : null); }
  if (body.letterBody !== undefined) { sets.push("letter_body=?"); vals.push(String(body.letterBody)); }

  if (sets.length === 0) return json(request, env, { error: "Nothing to update." }, 400);

  sets.push("updated_at=?");
  vals.push(now);
  vals.push(id);

  await env.HRMS.prepare(`UPDATE offer_letters SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
  const updated = await env.HRMS.prepare(`SELECT * FROM offer_letters WHERE id=?`).bind(id).first<OfferLetterRow>();
  return json(request, env, { offerLetter: updated });
}

async function handleDeleteOfferLetter(id: string, request: Request, env: Env, user: ApiUser): Promise<Response> {
  if (!HR_ROLES.has(user.role)) {
    return json(request, env, { error: "Forbidden." }, 403);
  }
  const row = await env.HRMS
    .prepare(`SELECT id FROM offer_letters WHERE id = ? AND company_id = ? LIMIT 1`)
    .bind(id, user.tenantId)
    .first<{ id: string }>();
  if (!row) return json(request, env, { error: "Not found." }, 404);
  await env.HRMS.prepare(`DELETE FROM offer_letters WHERE id = ?`).bind(id).run();
  return json(request, env, { ok: true });
}
