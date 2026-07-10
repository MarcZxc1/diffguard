import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  GITHUB_WEBHOOK_SECRET: z.string().min(1, {
    message: "GITHUB_WEBHOOK IS REQUIRED",
  }),
});

export const env = envSchema.parse(process.env);
