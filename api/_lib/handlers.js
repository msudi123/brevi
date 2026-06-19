import { getConfig, hasSupabaseConfig } from "./env.js";
import { readJsonBody, sendJson } from "./http.js";
import { summarizeWithOpenAI } from "./openai.js";
import { getUsage, incrementUsage, recordSummaryEvent, resetUsage } from "./supabase.js";
import { cleanText } from "./text.js";

export async function handleHealth(request, response) {
  const config = getConfig();
  sendJson(response, 200, {
    ok: true,
    appName: config.appName,
    model: config.openaiModel,
    hasOpenAIKey: Boolean(config.openaiApiKey),
    hasSupabase: hasSupabaseConfig(config),
    whopReady: false
  }, config);
}

export async function handleUsage(request, response) {
  const config = getConfig();
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const installId = cleanText(url.searchParams.get("installId") || url.searchParams.get("userId") || "");
  const email = cleanText(url.searchParams.get("email") || "");

  try {
    const usage = await getUsage({ installId, email, config });
    sendJson(response, 200, usage, config);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message: error.message
    }, config);
  }
}

export async function handleResetUsage(request, response) {
  const config = getConfig();
  if (config.nodeEnv === "production") {
    sendJson(response, 403, {
      ok: false,
      message: "Usage reset is disabled in production."
    }, config);
    return;
  }

  const body = await readJsonBody(request);
  await resetUsage({
    installId: cleanText(body.installId || body.userId || ""),
    email: cleanText(body.email || ""),
    config
  });
  sendJson(response, 200, { ok: true }, config);
}

export async function handleSummarize(request, response) {
  const config = getConfig();
  if (!config.openaiApiKey) {
    sendJson(response, 500, {
      ok: false,
      message: "OPENAI_API_KEY is missing."
    }, config);
    return;
  }

  const body = await readJsonBody(request);
  const title = cleanText(body.title || "Unknown article");
  const articleUrl = cleanText(body.url || "", 2000);
  const installId = cleanText(body.installId || body.userId || "");
  const email = cleanText(body.email || "");

  if (!articleUrl) {
    sendJson(response, 400, {
      ok: false,
      message: "Article URL is required."
    }, config);
    return;
  }

  try {
    const usage = await getUsage({ installId, email, config });
    if (usage.count >= config.freeDailyLimit) {
      await safeRecordSummaryEvent({
        installId,
        email,
        articleUrl,
        status: "limit",
        errorCategory: "limit",
        config
      });
      sendJson(response, 402, {
        ok: false,
        message: `You've used ${config.freeDailyLimit} free summaries today.`,
        upgradeUrl: config.whopCheckoutUrl,
        count: usage.count,
        limit: config.freeDailyLimit
      }, config);
      return;
    }

    const result = await summarizeWithOpenAI({ title, articleUrl, config });
    const shouldCountUsage = result.matchConfidence === "high" || result.matchConfidence === "medium";
    if (shouldCountUsage) {
      await incrementUsage({ installId, email, config });
    }
    await safeRecordSummaryEvent({
      installId,
      email,
      articleUrl,
      status: "success",
      sourceUrl: result.sourceUrl,
      matchConfidence: result.matchConfidence,
      sourceQuality: result.sourceQuality,
      config
    });

    const nextUsage = await getUsage({ installId, email, config });
    sendJson(response, 200, {
      ok: true,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      summary: result.summary,
      summaryBullets: result.summaryBullets,
      sourcesUsed: result.sourcesUsed,
      sourcesCheckedCount: result.sourcesCheckedCount,
      bestMatchSource: result.bestMatchSource,
      matchConfidence: result.matchConfidence,
      sourceQuality: result.sourceQuality,
      keyMissingContext: result.keyMissingContext,
      warning: result.warning,
      remaining: Math.max(config.freeDailyLimit - nextUsage.count, 0),
      paid: false
    }, config);
  } catch (error) {
    await safeRecordSummaryEvent({
      installId,
      email,
      articleUrl,
      status: "error",
      errorCategory: classifyError(error),
      config
    });
    sendJson(response, 500, {
      ok: false,
      message: error.message || "Brevi could not summarize this article."
    }, config);
  }
}

function classifyError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("openai")) return "openai";
  if (message.includes("supabase")) return "supabase";
  if (message.includes("missing")) return "config";
  return "unknown";
}

async function safeRecordSummaryEvent(event) {
  try {
    await recordSummaryEvent(event);
  } catch (error) {
    console.error("Brevi summary event logging failed:", error);
  }
}
