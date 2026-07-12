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
