import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.employees";
import HRMSLayout from "../components/HRMSLayout";
import { DEMO_USER } from "../lib/hrms.server";
import { requireSignedInUser } from "../lib/session.server";
import { createEmployee, getDemoEmployeesDashboard, getEmployeesDashboard } from "../lib/workforce.server";

const departments = ["All", "Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance", "Operations"];
const statuses = ["All", "Active", "Onboarding", "On Leave"];

type ActionResult = { ok: boolean; message: string; type: "success" | "error" };

export function meta() {
  return [{ title: "PeopleOS - Employees" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  const data = currentUser.id === DEMO_USER.id
    ? getDemoEmployeesDashboard()
    : currentUser.orgId
      ? await getEmployeesDashboard(context.cloudflare.env.HRMS, currentUser.orgId)
      : getDemoEmployeesDashboard();

  return { currentUser, ...data };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  if (currentUser.id === DEMO_USER.id) {
    return { ok: false, type: "error", message: "Demo workspace employee records are read-only." };
  }
  if (!currentUser.orgId) {
    return { ok: false, type: "error", message: "Organization not found for this user." };
  }

  const formData = await request.formData();
  await createEmployee(context.cloudflare.env.HRMS, {
    orgId: currentUser.orgId,
    name: String(formData.get("name") || "").trim(),
    role: String(formData.get("role") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    location: String(formData.get("location") || "").trim(),
    joinedOn: String(formData.get("joinedOn") || "").trim(),
    salary: String(formData.get("salary") || "").trim(),
    status: String(formData.get("status") || "Active").trim(),
  });

  return { ok: true, type: "success", message: "Employee added successfully." };
}

export default function Employees() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (fetcher.data) {
      setToast(fetcher.data);
      if (fetcher.data.ok) {
        setShowForm(false);
      }
    }
  }, [fetcher.data]);

  const filtered = useMemo(() => data.view.filter((employee) => {
    const matchSearch = employee.name.toLowerCase().includes(search.toLowerCase()) || employee.role.toLowerCase().includes(search.toLowerCase());
    const matchDepartment = department === "All" || employee.department === department;
    const matchStatus = status === "All" || employee.status === status;
    return matchSearch && matchDepartment && matchStatus;
  }), [data.view, search, department, status]);

  return (
    <HRMSLayout>
      {toast ? <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "success" ? "var(--green)" : "var(--red)", color: "white", padding: "12px 20px", borderRadius: 10, fontSize: 13 }}>{toast.message}</div> : null}
      <div className="page-title">Employees</div>
      <div className="page-sub">Manage your workforce with real employee records.</div>

      <div className="stat-grid">
        {data.stats.map((stat) => (
          <div className="stat-card" key={stat.label} style={{ borderTop: `3px solid ${stat.color}` }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {showForm ? (
        <fetcher.Form method="post" className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Add Employee</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input name="name" placeholder="Full name" style={fieldStyle} />
            <input name="role" placeholder="Role" style={fieldStyle} />
            <select name="department" style={fieldStyle}>{departments.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select>
            <input name="location" placeholder="Location" style={fieldStyle} />
            <input name="joinedOn" type="date" style={fieldStyle} />
            <input name="salary" placeholder="INR 12L" style={fieldStyle} />
            <select name="status" style={fieldStyle}>{statuses.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Saving..." : "Save Employee"}</button>
            <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : null}

      <div className="card">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees..." style={{ flex: 1, minWidth: 200, padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
          <select value={department} onChange={(event) => setDepartment(event.target.value)} style={selectStyle}>
            {departments.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} style={selectStyle}>
            {statuses.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Employee</button>
        </div>

        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Department</th><th>Location</th><th>Joined</th><th>Salary</th><th>Status</th></tr>
          </thead>
          <tbody>
            {filtered.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>{employee.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{employee.id} · {employee.role}</div>
                </td>
                <td>{employee.department}</td>
                <td>{employee.location}</td>
                <td>{employee.joinedLabel}</td>
                <td style={{ fontWeight: 600 }}>{employee.salary}</td>
                <td><span className={`badge ${employee.status === "Active" ? "badge-green" : employee.status === "Onboarding" ? "badge-blue" : "badge-amber"}`}>{employee.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HRMSLayout>
  );
}

const fieldStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 };
const selectStyle: CSSProperties = { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" };
