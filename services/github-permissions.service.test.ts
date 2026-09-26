import { describe, expect, test } from "bun:test";
import {
  canConnectRepository,
  githubPermissionLabel,
} from "./github-permissions.service";

describe("GitHub repository permission helpers", () => {
  test("allows self-service connection only for admin or maintain permission", () => {
    expect(canConnectRepository({ admin: true })).toBe(true);
    expect(canConnectRepository({ maintain: true })).toBe(true);
    expect(canConnectRepository({ push: true })).toBe(false);
    expect(canConnectRepository({ pull: true })).toBe(false);
    expect(canConnectRepository(undefined)).toBe(false);
  });

  test("labels the strongest returned GitHub repository permission", () => {
    expect(githubPermissionLabel({ admin: true, pull: true })).toBe("admin");
    expect(githubPermissionLabel({ maintain: true, push: true })).toBe("maintain");
    expect(githubPermissionLabel({ push: true })).toBe("write");
    expect(githubPermissionLabel({ triage: true })).toBe("triage");
    expect(githubPermissionLabel({ pull: true })).toBe("read");
    expect(githubPermissionLabel(undefined)).toBe("none");
  });
});
