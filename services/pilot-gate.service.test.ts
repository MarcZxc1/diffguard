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
