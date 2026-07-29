# Generic Repository Governance Configuration

Repository governance is an opt-in advisory layer. It helps reviewers receive consistent context and test evidence without teaching DiffGuard about a specific organization, product, directory layout, or data model.

## Dashboard Setup

Open an authorized repository in the dashboard, then use **Pull Request Governance**:

1. Enable governance.
2. Set optional description, issue-reference, and changed-file expectations.
3. Enter required Markdown heading names, one per line.
4. Enter protected and test path globs, one per line.
5. Save the configuration.
6. Run representative pull requests in advisory mode and tune the policy from observed signal quality.

Numeric value `0` disables the corresponding description or changed-file limit.

## Generic Example

```json
{
  "governance": {
    "enabled": true,
    "minimumDescriptionLength": 80,
    "requiredSections": ["Summary", "Testing", "Risk"],
    "requireIssueReference": true,
    "maxChangedFiles": 40,
    "protectedPaths": ["src/core/**", "infrastructure/**"],
    "requireTestsForProtectedPaths": true,
    "testPaths": ["**/*.test.*", "tests/**", "**/tests/**"]
  }
}
```

These paths are illustrative only. Private repositories should define their own values through their authorized DiffGuard deployment. Do not contribute private repository names, paths, screenshots, PR bodies, production schemas, or real data as public examples or fixtures.

## Policy Behavior

- `policy.pull-request-metadata` reports insufficient description length, missing configured headings, or a missing issue reference.
- `policy.pull-request-size` reports when the changed-file count exceeds the configured advisory limit.
- `policy.protected-change-without-tests` reports when a protected path changes without a changed file matching the configured test globs.

Each rule emits at most one finding per review. Findings remain `POLICY` feedback and cannot fail the security conclusion, even when the repository is enforcing proven security rules.

## Privacy Boundary

The repository configuration and its review-run snapshot are persisted in the DiffGuard database. When an enabled description, section, or issue-reference requirement needs PR context, the worker fetches the current pull-request title and description using the existing GitHub App installation token. Path-only and size-only governance make no metadata request. The title and description remain in memory only for rule evaluation.

DiffGuard persists the resulting bounded policy finding, such as a list of missing configured headings. It does not persist or log the raw description through the governance workflow.

Use synthetic, domain-neutral text in public tests and documentation. Keep customer-specific configuration in the authorized private deployment.

## GitHub-Native Controls

Governance feedback complements but does not replace:

- pull-request templates;
- CODEOWNERS;
- required reviewers;
- required status checks;
- branch protection or rulesets; and
- deployment approvals.

Configure those controls deliberately in GitHub after the advisory workflow demonstrates useful, low-noise results.
