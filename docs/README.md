# DiffGuard documentation

Read these documents in this order when joining the project:

1. [Project context](CONTEXT.md) describes the product, stack, structure, environment, and API.
2. [Code walkthrough](CODE_WALKTHROUGH.md) explains the responsibility and important code in every source file.
3. [Product and engineering roadmap](ROADMAP.md) defines phased outcomes, risks, and exit criteria.
4. [Engineering loop](ENGINEERING_LOOP.md) defines the repeatable agentic development cycle.
5. [Installation](INSTALLATION.md) walks through local setup, first use, GitHub connection, and common problems.
6. [Webhook testing](WEBHOOK_TESTING.md) shows how to test the signed GitHub endpoint without leaking secrets.
7. [Operations runbook](OPERATIONS.md) covers migrations, health checks, backups, retention, permissions, LLM opt-in, and evidence export.
8. [Advisory pilot runbook](PILOT.md) defines Phase 6 evidence collection and the enforcement gate.
9. [Generic repository governance](generic-repository-governance/RESEARCH.md) explains the domain-neutral policy architecture and privacy boundary.
10. [Frontend hardening](frontend-hardening/RESEARCH.md) records the audit, implementation plan, and verification.
11. [Development log](DEVELOPMENT_LOG.md) records completed work and current implementation evidence.

The reusable Codex skills live in [`../skills`](../skills). Copy them to `~/.codex/skills/` when you want Codex to discover them automatically.
