import { z } from "zod";

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

  GITHUB_WEBHOOK_SECRET: z.string().default("development-webhook-secret"),

  // App credentials are optional until a workflow needs to call GitHub's API.
  GITHUB_APP_ID: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  GITHUB_APP_PRIVATE_KEY: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().optional(),

  // OAuth for Phase 7
  GITHUB_CLIENT_ID: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  GITHUB_CLIENT_SECRET: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  GITHUB_OAUTH_REDIRECT_URI: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  OPENAI_API_KEY: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional()
  ),
  OPENAI_MODEL: z.string().default("gpt-5.6-sol"),
  OPENAI_BASE_URL: z.preprocess(
    (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? undefined : trimmed.replace(/\/+$/, "");
      }
      return val;
    },
    z.string().url().default("https://api.openai.com/v1")
  ),
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
