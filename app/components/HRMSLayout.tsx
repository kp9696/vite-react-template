import { useState } from "react";
import { Form, Link, useLocation } from "react-router";

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  email: string;
}

const DEMO_USER_ID = "USRDEMO01";

const nav = [
  { label: "Dashboard", icon: "⬛", path: "/hrms" },
  { label: "Employees", icon: "👥", path: "/hrms/employees" },
  { label: "Recruitment", icon: "🎯", path: "/hrms/recruitment" },
  { label: "Onboarding", icon: "🚀", path: "/hrms/onboarding" },
  { label: "Leave", icon: "🗓️", path: "/hrms/leave" },
  { label: "Payroll", icon: "💰", path: "/hrms/payroll" },
  { label: "Expenses", icon: "🧾", path: "/hrms/expenses" },
  { label: "Performance", icon: "📈", path: "/hrms/performance" },
  { label: "Learning", icon: "🎓", path: "/hrms/learning" },
  { label: "Assets", icon: "💻", path: "/hrms/assets" },
  { label: "Exit Mgmt", icon: "🚪", path: "/hrms/exit" },
  { label: "Analytics", icon: "📊", path: "/hrms/analytics" },
  { label: "HRBot AI", icon: "🤖", path: "/hrms/hrbot" },
  { label: "User Mgmt", icon: "🔐", path: "/hrms/users" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function HRMSLayout({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser?: CurrentUser;
}) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const isDemo = currentUser?.id === DEMO_USER_ID;
  const initials = currentUser ? getInitials(currentUser.name) : "?";

  return (
    <div className="hrms-shell">
      {isDemo ? (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
          color: "white", fontSize: 12, fontWeight: 600,
          padding: "7px 20px", textAlign: "center", letterSpacing: 0.2,
        }}>
          Demo workspace — all data is sample data. Create your own account to manage a real team.
          <a href="/register" style={{ color: "#c4b5fd", marginLeft: 12, textDecoration: "underline", fontWeight: 700 }}>
            Get started free →
          </a>
        </div>
      ) : null}

      <aside className={`hrms-sidebar ${collapsed ? "collapsed" : ""}`} style={{ top: isDemo ? 33 : 0 }}>
        <div className="sidebar-header">
          <div className="logo-mark">JK</div>
          {!collapsed ? <span className="logo-text">JWithKP</span> : null}
          {!collapsed && isDemo ? (
            <span style={{
              marginLeft: "auto", marginRight: 6,
              background: "rgba(99,102,241,0.25)", color: "#c4b5fd",
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
              letterSpacing: 0.5, textTransform: "uppercase",
            }}>
              Demo
            </span>
          ) : null}
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <nav className="sidebar-nav">
          {nav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed ? <span className="nav-label">{item.label}</span> : null}
              {!collapsed && location.pathname === item.path ? <span className="active-dot" /> : null}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="avatar">{initials}</div>
            {!collapsed && currentUser ? (
              <div className="user-info">
                <span className="user-name" title={currentUser.email}>{currentUser.name}</span>
                <span className="user-role">{currentUser.role}</span>
              </div>
            ) : null}
          </div>
          <Form method="post" action="/login" style={{ marginTop: 8 }}>
            <input type="hidden" name="intent" value="logout" />
            <button
              type="submit"
              title="Sign Out"
              style={{
                width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.5)", borderRadius: 8, padding: "7px 10px",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 8,
              }}
            >
              <span>↩</span>{!collapsed ? " Sign Out" : null}
            </button>
          </Form>
        </div>
      </aside>

      <main className="hrms-main" style={{ marginTop: isDemo ? 33 : 0 }}>
        <header className="hrms-topbar">
          <div className="topbar-breadcrumb">
            {nav.find((item) => item.path === location.pathname)?.label ?? "Dashboard"}
          </div>
          <div className="topbar-actions">
            <button className="topbar-btn">🔔</button>
            <button className="topbar-btn">⚙️</button>
            <div className="topbar-date">
              {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </div>
          </div>
        </header>
        <div className="hrms-content">{children}</div>
      </main>

      <style>{`
        :root {
          --ink: #0f1117;
          --ink-2: #3d4152;
          --ink-3: #7b8099;
          --border: #e8eaf0;
          --surface: #f4f5f9;
          --card: #ffffff;
          --accent: #4f46e5;
          --accent-light: #eef2ff;
          --green: #10b981;
          --green-light: #ecfdf5;
          --amber: #f59e0b;
          --amber-light: #fffbeb;
          --red: #ef4444;
          --red-light: #fef2f2;
          --sidebar-w: 220px;
          --sidebar-w-collapsed: 64px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Segoe UI', sans-serif; background: var(--surface); color: var(--ink); }
        .hrms-shell { display: flex; min-height: 100vh; }
        .hrms-sidebar {
          width: var(--sidebar-w);
          background: var(--ink);
          display: flex;
          flex-direction: column;
          transition: width 0.25s ease;
          position: fixed;
          left: 0; bottom: 0;
          z-index: 100;
          overflow: hidden;
        }
        .hrms-sidebar.collapsed { width: var(--sidebar-w-collapsed); }
        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 20px 16px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          position: relative;
        }
        .logo-mark {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 8px;
          display: grid; place-items: center;
          font-weight: 800; font-size: 16px;
          color: white;
          flex-shrink: 0;
        }
        .logo-text {
          font-size: 16px; font-weight: 700;
          color: white; letter-spacing: -0.3px;
          white-space: nowrap;
        }
        .collapse-btn {
          margin-left: auto;
          background: rgba(255,255,255,0.08);
          border: none; color: white;
          width: 22px; height: 22px;
          border-radius: 6px;
          cursor: pointer; font-size: 14px;
          display: grid; place-items: center;
          flex-shrink: 0;
        }
        .sidebar-nav {
          flex: 1;
          min-height: 0;
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 8px;
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          font-size: 13.5px;
          font-weight: 500;
          transition: all 0.15s;
          position: relative;
          white-space: nowrap;
        }
        .nav-item:hover { background: rgba(255,255,255,0.07); color: white; }
        .nav-item.active { background: var(--accent); color: white; }
        .nav-icon { font-size: 16px; flex-shrink: 0; width: 20px; text-align: center; }
        .active-dot {
          width: 6px; height: 6px;
          background: rgba(255,255,255,0.7);
          border-radius: 50%;
          margin-left: auto;
        }
        .sidebar-footer {
          flex-shrink: 0;
          padding: 12px 10px 20px;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .user-pill {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(255,255,255,0.06);
        }
        .avatar {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 50%;
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700;
          color: white; flex-shrink: 0;
        }
        .user-name { display: block; font-size: 13px; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
        .user-role { display: block; font-size: 11px; color: rgba(255,255,255,0.45); }
        .user-info { overflow: hidden; }
        .hrms-main {
          flex: 1;
          margin-left: var(--sidebar-w);
          transition: margin-left 0.25s ease;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        .hrms-sidebar.collapsed ~ .hrms-main { margin-left: var(--sidebar-w-collapsed); }
        .hrms-topbar {
          background: var(--card);
          border-bottom: 1px solid var(--border);
          padding: 0 28px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky; top: 0; z-index: 50;
        }
        .topbar-breadcrumb { font-size: 15px; font-weight: 700; color: var(--ink); }
        .topbar-actions { display: flex; align-items: center; gap: 8px; }
        .topbar-btn {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 8px; width: 36px; height: 36px;
          cursor: pointer; font-size: 15px;
          display: grid; place-items: center;
        }
        .topbar-date {
          font-size: 12px; color: var(--ink-3);
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 6px 12px; border-radius: 8px;
          font-weight: 500;
        }
        .hrms-content { padding: 28px; flex: 1; }
        .page-title { font-size: 22px; font-weight: 800; color: var(--ink); letter-spacing: -0.4px; margin-bottom: 4px; }
        .page-sub { font-size: 13px; color: var(--ink-3); margin-bottom: 24px; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
        .stat-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
        }
        .stat-label { font-size: 12px; font-weight: 600; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .stat-value { font-size: 28px; font-weight: 800; color: var(--ink); letter-spacing: -1px; }
        .stat-delta { font-size: 12px; margin-top: 4px; }
        .delta-up { color: var(--green); }
        .delta-down { color: var(--red); }
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .card-title { font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 16px; }
        .table { width: 100%; border-collapse: collapse; }
        .table th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-3); padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
        .table td { font-size: 13px; color: var(--ink-2); padding: 12px 12px; border-bottom: 1px solid var(--border); }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: var(--surface); }
        .badge {
          display: inline-flex; align-items: center;
          padding: 3px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 600;
        }
        .badge-green { background: var(--green-light); color: var(--green); }
        .badge-amber { background: var(--amber-light); color: var(--amber); }
        .badge-red { background: var(--red-light); color: var(--red); }
        .badge-blue { background: var(--accent-light); color: var(--accent); }
        .btn {
          padding: 8px 16px; border-radius: 8px;
          font-size: 13px; font-weight: 600;
          cursor: pointer; border: none;
          transition: all 0.15s;
        }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--ink-2); }
        .btn-outline:hover { background: var(--surface); }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        @media (max-width: 1024px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
          .two-col { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
