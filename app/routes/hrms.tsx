import HRMSLayout from "../components/HRMSLayout";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms";
import { DEMO_USER, getDashboardData, getDemoDashboardData } from "../lib/hrms.server";
import { isAdminRole } from "../lib/hrms.shared";
import { requireSignedInUser } from "../lib/session.server";

const colors = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9"];

export function meta() {
  return [{ title: "PeopleOS - Dashboard" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env.HRMS);
  const dashboard = currentUser.id === DEMO_USER.id
    ? getDemoDashboardData()
    : await getDashboardData(context.cloudflare.env.HRMS, currentUser.orgId ?? undefined);

  return {
    currentUser,
    ...dashboard,
  };
}

export default function HRMSDashboard() {
  const data = useLoaderData<typeof loader>();

  return (
    <HRMSLayout>
      <div className="page-title">Welcome, {data.currentUser.name}</div>
      <div className="page-sub">
        {data.organization?.name
          ? `${data.organization.name} workspace · ${isAdminRole(data.currentUser.role) ? "Admin" : "Employee"} access`
          : "Your dashboard is powered by live D1 data from Cloudflare."}
      </div>

      <div className="stat-grid">
        {data.stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <div className={`stat-delta ${stat.tone === "warning" ? "delta-down" : stat.tone === "positive" ? "delta-up" : ""}`}>
              {stat.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Team Snapshot</div>
            {isAdminRole(data.currentUser.role) ? (
              <Link to="/hrms/users" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>Manage users →</Link>
            ) : null}
          </div>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Joined</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.recentUsers.length === 0 ? (
                <tr><td colSpan={4} style={{ color: "var(--ink-3)" }}>No users found in D1 yet.</td></tr>
              ) : (
                data.recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{user.department}</div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.joinedOn}</td>
                    <td><span className={`badge ${user.status === "Active" ? "badge-green" : "badge-amber"}`}>{user.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>Pending Invite Activity</div>
            <span className="badge badge-red">{data.pendingInvites.length} pending</span>
          </div>
          {data.pendingInvites.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>There are no outstanding invites right now.</div>
          ) : (
            data.pendingInvites.map((invite) => (
              <div key={invite.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{invite.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{invite.role} · {invite.department}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{invite.detail}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Workforce by Department</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.departmentData.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Department breakdown will appear once users are added.</div>
          ) : (
            data.departmentData.map((item, index) => (
              <div key={item.department} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 140, fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{item.department}</div>
                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 99, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${item.percent}%`, background: colors[index % colors.length], height: "100%", borderRadius: 99 }} />
                </div>
                <div style={{ width: 60, fontSize: 13, fontWeight: 700, color: "var(--ink)", textAlign: "right" }}>{item.count}</div>
                <div style={{ width: 44, fontSize: 12, color: "var(--ink-3)" }}>{item.percent}%</div>
              </div>
            ))
          )}
        </div>
      </div>
    </HRMSLayout>
  );
}
