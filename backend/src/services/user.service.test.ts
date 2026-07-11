import { describe, expect, it } from "bun:test";
import { createUserSafely } from "./user.service";

describe("createUserSafely", () => {
  it("hashes the admin-supplied password before persistence", async () => {
    const persisted: Array<{ email: string; name?: string; password: string }> = [];
    let invalidated = false;

    const result = await createUserSafely(
      {
        email: "new-user@example.com",
        name: "New User",
        password: "test-password",
      },
      {
        hashPassword: async (password) => `hashed:${password}`,
        invalidateCache: async () => {
          invalidated = true;
        },
        persist: async (user) => {
          persisted.push(user);
          return { id: "user-1", email: user.email };
        },
      },
    );

    expect(invalidated).toBe(true);
    expect(persisted).toEqual([
      {
        email: "new-user@example.com",
        name: "New User",
        password: "hashed:test-password",
      },
    ]);
    expect(result).toEqual({ id: "user-1", email: "new-user@example.com" });
  });
});
