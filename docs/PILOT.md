# Advisory Pilot Runbook

Phase 6 validates DiffGuard with real pull requests before any deterministic rule is allowed to fail a Check Run. The dashboard records the evidence, but GitHub remains the source of truth for pull requests and Check Runs.

## Acceptance targets

The initial conservative targets are:

- at least 5 distinct pull requests with a terminal analysis result;
- at least 95% successful full-coverage runs across terminal `SUCCEEDED`, `PARTIAL`, and `FAILED` analyses;
- at least 10 human-verified findings for an individual deterministic rule version; and
- at least 90% confirmed precision for that rule version.

Skipped runs are reported but do not count as completed analysis. Partial and failed runs reduce reliability. Suppressed, policy, and LLM findings do not contribute to the deterministic enforcement gate. Updating a rule version starts a new evidence sample for that version.

These targets control whether DiffGuard can enter `ENFORCING` mode. Making the resulting Check Run required is a separate, deliberate GitHub branch-protection change.

### Development-only enforcement exercise

To exercise an enforcing Check Run locally before the acceptance targets are met, set both `NODE_ENV=development` and `DIFFGUARD_DEV_ENFORCEMENT_BYPASS=true`, then restart the backend. The dashboard visibly labels the bypass while continuing to show the real `COLLECTING` status, blockers, and eligible-rule count. In this mode all deterministic security rules can fail the Check Run; policy and LLM findings remain advisory. The transition is written to the audit log.

This bypass does not create pilot evidence and must not be used to claim that the acceptance targets passed. Production startup rejects the flag.

## Current target evidence snapshot

A read-only audit of the public target repository on 2026-07-21 found DiffGuard checks associated with PRs [#4](https://github.com/MarcZxc1/diffguard/pull/4), [#5](https://github.com/MarcZxc1/diffguard/pull/5), [#6](https://github.com/MarcZxc1/diffguard/pull/6), [#7](https://github.com/MarcZxc1/diffguard/pull/7), and [#8](https://github.com/MarcZxc1/diffguard/pull/8). This does **not** complete the advisory pilot:

- PRs #5, #6, and #7 point at the same head commit and expose one inherited DiffGuard Check Run. That run was `PARTIAL`, analyzed 21 files, skipped 7 files, and reported no findings.
- PRs #4 and #8 each had a full-coverage `SUCCEEDED` run with 5 reported findings, but both PRs contain the same six fixture blobs. Repeating an identical synthetic fixture does not provide independent target-repository evidence.
- The public checks expose four inline annotations on each fixture run, but no audited human confirmed/false-positive decisions. Precision by deterministic rule version therefore remains unknown.
- On unique public Check Runs, the observable full-coverage rate is 2 of 3 (66.7%), below the 95% target. The application dashboard remains authoritative for database-backed review and finding-verdict counts once the runtime is available.

Do not switch the repository to `ENFORCING` or require the DiffGuard check based on this snapshot. Continue the pilot with distinct, representative PR revisions, resolve the partial-coverage cause, and record human verdicts until the dashboard reports at least 95% full-coverage reliability and an individual rule version has at least 10 verified findings with at least 90% precision.

## Before the pilot

1. Back up PostgreSQL and apply migrations.
2. Install the GitHub App only on the target repository with Metadata read, Pull requests read/write, and Checks read/write.
3. Connect the repository from an authorized GitHub account with `admin` or `maintain` permission.
4. Confirm that the repository is enabled and its Check Run mode is `ADVISORY`.
5. Review enabled rules, ignored paths, suppressions, retention, and whether LLM review is appropriate for the repository's data policy.
6. Keep GitHub branch protection from requiring DiffGuard during evidence collection.

## Evidence workflow

For each representative pull request:

1. Open or update the PR and wait for its DiffGuard run to reach a terminal state.
2. In **Review Runs**, use **GitHub** to confirm the authoritative Check Run and **Inspect** to view sanitized stored findings.
3. For each unsuppressed deterministic security finding, record **Confirm finding** or **Mark false positive**. Add a short code-review note when it will help another reviewer understand the decision.
4. Investigate partial coverage, failed processing, retries, and skipped files rather than treating them as clean runs.
5. Tune repository rules only with a documented reason. Do not suppress a real defect to improve the displayed precision.
6. Use **Save PR Evidence** only for selected merged milestone PRs, verify the preview, and place the downloaded note in `11 Testing and QA/PR Reviews/`.

The **Advisory pilot** panel shows progress and exact blockers. The precision table is separated by rule version and marks only qualified versions as eligible.

## Enabling enforcement

The backend rejects a transition from `ADVISORY` to `ENFORCING` until the displayed repository reliability and at least one rule-version evidence sample meet the targets. In enforcing mode, only eligible deterministic rule versions can produce a failing security conclusion. LLM findings remain advisory.

After the application gate passes:

1. Review the classified findings and failure/coverage history with the project owner.
2. Confirm which rule versions are shown as eligible.
3. Switch the repository to `ENFORCING` and exercise it on a non-critical test PR.
4. Only then, configure the DiffGuard Check Run as required in GitHub branch protection or rulesets.
5. Revert to `ADVISORY` immediately if precision or reliability regresses. The dashboard always permits that downgrade.

## Evidence to retain

Retain links and summaries, not full source patches:

- representative PR and Check Run URLs;
- confirmed and false-positive counts by rule version;
- partial, failed, skipped, and retried run counts;
- documented configuration/suppression changes;
- the privacy review outcome; and
- selected sanitized PR evidence exports.

Never copy tokens, webhook bodies, raw patches, suspected secret values, private logs, or unnecessary personal data into pilot notes or thesis records.
