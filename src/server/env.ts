import { z } from "zod";

/**
 * Every environment variable the app reads goes through this schema.
 * Nothing outside `demo` mode is required to boot in demo mode: the
 * fallbacks below keep `pnpm dev` runnable with an empty `.env`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "live"]).default("demo"),

  DATABASE_URL: z
    .string()
    .default("postgresql://flow_desk:flow_desk_dev@localhost:5433/flow_desk"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SESSION_SECRET: z.string().default("dev-only-insecure-secret"),

  JEV_API_KEY: z.string().optional(),
  JEV_API_URL: z.string().url().default("https://api.typesafe.ai"),

  OPENAI_API_KEY: z.string().optional(),

  EXA_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  APIFY_TOKEN: z.string().optional(),
  BROWSER_PROVIDER_API_KEY: z.string().optional(),

  SCREENSHOT_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  SCREENSHOT_STORAGE_DIR: z.string().default("./.data/screenshots"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  BROWSER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  BROWSER_PER_DOMAIN_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  BROWSER_MAX_PAGES_PER_FLOW: z.coerce.number().int().min(1).max(20).default(3),
  BROWSER_MAX_STEPS_PER_FLOW: z.coerce.number().int().min(1).max(100).default(20),
  BROWSER_MAX_DURATION_SECONDS: z.coerce.number().int().min(10).max(600).default(120),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Production mode refuses to boot on invalid config; demo/dev mode logs the
 * problem and falls back to schema defaults so local iteration never blocks
 * on missing infrastructure.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    cached = parsed.data;
    return cached;
  }

  if (process.env.NODE_ENV === "production" && process.env.APP_MODE !== "demo") {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  console.warn(
    "[env] Invalid environment configuration, falling back to schema defaults for local/demo use:",
    parsed.error.flatten().fieldErrors,
  );
  cached = envSchema.parse({});
  return cached;
}

export function isDemoMode(): boolean {
  return getEnv().APP_MODE === "demo";
}
