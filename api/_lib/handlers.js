import { getConfig, hasSupabaseConfig } from "./env.js";
import { availableCreditPacks, createLemonCheckout, packForId, parseLemonOrderEvent, verifyLemonSignature } from "./credits.js";
import { readJsonBody, readRawBody, sendHtml, sendJson } from "./http.js";
import { summarizeWithOpenAI } from "./openai.js";
import {
  assertRateLimit,
  getCreditAccount,
  getUsage,
  grantPurchasedCredits,
  incrementUsage,
  recordSummaryEvent,
  refundPurchasedCredits,
  resetUsage,
  spendPaidCredit
} from "./supabase.js";
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
  const ipAddress = getClientIp(request);

  try {
    const usage = await getUsage({ installId, email, ipAddress, config });
    sendJson(response, 200, usage, config);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message: error.message
    }, config);
  }
}

export async function handleCredits(request, response) {
  const config = getConfig();
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const installId = cleanText(url.searchParams.get("installId") || url.searchParams.get("userId") || "");
  const email = cleanText(url.searchParams.get("email") || "");
  const ipAddress = getClientIp(request);

  try {
    await assertRateLimit({
      key: installId || ipAddress,
      route: "credits_status",
      limit: 60,
      windowSeconds: 60,
      config
    });
    const [usage, creditAccount] = await Promise.all([
      getUsage({ installId, email, ipAddress, config }),
      getCreditAccount({ installId, email, config })
    ]);
    sendJson(response, 200, {
      ok: true,
      free: usage,
      paid: {
        balance: creditAccount.balance
      },
      packs: availableCreditPacks(config)
    }, config);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.message
    }, config);
  }
}

export async function handleCreditCheckout(request, response) {
  const config = getConfig();
  const ipAddress = getClientIp(request);

  try {
    const body = await readJsonBody(request);
    const installId = cleanText(body.installId || body.userId || "");
    const email = cleanText(body.email || "");
    const pack = packForId(body.pack);
    if (!installId) {
      sendJson(response, 400, { ok: false, message: "Install ID is required." }, config);
      return;
    }
    if (!pack) {
      sendJson(response, 400, { ok: false, message: "Unknown credit pack." }, config);
      return;
    }

    await assertRateLimit({
      key: installId || ipAddress,
      route: "credits_checkout",
      limit: 8,
      windowSeconds: 300,
      config
    });
    const checkout = await createLemonCheckout({ pack, installId, email, config });
    sendJson(response, 200, {
      ok: true,
      checkoutUrl: checkout.checkoutUrl,
      pack: {
        id: pack.id,
        name: pack.name,
        credits: pack.credits
      }
    }, config);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.message
    }, config);
  }
}

export async function handleCreditConfirm(request, response) {
  const config = getConfig();
  sendHtml(response, 200, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Brevi credits</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0B1320; background: #F5F7FA; }
      main { width: min(420px, calc(100vw - 32px)); padding: 24px; border: 1px solid rgba(11, 19, 32, 0.1); border-radius: 8px; background: #fff; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0; color: #334155; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Credits are processing</h1>
      <p>Return to Brevi and refresh the popup. Your paid credits will appear after Lemon Squeezy sends the verified webhook.</p>
    </main>
  </body>
</html>`, config);
}

export async function handleLemonWebhook(request, response) {
  const config = getConfig();
  const rawBody = await readRawBody(request);
  const signature = getHeader(request, "x-signature");

  if (!verifyLemonSignature(rawBody, signature, config.lemonSqueezyWebhookSecret)) {
    sendJson(response, 401, {
      ok: false,
      message: "Invalid Lemon Squeezy signature."
    }, config);
    return;
  }

  try {
    const event = JSON.parse(rawBody || "{}");
    const parsed = parseLemonOrderEvent(event, config);
    if (!parsed.installId || !parsed.orderId || !parsed.pack || parsed.credits <= 0) {
      sendJson(response, 202, { ok: true, ignored: true }, config);
      return;
    }

    if (parsed.eventName === "order_created") {
      const result = await grantPurchasedCredits({
        installId: parsed.installId,
        email: parsed.email,
        lemonOrderId: parsed.orderId,
        lemonEventId: parsed.eventId,
        variantId: parsed.variantId,
        pack: parsed.pack.id,
        credits: parsed.credits,
        config
      });
      sendJson(response, 200, { ok: true, result }, config);
      return;
    }

    if (parsed.eventName === "order_refunded") {
      const result = await refundPurchasedCredits({
        installId: parsed.installId,
        email: parsed.email,
        lemonOrderId: parsed.orderId,
        lemonEventId: parsed.eventId,
        credits: parsed.credits,
        config
      });
      sendJson(response, 200, { ok: true, result }, config);
      return;
    }

    sendJson(response, 202, { ok: true, ignored: true }, config);
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
  const ipAddress = getClientIp(request);
  await resetUsage({
    installId: cleanText(body.installId || body.userId || ""),
    email: cleanText(body.email || ""),
    ipAddress,
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
  const excludedSourceUrls = normalizeExcludedSourceUrls(body.excludedSourceUrls || body.excludeUrls || body.excluded_sources);
  const ipAddress = getClientIp(request);

  if (!articleUrl) {
    sendJson(response, 400, {
      ok: false,
      message: "Article URL is required."
    }, config);
    return;
  }

  try {
    await assertRateLimit({
      key: installId || ipAddress,
      route: "summarize",
      limit: config.rateLimitMaxRequests,
      windowSeconds: config.rateLimitWindowSeconds,
      config
    });
    const usage = await getUsage({ installId, email, ipAddress, config });
    const paidAccount = usage.count >= config.freeDailyLimit
      ? await getCreditAccount({ installId, email, config })
      : { balance: 0 };
    if (usage.count >= config.freeDailyLimit && paidAccount.balance <= 0) {
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
        buyCredits: true,
        count: usage.count,
        limit: config.freeDailyLimit,
        paidCredits: 0
      }, config);
      return;
    }

    const result = await summarizeWithOpenAI({ title, articleUrl, excludedSourceUrls, config });
    const shouldCountUsage = result.status === "success" && (result.matchConfidence === "high" || result.matchConfidence === "medium");
    if (shouldCountUsage) {
      if (usage.count < config.freeDailyLimit) {
        await incrementUsage({ installId, email, ipAddress, config });
      } else {
        const spend = await spendPaidCredit({ installId, email, articleUrl, config });
        if (!spend?.spent) {
          const error = new Error("No paid credits are available.");
          error.statusCode = 402;
          throw error;
        }
      }
    }
    await safeRecordSummaryEvent({
      installId,
      email,
      articleUrl,
      status: result.status === "success" ? "success" : "no_reliable_free_coverage",
      sourceUrl: result.sourceUrl,
      matchConfidence: result.matchConfidence,
      sourceQuality: result.sourceQuality,
      config
    });

    const nextUsage = await getUsage({ installId, email, ipAddress, config });
    const nextPaidAccount = await getCreditAccount({ installId, email, config });
    sendJson(response, 200, {
      ok: true,
      status: result.status,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      lockedArticle: result.lockedArticle,
      bestFreeMatch: result.bestFreeMatch,
      sourceValidation: result.sourceValidation,
      source_validation: result.source_validation,
      summary: result.summary,
      summaryBullets: result.summaryBullets,
      sourcesUsed: result.sourcesUsed,
      sourcesCheckedCount: result.sourcesCheckedCount,
      bestMatchSource: result.bestMatchSource,
      matchConfidence: result.matchConfidence,
      sourceQuality: result.sourceQuality,
      missingContext: result.missingContext,
      keyMissingContext: result.keyMissingContext,
      readOriginalRecommendation: result.readOriginalRecommendation,
      warning: result.warning,
      remaining: Math.max(config.freeDailyLimit - nextUsage.count, 0),
      paid: usage.count >= config.freeDailyLimit && shouldCountUsage,
      paidCreditUsed: usage.count >= config.freeDailyLimit && shouldCountUsage ? 1 : 0,
      paidCredits: nextPaidAccount.balance
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
    sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.message || "Brevi could not summarize this article.",
      buyCredits: error.statusCode === 402 || undefined
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

function getClientIp(request) {
  const headers = request.headers || {};
  const forwardedFor = typeof headers.get === "function"
    ? headers.get("x-forwarded-for")
    : headers["x-forwarded-for"];
  const realIp = typeof headers.get === "function"
    ? headers.get("x-real-ip")
    : headers["x-real-ip"];
  return cleanText(
    forwardedFor
    || realIp
    || request.socket?.remoteAddress
    || "",
    120
  );
}

function getHeader(request, name) {
  const headers = request.headers || {};
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] || headers[name.toLowerCase()];
}

function normalizeExcludedSourceUrls(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((url) => cleanText(url, 2000))
    .filter(Boolean))]
    .slice(0, 12);
}
