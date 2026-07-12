import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  GITHUB_WEBHOOK_SECRET: z.string().min(1, {
    message: "GITHUB_WEBHOOK_SECRET is required",
  }),

  // App credentials are optional until a workflow needs to call GitHub's API.
  GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().min(1).optional(),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-sol"),
});

export const env = envSchema.parse(process.env);
