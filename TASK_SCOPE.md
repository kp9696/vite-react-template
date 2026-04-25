# TASK_SCOPE (Per-Request Contract)

Use this file at the start of each new request.
Keep it short and update only what is necessary.

## Request Summary
- Task: Pending (fill from next user request)
- Business goal: Deliver only the requested change with minimal safe impact
- Owner/requester: Admin

## In Scope
- Only files directly required for the requested change

## Out of Scope
- Refactors outside the requested feature/bug
- Secret/env/deployment changes unless explicitly requested
- Unrelated UI/route/system cleanup

## Files Allowed To Change
- To be listed per task before implementation

## Files Protected (Do Not Touch)
- `wrangler.json` (unless explicitly requested)
- migrations (unless explicitly requested)
- auth/secrets flows (unless explicitly requested)

## Environment/Config Rules
- Do not change secrets/auth/env/deploy config unless explicitly requested.
- Do not rotate JWT or Cloudflare secrets unless explicitly requested.

## Acceptance Criteria
- Must map 1:1 to requested behavior
- No unrelated behavior changes

## Validation Plan
- Minimal checks to run: Task-specific smoke checks only
- Commands (only if needed): Build/test only if required for confidence

## Deployment
- Deploy required for this task? No (default)
- If yes, explicit user approval recorded? No (required before deploy)

## Notes/Risks
- Keep diffs narrow; avoid touching stable paths without task need

## Completion Checklist
- [ ] Only in-scope files changed
- [ ] Working setup left intact
- [ ] Acceptance criteria met
- [ ] Validation completed at minimal scope
