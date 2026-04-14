export interface EmployeeRecord {
  id: string;
  orgId: string;
  name: string;
  role: string;
  department: string;
  location: string;
  status: string;
  joinedOn: string;
  salary: string;
  createdAt: string;
}

export interface JobOpeningRecord {
  id: string;
  orgId: string;
  title: string;
  department: string;
  location: string;
  priority: string;
  applicantCount: number;
  stage: string;
  createdAt: string;
}

export interface OnboardingTaskRecord {
  id: string;
  joinerId: string;
  section: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

export interface OnboardingJoinerRecord {
  id: string;
  orgId: string;
  name: string;
  role: string;
  department: string;
  startDate: string;
  progress: number;
  avatar: string;
  createdAt: string;
  tasks: OnboardingTaskRecord[];
}

export interface ExitTaskRecord {
  id: string;
  exitId: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

export interface ExitProcessRecord {
  id: string;
  orgId: string;
  name: string;
  employeeCode: string;
  role: string;
  department: string;
  exitType: string;
  noticePeriod: string;
  lastDay: string;
  progress: number;
  reason: string;
  createdAt: string;
  tasks: ExitTaskRecord[];
}

function monthYear(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date(value));
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));
}

function initials(name: string): string {
  return name.split(" ").map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function mapEmployee(row: Record<string, unknown>): EmployeeRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    role: String(row.role),
    department: String(row.department),
    location: String(row.location),
    status: String(row.status),
    joinedOn: String(row.joined_on),
    salary: String(row.salary),
    createdAt: String(row.created_at),
  };
}

function mapOpening(row: Record<string, unknown>): JobOpeningRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    title: String(row.title),
    department: String(row.department),
    location: String(row.location),
    priority: String(row.priority),
    applicantCount: Number(row.applicant_count ?? 0),
    stage: String(row.stage),
    createdAt: String(row.created_at),
  };
}

function mapTask(row: Record<string, unknown>): OnboardingTaskRecord {
  return {
    id: String(row.id),
    joinerId: String(row.joiner_id),
    section: String(row.section),
    label: String(row.label),
    done: Boolean(row.done),
    sortOrder: Number(row.sort_order),
  };
}

function mapExitTask(row: Record<string, unknown>): ExitTaskRecord {
  return {
    id: String(row.id),
    exitId: String(row.exit_id),
    label: String(row.label),
    done: Boolean(row.done),
    sortOrder: Number(row.sort_order),
  };
}

const defaultOnboardingTemplate = [
  ["Pre-joining", "Offer Letter Signed"],
  ["Pre-joining", "Background Verification"],
  ["Pre-joining", "Document Submission"],
  ["Day 1 Setup", "Laptop Assigned"],
  ["Day 1 Setup", "Email and Slack Access"],
  ["Day 1 Setup", "ID Card Issued"],
  ["Week 1", "HR Induction Session"],
  ["Week 1", "Team Introduction"],
  ["Week 1", "Tool Access Provisioned"],
  ["30-Day Goals", "Complete Security Training"],
  ["30-Day Goals", "First Project Kickoff"],
  ["30-Day Goals", "Buddy Check-in"],
] as const;

const defaultExitTemplate = [
  "Resignation Accepted",
  "Notice Period Confirmed",
  "Knowledge Transfer Plan",
  "Asset Retrieval",
  "Access Revocation",
  "Exit Interview",
  "Full & Final Settlement",
  "Experience Letter",
] as const;

export async function listEmployees(db: D1Database, orgId: string): Promise<EmployeeRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, org_id, name, role, department, location, status, joined_on, salary, created_at
       FROM employees
       WHERE org_id = ?
       ORDER BY date(joined_on) DESC, name ASC`,
    )
    .bind(orgId)
    .all<Record<string, unknown>>();

  return result.results.map(mapEmployee);
}

export async function createEmployee(
  db: D1Database,
  input: {
    orgId: string;
    name: string;
    role: string;
    department: string;
    location: string;
    joinedOn: string;
    salary: string;
    status: string;
  },
): Promise<void> {
  const id = `EMP${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO employees (id, org_id, name, role, department, location, status, joined_on, salary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.orgId, input.name.trim(), input.role.trim(), input.department.trim(), input.location.trim(), input.status.trim(), input.joinedOn, input.salary.trim(), now, now)
    .run();
}

export async function getEmployeesDashboard(db: D1Database, orgId: string) {
  const employees = await listEmployees(db, orgId);
  return {
    employees,
    stats: [
      { label: "Total", value: String(employees.length), color: "#4f46e5" },
      { label: "Active", value: String(employees.filter((employee) => employee.status === "Active").length), color: "#10b981" },
      { label: "On Leave", value: String(employees.filter((employee) => employee.status === "On Leave").length), color: "#f59e0b" },
      { label: "Onboarding", value: String(employees.filter((employee) => employee.status === "Onboarding").length), color: "#8b5cf6" },
    ],
    view: employees.map((employee) => ({
      ...employee,
      joinedLabel: monthYear(employee.joinedOn),
    })),
  };
}


export async function listJobOpenings(db: D1Database, orgId: string): Promise<JobOpeningRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, org_id, title, department, location, priority, applicant_count, stage, created_at
       FROM job_openings
       WHERE org_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .bind(orgId)
    .all<Record<string, unknown>>();

  return result.results.map(mapOpening);
}

export async function createJobOpening(
  db: D1Database,
  input: {
    orgId: string;
    title: string;
    department: string;
    location: string;
    priority: string;
  },
): Promise<void> {
  const id = `JOB${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO job_openings (id, org_id, title, department, location, priority, applicant_count, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'Applied', ?, ?)`,
    )
    .bind(id, input.orgId, input.title.trim(), input.department.trim(), input.location.trim(), input.priority.trim(), now, now)
    .run();
}

export async function getRecruitmentDashboard(db: D1Database, orgId: string) {
  const openings = await listJobOpenings(db, orgId);
  const stages = ["Applied", "Screening", "Interview", "Offer"];
  const pipeline = stages.map((stage, index) => {
    const roles = openings.filter((opening) => opening.stage === stage);
    const colors = ["#7b8099", "#4f46e5", "#f59e0b", "#10b981"];
    return {
      stage,
      color: colors[index],
      count: roles.length,
      roles: roles.map((role) => ({
        id: role.id,
        title: role.title,
        department: role.department,
        location: role.location,
        applicants: role.applicantCount,
        priority: role.priority,
      })),
    };
  });

  return { openings, pipeline };
}


export async function listOnboardingJoiners(db: D1Database, orgId: string): Promise<OnboardingJoinerRecord[]> {
  const joinersResult = await db
    .prepare(
      `SELECT id, org_id, name, role, department, start_date, progress, avatar, created_at
       FROM onboarding_joiners
       WHERE org_id = ?
       ORDER BY date(start_date) ASC, datetime(created_at) DESC`,
    )
    .bind(orgId)
    .all<Record<string, unknown>>();

  const tasksResult = await db
    .prepare(
      `SELECT id, joiner_id, section, label, done, sort_order
       FROM onboarding_tasks
       WHERE joiner_id IN (SELECT id FROM onboarding_joiners WHERE org_id = ?)
       ORDER BY section, sort_order ASC`,
    )
    .bind(orgId)
    .all<Record<string, unknown>>();

  const taskMap = new Map<string, OnboardingTaskRecord[]>();
  for (const row of tasksResult.results) {
    const task = mapTask(row);
    const list = taskMap.get(task.joinerId) ?? [];
    list.push(task);
    taskMap.set(task.joinerId, list);
  }

  return joinersResult.results.map((row) => ({
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    role: String(row.role),
    department: String(row.department),
    startDate: String(row.start_date),
    progress: Number(row.progress ?? 0),
    avatar: String(row.avatar),
    createdAt: String(row.created_at),
    tasks: taskMap.get(String(row.id)) ?? [],
  }));
}

export async function createOnboardingJoiner(
  db: D1Database,
  input: {
    orgId: string;
    name: string;
    role: string;
    department: string;
    startDate: string;
  },
): Promise<void> {
  const id = `ONB${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO onboarding_joiners (id, org_id, name, role, department, start_date, progress, avatar, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(id, input.orgId, input.name.trim(), input.role.trim(), input.department.trim(), input.startDate, initials(input.name), now, now)
    .run();

  const statements = defaultOnboardingTemplate.map(([section, label], index) =>
    db.prepare(
      `INSERT INTO onboarding_tasks (id, joiner_id, section, label, done, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(`TSK${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`, id, section, label, index + 1, now, now),
  );

  await db.batch(statements);
}

export async function toggleOnboardingTask(db: D1Database, joinerId: string, taskId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE onboarding_tasks
       SET done = CASE done WHEN 1 THEN 0 ELSE 1 END,
           updated_at = ?
       WHERE id = ? AND joiner_id = ?`,
    )
    .bind(now, taskId, joinerId)
    .run();

  const result = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) AS done_count,
         COUNT(*) AS total_count
       FROM onboarding_tasks
       WHERE joiner_id = ?`,
    )
    .bind(joinerId)
    .first<{ done_count: number | string; total_count: number | string }>();

  const done = Number(result?.done_count ?? 0);
  const total = Number(result?.total_count ?? 0);
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  await db
    .prepare(`UPDATE onboarding_joiners SET progress = ?, updated_at = ? WHERE id = ?`)
    .bind(progress, now, joinerId)
    .run();
}

export async function getOnboardingDashboard(db: D1Database, orgId: string) {
  const joiners = await listOnboardingJoiners(db, orgId);
  const view = joiners.map((joiner) => ({
    ...joiner,
    startDateLabel: shortDate(joiner.startDate),
    groupedTasks: joiner.tasks.reduce<Array<{ section: string; items: OnboardingTaskRecord[] }>>((groups, task) => {
      const existing = groups.find((group) => group.section === task.section);
      if (existing) {
        existing.items.push(task);
      } else {
        groups.push({ section: task.section, items: [task] });
      }
      return groups;
    }, []),
  }));

  return {
    joiners: view,
    stats: [
      { label: "Joining This Month", value: String(joiners.length), sub: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date()) },
      { label: "In Progress", value: String(joiners.filter((joiner) => joiner.progress > 0 && joiner.progress < 100).length), sub: "Active onboarding" },
      { label: "Completed", value: String(joiners.filter((joiner) => joiner.progress >= 100).length), sub: "Fully onboarded" },
      { label: "Avg Completion", value: `${joiners.length ? Math.round(joiners.reduce((sum, joiner) => sum + joiner.progress, 0) / joiners.length) : 0}%`, sub: "Across all joiners" },
    ],
  };
}


export async function listExitProcesses(db: D1Database, orgId: string): Promise<ExitProcessRecord[]> {
  const exitsResult = await db
    .prepare(
      `SELECT id, org_id, name, employee_code, role, department, exit_type, notice_period, last_day, progress, reason, created_at
       FROM exit_processes
       WHERE org_id = ?
       ORDER BY date(last_day) ASC, datetime(created_at) DESC`,
    )
    .bind(orgId)
    .all<Record<string, unknown>>();

  const tasksResult = await db
    .prepare(
      `SELECT id, exit_id, label, done, sort_order
       FROM exit_tasks
       WHERE exit_id IN (SELECT id FROM exit_processes WHERE org_id = ?)
       ORDER BY sort_order ASC`,
    )
    .bind(orgId)
    .all<Record<string, unknown>>();

  const taskMap = new Map<string, ExitTaskRecord[]>();
  for (const row of tasksResult.results) {
    const task = mapExitTask(row);
    const list = taskMap.get(task.exitId) ?? [];
    list.push(task);
    taskMap.set(task.exitId, list);
  }

  return exitsResult.results.map((row) => ({
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    employeeCode: String(row.employee_code),
    role: String(row.role),
    department: String(row.department),
    exitType: String(row.exit_type),
    noticePeriod: String(row.notice_period),
    lastDay: String(row.last_day),
    progress: Number(row.progress ?? 0),
    reason: String(row.reason ?? "-"),
    createdAt: String(row.created_at),
    tasks: taskMap.get(String(row.id)) ?? [],
  }));
}

export async function createExitProcess(
  db: D1Database,
  input: {
    orgId: string;
    name: string;
    employeeCode: string;
    role: string;
    department: string;
    exitType: string;
    noticePeriod: string;
    lastDay: string;
  },
): Promise<void> {
  const id = `EXT${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO exit_processes (id, org_id, name, employee_code, role, department, exit_type, notice_period, last_day, progress, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '-', ?, ?)`,
    )
    .bind(
      id,
      input.orgId,
      input.name.trim(),
      input.employeeCode.trim(),
      input.role.trim(),
      input.department.trim(),
      input.exitType.trim(),
      input.noticePeriod.trim(),
      input.lastDay,
      now,
      now,
    )
    .run();

  const statements = defaultExitTemplate.map((label, index) =>
    db.prepare(
      `INSERT INTO exit_tasks (id, exit_id, label, done, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
    ).bind(`XTK${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`, id, label, index + 1, now, now),
  );

  await db.batch(statements);
}

export async function toggleExitTask(db: D1Database, exitId: string, taskId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE exit_tasks
       SET done = CASE done WHEN 1 THEN 0 ELSE 1 END,
           updated_at = ?
       WHERE id = ? AND exit_id = ?`,
    )
    .bind(now, taskId, exitId)
    .run();

  const result = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) AS done_count,
         COUNT(*) AS total_count
       FROM exit_tasks
       WHERE exit_id = ?`,
    )
    .bind(exitId)
    .first<{ done_count: number | string; total_count: number | string }>();

  const done = Number(result?.done_count ?? 0);
  const total = Number(result?.total_count ?? 0);
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  await db
    .prepare(`UPDATE exit_processes SET progress = ?, updated_at = ? WHERE id = ?`)
    .bind(progress, now, exitId)
    .run();
}

export async function getExitDashboard(db: D1Database, orgId: string) {
  const exits = await listExitProcesses(db, orgId);
  return { exits };
}

