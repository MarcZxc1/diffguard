import { describe, expect, it } from "bun:test";
import { registerGithubWebhookDelivery } from "./github-webhook-delivery.service";

const delivery = {
  deliveryId: "delivery-123",
  eventType: "pull_request",
};

describe("registerGithubWebhookDelivery", () => {
  it("registers a new delivery", async () => {
    const createMany = async () => ({ count: 1 });

    await expect(
      registerGithubWebhookDelivery({ createMany }, delivery),
    ).resolves.toEqual({ isDuplicate: false });
  });

  it("marks a duplicate delivery without starting another review", async () => {
    const createMany = async () => ({ count: 0 });

    await expect(
      registerGithubWebhookDelivery({ createMany }, delivery),
    ).resolves.toEqual({ isDuplicate: true });
  });

  it("propagates persistence failures that are not duplicate deliveries", async () => {
    const databaseError = new Error("Database unavailable");
    const createMany = async () => {
      throw databaseError;
    };

    await expect(
      registerGithubWebhookDelivery({ createMany }, delivery),
    ).rejects.toBe(databaseError);
  });
});
