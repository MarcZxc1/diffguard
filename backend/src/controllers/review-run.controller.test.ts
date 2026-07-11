import { describe, expect, it } from "bun:test";
import type { Request, Response } from "express";
import { HttpError } from "../middlewares/error.middleware";
import { getReviewRun } from "./review-run.controller";

describe("getReviewRun", () => {
  it("rejects malformed IDs before querying persistence", async () => {
    const request = { params: { id: "not-a-uuid" } } as unknown as Request;
    try {
      await getReviewRun(request, {} as Response);
      throw new Error("Expected invalid ID rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});
