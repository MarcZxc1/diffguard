# Generic Repository Governance Research

## Overview

DiffGuard already applies deterministic security and maintainability rules to changed pull-request lines. This feature adds an opt-in, repository-configurable governance layer for pull-request descriptions, issue references, change size, protected paths, and accompanying tests.

The implementation is intentionally domain-neutral. Repository owners supply their own headings and path patterns at runtime. DiffGuard's source, fixtures, defaults, and documentation contain no customer-specific names, code, paths, or data.

## Problem Statement

Security findings alone do not answer whether a pull request is ready for review. Maintainers also need consistent context, bounded change size, and extra evidence when important areas change. Hard-coding those expectations would make DiffGuard unsuitable for reuse and could expose private repository details.

The governance layer should:

- work for repositories with different layouts and review conventions;
- remain disabled until a manager opts in;
- use the GitHub permissions DiffGuard already requires;
- avoid storing pull-request descriptions;
- produce bounded, advisory policy findings; and
- leave approval ownership and merge protection to GitHub.

## User Stories / Use Cases

- A repository manager requires Markdown sections such as `Summary`, `Testing`, and `Risk`.
- A manager requires a linked issue reference for traceability.
- A team receives advisory feedback when a pull request exceeds its preferred file count.
- A team configures protected path globs and test path globs, then receives feedback when protected changes have no accompanying test change.
- A private repository uses its own configuration without adding its identity, directory layout, or data to the DiffGuard source repository.

## Technical Research

### Approach Options

#### Hard-coded repository profile

Advantages:

- Fast to implement for one repository.

Disadvantages:

- Leaks private structure into a reusable project.
- Couples releases to one repository.
- Encourages private fixtures and terminology in public history.

This approach is rejected.

#### Configuration file fetched from each repository

Advantages:

- Configuration stays with the reviewed code.
- Supports code review of policy changes.

Disadvantages:

- Requires Contents read permission that DiffGuard does not currently need.
- Adds bootstrap and configuration-file trust concerns.

This can be considered later, but is not required for the first version.

#### Database-backed generic configuration

Advantages:

- Reuses the existing repository `ruleConfiguration` snapshot.
- Adds no migration and no new GitHub permission.
- Keeps configurations isolated by repository.
- Makes policy changes auditable through the existing settings endpoint.

Disadvantages:

- Policy changes are managed in DiffGuard rather than reviewed in the target repository.

This is the recommended first version.

### Recommended Approach

Extend the strict repository rule-configuration schema with an opt-in `governance` object:

- minimum pull-request description length;
- required Markdown heading names;
- optional issue-reference requirement;
- maximum changed-file count;
- protected path globs;
- test path globs; and
- optional test-change requirement for protected paths.

Add three deterministic `POLICY` rules:

1. pull-request metadata completeness;
2. pull-request change-size limit; and
3. protected change without an accompanying test change.

When an enabled governance requirement needs PR context, the worker fetches authoritative pull-request metadata using the existing installation token. Path-only and size-only governance make no metadata request. The title and body exist only in memory while rules run. Persisted findings describe which configured requirement was missed but do not copy the pull-request body.

Policy findings remain advisory, are excluded from pilot precision, cannot fail a Check Run, and do not create inline review comments.

### Required Technologies

- Existing GitHub Pull Requests REST endpoint.
- Existing GitHub Check Run integration.
- Existing Zod configuration validation.
- Existing JSON-backed repository configuration.
- Existing React settings dashboard.

No new dependency, database table, or GitHub App permission is required.

### Data Requirements

Persisted:

- repository governance configuration inside `ruleConfiguration`;
- the configuration snapshot already stored on each review run;
- bounded policy findings and normal audit metadata.

Transient only:

- pull-request title;
- pull-request body.

Never added to source control:

- customer identifiers;
- private repository paths;
- real pull-request descriptions;
- proprietary fixtures; or
- production data.

## UI/UX Considerations

- Governance is visibly opt-in and advisory.
- Managers edit neutral fields rather than raw JSON.
- Path and heading lists use one entry per line.
- Numeric value `0` disables the corresponding limit.
- A deliberate Save action avoids network requests for every keystroke.
- Validation failures use the existing sanitized settings error path.

## Integration Points

- `rule-engine.ts`: strict schema, context, and deterministic policies.
- `review-processor.ts`: conditional metadata fetch and transient context.
- `github-review.ts`: existing validated metadata client.
- `repository.service.ts`: existing settings validation, persistence, and audit flow.
- `App.tsx`: manager configuration UI.
- Check Run summaries and review detail: existing policy-finding surfaces.

## Risks and Challenges

- **Configuration mistakes:** strict bounds and schema validation reject unknown or excessive data.
- **Path matching ambiguity:** reuse the existing bounded glob semantics.
- **Description leakage:** do not persist or log the body; findings mention only missing configured requirements.
- **False blocking:** keep every governance rule in the `POLICY` category so it cannot enforce.
- **API availability:** fetch metadata only when governance is enabled and classify GitHub failures through the existing retry path.
- **Overly large output:** emit at most one candidate per governance rule.
- **Private coupling:** add an automated repository scan for prohibited private identifiers during verification.

## Open Questions

- A future version could load a versioned policy file from the target repository after a deliberate Contents-permission review.
- A future version could expose reporting on governance trends without storing raw descriptions.
- Review assignment should continue to use GitHub CODEOWNERS and required-review settings.

## References

- [GitHub REST API: Pull requests](https://docs.github.com/en/rest/pulls/pulls)
- [GitHub REST API: Checks](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)
- [GitHub: Managing and standardizing pull requests](https://docs.github.com/en/pull-requests/reference/managing-and-standardizing-pull-requests)
- [GitHub: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
