import { z } from "zod";
import "dotenv/config";

const strictBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

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

  // OAuth for Phase 7
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-sol"),
  DIFFGUARD_DEV_ENFORCEMENT_BYPASS: strictBoolean.default(false),
}).superRefine((environment, context) => {
  if (
    environment.NODE_ENV === "production" &&
    environment.DIFFGUARD_DEV_ENFORCEMENT_BYPASS
  ) {
    context.addIssue({
      code: "custom",
      path: ["DIFFGUARD_DEV_ENFORCEMENT_BYPASS"],
      message: "DIFFGUARD_DEV_ENFORCEMENT_BYPASS cannot be enabled in production",
    });
  }
});

export function parseEnvironment(input: Record<string, unknown>) {
  return envSchema.parse(input);
}

export const env = parseEnvironment(process.env);
