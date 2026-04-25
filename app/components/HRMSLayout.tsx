import { useState, useRef, useEffect } from "react";
import { Form, Link, useLocation, useFetcher } from "react-router";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  email: string;
}

const adminNavGroups = [
  {
    title: "Core",
    items: [
      { label: "Dashboard",   icon: SVGGrid,      path: "/hrms" },
      { label: "Employees",   icon: SVGUsers,     path: "/hrms/employees" },
      { label: "Recruitment", icon: SVGTarget,    path: "/hrms/recruitment" },
      { label: "Offer Letters", icon: SVGEnvelope,  path: "/hrms/offer-letters" },
      { label: "Onboarding",  icon: SVGRocket,    path: "/hrms/onboarding" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Leave",       icon: SVGCalendar,  path: "/hrms/leave" },
      { label: "Attendance",  icon: SVGClock,     path: "/hrms/attendance" },
      { label: "Payroll",     icon: SVGCoin,      path: "/hrms/payroll" },
      { label: "IT Decl.",    icon: SVGShield,    path: "/hrms/it-declaration" },
      { label: "Expenses",    icon: SVGReceipt,   path: "/hrms/expenses" },
      { label: "Loans",       icon: SVGCoin2,     path: "/hrms/loans" },
      { label: "Performance", icon: SVGTrending,  path: "/hrms/performance" },
      { label: "Learning",    icon: SVGBook,      path: "/hrms/learning" },
      { label: "Assets",      icon: SVGLaptop,    path: "/hrms/assets" },
      { label: "Holidays",    icon: SVGCalendar,  path: "/hrms/holidays" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Exit Mgmt",   icon: SVGDoor,         path: "/hrms/exit" },
      { label: "Resignation",  icon: SVGDoor,         path: "/hrms/resignation" },
      { label: "F&F Settlement", icon: SVGHandCoins,  path: "/hrms/fnf" },
      { label: "Analytics",   icon: SVGChart,        path: "/hrms/analytics" },
      { label: "Reports",     icon: SVGClipboard,    path: "/hrms/reports" },
      { label: "HRBot AI",    icon: SVGBot,          path: "/hrms/hrbot" },
      { label: "Noticeboard", icon: SVGMegaphone,    path: "/hrms/announcements" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Help Desk",   icon: SVGTicket,       path: "/hrms/helpdesk" },
      { label: "Documents",   icon: SVGFolder,       path: "/hrms/documents" },
      { label: "Shifts",      icon: SVGClock2,       path: "/hrms/shifts" },
      { label: "Settings",    icon: SVGSettings,     path: "/hrms/settings" },
      { label: "Setup",       icon: SVGRocket2,      path: "/hrms/setup" },
    ],
  },
];

const employeeNavGroups = [
  {
    title: "My Work",
    items: [
      { label: "Dashboard",   icon: SVGGrid,       path: "/hrms" },
      { label: "Attendance",  icon: SVGClock,      path: "/hrms/attendance" },
      { label: "Expenses",    icon: SVGReceipt,    path: "/hrms/expenses" },
      { label: "Loans",       icon: SVGCoin2,      path: "/hrms/loans" },
    ],
  },
  {
    title: "View Only",
    items: [
      { label: "Leave",       icon: SVGCalendar,   path: "/hrms/leave" },
      { label: "Payroll",     icon: SVGCoin,       path: "/hrms/payroll" },
      { label: "IT Decl.",    icon: SVGShield,     path: "/hrms/it-declaration" },
      { label: "Assets",      icon: SVGLaptop,     path: "/hrms/assets" },
      { label: "Holidays",    icon: SVGCalendar,   path: "/hrms/holidays" },
      { label: "Resign",      icon: SVGDoor,       path: "/hrms/resignation" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "Help Desk",   icon: SVGTicket,     path: "/hrms/helpdesk" },
      { label: "Noticeboard", icon: SVGMegaphone,  path: "/hrms/announcements" },
      { label: "My Shifts",   icon: SVGClock2,     path: "/hrms/shifts" },
      { label: "Documents",   icon: SVGFolder,     path: "/hrms/documents" },
      { label: "HRBot AI",    icon: SVGBot,        path: "/hrms/hrbot" },
    ],
  },
];

function getNavGroups(role?: string) {
  return role && !isAdminRole(role) ? employeeNavGroups : adminNavGroups;
}

const allAdminNav = adminNavGroups.flatMap((g) => g.items);
const allEmployeeNav = employeeNavGroups.flatMap((g) => g.items);

// ─── Inline SVG icons (16×16) ──────────────────────────────
function SVGGrid() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function SVGUsers() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function SVGTarget() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>; }
function SVGRocket() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>; }
function SVGCalendar() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function SVGClock() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>; }
function SVGCoin() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2m-4-5h5a2 2 0 0 0 0-4H9a2 2 0 0 1 0-4h5"/></svg>; }
function SVGReceipt() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8H8m8 4H8m5 4H8"/></svg>; }
function SVGTrending() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>; }
function SVGBook() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }
function SVGLaptop() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55A1 1 0 0 1 20.37 20H3.63a1 1 0 0 1-.91-1.45L4 16"/></svg>; }
function SVGDoor() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M13 4H3v16h10V4z"/><path d="M17 8l4 4-4 4m4-4H9"/></svg>; }
function SVGChart() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function SVGBot() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 3v4m-3.5 4h7M9 15h1m5 0h1"/><path d="M7 11V9a5 5 0 0 1 10 0v2"/></svg>; }
function SVGShield() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function SVGBell() { return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function SVGSearch() { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function SVGSignOut() { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }

function SVGMegaphone() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>; }
function SVGFolder() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function SVGClipboard() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>; }
function SVGClock2() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function SVGRocket2() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>; }
function SVGSettings() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>; }
function SVGCoin2() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M6 12h.01M18 12h.01"/></svg>; }
function SVGHandCoins() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M11 15h2a2 2 0 0 0 0-4H9a2 2 0 0 1 0-4h2"/><path d="M12 6v2m0 8v2"/><path d="M5 9H3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2"/></svg>; }

function SVGEnvelope() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>; }
function SVGTicket() { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="9" y1="9" x2="9" y2="15"/></svg>; }
function SVGMenu() { return <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>; }

export default function HRMSLayout({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser?: CurrentUser;
}) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const avatarRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const initials = currentUser ? getInitials(currentUser.name) : "?";
  const accentColor = currentUser ? avatarColor(currentUser.name) : "#6366f1";
  const navGroups = getNavGroups(currentUser?.role);
  const allNav = currentUser && !isAdminRole(currentUser.role) ? allEmployeeNav : allAdminNav;
  const currentPage = allNav.find((item) => item.path === location.pathname);

  // useFetcher targets the /hrms/notifications React Router proxy route (which uses callCoreHrmsApi server-side)
  const notifFetcher = useFetcher<{ notifications: Notification[]; unreadCount: number }>();
  const markFetcher = useFetcher();

  // Sync fetcher data into local state
  useEffect(() => {
    if (notifFetcher.data?.notifications) {
      setNotifications(notifFetcher.data.notifications);
      setUnreadCount(notifFetcher.data.unreadCount ?? 0);
    }
  }, [notifFetcher.data]);

  // Load notifications on route change
  useEffect(() => {
    if (!currentUser) return;
    notifFetcher.load("/hrms/notifications");
  }, [location.pathname, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps
  const brandingFetcher = useFetcher<{ companyName: string | null; companyLogoUrl: string | null }>();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  // Load branding once on mount
  useEffect(() => {
    if (!currentUser) return;
    brandingFetcher.load("/hrms/branding");
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (brandingFetcher.data?.companyName != null) setCompanyName(brandingFetcher.data.companyName);
    if (brandingFetcher.data?.companyLogoUrl != null) {
      setCompanyLogoUrl(brandingFetcher.data.companyLogoUrl);
      setLogoLoadFailed(false);
    }
  }, [brandingFetcher.data]);

  const handleMarkAllRead = () => {
    markFetcher.submit(
      { intent: "mark-all-read" },
      { method: "POST", action: "/hrms/notifications" },
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleMarkOneRead = (notifId: string, link: string | null) => {
    markFetcher.submit(
      { intent: "mark-one-read", id: notifId },
      { method: "POST", action: "/hrms/notifications" },
    );
    setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (link) window.location.href = link;
    setBellOpen(false);
  };

  const notifTypeIcon: Record<string, string> = {
    leave_approved: "✅",
    leave_rejected: "❌",
    payroll_processed: "💰",
    onboarding_task: "🚀",
    general: "🔔",
  };

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="hrms-shell">
      {/* ── Mobile overlay backdrop ── */}
      {mobileSidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`hrms-sidebar ${collapsed ? "collapsed" : ""} ${mobileSidebarOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top-strip" />

        <div className="sidebar-header">
          {companyLogoUrl && !logoLoadFailed ? (
            <img
              src={companyLogoUrl}
              alt={companyName ?? "Company logo"}
              onError={() => setLogoLoadFailed(true)}
              style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div className="logo-mark">
              <span style={{ color: "white", fontWeight: 800, fontSize: 12, letterSpacing: -0.5 }}>
                {companyName ? companyName.slice(0, 2).toUpperCase() : "JK"}
              </span>
            </div>
          )}
          {!collapsed ? (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, overflow: "hidden" }}>
              <span className="logo-text" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {companyName ?? "JWithKP"}
              </span>
              <span className="logo-sub">HRMS Platform</span>
            </div>
          ) : null}
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <nav className="sidebar-nav">
          {collapsed
            ? allNav.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path} className={`nav-item ${isActive ? "active" : ""}`} title={item.label}>
                    <span className="nav-icon"><Icon /></span>
                  </Link>
                );
              })
            : navGroups.map((group) => (
                <div key={group.title} className="nav-group">
                  <div className="nav-group-label">{group.title}</div>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    return (
                      <Link key={item.path} to={item.path} className={`nav-item ${isActive ? "active" : ""}`}>
                        <span className="nav-icon"><Icon /></span>
                        <span className="nav-label">{item.label}</span>
                        {isActive ? <span className="nav-active-dot" /> : null}
                      </Link>
                    );
                  })}
                </div>
              ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="avatar" style={{ background: accentColor }} title={currentUser?.email}>
              {initials}
            </div>
            {!collapsed && currentUser ? (
              <div className="user-info">
                <span className="user-name" title={currentUser.email}>{currentUser.name}</span>
                <span className="user-role">{currentUser.role}</span>
              </div>
            ) : null}
          </div>
          <Form method="post" action="/login" style={{ marginTop: 6 }}>
            <input type="hidden" name="intent" value="logout" />
            <button type="submit" title="Sign Out" className="signout-btn">
              <SVGSignOut />
              {!collapsed ? <span>Sign Out</span> : null}
            </button>
          </Form>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="hrms-main">
        <header className="hrms-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            title="Open menu"
          >
            <SVGMenu />
          </button>
          <div className="topbar-left">
            <div className="topbar-page-icon">
              {currentPage ? <currentPage.icon /> : <SVGGrid />}
            </div>
            <div>
              <div className="topbar-title">{currentPage?.label ?? "Dashboard"}</div>
              {currentUser ? <div className="topbar-role">{currentUser.role} · {currentUser.name}</div> : null}
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-search-wrap">
              <span className="topbar-search-icon"><SVGSearch /></span>
              <input className="topbar-search" placeholder="Quick search…" readOnly />
            </div>
            <div className="topbar-date">
              {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
            {/* ── Notifications Bell ── */}
            <div ref={bellRef} style={{ position: "relative" }}>
              <button
                className="topbar-icon-btn"
                title="Notifications"
                onClick={() => {
                  setBellOpen((v) => !v);
                  if (!bellOpen && currentUser) {
                    notifFetcher.load("/hrms/notifications");
                  }
                }}
                style={{ position: "relative" }}
              >
                <SVGBell />
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute", top: -4, right: -4,
                    background: "#ef4444", color: "white",
                    fontSize: 9, fontWeight: 700,
                    minWidth: 16, height: 16, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 3px", lineHeight: 1,
                    border: "2px solid white",
                    pointerEvents: "none",
                  }}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 10px)", right: 0,
                  background: "white", border: "1px solid var(--border)",
                  borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                  width: 340, zIndex: 999,
                  animation: "scaleIn 0.15s cubic-bezier(0.16,1,0.3,1)",
                  transformOrigin: "top right",
                  overflow: "hidden",
                }}>
                  {/* Header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderBottom: "1px solid var(--border)",
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                      Notifications
                      {unreadCount > 0 && (
                        <span style={{
                          marginLeft: 6, background: "#ef4444", color: "white",
                          fontSize: 10, fontWeight: 700, padding: "1px 6px",
                          borderRadius: 10,
                        }}>{unreadCount}</span>
                      )}
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        style={{
                          fontSize: 11, color: "var(--accent)", fontWeight: 600,
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {/* Notification list */}
                  <div style={{ maxHeight: 360, overflowY: "auto" }}>
                    {notifications.length === 0 ? (
                      <div style={{
                        padding: "32px 16px", textAlign: "center",
                        color: "var(--ink-3)", fontSize: 12,
                      }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                        <div style={{ fontWeight: 600 }}>You're all caught up!</div>
                        <div style={{ marginTop: 4, opacity: 0.7 }}>No notifications yet</div>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleMarkOneRead(n.id, n.link)}
                          style={{
                            display: "flex", gap: 10, padding: "10px 16px",
                            cursor: n.link ? "pointer" : "default",
                            background: n.read ? "transparent" : "rgba(99,102,241,0.04)",
                            borderBottom: "1px solid var(--border)",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.07)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = n.read ? "transparent" : "rgba(99,102,241,0.04)"; }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "var(--accent-light)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, flexShrink: 0,
                          }}>
                            {notifTypeIcon[n.type] ?? "🔔"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              alignItems: "flex-start", gap: 4,
                            }}>
                              <span style={{
                                fontSize: 12, fontWeight: n.read ? 500 : 700,
                                color: "var(--ink)", lineHeight: 1.3,
                              }}>{n.title}</span>
                              <span style={{
                                fontSize: 10, color: "var(--ink-3)", flexShrink: 0,
                                marginTop: 1,
                              }}>{timeAgo(n.created_at)}</span>
                            </div>
                            {n.body && (
                              <div style={{
                                fontSize: 11, color: "var(--ink-3)", marginTop: 2,
                                lineHeight: 1.4, overflow: "hidden",
                                display: "-webkit-box", WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}>{n.body}</div>
                            )}
                          </div>
                          {!n.read && (
                            <div style={{
                              width: 7, height: 7, borderRadius: "50%",
                              background: "#6366f1", flexShrink: 0, marginTop: 4,
                            }} />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Avatar with dropdown */}
            <div ref={avatarRef} style={{ position: "relative" }}>
              <div
                className="topbar-avatar"
                style={{ background: accentColor, cursor: "pointer" }}
                title={currentUser?.email}
                onClick={() => setAvatarOpen((v) => !v)}
              >
                {initials}
              </div>
              {avatarOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 10px)", right: 0,
                  background: "white", border: "1px solid var(--border)",
                  borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                  minWidth: 220, zIndex: 999,
                  animation: "scaleIn 0.15s cubic-bezier(0.16,1,0.3,1)",
                  transformOrigin: "top right",
                }}>
                  {/* User info header */}
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: accentColor,
                        display: "grid", placeItems: "center",
                        fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0,
                      }}>{initials}</div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                          {currentUser?.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                          {currentUser?.email}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        background: "var(--accent-light)", color: "var(--accent)",
                        border: "1px solid #c7d2fe", textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        {currentUser?.role}
                      </span>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div style={{ padding: "6px 0" }}>
                    {currentUser && (
                      <Link
                        to={`/hrms/profile/${currentUser.id}`}
                        onClick={() => setAvatarOpen(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 16px", color: "var(--ink-2)",
                          textDecoration: "none", fontSize: 13, fontWeight: 500,
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        View Profile
                      </Link>
                    )}
                    <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                    <Form method="post" action="/login" style={{ padding: "2px 8px" }}>
                      <input type="hidden" name="intent" value="logout" />
                      <button type="submit" style={{
                        width: "100%", background: "transparent", border: "none",
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px", borderRadius: 8, color: "#ef4444",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                        transition: "background 0.1s", fontFamily: "inherit",
                        textAlign: "left",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <SVGSignOut />
                        Sign Out
                      </button>
                    </Form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="hrms-content">{children}</div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,300..800&display=swap');

        /* ── Design Tokens ─────────────────────────────── */
        :root {
          --sidebar-bg:       #141929;
          --sidebar-bg2:      #1b2236;
          --ink:              #0f172a;
          --ink-2:            #334155;
          --ink-3:            #94a3b8;
          --border:           #e2e8f0;
          --surface:          #f1f5fd;
          --card:             #ffffff;
          --accent:           #6366f1;
          --accent-2:         #8b5cf6;
          --accent-grad:      linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          --accent-light:     #eef2ff;
          --green:            #10b981;
          --green-light:      #ecfdf5;
          --amber:            #f59e0b;
          --amber-light:      #fffbeb;
          --red:              #ef4444;
          --red-light:        #fef2f2;
          --blue:             #3b82f6;
          --blue-light:       #eff6ff;
          --teal:             #0d9488;
          --teal-light:       #f0fdfa;
          --purple:           #7c3aed;
          --purple-light:     #f5f3ff;
          --sidebar-w:        232px;
          --sidebar-w-col:    60px;
          --topbar-h:         60px;
          --radius:           12px;
          --radius-sm:        8px;
          --shadow-xs:        0 1px 2px rgba(0,0,0,0.05);
          --shadow-sm:        0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
          --shadow-md:        0 4px 20px rgba(99,102,241,0.1), 0 2px 8px rgba(0,0,0,0.06);
          --shadow-lg:        0 20px 60px rgba(0,0,0,0.2);
        }

        /* ── Reset & Base ──────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          background: var(--surface); color: var(--ink);
          -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
          font-size: 14px;
        }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--ink-3); }

        input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
        select, textarea { transition: border-color 0.15s, box-shadow 0.15s; }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.14) !important;
        }

        /* ── Animations ────────────────────────────────── */
        @keyframes slideInRight { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

        /* ── Shell ─────────────────────────────────────── */
        .hrms-shell { display: flex; min-height: 100vh; }

        /* ── Sidebar ───────────────────────────────────── */
        .hrms-sidebar {
          width: var(--sidebar-w);
          background: var(--sidebar-bg);
          display: flex; flex-direction: column;
          transition: width 0.25s cubic-bezier(0.4,0,0.2,1);
          position: fixed; top: 0; left: 0; bottom: 0;
          z-index: 100; overflow: hidden;
          box-shadow: 2px 0 20px rgba(0,0,0,0.25);
        }
        .hrms-sidebar.collapsed { width: var(--sidebar-w-col); }

        .sidebar-top-strip {
          height: 3px; flex-shrink: 0;
          background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
        }

        .sidebar-header {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 14px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .logo-mark {
          width: 34px; height: 34px; flex-shrink: 0;
          background: var(--accent-grad);
          border-radius: 10px; display: grid; place-items: center;
          box-shadow: 0 4px 14px rgba(99,102,241,0.5);
        }
        .logo-text {
          font-size: 14.5px; font-weight: 700; color: white;
          letter-spacing: -0.4px; white-space: nowrap;
        }
        .logo-sub {
          font-size: 9.5px; color: rgba(255,255,255,0.3);
          font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase;
          margin-top: 1px;
        }
        .collapse-btn {
          margin-left: auto;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.45); width: 24px; height: 24px;
          border-radius: 6px; cursor: pointer; font-size: 14px;
          display: grid; place-items: center; flex-shrink: 0;
          transition: all 0.15s;
        }
        .collapse-btn:hover { background: rgba(255,255,255,0.13); color: white; }

        .sidebar-nav {
          flex: 1; min-height: 0; padding: 8px 8px;
          display: flex; flex-direction: column; overflow-y: auto;
        }
        .nav-group { margin-bottom: 4px; }
        .nav-group-label {
          font-size: 9.5px; font-weight: 600; letter-spacing: 0.9px;
          text-transform: uppercase; color: rgba(255,255,255,0.22);
          padding: 10px 10px 4px; white-space: nowrap;
        }
        .nav-item {
          display: flex; align-items: center; gap: 9px;
          padding: 8px 10px; border-radius: var(--radius-sm);
          color: rgba(255,255,255,0.48);
          text-decoration: none; font-size: 13px; font-weight: 500;
          transition: all 0.14s;
          position: relative; white-space: nowrap;
        }
        .nav-item:hover {
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.82);
        }
        .nav-item.active {
          background: linear-gradient(90deg, rgba(99,102,241,0.28), rgba(139,92,246,0.2));
          color: #a5b4fc;
          border: 1px solid rgba(99,102,241,0.3);
          box-shadow: 0 2px 12px rgba(99,102,241,0.18);
        }
        .nav-icon {
          flex-shrink: 0; width: 18px; display: flex; align-items: center; justify-content: center;
        }
        .nav-item.active .nav-icon { color: #818cf8; }
        .nav-label { flex: 1; }
        .nav-active-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #818cf8; flex-shrink: 0;
          box-shadow: 0 0 6px rgba(99,102,241,0.8);
          animation: pulse-dot 2s ease infinite;
        }

        .sidebar-footer {
          flex-shrink: 0; padding: 10px 8px 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .user-pill {
          display: flex; align-items: center; gap: 9px; padding: 9px;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          margin-bottom: 6px;
        }
        .avatar {
          width: 32px; height: 32px; border-radius: 50%;
          display: grid; place-items: center;
          font-size: 11.5px; font-weight: 700; color: white; flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .user-info { overflow: hidden; flex: 1; }
        .user-name {
          display: block; font-size: 12.5px; font-weight: 600;
          color: rgba(255,255,255,0.88); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; max-width: 120px;
        }
        .user-role {
          display: block; font-size: 10.5px;
          color: rgba(255,255,255,0.35); margin-top: 1px;
        }
        .signout-btn {
          width: 100%; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.35); border-radius: var(--radius-sm);
          padding: 7px 10px; font-size: 11.5px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 7px;
          transition: all 0.15s; letter-spacing: 0.2px; text-transform: uppercase;
          font-family: inherit;
        }
        .signout-btn:hover { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.2); }

        /* ── Main ──────────────────────────────────────── */
        .hrms-main {
          flex: 1; margin-left: var(--sidebar-w);
          transition: margin-left 0.25s cubic-bezier(0.4,0,0.2,1);
          display: flex; flex-direction: column; min-height: 100vh;
        }
        .hrms-sidebar.collapsed ~ .hrms-main { margin-left: var(--sidebar-w-col); }

        /* ── Topbar ────────────────────────────────────── */
        .hrms-topbar {
          background: var(--card);
          border-bottom: 1px solid var(--border);
          padding: 0 24px; height: var(--topbar-h);
          display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 50;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .topbar-left { display: flex; align-items: center; gap: 12px; }
        .topbar-page-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--accent-light);
          display: grid; place-items: center; color: var(--accent); flex-shrink: 0;
        }
        .topbar-title { font-size: 14.5px; font-weight: 700; color: var(--ink); letter-spacing: -0.2px; }
        .topbar-role { font-size: 11px; color: var(--ink-3); margin-top: 1px; font-weight: 400; }
        .topbar-right { display: flex; align-items: center; gap: 8px; }
        .topbar-search-wrap { position: relative; }
        .topbar-search-icon {
          position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
          color: var(--ink-3); display: flex; align-items: center; pointer-events: none;
        }
        .topbar-search {
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: var(--radius-sm); padding: 7px 12px 7px 32px;
          font-size: 13px; color: var(--ink); width: 190px;
          transition: all 0.2s; cursor: pointer; font-family: inherit;
        }
        .topbar-search::placeholder { color: var(--ink-3); }
        .topbar-search:focus { width: 230px; outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        .topbar-date {
          font-size: 12px; color: var(--ink-3); background: var(--surface);
          border: 1.5px solid var(--border); padding: 6px 12px;
          border-radius: var(--radius-sm); font-weight: 500; white-space: nowrap;
        }
        .topbar-icon-btn {
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: var(--radius-sm); width: 36px; height: 36px;
          cursor: pointer; color: var(--ink-3);
          display: grid; place-items: center; transition: all 0.15s;
        }
        .topbar-icon-btn:hover { background: var(--accent-light); border-color: #c7d2fe; color: var(--accent); }
        .topbar-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: grid; place-items: center;
          font-size: 12px; font-weight: 700; color: white; cursor: pointer; flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.18);
          transition: transform 0.15s;
        }
        .topbar-avatar:hover { transform: scale(1.06); }
        .hrms-content { padding: 28px; flex: 1; animation: fadeIn 0.2s ease; }

        /* ── Page Header ───────────────────────────────── */
        .page-title {
          font-size: 21px; font-weight: 800; color: var(--ink);
          letter-spacing: -0.6px; margin-bottom: 3px; line-height: 1.2;
        }
        .page-sub { font-size: 13px; color: var(--ink-3); margin-bottom: 24px; line-height: 1.5; }

        /* ── Stat Cards ────────────────────────────────── */
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 20px 20px 16px;
          position: relative; overflow: hidden;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .stat-card::after {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--accent-grad);
        }
        .stat-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
        .stat-label {
          font-size: 11px; font-weight: 600; color: var(--ink-3);
          text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px;
        }
        .stat-value {
          font-size: 32px; font-weight: 800; color: var(--ink);
          letter-spacing: -1.5px; line-height: 1;
        }
        .stat-delta { font-size: 12px; margin-top: 7px; font-weight: 500; }
        .delta-up { color: var(--green); }
        .delta-down { color: var(--red); }

        /* ── Cards ─────────────────────────────────────── */
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 20px; margin-bottom: 20px;
          transition: box-shadow 0.18s ease;
        }
        .card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .card-title {
          font-size: 13.5px; font-weight: 700; color: var(--ink);
          margin-bottom: 16px; letter-spacing: -0.2px;
        }

        /* ── Table ─────────────────────────────────────── */
        .table { width: 100%; border-collapse: collapse; }
        .table th {
          font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.7px; color: var(--ink-3);
          padding: 8px 12px; text-align: left; border-bottom: 2px solid var(--border);
        }
        .table td {
          font-size: 13px; color: var(--ink-2);
          padding: 12px; border-bottom: 1px solid var(--border);
          transition: background 0.1s;
        }
        .table tr:last-child td { border-bottom: none; }
        .table tr:hover td { background: #fafbff; }

        /* ── Badges ────────────────────────────────────── */
        .badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.1px;
        }
        .badge-green { background: var(--green-light); color: #059669; }
        .badge-amber { background: var(--amber-light); color: #d97706; }
        .badge-red { background: var(--red-light); color: #dc2626; }
        .badge-blue { background: var(--accent-light); color: var(--accent); }
        .badge-teal { background: var(--teal-light); color: var(--teal); }
        .badge-purple { background: var(--purple-light); color: var(--purple); }

        /* ── Buttons ───────────────────────────────────── */
        .btn {
          padding: 8px 16px; border-radius: var(--radius-sm);
          font-size: 13px; font-weight: 600; cursor: pointer; border: none;
          transition: all 0.15s;
          display: inline-flex; align-items: center; gap: 6px;
          letter-spacing: -0.1px; font-family: inherit;
        }
        .btn-primary {
          background: var(--accent-grad); color: white;
          box-shadow: 0 2px 12px rgba(99,102,241,0.35);
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99,102,241,0.45); }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--ink-2);
        }
        .btn-outline:hover:not(:disabled) { background: var(--surface); border-color: #cbd5e1; }
        .btn-success { background: var(--green-light); color: #059669; border: 1px solid #a7f3d0; }
        .btn-success:hover { background: #d1fae5; }
        .btn-danger { background: var(--red-light); color: #dc2626; border: 1px solid #fecaca; }
        .btn-danger:hover { background: #fee2e2; }

        /* ── Layouts ───────────────────────────────────── */
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

        /* ── Tabs ──────────────────────────────────────── */
        .tab-bar {
          display: flex; gap: 2px; background: var(--surface); padding: 3px;
          border-radius: 10px; width: fit-content; margin-bottom: 20px;
          border: 1.5px solid var(--border);
        }
        .tab-btn {
          padding: 7px 18px; border-radius: 8px; border: none; cursor: pointer;
          font-size: 13px; font-weight: 600; transition: all 0.15s;
          background: transparent; color: var(--ink-3); font-family: inherit;
        }
        .tab-btn.active {
          background: white; color: var(--ink);
          box-shadow: 0 1px 6px rgba(0,0,0,0.08);
        }
        .tab-btn:hover:not(.active) { color: var(--ink-2); }

        /* ── Search ────────────────────────────────────── */
        .search-wrap { position: relative; }
        .search-wrap input { padding-left: 34px !important; }
        .search-icon {
          position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
          font-size: 14px; color: var(--ink-3); pointer-events: none;
        }

        /* ── Progress ──────────────────────────────────── */
        .progress-track { background: var(--surface); border-radius: 99px; height: 8px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }

        /* ── Modal ─────────────────────────────────────── */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.55);
          backdrop-filter: blur(4px); z-index: 999;
          display: flex; align-items: center; justify-content: center;
          animation: fadeIn 0.15s ease;
        }
        .modal-box {
          background: white; border-radius: 18px; padding: 28px;
          width: 480px; max-width: calc(100vw - 40px);
          box-shadow: var(--shadow-lg);
          animation: scaleIn 0.2s cubic-bezier(0.16,1,0.3,1);
          max-height: 90vh; overflow-y: auto;
          border: 1px solid var(--border);
        }
        .modal-title {
          font-size: 16px; font-weight: 800; color: var(--ink);
          margin-bottom: 20px; letter-spacing: -0.3px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .modal-close {
          background: var(--surface); border: none; width: 28px; height: 28px;
          border-radius: 50%; cursor: pointer; font-size: 16px;
          display: grid; place-items: center; color: var(--ink-3);
          transition: all 0.12s; flex-shrink: 0;
        }
        .modal-close:hover { background: var(--border); color: var(--ink); }

        /* ── Misc ──────────────────────────────────────── */
        .divider { height: 1px; background: var(--border); margin: 16px 0; }

        .empty-state { text-align: center; padding: 52px 20px; color: var(--ink-3); }
        .empty-state-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }
        .empty-state-title { font-size: 14px; font-weight: 600; color: var(--ink-2); margin-bottom: 4px; }
        .empty-state-sub { font-size: 13px; }

        .toast {
          position: fixed; top: 20px; right: 20px; z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 18px; border-radius: 12px;
          font-size: 13px; font-weight: 600;
          box-shadow: var(--shadow-lg);
          animation: slideInRight 0.28s cubic-bezier(0.16,1,0.3,1);
          min-width: 220px;
        }
        .toast-success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .toast-error { background: var(--red-light); color: #dc2626; border: 1px solid #fecaca; }

        .avatar-sm {
          width: 28px; height: 28px; border-radius: 50%;
          display: inline-grid; place-items: center;
          font-size: 11px; font-weight: 700; color: white; flex-shrink: 0;
          vertical-align: middle;
        }

        /* ── Mobile hamburger button ───────────────────── */
        .mobile-menu-btn {
          display: none;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          width: 36px; height: 36px;
          cursor: pointer; color: var(--ink-2);
          align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.15s;
          margin-right: 4px;
        }
        .mobile-menu-btn:hover { background: var(--accent-light); border-color: #c7d2fe; color: var(--accent); }

        /* ── Mobile overlay ────────────────────────────── */
        .mobile-overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.5);
          z-index: 99;
          backdrop-filter: blur(2px);
          animation: fadeIn 0.15s ease;
        }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width: 1100px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
          .two-col { grid-template-columns: 1fr; }
          .three-col { grid-template-columns: 1fr 1fr; }
          .topbar-search-wrap { display: none; }
          .topbar-date { display: none; }
        }

        @media (max-width: 768px) {
          /* Show hamburger, hide collapse button */
          .mobile-menu-btn { display: flex; }
          .collapse-btn { display: none; }

          /* Sidebar becomes off-canvas overlay */
          .hrms-sidebar {
            transform: translateX(-100%);
            transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1);
            width: var(--sidebar-w) !important;
            z-index: 200;
          }
          .hrms-sidebar.mobile-open {
            transform: translateX(0);
          }
          /* Mobile: main content takes full width */
          .hrms-main { margin-left: 0 !important; }

          /* Tables scroll horizontally */
          .card { overflow-x: auto; }
          .table { min-width: 560px; }

          .hrms-content { padding: 14px; }
          .stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .stat-value { font-size: 22px !important; }
          .three-col { grid-template-columns: 1fr; }
          .page-title { font-size: 17px; }
          .topbar-role { display: none; }
        }

        @media (max-width: 480px) {
          .stat-grid { grid-template-columns: 1fr; gap: 10px; }
          .hrms-content { padding: 12px; }
          .modal-box { padding: 18px; }
        }
      `}</style>
    </div>
  );
}
