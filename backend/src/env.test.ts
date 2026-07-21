import { describe, expect, test } from "bun:test";
import { parseEnvironment } from "./env";

const requiredEnvironment = {
  GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
};

describe("environment validation", () => {
  test("enables the enforcement bypass only from an explicit true value", () => {
    const environment = parseEnvironment({
      ...requiredEnvironment,
      NODE_ENV: "development",
      DIFFGUARD_DEV_ENFORCEMENT_BYPASS: "true",
    });

    expect(environment.DIFFGUARD_DEV_ENFORCEMENT_BYPASS).toBe(true);
  });

  test("defaults the enforcement bypass to disabled", () => {
    const environment = parseEnvironment(requiredEnvironment);

    expect(environment.DIFFGUARD_DEV_ENFORCEMENT_BYPASS).toBe(false);
  });

  test("rejects the enforcement bypass in production", () => {
    expect(() => parseEnvironment({
      ...requiredEnvironment,
      NODE_ENV: "production",
      DIFFGUARD_DEV_ENFORCEMENT_BYPASS: "true",
    })).toThrow("cannot be enabled in production");
  });

  test("rejects ambiguous boolean values", () => {
    expect(() => parseEnvironment({
      ...requiredEnvironment,
      NODE_ENV: "development",
      DIFFGUARD_DEV_ENFORCEMENT_BYPASS: "1",
    })).toThrow();
  });
});
