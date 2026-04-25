// Employee Custom Fields CRUD
export async function listEmployeeCustomFields(db: D1Database, employeeId: string) {
  const result = await db.prepare(
    `SELECT id, field_name, field_value, created_at, updated_at FROM employee_custom_fields WHERE employee_id = ? ORDER BY created_at DESC`
  ).bind(employeeId).all<Record<string, unknown>>();
  return result.results;
}

export async function addEmployeeCustomField(db: D1Database, employeeId: string, data: { field_name: string; field_value: string }) {
  const id = `CF${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO employee_custom_fields (id, employee_id, field_name, field_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, employeeId, data.field_name, data.field_value, now, now).run();
}

// Employee Documents CRUD
export async function listEmployeeDocuments(db: D1Database, employeeId: string) {
  const result = await db.prepare(
    `SELECT id, doc_type, file_name, file_url, uploaded_at FROM employee_documents WHERE employee_id = ? ORDER BY uploaded_at DESC`
  ).bind(employeeId).all<Record<string, unknown>>();
  return result.results;
}

export async function addEmployeeDocument(db: D1Database, employeeId: string, data: { doc_type: string; file_name: string; file_url: string }) {
  const id = `DOC${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO employee_documents (id, employee_id, doc_type, file_name, file_url, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, employeeId, data.doc_type, data.file_name, data.file_url, now).run();
}
// Fetch a single employee by ID
export async function getEmployeeById(db: D1Database, id: string): Promise<EmployeeRecord | null> {
  const result = await db
    .prepare(
      `SELECT id, company_id, org_id, name, role, department, location, status, joined_on, salary, created_at
       FROM employees
       WHERE id = ?`
    )
    .bind(id)
    .first<Record<string, unknown>>();
  return result ? mapEmployee(result) : null;
}

// Update employee details (personal, employment, bank, etc.)
export async function updateEmployee(
  db: D1Database,
  id: string,
  updates: Partial<{
    name: string;
    dob: string;
    gender: string;
    address: string;
    emergencyContact: string;
    idProof: string;
    designation: string;
    grade: string;
    reportingManager: string;
    costCenter: string;
    accountHolder: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    branch: string;
    // Add more fields as needed
  }>
): Promise<void> {
  const fields = Object.keys(updates).filter((k) => updates[k as keyof typeof updates] !== undefined);
  if (!fields.length) return;
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => updates[f as keyof typeof updates]);
  values.push(new Date().toISOString(), id);
  await db
    .prepare(
      `UPDATE employees SET ${setClause}, updated_at = ? WHERE id = ?`
    )
    .bind(...values)
    .run();
}
export interface EmployeeRecord {
  id: string;
  companyId: string;
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
  companyId: string;
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

export interface OnboardingTechAllocation {
  id: string;
  joinerId: string;
  assetType: string;
  assetTag: string;
  serialNo: string;
  notes: string;
  allocatedAt: string;
}

export interface OnboardingJoinerRecord {
  id: string;
  companyId: string;
  name: string;
  role: string;
  department: string;
  startDate: string;
  email: string;
  phone: string;
  offerSigned: boolean;
  bgCheck: boolean;
  docsCollected: boolean;
  welcomeSent: boolean;
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
  companyId: string;
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
  const companyId = String(row.company_id ?? row.org_id ?? "");
  return {
    id: String(row.id),
    companyId,
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

export interface EmployeeProfileRecord extends EmployeeRecord {
  dob: string;
  gender: string;
  address: string;
  emergencyContact: string;
  idProof: string;
  designation: string;
  grade: string;
  reportingManager: string;
  costCenter: string;
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  profilePhotoUrl: string;
}

function mapEmployeeProfile(row: Record<string, unknown>): EmployeeProfileRecord {
  return {
    ...mapEmployee(row),
    dob: String(row.dob ?? ""),
    gender: String(row.gender ?? ""),
    address: String(row.address ?? ""),
    emergencyContact: String(row.emergency_contact ?? ""),
    idProof: String(row.id_proof ?? ""),
    designation: String(row.designation ?? ""),
    grade: String(row.grade ?? ""),
    reportingManager: String(row.reporting_manager ?? ""),
    costCenter: String(row.cost_center ?? ""),
    accountHolder: String(row.account_holder ?? ""),
    bankName: String(row.bank_name ?? ""),
    accountNumber: String(row.account_number ?? ""),
    ifsc: String(row.ifsc ?? ""),
    branch: String(row.branch ?? ""),
    profilePhotoUrl: String(row.profile_photo_url ?? ""),
  };
}

export interface EmployeeWorkHistoryItem {
  id: string;
  company: string;
  role: string;
  duration: string;
  description: string;
}

export interface EmployeeCustomFieldItem {
  id: string;
  fieldName: string;
  fieldValue: string;
}

export interface EmployeeDocumentItem {
  id: string;
  docType: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

export async function getEmployeeProfileById(
  db: D1Database,
  companyId: string,
  employeeId: string,
): Promise<EmployeeProfileRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, company_id, org_id, name, role, department, location, status, joined_on, salary, created_at,
              dob, gender, address, emergency_contact, id_proof,
              designation, grade, reporting_manager, cost_center,
              account_holder, bank_name, account_number, ifsc, branch, profile_photo_url
       FROM employees
       WHERE id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(employeeId, companyId)
    .first<Record<string, unknown>>();

  return row ? mapEmployeeProfile(row) : null;
}

export async function updateEmployeeProfileById(
  db: D1Database,
  companyId: string,
  employeeId: string,
  updates: Partial<{
    name: string;
    dob: string;
    gender: string;
    address: string;
    emergencyContact: string;
    idProof: string;
    designation: string;
    grade: string;
    reportingManager: string;
    costCenter: string;
    accountHolder: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    branch: string;
    profilePhotoUrl: string;
  }>,
): Promise<void> {
  const columnMap = {
    name: "name",
    dob: "dob",
    gender: "gender",
    address: "address",
    emergencyContact: "emergency_contact",
    idProof: "id_proof",
    designation: "designation",
    grade: "grade",
    reportingManager: "reporting_manager",
    costCenter: "cost_center",
    accountHolder: "account_holder",
    bankName: "bank_name",
    accountNumber: "account_number",
    ifsc: "ifsc",
    branch: "branch",
    profilePhotoUrl: "profile_photo_url",
  } as const;

  const entries = Object.entries(updates)
    .filter(([, value]) => value !== undefined)
    .filter(([key]) => key in columnMap) as Array<[keyof typeof columnMap, string]>;

  if (entries.length === 0) return;

  const setClause = entries.map(([key]) => `${columnMap[key]} = ?`).join(", ");
  const values = entries.map(([, value]) => String(value).trim());
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE employees
       SET ${setClause}, updated_at = ?
       WHERE id = ? AND COALESCE(company_id, org_id) = ?`,
    )
    .bind(...values, now, employeeId, companyId)
    .run();
}

export async function listEmployeeWorkHistoryByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
): Promise<EmployeeWorkHistoryItem[]> {
  const result = await db
    .prepare(
      `SELECT h.id, h.company, h.role, h.duration, h.description
       FROM employee_work_history h
       JOIN employees e ON e.id = h.employee_id
      WHERE h.employee_id = ? AND COALESCE(e.company_id, e.org_id) = ?
       ORDER BY datetime(h.created_at) DESC`,
    )
    .bind(employeeId, companyId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    company: String(row.company),
    role: String(row.role),
    duration: String(row.duration),
    description: String(row.description ?? ""),
  }));
}

export async function addEmployeeWorkHistoryByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
  data: { company: string; role: string; duration: string; description?: string },
): Promise<void> {
  const exists = await db
    .prepare(`SELECT 1 as ok FROM employees WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(employeeId, companyId)
    .first<{ ok: number }>();
  if (!exists) return;

  const id = `WH${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO employee_work_history (id, employee_id, company, role, duration, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, employeeId, data.company.trim(), data.role.trim(), data.duration.trim(), (data.description ?? "").trim(), now, now)
    .run();
}

export async function deleteEmployeeWorkHistoryByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
  workHistoryId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM employee_work_history
       WHERE id = ?
         AND employee_id = ?
         AND employee_id IN (SELECT id FROM employees WHERE id = ? AND COALESCE(company_id, org_id) = ?)`,
    )
    .bind(workHistoryId, employeeId, employeeId, companyId)
    .run();
}

export async function listEmployeeCustomFieldsByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
): Promise<EmployeeCustomFieldItem[]> {
  const result = await db
    .prepare(
      `SELECT c.id, c.field_name, c.field_value
       FROM employee_custom_fields c
       JOIN employees e ON e.id = c.employee_id
      WHERE c.employee_id = ? AND COALESCE(e.company_id, e.org_id) = ?
       ORDER BY datetime(c.created_at) DESC`,
    )
    .bind(employeeId, companyId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    fieldName: String(row.field_name),
    fieldValue: String(row.field_value ?? ""),
  }));
}

export async function addEmployeeCustomFieldByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
  data: { fieldName: string; fieldValue: string },
): Promise<void> {
  const exists = await db
    .prepare(`SELECT 1 as ok FROM employees WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(employeeId, companyId)
    .first<{ ok: number }>();
  if (!exists) return;

  const id = `CF${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO employee_custom_fields (id, employee_id, field_name, field_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, employeeId, data.fieldName.trim(), data.fieldValue.trim(), now, now)
    .run();
}

export async function deleteEmployeeCustomFieldByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
  customFieldId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM employee_custom_fields
       WHERE id = ?
         AND employee_id = ?
         AND employee_id IN (SELECT id FROM employees WHERE id = ? AND COALESCE(company_id, org_id) = ?)`,
    )
    .bind(customFieldId, employeeId, employeeId, companyId)
    .run();
}

export async function listEmployeeDocumentsByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
): Promise<EmployeeDocumentItem[]> {
  const result = await db
    .prepare(
      `SELECT d.id, d.doc_type, d.file_name, d.file_url, d.uploaded_at
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id
      WHERE d.employee_id = ? AND COALESCE(e.company_id, e.org_id) = ?
       ORDER BY datetime(d.uploaded_at) DESC`,
    )
    .bind(employeeId, companyId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    docType: String(row.doc_type),
    fileName: String(row.file_name),
    fileUrl: String(row.file_url),
    uploadedAt: String(row.uploaded_at),
  }));
}

export async function addEmployeeDocumentByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
  data: { docType: string; fileName: string; fileUrl: string },
): Promise<void> {
  const exists = await db
    .prepare(`SELECT 1 as ok FROM employees WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(employeeId, companyId)
    .first<{ ok: number }>();
  if (!exists) return;

  const id = `DOC${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO employee_documents (id, employee_id, doc_type, file_name, file_url, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, employeeId, data.docType.trim(), data.fileName.trim(), data.fileUrl, now)
    .run();
}

export async function deleteEmployeeDocumentByOrg(
  db: D1Database,
  companyId: string,
  employeeId: string,
  documentId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM employee_documents
       WHERE id = ?
         AND employee_id = ?
         AND employee_id IN (SELECT id FROM employees WHERE id = ? AND COALESCE(company_id, org_id) = ?)`,
    )
    .bind(documentId, employeeId, employeeId, companyId)
    .run();
}

function mapOpening(row: Record<string, unknown>): JobOpeningRecord {
  const companyId = String(row.company_id ?? row.org_id ?? "");
  return {
    id: String(row.id),
    companyId,
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

export async function listEmployees(db: D1Database, companyId: string): Promise<EmployeeRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, company_id, org_id, name, role, department, location, status, joined_on, salary, created_at
       FROM employees
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY date(joined_on) DESC, name ASC`,
    )
    .bind(companyId)
    .all<Record<string, unknown>>();

  return result.results.map(mapEmployee);
}

export async function createEmployee(
  db: D1Database,
  input: {
    companyId: string;
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
      `INSERT INTO employees (id, company_id, org_id, name, role, department, location, status, joined_on, salary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.companyId, input.companyId, input.name.trim(), input.role.trim(), input.department.trim(), input.location.trim(), input.status.trim(), input.joinedOn, input.salary.trim(), now, now)
    .run();
}

export async function getEmployeesDashboard(db: D1Database, companyId: string) {
  const employees = await listEmployees(db, companyId);
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


export async function listJobOpenings(db: D1Database, companyId: string): Promise<JobOpeningRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, company_id, org_id, title, department, location, priority, applicant_count, stage, created_at
       FROM job_openings
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .bind(companyId)
    .all<Record<string, unknown>>();

  return result.results.map(mapOpening);
}

export async function createJobOpening(
  db: D1Database,
  input: {
    companyId: string;
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
      `INSERT INTO job_openings (id, company_id, org_id, title, department, location, priority, applicant_count, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Applied', ?, ?)`,
    )
    .bind(id, input.companyId, input.companyId, input.title.trim(), input.department.trim(), input.location.trim(), input.priority.trim(), now, now)
    .run();
}

export async function getRecruitmentDashboard(db: D1Database, companyId: string) {
  const openings = await listJobOpenings(db, companyId);
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


export async function listOnboardingJoiners(db: D1Database, companyId: string): Promise<OnboardingJoinerRecord[]> {
  const joinersResult = await db
    .prepare(
      `SELECT id, company_id, org_id, name, role, department, start_date, progress, avatar,
              email, phone, offer_signed, bg_check, docs_collected, welcome_sent, created_at
       FROM onboarding_joiners
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY date(start_date) ASC, datetime(created_at) DESC`,
    )
    .bind(companyId)
    .all<Record<string, unknown>>();

  const tasksResult = await db
    .prepare(
      `SELECT id, joiner_id, section, label, done, sort_order
       FROM onboarding_tasks
       WHERE joiner_id IN (SELECT id FROM onboarding_joiners WHERE COALESCE(company_id, org_id) = ?)
       ORDER BY section, sort_order ASC`,
    )
    .bind(companyId)
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
    companyId: String(row.company_id ?? row.org_id ?? ""),
    name: String(row.name),
    role: String(row.role),
    department: String(row.department),
    startDate: String(row.start_date),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    offerSigned: Boolean(row.offer_signed),
    bgCheck: Boolean(row.bg_check),
    docsCollected: Boolean(row.docs_collected),
    welcomeSent: Boolean(row.welcome_sent),
    progress: Number(row.progress ?? 0),
    avatar: String(row.avatar),
    createdAt: String(row.created_at),
    tasks: taskMap.get(String(row.id)) ?? [],
  }));
}

export async function createOnboardingJoiner(
  db: D1Database,
  input: {
    companyId: string;
    name: string;
    role: string;
    department: string;
    startDate: string;
    email?: string;
    phone?: string;
  },
): Promise<string> {
  const id = `ONB${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO onboarding_joiners (id, company_id, org_id, name, role, department, start_date, progress, avatar, email, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.companyId, input.companyId, input.name.trim(), input.role.trim(), input.department.trim(), input.startDate, initials(input.name), (input.email ?? "").trim(), (input.phone ?? "").trim(), now, now)
    .run();

  const statements = defaultOnboardingTemplate.map(([section, label], index) =>
    db.prepare(
      `INSERT INTO onboarding_tasks (id, joiner_id, section, label, done, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(`TSK${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`, id, section, label, index + 1, now, now),
  );

  await db.batch(statements);
  return id;
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

export async function getOnboardingDashboard(db: D1Database, companyId: string) {
  const joiners = await listOnboardingJoiners(db, companyId);
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


export async function listExitProcesses(db: D1Database, companyId: string): Promise<ExitProcessRecord[]> {
  const exitsResult = await db
    .prepare(
      `SELECT id, company_id, org_id, name, employee_code, role, department, exit_type, notice_period, last_day, progress, reason, created_at
       FROM exit_processes
       WHERE COALESCE(company_id, org_id) = ?
       ORDER BY date(last_day) ASC, datetime(created_at) DESC`,
    )
    .bind(companyId)
    .all<Record<string, unknown>>();

  const tasksResult = await db
    .prepare(
      `SELECT id, exit_id, label, done, sort_order
       FROM exit_tasks
       WHERE exit_id IN (SELECT id FROM exit_processes WHERE COALESCE(company_id, org_id) = ?)
       ORDER BY sort_order ASC`,
    )
    .bind(companyId)
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
    companyId: String(row.company_id ?? row.org_id ?? ""),
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
    companyId: string;
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
      `INSERT INTO exit_processes (id, company_id, org_id, name, employee_code, role, department, exit_type, notice_period, last_day, progress, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '-', ?, ?)`,
    )
    .bind(
      id,
      input.companyId,
      input.companyId,
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

export async function getExitDashboard(db: D1Database, companyId: string) {
  const [exits, headcount] = await Promise.all([
    listExitProcesses(db, companyId),
    db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE COALESCE(company_id, org_id) = ? AND status NOT IN ('Inactive','inactive')")
      .bind(companyId)
      .first<{ cnt: number }>(),
  ]);
  return { exits, totalEmployees: headcount?.cnt ?? 0 };
}

// ── Onboarding: Pre-boarding status ─────────────────────────────────────────

export async function updatePreBoarding(
  db: D1Database,
  companyId: string,
  joinerId: string,
  data: {
    offerSigned?: boolean;
    bgCheck?: boolean;
    docsCollected?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const parts: string[] = [];
  const values: unknown[] = [];
  if (data.offerSigned !== undefined) { parts.push("offer_signed = ?"); values.push(data.offerSigned ? 1 : 0); }
  if (data.bgCheck !== undefined) { parts.push("bg_check = ?"); values.push(data.bgCheck ? 1 : 0); }
  if (data.docsCollected !== undefined) { parts.push("docs_collected = ?"); values.push(data.docsCollected ? 1 : 0); }
  if (!parts.length) return;
  parts.push("updated_at = ?");
  values.push(now, joinerId, companyId);
  await db
    .prepare(`UPDATE onboarding_joiners SET ${parts.join(", ")} WHERE id = ? AND COALESCE(company_id, org_id) = ?`)
    .bind(...values)
    .run();
}

export async function markWelcomeSent(
  db: D1Database,
  joinerId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE onboarding_joiners SET welcome_sent = 1, updated_at = ? WHERE id = ?`)
    .bind(now, joinerId)
    .run();
}

// ── Onboarding: Tech Allocations ─────────────────────────────────────────────

export async function listTechAllocations(
  db: D1Database,
  joinerId: string,
): Promise<OnboardingTechAllocation[]> {
  const result = await db
    .prepare(
      `SELECT id, joiner_id, asset_type, asset_tag, serial_no, notes, allocated_at
       FROM onboarding_tech_allocations
       WHERE joiner_id = ?
       ORDER BY datetime(allocated_at) ASC`,
    )
    .bind(joinerId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    joinerId: String(row.joiner_id),
    assetType: String(row.asset_type),
    assetTag: String(row.asset_tag ?? ""),
    serialNo: String(row.serial_no ?? ""),
    notes: String(row.notes ?? ""),
    allocatedAt: String(row.allocated_at),
  }));
}

export async function addTechAllocation(
  db: D1Database,
  companyId: string,
  joinerId: string,
  data: {
    assetType: string;
    assetTag?: string;
    serialNo?: string;
    notes?: string;
  },
): Promise<string> {
  const id = `TEC${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO onboarding_tech_allocations (id, company_id, org_id, joiner_id, asset_type, asset_tag, serial_no, notes, allocated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, companyId, companyId, joinerId, data.assetType.trim(), (data.assetTag ?? "").trim(), (data.serialNo ?? "").trim(), (data.notes ?? "").trim(), now, now)
    .run();
  return id;
}

export async function deleteTechAllocation(
  db: D1Database,
  companyId: string,
  allocationId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM onboarding_tech_allocations
       WHERE id = ?
         AND joiner_id IN (SELECT id FROM onboarding_joiners WHERE id = joiner_id AND COALESCE(company_id, org_id) = ?)`,
    )
    .bind(allocationId, companyId)
    .run();
}

