import { describe, expect, test } from "bun:test";
import { PilotReadinessError } from "./pilot.service";
import { evaluateEnforcementTransition } from "./repository.service";

describe("repository enforcement transitions", () => {
  test("rejects enforcing when neither pilot evidence nor the bypass permits it", () => {
    expect(() => evaluateEnforcementTransition({
      currentMode: "ADVISORY",
      requestedMode: "ENFORCING",
      pilot: {
        canEnableEnforcing: false,
        developmentBypass: { active: false },
        blockers: ["Collect more evidence."],
      },
    })).toThrow(PilotReadinessError);
  });

  test("reports when an enforcing transition uses the development bypass", () => {
    expect(evaluateEnforcementTransition({
      currentMode: "ADVISORY",
      requestedMode: "ENFORCING",
      pilot: {
        canEnableEnforcing: true,
        developmentBypass: { active: true },
        blockers: ["Collect more evidence."],
      },
    })).toEqual({ usedDevelopmentBypass: true });
  });

  test("always allows a downgrade to advisory", () => {
    expect(evaluateEnforcementTransition({
      currentMode: "ENFORCING",
      requestedMode: "ADVISORY",
    })).toEqual({ usedDevelopmentBypass: false });
  });
});
