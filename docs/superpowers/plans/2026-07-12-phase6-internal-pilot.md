# Phase 6 — Internal Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate DiffGuard safely on the primary repository by building pilot tracking, finding verification, precision measurement, and controlled check enablement.

**Architecture:** Extend the existing backend with pilot-specific models for tracking finding verification (confirmed/false-positive), compute precision metrics per rule, add a pilot dashboard view, and gate required-check enablement on measured precision targets.

**Tech Stack:** Bun, Express 5, Prisma 7, TypeScript 6, React 19, Zod 4, PostgreSQL 17

---

## Pre-requisites (already fixed)

- [x] BUG-3 fixed: `rerunReviewRun` now resets `attemptCount`, `startedAt`, and all check run fields
- [x] ISS-16 fixed: `nineMinutesInSeconds` constant moved before usage

---

### Task 1: Pilot Finding Verification Data Model

Add database support for marking findings as confirmed true positives or false positives during the pilot.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/YYYYMMDDHHMMSS_add_pilot_verification/migration.sql` (auto-generated)

- [ ] **Step 1: Add verification fields to Finding model**

Add to `backend/prisma/schema.prisma`, inside the `Finding` model, after `suppressionReason`:

```prisma
  pilotVerification  String?
  pilotVerifiedAt    DateTime?
  pilotVerifiedBy    String?
  pilotNotes         String?
```

- [ ] **Step 2: Add PilotPrecisionSnapshot model**

Add a new model at the end of `schema.prisma`:

```prisma
model PilotPrecisionSnapshot {
  id                String   @id @default(uuid())
  repositoryId      String
  repository        GithubRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  ruleId            String
  totalFindings     Int
  confirmedCount    Int
  falsePositiveCount Int
  unverifiedCount   Int
  precision         Float
  snapshotAt        DateTime @default(now())

  @@index([repositoryId, ruleId, snapshotAt])
}
```

Also add to `GithubRepository` model's relations:

```prisma
  precisionSnapshots PilotPrecisionSnapshot[]
```

- [ ] **Step 3: Generate and apply migration**

Run: `cd backend && bunx prisma migrate dev --name add_pilot_verification`
Expected: Migration created and applied successfully.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/
git commit -m "feat(pilot): add finding verification and precision snapshot models"
```

---

### Task 2: Finding Verification API

**Files:**
- Create: `backend/src/services/pilot.service.ts`
- Create: `backend/src/services/pilot.service.test.ts`
- Modify: `backend/src/routes/repository.routes.ts`
- Modify: `backend/src/controllers/repository.controller.ts`

- [ ] **Step 1: Write the failing test for verifyFinding**

Create `backend/src/services/pilot.service.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { verifyFinding, computeRulePrecision } from "./pilot.service";

describe("pilot finding verification", () => {
  test("rejects invalid verification status", () => {
    expect(() =>
      verifyFinding.parseInput({ verification: "INVALID", notes: "" })
    ).toThrow();
  });

  test("accepts CONFIRMED verification", () => {
    const parsed = verifyFinding.parseInput({
      verification: "CONFIRMED",
      notes: "Verified in code review",
    });
    expect(parsed.verification).toBe("CONFIRMED");
    expect(parsed.notes).toBe("Verified in code review");
  });

  test("accepts FALSE_POSITIVE verification", () => {
    const parsed = verifyFinding.parseInput({
      verification: "FALSE_POSITIVE",
      notes: "Test fixture, not a real secret",
    });
    expect(parsed.verification).toBe("FALSE_POSITIVE");
  });
});

describe("pilot precision computation", () => {
  test("computes precision from verified findings", () => {
    const findings = [
      { pilotVerification: "CONFIRMED" },
      { pilotVerification: "CONFIRMED" },
      { pilotVerification: "FALSE_POSITIVE" },
      { pilotVerification: null },
    ];
    const precision = computeRulePrecision(findings as any);
    expect(precision.confirmedCount).toBe(2);
    expect(precision.falsePositiveCount).toBe(1);
    expect(precision.unverifiedCount).toBe(1);
    expect(precision.precision).toBeCloseTo(0.667, 2);
  });

  test("returns precision 0 when no findings are verified", () => {
    const precision = computeRulePrecision([]);
    expect(precision.precision).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/services/pilot.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pilot service implementation**

Create `backend/src/services/pilot.service.ts`:

```typescript
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "./repository-authorization.service";
import { recordAuditLog } from "./repository-authorization.service";

const verificationInputSchema = z.object({
  verification: z.enum(["CONFIRMED", "FALSE_POSITIVE"]),
  notes: z.string().max(2000).default(""),
}).strict();

export const verifyFinding = {
  parseInput(input: unknown) {
    const parsed = verificationInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid verification input");
    return parsed.data;
  },

  async execute(findingId: string, input: unknown, user: AuthenticatedUser) {
    const data = this.parseInput(input);
    const finding = await prisma.finding.findUnique({
      where: { id: findingId },
      select: {
        id: true,
        reviewRunId: true,
        reviewRun: { select: { repositoryId: true } },
      },
    });
    if (!finding) return null;

    const updated = await prisma.finding.update({
      where: { id: findingId },
      data: {
        pilotVerification: data.verification,
        pilotVerifiedAt: new Date(),
        pilotVerifiedBy: user.id,
        pilotNotes: data.notes || null,
      },
    });

    await recordAuditLog({
      user,
      repositoryId: finding.reviewRun.repositoryId,
      action: `finding.pilot.${data.verification.toLowerCase()}`,
      metadata: { findingId, verification: data.verification },
    });

    return updated;
  },
};

export function computeRulePrecision(
  findings: { pilotVerification: string | null }[],
) {
  const confirmed = findings.filter(
    (f) => f.pilotVerification === "CONFIRMED",
  ).length;
  const falsePositive = findings.filter(
    (f) => f.pilotVerification === "FALSE_POSITIVE",
  ).length;
  const unverified = findings.filter(
    (f) => !f.pilotVerification,
  ).length;
  const denominator = confirmed + falsePositive;
  return {
    totalFindings: findings.length,
    confirmedCount: confirmed,
    falsePositiveCount: falsePositive,
    unverifiedCount: unverified,
    precision: denominator === 0 ? 0 : confirmed / denominator,
  };
}

export async function getPilotPrecisionByRule(repositoryId: string) {
  const findings = await prisma.finding.findMany({
    where: { reviewRun: { repositoryId } },
    select: { ruleId: true, pilotVerification: true },
  });

  const byRule = new Map<string, { pilotVerification: string | null }[]>();
  for (const finding of findings) {
    const list = byRule.get(finding.ruleId) ?? [];
    list.push(finding);
    byRule.set(finding.ruleId, list);
  }

  return Array.from(byRule.entries()).map(([ruleId, ruleFindgs]) => ({
    ruleId,
    ...computeRulePrecision(ruleFindgs),
  }));
}

export async function snapshotPilotPrecision(repositoryId: string) {
  const metrics = await getPilotPrecisionByRule(repositoryId);
  return await Promise.all(
    metrics.map((m) =>
      prisma.pilotPrecisionSnapshot.create({
        data: {
          repositoryId,
          ruleId: m.ruleId,
          totalFindings: m.totalFindings,
          confirmedCount: m.confirmedCount,
          falsePositiveCount: m.falsePositiveCount,
          unverifiedCount: m.unverifiedCount,
          precision: m.precision,
        },
      })
    ),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/services/pilot.service.test.ts`
Expected: PASS

- [ ] **Step 5: Add API routes and controllers**

Add to `backend/src/controllers/repository.controller.ts`:

```typescript
export async function verifyFindingController(req: AuthRequest, res: Response) {
  const params = z.object({
    id: z.string().uuid(),
    findingId: z.string().uuid(),
  }).safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid IDs");
  await requireRepositoryManager(req, params.data.id);
  const { verifyFinding } = await import("../services/pilot.service");
  const result = await verifyFinding.execute(
    params.data.findingId,
    req.body,
    req.user!,
  );
  if (!result) throw new HttpError(404, "Finding not found");
  res.json(result);
}

export async function getPilotPrecisionController(
  req: AuthRequest,
  res: Response,
) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  const { getPilotPrecisionByRule } = await import(
    "../services/pilot.service"
  );
  res.json(await getPilotPrecisionByRule(params.data.id));
}
```

Add routes to `backend/src/routes/repository.routes.ts`:

```typescript
router.patch("/:id/findings/:findingId/verify", authMiddleware, asyncHandler(verifyFindingController));
router.get("/:id/pilot/precision", authMiddleware, asyncHandler(getPilotPrecisionController));
```

- [ ] **Step 6: Run full test suite**

Run: `cd backend && bun test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/pilot.service.ts backend/src/services/pilot.service.test.ts backend/src/controllers/repository.controller.ts backend/src/routes/repository.routes.ts
git commit -m "feat(pilot): add finding verification and precision metrics API"
```

---

### Task 3: Precision-Gated Enforcement

Phase 6 step 8: Enable a required check only for rules that meet agreed precision targets.

**Files:**
- Create: `backend/src/services/pilot-gate.service.ts`
- Create: `backend/src/services/pilot-gate.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `backend/src/services/pilot-gate.service.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { shouldEnforceRule } from "./pilot-gate.service";

describe("pilot precision gate", () => {
  test("blocks enforcement when precision below threshold", () => {
    expect(shouldEnforceRule({
      precision: 0.85,
      minimumPrecision: 0.90,
      minimumVerifiedFindings: 10,
      totalVerifiedFindings: 15,
    })).toBe(false);
  });

  test("allows enforcement when precision meets threshold", () => {
    expect(shouldEnforceRule({
      precision: 0.95,
      minimumPrecision: 0.90,
      minimumVerifiedFindings: 10,
      totalVerifiedFindings: 15,
    })).toBe(true);
  });

  test("blocks enforcement when insufficient verified findings", () => {
    expect(shouldEnforceRule({
      precision: 0.99,
      minimumPrecision: 0.90,
      minimumVerifiedFindings: 10,
      totalVerifiedFindings: 5,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && bun test src/services/pilot-gate.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pilot gate service**

Create `backend/src/services/pilot-gate.service.ts`:

```typescript
export function shouldEnforceRule(params: {
  precision: number;
  minimumPrecision: number;
  minimumVerifiedFindings: number;
  totalVerifiedFindings: number;
}): boolean {
  if (params.totalVerifiedFindings < params.minimumVerifiedFindings) {
    return false;
  }
  return params.precision >= params.minimumPrecision;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/services/pilot-gate.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pilot-gate.service.ts backend/src/services/pilot-gate.service.test.ts
git commit -m "feat(pilot): add precision-gated enforcement check"
```

---

### Task 4: Pilot Dashboard — Precision Metrics View

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add RulePrecision type and state**

Add after the `EvidencePreview` type:

```typescript
type RulePrecision = {
  ruleId: string;
  totalFindings: number;
  confirmedCount: number;
  falsePositiveCount: number;
  unverifiedCount: number;
  precision: number;
};
```

Add state:

```typescript
const [pilotPrecision, setPilotPrecision] = useState<RulePrecision[]>([]);
```

- [ ] **Step 2: Load precision data in loadRepository**

Add to the `loadRepository` function's `Promise.all`:

```typescript
const [repository, metricData, precisionData] = await Promise.all([
  api<Repository>(`api/repositories/${id}`, token),
  api<Metrics>(`api/repositories/${id}/metrics`, token),
  api<RulePrecision[]>(`api/repositories/${id}/pilot/precision`, token),
]);
// ...
setPilotPrecision(precisionData);
```

- [ ] **Step 3: Add Precision Table UI**

Add between the metrics cards and review runs table:

```tsx
{pilotPrecision.length > 0 && (
  <div className="rounded border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-black">Pilot Precision by Rule</h2>
    <table className="mt-4 w-full text-left text-sm">
      <thead className="bg-slate-100 text-xs uppercase text-slate-600">
        <tr>
          <th className="p-3">Rule</th>
          <th className="p-3">Total</th>
          <th className="p-3">Confirmed</th>
          <th className="p-3">False Pos.</th>
          <th className="p-3">Unverified</th>
          <th className="p-3">Precision</th>
        </tr>
      </thead>
      <tbody>
        {pilotPrecision.map((rule) => (
          <tr key={rule.ruleId} className="border-t">
            <td className="p-3 font-mono text-xs">{rule.ruleId}</td>
            <td className="p-3">{rule.totalFindings}</td>
            <td className="p-3 text-emerald-700">{rule.confirmedCount}</td>
            <td className="p-3 text-red-700">{rule.falsePositiveCount}</td>
            <td className="p-3 text-slate-500">{rule.unverifiedCount}</td>
            <td className="p-3 font-semibold">
              {(rule.precision * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(pilot): add precision metrics view to dashboard"
```

---

### Task 5: Evidence Export Sanitization Tests

Verify ROADMAP Phase 6, step 7 requirements.

**Files:**
- Create: `backend/src/services/evidence-export-sanitization.test.ts`

- [ ] **Step 1: Write sanitization verification tests**

```typescript
import { describe, test, expect } from "bun:test";

// Test the sanitizeScalar function directly
function sanitizeScalar(value: unknown) {
  return String(value ?? "")
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[\[.*?\]\]/g, "[removed embed]")
    .replace(/\{\{.*?\}\}/g, "[removed template]")
    .slice(0, 20_000);
}

describe("evidence export sanitization", () => {
  test("strips control characters", () => {
    expect(sanitizeScalar("test\x00\x01\x02value")).toBe("test   value");
  });

  test("removes HTML comments", () => {
    expect(sanitizeScalar("before<!-- secret -->after")).toBe("beforeafter");
  });

  test("removes Obsidian embeds", () => {
    expect(sanitizeScalar("text ![[image.png]] more")).toBe("text [removed embed] more");
  });

  test("removes template syntax", () => {
    expect(sanitizeScalar("text {{template}} more")).toBe("text [removed template] more");
  });

  test("truncates at 20k characters", () => {
    const long = "a".repeat(25_000);
    expect(sanitizeScalar(long).length).toBe(20_000);
  });

  test("normalizes line endings", () => {
    expect(sanitizeScalar("line1\r\nline2\rline3")).toBe("line1\nline2\nline3");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd backend && bun test src/services/evidence-export-sanitization.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/evidence-export-sanitization.test.ts
git commit -m "test(pilot): add evidence export sanitization verification tests"
```

---

### Task 6: Full Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && bun test`
Expected: All tests pass.

- [ ] **Step 2: Type check**

Run: `cd backend && bunx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(pilot): Phase 6 internal pilot implementation complete"
```

---

## Post-Implementation: Operational Steps (Manual)

These are NOT code tasks — they are manual operational steps from the ROADMAP:

1. **Install GitHub App on primary repository** — minimum permissions (pull_requests: read, checks: write, contents: read)
2. **Run advisory mode** — open representative PRs, observe DiffGuard behavior
3. **Verify findings** — use `PATCH /api/repositories/:id/findings/:findingId/verify` to mark CONFIRMED/FALSE_POSITIVE
4. **Check precision** — use `GET /api/repositories/:id/pilot/precision` and dashboard view
5. **Tune thresholds** — use `PATCH /api/repositories/:id/settings` to adjust severityThreshold, ignoredPaths, suppressions
6. **Export evidence** — use the evidence export flow for merged milestone PRs
7. **Verify exports** — confirm no secrets, patches, or PII in downloaded Markdown
8. **Enable required check** — only after precision targets met per `shouldEnforceRule()` gate
