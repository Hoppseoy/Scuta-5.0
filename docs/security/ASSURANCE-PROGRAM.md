# Security Assurance Program

## Required gates before high-risk deployment
1. Independent cryptographic review of identity/enrollment and group protocol migration plan.
2. Penetration test focused on socket event forgery, replay, and privilege escalation.
3. Dependency audit + SBOM publication per release.
4. Signed build artifacts and release provenance.
5. Incident response runbook + key rotation drills.

## CI/CD security checks
- Type checking + linting as minimum quality gate.
- Add integration tests for join proof verification/replay rejection.
- Add negative tests for non-owner privileged event denial.

## Governance
- 24h triage SLA for critical findings.
- Semver + security advisory process.
- Documented threat model updates per major architecture change.

