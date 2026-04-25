# TODO - Secrets/config risk remediation

- [x] Remove hardcoded secrets from `wrangler.json` (`JWT_ACCESS_SECRET`, `JWT_SECRET`, `OPENROUTER_API_KEY`)
- [x] Keep only non-sensitive vars in `wrangler.json` (e.g., `HRMS_BASE_URL`, optional debug toggles if desired)
- [x] Add deployment/runbook docs in `README.md` for required `wrangler secret put ...` commands
- [x] Verify no hardcoded secret values remain in `wrangler.json`
