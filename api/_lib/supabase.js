import { createHash } from "node:crypto";
import { hasSupabaseConfig } from "./env.js";
import { normalizeUserId, todayIso } from "./text.js";

export async function getUsage({ installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyFor(installId, email);
  const date = todayIso();

  await upsertUser({ installId, email, config });
  const rows = await supabaseFetch(config, `/rest/v1/daily_usage?user_key=eq.${encodeURIComponent(userKey)}&usage_date=eq.${date}&select=count`, {
    method: "GET"
  });

  const count = Number(rows?.[0]?.count || 0);
  return {
    userId: userKey,
    date,
    count,
    limit: config.freeDailyLimit,
    paid: false
  };
}

export async function incrementUsage({ installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyFor(installId, email);
  const date = todayIso();
  const usage = await getUsage({ installId, email, config });

  await supabaseFetch(config, "/rest/v1/daily_usage?on_conflict=user_key,usage_date", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      user_key: userKey,
      usage_date: date,
      count: usage.count + 1
    })
  });
}

export async function resetUsage({ installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyFor(installId, email);
  const date = todayIso();

  await upsertUser({ installId, email, config });
  await supabaseFetch(config, "/rest/v1/daily_usage?on_conflict=user_key,usage_date", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      user_key: userKey,
      usage_date: date,
      count: 0
    })
  });
}

export async function recordSummaryEvent({ installId, email, articleUrl, status, sourceUrl = "", errorCategory = "", config }) {
  if (!hasSupabaseConfig(config)) return;

  const userKey = userKeyFor(installId, email);
  const articleHash = createHash("sha256").update(String(articleUrl || "")).digest("hex");
  await supabaseFetch(config, "/rest/v1/summary_events", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      user_key: userKey,
      article_url_hash: articleHash,
      status,
      source_url: sourceUrl || null,
      model: config.openaiModel,
      error_category: errorCategory || null
    })
  });
}

export async function upsertUser({ installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyFor(installId, email);

  await supabaseFetch(config, "/rest/v1/users?on_conflict=user_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      user_key: userKey,
      install_id: cleanNullable(installId),
      email: cleanNullable(email)
    })
  });
}

export function userKeyFor(installId, email) {
  return normalizeUserId(email || installId || "anonymous");
}

async function supabaseFetch(config, path, options) {
  const headers = {
    "apikey": config.supabaseServiceRoleKey,
    "authorization": `Bearer ${config.supabaseServiceRoleKey}`,
    "content-type": "application/json"
  };

  if (options.prefer) {
    headers.prefer = options.prefer;
  }

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error (${response.status}): ${text.slice(0, 240)}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function assertSupabase(config) {
  if (!hasSupabaseConfig(config)) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

function cleanNullable(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}
