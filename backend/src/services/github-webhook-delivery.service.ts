import { prisma } from "../lib/prisma";

type GithubWebhookDeliveryInput = {
  deliveryId: string;
  eventType: string;
};

type DeliveryStore = {
  createMany: (input: {
    data: GithubWebhookDeliveryInput;
    skipDuplicates: true;
  }) => Promise<{ count: number }>;
};

export async function registerGithubWebhookDelivery(
  store: DeliveryStore,
  input: GithubWebhookDeliveryInput,
): Promise<{ isDuplicate: boolean }> {
  // The database unique key makes concurrent retries converge without treating them as errors.
  const result = await store.createMany({
    data: input,
    skipDuplicates: true,
  });

  return { isDuplicate: result.count === 0 };
}

export const githubWebhookDeliveryService = {
  register(input: GithubWebhookDeliveryInput) {
    return registerGithubWebhookDelivery(prisma.githubWebhookDelivery, input);
  },
};
