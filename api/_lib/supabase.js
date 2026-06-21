import { createHash } from "node:crypto";
import { hasSupabaseConfig } from "./env.js";
import { normalizeUserId, todayIso } from "./text.js";

export async function getUsage({ authUserId, installId, email, ipAddress, config }) {
  assertSupabase(config);
  const usageKeys = usageKeysForIdentity({ authUserId, installId, email, ipAddress });
  const userKey = userKeyForIdentity({ authUserId, installId });
  const date = todayIso();

  await upsertUsageUsers({ usageKeys, authUserId, installId, email, config });
  const rows = await supabaseFetch(config, `/rest/v1/daily_usage?user_key=in.(${usageKeys.keys.map(encodeURIComponent).join(",")})&usage_date=eq.${date}&select=user_key,count`, {
    method: "GET"
  });

  const counts = usageKeys.keys.map((key) => Number(rows?.find((row) => row.user_key === key)?.count || 0));
  const count = Math.max(0, ...counts);
  return {
    userId: userKey,
    date,
    count,
    limit: config.freeDailyLimit,
    remaining: Math.max(config.freeDailyLimit - count, 0),
    paid: false
  };
}

export async function getCreditAccount({ authUserId, installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyForIdentity({ authUserId, installId });
  const lookupKeys = creditAccountKeysForIdentity({ authUserId, installId });
  await upsertCreditAccount({ authUserId, installId, email, config });
  await mergeCreditAccountsForVerifiedEmail({ authUserId, email, config });
  const [keyRows, emailRows] = await Promise.all([
    supabaseFetch(config, `/rest/v1/credit_accounts?user_key=in.(${lookupKeys.map(encodeURIComponent).join(",")})&select=user_key,install_id,email,balance`, {
      method: "GET"
    }),
    getCreditAccountsForVerifiedEmail({ authUserId, email, config })
  ]);
  const accounts = uniqueAccounts([...(Array.isArray(keyRows) ? keyRows : []), ...emailRows]);
  const balance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  return {
    userKey,
    installId: cleanNullable(installId),
    email: cleanNullable(email),
    balance
  };
}

async function getCreditAccountsForVerifiedEmail({ authUserId, email, config }) {
  const emailHash = verifiedEmailHashForIdentity({ authUserId, email });
  if (!emailHash) return [];
  const rows = await supabaseFetch(config, `/rest/v1/credit_accounts?email_hash=eq.${encodeURIComponent(emailHash)}&select=user_key,install_id,email,balance`, {
    method: "GET"
  });
  return Array.isArray(rows) ? rows : [];
}

export async function upsertCreditAccount({ authUserId, installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyForIdentity({ authUserId, installId });
  await supabaseFetch(config, "/rest/v1/credit_accounts?on_conflict=user_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      user_key: userKey,
      install_id: cleanNullable(installId),
      email: cleanNullable(email),
      email_hash: email ? sha256(normalizeUserId(email)) : null
    })
  });
  return userKey;
}

export async function spendPaidCredit({ authUserId, installId, email, articleUrl, config }) {
  assertSupabase(config);
  await upsertCreditAccount({ authUserId, installId, email, config });
  await mergeCreditAccountsForVerifiedEmail({ authUserId, email, config });
  const userKeys = await creditSpendKeysForIdentity({ authUserId, installId, email, config });

  for (const userKey of userKeys) {
    const rows = await supabaseFetch(config, "/rest/v1/rpc/spend_paid_credit", {
      method: "POST",
      body: JSON.stringify({
        p_user_key: userKey,
        p_amount: 1,
        p_reason: "summary",
        p_reference_id: articleUrl ? sha256(articleUrl) : null
      })
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (result?.spent) {
      return result;
    }
  }

  return { spent: false, balance: 0 };
}

export async function grantPurchasedCredits({ authUserId, installId, email, lemonOrderId, lemonEventId, variantId, pack, credits, config }) {
  assertSupabase(config);
  const userKey = await upsertCreditAccount({ authUserId, installId, email, config });
  const rows = await supabaseFetch(config, "/rest/v1/rpc/grant_purchased_credits", {
    method: "POST",
    body: JSON.stringify({
      p_user_key: userKey,
      p_install_id: cleanNullable(installId),
      p_email: cleanNullable(email),
      p_lemon_order_id: String(lemonOrderId || ""),
      p_lemon_event_id: cleanNullable(lemonEventId),
      p_variant_id: String(variantId || ""),
      p_pack: String(pack || ""),
      p_credits: Number(credits || 0)
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function refundPurchasedCredits({ authUserId, installId, email, lemonOrderId, lemonEventId, credits, config }) {
  assertSupabase(config);
  const userKey = await upsertCreditAccount({ authUserId, installId, email, config });
  const rows = await supabaseFetch(config, "/rest/v1/rpc/refund_purchased_credits", {
    method: "POST",
    body: JSON.stringify({
      p_user_key: userKey,
      p_lemon_order_id: String(lemonOrderId || ""),
      p_lemon_event_id: cleanNullable(lemonEventId),
      p_credits: Number(credits || 0)
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function mergeCreditAccountsForVerifiedEmail({ authUserId, email, config }) {
  const emailHash = verifiedEmailHashForIdentity({ authUserId, email });
  if (!emailHash) return null;
  const targetUserKey = userKeyForIdentity({ authUserId });
  const rows = await supabaseFetch(config, "/rest/v1/rpc/merge_credit_accounts_by_email", {
    method: "POST",
    body: JSON.stringify({
      p_target_user_key: targetUserKey,
      p_email_hash: emailHash
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function assertRateLimit({ key, route, limit, windowSeconds, config }) {
  assertSupabase(config);
  const result = await supabaseFetch(config, "/rest/v1/rpc/check_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_key: String(key || "anonymous"),
      p_route: String(route || "global"),
      p_limit: Number(limit || config.rateLimitMaxRequests || 20),
      p_window_seconds: Number(windowSeconds || config.rateLimitWindowSeconds || 60)
    })
  });
  const row = Array.isArray(result) ? result[0] : result;
  if (row && row.allowed === false) {
    const error = new Error("Too many requests. Please wait a moment and try again.");
    error.statusCode = 429;
    error.rateLimit = row;
    throw error;
  }
  return row;
}

export async function incrementUsage({ authUserId, installId, email, ipAddress, config }) {
  assertSupabase(config);
  const usageKeys = usageKeysForIdentity({ authUserId, installId, email, ipAddress });
  const date = todayIso();
  const usage = await getUsage({ authUserId, installId, email, ipAddress, config });
  const keys = authUserId ? [usageKeys.primary] : usageKeys.keys;
  const body = keys.map((userKey) => ({
    user_key: userKey,
    usage_date: date,
    count: usage.count + 1
  }));

  await supabaseFetch(config, "/rest/v1/daily_usage?on_conflict=user_key,usage_date", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(body)
  });
}

export async function resetUsage({ authUserId, installId, email, ipAddress, config }) {
  assertSupabase(config);
  const usageKeys = usageKeysForIdentity({ authUserId, installId, email, ipAddress });
  const date = todayIso();
  const body = usageKeys.keys.map((userKey) => ({
    user_key: userKey,
    usage_date: date,
    count: 0
  }));

  await upsertUsageUsers({ usageKeys, authUserId, installId, email, config });
  await supabaseFetch(config, "/rest/v1/daily_usage?on_conflict=user_key,usage_date", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(body)
  });
}

export async function recordSummaryEvent({
  authUserId,
  installId,
  email,
  articleUrl,
  status,
  sourceUrl = "",
  matchConfidence = "",
  sourceQuality = "",
  errorCategory = "",
  config
}) {
  if (!hasSupabaseConfig(config)) return;

  const userKey = userKeyForIdentity({ authUserId, installId });
  const articleHash = createHash("sha256").update(String(articleUrl || "")).digest("hex");
  await supabaseFetch(config, "/rest/v1/summary_events", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      user_key: userKey,
      article_url_hash: articleHash,
      status,
      source_url: sourceUrl || null,
      match_confidence: cleanNullable(matchConfidence),
      source_quality: cleanNullable(sourceQuality),
      model: config.openaiModel,
      error_category: errorCategory || null
    })
  });
}

export async function upsertUser({ authUserId, installId, email, config }) {
  assertSupabase(config);
  const userKey = userKeyForIdentity({ authUserId, installId });

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

async function upsertUsageUsers({ usageKeys, authUserId, installId, email, config }) {
  const rows = usageKeys.keys.map((userKey) => ({
    user_key: userKey,
    install_id: cleanNullable(installId),
    email: cleanNullable(email)
  }));

  await supabaseFetch(config, "/rest/v1/users?on_conflict=user_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(rows)
  });
}

export function userKeyFor(installId) {
  return `install:${normalizeUserId(installId || "anonymous")}`;
}

export function userKeyForIdentity({ authUserId, installId } = {}) {
  if (authUserId) {
    return `auth:${normalizeUserId(authUserId)}`;
  }
  return userKeyFor(installId);
}

export function usageKeysForIdentity({ authUserId, installId, email, ipAddress } = {}) {
  if (authUserId) {
    return {
      primary: userKeyForIdentity({ authUserId, installId }),
      keys: uniqueKeys([
        userKeyForIdentity({ authUserId, installId }),
        installId ? userKeyFor(installId) : ""
      ])
    };
  }

  const keys = [userKeyFor(installId)];
  const normalizedEmail = normalizeUserId(email);
  if (normalizedEmail && normalizedEmail !== "anonymous") {
    keys.push(`email:${sha256(normalizedEmail)}`);
  }
  const normalizedIp = normalizeIp(ipAddress);
  if (normalizedIp) {
    keys.push(`ip:${sha256(normalizedIp)}`);
  }
  return {
    primary: keys[0],
    keys: uniqueKeys(keys)
  };
}

export function creditAccountKeysForIdentity({ authUserId, installId } = {}) {
  if (authUserId) {
    return uniqueKeys([
      userKeyForIdentity({ authUserId, installId }),
      installId ? userKeyFor(installId) : ""
    ]);
  }
  return [userKeyFor(installId)];
}

export async function creditSpendKeysForIdentity({ authUserId, installId, email, config } = {}) {
  const directKeys = creditAccountKeysForIdentity({ authUserId, installId });
  if (!config) return directKeys;
  const emailAccounts = await getCreditAccountsForVerifiedEmail({ authUserId, email, config });
  return uniqueKeys([
    ...directKeys,
    ...emailAccounts.map((account) => account.user_key)
  ]);
}

export async function supabaseFetch(config, path, options) {
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

function verifiedEmailHashForIdentity({ authUserId, email } = {}) {
  const normalizedEmail = normalizeUserId(email);
  if (!authUserId || !normalizedEmail || normalizedEmail === "anonymous") return "";
  return sha256(normalizedEmail);
}

function normalizeIp(value) {
  const ip = String(value || "").split(",")[0].trim().toLowerCase();
  if (!ip || ip === "unknown") return "";
  return ip.replace(/^::ffff:/, "");
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function uniqueKeys(keys) {
  return [...new Set(keys.filter(Boolean))];
}

function uniqueAccounts(accounts) {
  const byUserKey = new Map();
  for (const account of accounts) {
    if (account?.user_key && !byUserKey.has(account.user_key)) {
      byUserKey.set(account.user_key, account);
    }
  }
  return [...byUserKey.values()];
}
