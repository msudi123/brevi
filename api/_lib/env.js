import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export function loadLocalEnv() {
  const envPath = join(ROOT_DIR, ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getConfig() {
  return {
    appName: "Brevi",
    freeDailyLimit: Number(process.env.FREE_DAILY_LIMIT || 5),
    rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20),
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    openaiEndpoint: "https://api.openai.com/v1/responses",
    supabaseUrl: trimTrailingSlash(process.env.SUPABASE_URL || ""),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    lemonSqueezyApiKey: process.env.LEMONSQUEEZY_API_KEY || "",
    lemonSqueezyStoreId: process.env.LEMONSQUEEZY_STORE_ID || "",
    lemonSqueezyWebhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "",
    lemonSqueezyTestMode: String(process.env.LEMONSQUEEZY_TEST_MODE || "true").toLowerCase() !== "false",
    lemonSqueezyVariantStarter: process.env.LEMONSQUEEZY_VARIANT_STARTER || "",
    lemonSqueezyVariantReader: process.env.LEMONSQUEEZY_VARIANT_READER || "",
    lemonSqueezyVariantPower: process.env.LEMONSQUEEZY_VARIANT_POWER || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    supportEmail: process.env.SUPPORT_EMAIL || "getbrevi@gmail.com",
    supportFromEmail: process.env.SUPPORT_FROM_EMAIL || "Brevi Support <support@getbrevi.dev>",
    publicAppUrl: normalizePublicUrl(process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || ""),
    extensionOrigin: process.env.PUBLIC_EXTENSION_ORIGIN || "*",
    whopCheckoutUrl: process.env.WHOP_CHECKOUT_URL || "https://whop.com",
    nodeEnv: process.env.NODE_ENV || "development"
  };
}

export function hasSupabaseConfig(config = getConfig()) {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

export function hasSupabaseAuthConfig(config = getConfig()) {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePublicUrl(value) {
  const trimmed = trimTrailingSlash(value);
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
