import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { useState } from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────
interface KPIProps {
  label: string;
  value: number | string;
  trend?: number;
  color?: string;
}

interface ChartData {
  name: string;
  value: number;
  [key: string]: any;
}

interface BIDashboardProps {
  totalEmployees: number;
  presentToday: number;
  pendingApprovals: number;
  attendanceRate: number;
  deptHeadcount?: { dept: string; headcount: number }[];
  hiringTrend?: { month: string; hired: number; left: number }[];
  leaveBreakdown?: { type: string; used: number }[];
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

function KPICard({ label, value, trend, color = "#6366f1" }: KPIProps) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      {trend !== undefined && (
        <div style={{ fontSize: 12, color: trend >= 0 ? "#10b981" : "#ef4444", marginTop: 4 }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

export default function BIDashboard({
  totalEmployees,
  presentToday,
  pendingApprovals,
  attendanceRate,
  deptHeadcount = [],
  hiringTrend = [],
  leaveBreakdown = [],
}: BIDashboardProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <KPICard label="Total Employees" value={totalEmployees} color="#6366f1" />
        <KPICard label="Present Today" value={presentToday} color="#10b981" />
        <KPICard label="Pending Approvals" value={pendingApprovals} color="#f59e0b" />
        <KPICard label="Attendance Rate" value={`${attendanceRate}%`} color="#3b82f6" />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* Dept headcount bar */}
        {deptHeadcount.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Headcount by Department</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deptHeadcount}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="headcount" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Hiring trend */}
        {hiringTrend.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Hiring Trend</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hiringTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="hired" stroke="#10b981" fill="#d1fae5" />
                <Area type="monotone" dataKey="left" stroke="#ef4444" fill="#fee2e2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Leave breakdown pie */}
        {leaveBreakdown.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Leave Breakdown</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={leaveBreakdown} dataKey="used" nameKey="type" cx="50%" cy="50%" outerRadius={80} label>
                  {leaveBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
