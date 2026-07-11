import { describe, expect, it } from "bun:test";
import type { Request, Response } from "express";
import { HttpError } from "../middlewares/error.middleware";
import { createUser } from "./user.controller";

describe("admin create-user contract", () => {
  it("rejects the old password-less request body", async () => {
    const request = {
      body: { email: "new-user@example.com", name: "New User" },
    } as Request;

    try {
      await createUser(request, {} as Response);
      throw new Error("Expected createUser to reject the request");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});
