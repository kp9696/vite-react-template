import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("hrms", "routes/hrms.tsx"),
  route("hrms/employees", "routes/hrms.employees.tsx"),
  route("hrms/employees/:id", "routes/hrms.employee.$id.tsx"),
  route("hrms/recruitment", "routes/hrms.recruitment.tsx"),
  route("hrms/onboarding", "routes/hrms.onboarding.tsx"),
  route("hrms/leave", "routes/hrms.leave.tsx"),
  route("hrms/payroll", "routes/hrms.payroll.tsx"),
  route("hrms/expenses", "routes/hrms.expenses.tsx"),
  route("hrms/performance", "routes/hrms.performance.tsx"),
  route("hrms/learning", "routes/hrms.learning.tsx"),
  route("hrms/assets", "routes/hrms.assets.tsx"),
  route("hrms/exit", "routes/hrms.exit.tsx"),
  route("hrms/analytics", "routes/hrms.analytics.tsx"),
  route("hrms/hrbot", "routes/hrms.hrbot.tsx"),
  route("hrms/users", "routes/hrms.users.tsx"),
] satisfies RouteConfig;
