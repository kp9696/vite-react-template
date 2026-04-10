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

export const DEMO_EMPLOYEES: EmployeeRecord[] = [
  { id: "EMPD001", orgId: "ORGDEMOUI", name: "Deepa Krishnan", role: "Engineering Manager", department: "Engineering", location: "Bengaluru", status: "Active", joinedOn: "2024-08-10", salary: "INR 42L", createdAt: "2024-08-10T09:00:00.000Z" },
  { id: "EMPD002", orgId: "ORGDEMOUI", name: "Aarav Shah", role: "Senior Engineer", department: "Engineering", location: "Bengaluru", status: "Active", joinedOn: "2025-04-02", salary: "INR 28L", createdAt: "2025-04-02T09:00:00.000Z" },
  { id: "EMPD003", orgId: "ORGDEMOUI", name: "Vikram Joshi", role: "Backend Engineer", department: "Engineering", location: "Hyderabad", status: "Active", joinedOn: "2025-01-20", salary: "INR 22L", createdAt: "2025-01-20T09:00:00.000Z" },
  { id: "EMPD004", orgId: "ORGDEMOUI", name: "Priya Nair", role: "Product Designer", department: "Design", location: "Mumbai", status: "Active", joinedOn: "2025-03-18", salary: "INR 22L", createdAt: "2025-03-18T09:00:00.000Z" },
  { id: "EMPD005", orgId: "ORGDEMOUI", name: "Rohan Mehta", role: "Data Analyst", department: "Analytics", location: "Pune", status: "Onboarding", joinedOn: "2026-03-28", salary: "INR 18L", createdAt: "2026-03-28T09:00:00.000Z" },
  { id: "EMPD006", orgId: "ORGDEMOUI", name: "Sneha Pillai", role: "HR Generalist", department: "People Ops", location: "Bengaluru", status: "Active", joinedOn: "2025-02-12", salary: "INR 16L", createdAt: "2025-02-12T09:00:00.000Z" },
  { id: "EMPD007", orgId: "ORGDEMOUI", name: "Meera Iyer", role: "Marketing Lead", department: "Marketing", location: "Mumbai", status: "Active", joinedOn: "2025-01-12", salary: "INR 20L", createdAt: "2025-01-12T09:00:00.000Z" },
  { id: "EMPD008", orgId: "ORGDEMOUI", name: "Arjun Gupta", role: "Sales Executive", department: "Sales", location: "Delhi", status: "Active", joinedOn: "2025-06-01", salary: "INR 14L", createdAt: "2025-06-01T09:00:00.000Z" },
  { id: "EMPD009", orgId: "ORGDEMOUI", name: "Kavya Sharma", role: "Finance Analyst", department: "Finance", location: "Bengaluru", status: "Active", joinedOn: "2025-11-15", salary: "INR 17L", createdAt: "2025-11-15T09:00:00.000Z" },
  { id: "EMPD010", orgId: "ORGDEMOUI", name: "Ishaan Verma", role: "ML Engineer", department: "Engineering", location: "Bengaluru", status: "Onboarding", joinedOn: "2026-04-14", salary: "INR 26L", createdAt: "2026-04-01T09:00:00.000Z" },
];

export const DEMO_OPENINGS: JobOpeningRecord[] = [
  { id: "JOBD001", orgId: "ORGDEMOUI", title: "Senior Frontend Engineer", department: "Engineering", location: "Bengaluru", priority: "Urgent", applicantCount: 28, stage: "Applied", createdAt: "2026-04-01T09:00:00.000Z" },
  { id: "JOBD002", orgId: "ORGDEMOUI", title: "Product Manager", department: "Product", location: "Remote", priority: "Normal", applicantCount: 12, stage: "Screening", createdAt: "2026-04-01T09:00:00.000Z" },
  { id: "JOBD003", orgId: "ORGDEMOUI", title: "Data Scientist", department: "Analytics", location: "Hyderabad", priority: "Urgent", applicantCount: 6, stage: "Interview", createdAt: "2026-04-01T09:00:00.000Z" },
  { id: "JOBD004", orgId: "ORGDEMOUI", title: "UX Researcher", department: "Design", location: "Mumbai", priority: "Normal", applicantCount: 2, stage: "Offer", createdAt: "2026-04-01T09:00:00.000Z" },
];

export const DEMO_JOINERS: OnboardingJoinerRecord[] = [
  {
    id: "ONBD001",
    orgId: "ORGDEMOUI",
    name: "Ishaan Verma",
    role: "ML Engineer",
    department: "Engineering",
    startDate: "2026-04-14",
    progress: 33,
    avatar: "IV",
    createdAt: "2026-04-01T09:00:00.000Z",
    tasks: [
      { id: "TSKD001", joinerId: "ONBD001", section: "Pre-joining", label: "Offer Letter Signed", done: true, sortOrder: 1 },
      { id: "TSKD002", joinerId: "ONBD001", section: "Pre-joining", label: "Background Verification", done: true, sortOrder: 2 },
      { id: "TSKD003", joinerId: "ONBD001", section: "Day 1 Setup", label: "Laptop Assigned", done: true, sortOrder: 3 },
      { id: "TSKD004", joinerId: "ONBD001", section: "Day 1 Setup", label: "Email and Slack Access", done: false, sortOrder: 4 },
      { id: "TSKD005", joinerId: "ONBD001", section: "Week 1", label: "HR Induction Session", done: false, sortOrder: 5 },
      { id: "TSKD006", joinerId: "ONBD001", section: "30-Day Goals", label: "First Project Kickoff", done: false, sortOrder: 6 },
    ],
  },
  {
    id: "ONBD002",
    orgId: "ORGDEMOUI",
    name: "Pooja Hegde",
    role: "UX Researcher",
    department: "Design",
    startDate: "2026-04-07",
    progress: 67,
    avatar: "PH",
    createdAt: "2026-04-01T09:00:00.000Z",
    tasks: [
      { id: "TSKD007", joinerId: "ONBD002", section: "Pre-joining", label: "Offer Letter Signed", done: true, sortOrder: 1 },
      { id: "TSKD008", joinerId: "ONBD002", section: "Pre-joining", label: "Background Verification", done: true, sortOrder: 2 },
      { id: "TSKD009", joinerId: "ONBD002", section: "Day 1 Setup", label: "Laptop Assigned", done: true, sortOrder: 3 },
      { id: "TSKD010", joinerId: "ONBD002", section: "Day 1 Setup", label: "Email and Slack Access", done: true, sortOrder: 4 },
      { id: "TSKD011", joinerId: "ONBD002", section: "Week 1", label: "HR Induction Session", done: true, sortOrder: 5 },
      { id: "TSKD012", joinerId: "ONBD002", section: "30-Day Goals", label: "First Project Kickoff", done: false, sortOrder: 6 },
    ],
  },
];

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

export function getDemoEmployeesDashboard() {
  const active = DEMO_EMPLOYEES.filter((e) => e.status === "Active").length;
  const onLeave = DEMO_EMPLOYEES.filter((e) => e.status === "On Leave").length;
  const onboarding = DEMO_EMPLOYEES.filter((e) => e.status === "Onboarding").length;
  return {
    employees: DEMO_EMPLOYEES,
    stats: [
      { label: "Total", value: String(DEMO_EMPLOYEES.length), color: "#4f46e5" },
      { label: "Active", value: String(active), color: "#10b981" },
      { label: "On Leave", value: String(onLeave), color: "#f59e0b" },
      { label: "Onboarding", value: String(onboarding), color: "#8b5cf6" },
    ],
    view: DEMO_EMPLOYEES.map((employee) => ({ ...employee, joinedLabel: monthYear(employee.joinedOn) })),
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

export function getDemoRecruitmentDashboard() {
  const openings = DEMO_OPENINGS;
  const stages = ["Applied", "Screening", "Interview", "Offer"];
  const colors = ["#7b8099", "#4f46e5", "#f59e0b", "#10b981"];
  return {
    openings,
    pipeline: stages.map((stage, index) => ({
      stage,
      color: colors[index],
      count: openings.filter((opening) => opening.stage === stage).length,
      roles: openings.filter((opening) => opening.stage === stage).map((role) => ({
        id: role.id,
        title: role.title,
        department: role.department,
        location: role.location,
        applicants: role.applicantCount,
        priority: role.priority,
      })),
    })),
  };
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

export function getDemoOnboardingDashboard() {
  const joiners = DEMO_JOINERS.map((joiner) => ({
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
    joiners,
    stats: [
      { label: "Joining This Month", value: String(joiners.length), sub: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date()) },
      { label: "In Progress", value: String(joiners.filter((joiner) => joiner.progress > 0 && joiner.progress < 100).length), sub: "Active onboarding" },
      { label: "Completed", value: String(joiners.filter((joiner) => joiner.progress >= 100).length), sub: "Fully onboarded" },
      { label: "Avg Completion", value: `${joiners.length ? Math.round(joiners.reduce((sum, joiner) => sum + joiner.progress, 0) / joiners.length) : 0}%`, sub: "Across all joiners" },
    ],
  };
}
