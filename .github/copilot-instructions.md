# Copilot Master Instructions (Project Scope Guard)

These instructions apply to all future Copilot tasks in this repository.

## 0) Cross-Agent Compatibility
- This same operating contract is mirrored in `CLAUDE.md` for Claude-based agents.
- For each new task, use `TASK_SCOPE.md` as the active task contract.
- If `TASK_SCOPE.md` conflicts with a broad default rule, follow `TASK_SCOPE.md` for that task.

## 1) Respect Working Setup
- If something is already working, do not reconfigure it.
- Do not rotate/change secrets, auth config, env vars, DB bindings, or deployment settings unless explicitly requested.
- Do not modify `wrangler.json`, Worker secrets, migrations, or routing behavior unless the current task directly requires it.

## 2) Stay Task-Scoped
- Work only on the exact user request.
- Edit only files directly related to the requested feature/bug.
- Do not do broad refactors, cleanup passes, or architecture changes unless asked.
- Ignore unrelated errors/warnings outside the current task scope, and report them separately if needed.

## 3) Minimal Change Policy
- Prefer smallest safe diff.
- Keep existing APIs, behavior, and styling unless the task asks to change them.
- Avoid touching stable modules for convenience.

## 4) Safe Execution Policy
- Do not run deploys by default.
- Run build/test only when needed to validate the requested change.
- If deployment is needed, ask first unless the user explicitly asked to deploy.

## 5) UI/Feature Work Policy
- Preserve existing design language unless redesign is requested.
- For frontend tasks, change only target components/routes.
- Do not alter global layout/navigation unless required by the task.

## 6) Communication Policy
- Briefly state what files will be changed before editing.
- If a requested change risks breaking working flows, call out the risk and propose the safest path.
- If blocked, ask one precise question and continue after answer.

## 7) Current Project Guardrails
- Home page CRO changes are already deployed and should be treated as stable.
- Payroll `.data` routing fix in Worker is stable and should not be changed unless explicitly requested.
- Login/auth should be treated as stable after secrets are configured; avoid auth-system rewrites.

## 8) Definition of Done
A task is done when:
- Requested change is implemented.
- Only relevant files were touched.
- No unnecessary config/environment changes were made.
- Result is verified at the smallest reasonable scope.
