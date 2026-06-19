import { cleanText } from "./text.js";

export async function summarizeWithOpenAI({ title, articleUrl, config }) {
  const lockedArticle = buildLockedArticle(title, articleUrl);
  const prompt = [
    "You are Brevi, a careful open-web news summarizer.",
    "",
    "Your job is not to bypass paywalls. Your job is to find free, reliable coverage of the same story and summarize only what is supported by the free source.",
    "",
    "Before summarizing, verify that the free source appears to cover the same story as the locked article.",
    "",
    "Check:",
    "- same main subject",
    "- same event",
    "- same date or timeframe",
    "- same people, companies, locations, or institutions",
    "- not just a broadly related topic",
    "",
    "Rules:",
    "- Do not bypass or reproduce paywalled content.",
    "- Only summarize free, accessible sources.",
    "- Verify that the free source is about the same story as the locked article.",
    "- Every factual bullet must be supported by at least one source.",
    "- Do not invent facts.",
    "- Do not show internal search IDs to the user.",
    "- Do not use the paywalled article body.",
    "- Do not claim this is a full replacement for the original article.",
    "- If no reliable free match is found, do not summarize.",
    "- If confidence is low, show exactly: No reliable free coverage found.",
    "- If confidence is medium, summarize with a clear caution.",
    "- Separate sources checked from sources used.",
    "- Do not list a source as used unless it directly supports at least one bullet.",
    "",
    `Locked article title: ${lockedArticle.title}`,
    `Locked article domain: ${lockedArticle.domain}`,
    `Locked article URL: ${lockedArticle.url}`,
    "",
    "Return JSON only with exactly these snake_case keys:",
    "match_confidence: high | medium | low",
    "source_quality: high | medium | low",
    "locked_article: object with title, domain, url",
    "best_free_match: object with publisher, title, url, date, reason",
    "summary_bullets: array of objects, each with text and sources",
    "summary_bullets[].sources: array of objects with publisher and url",
    "sources_used: array of objects with publisher, title, url, date, reason_used",
    "sources_checked_count: number",
    "missing_context: string describing what may be missing compared with the original paywalled article",
    "warning: string; include a warning if this is not clearly the same story",
    "",
    "Reference rules:",
    "- Every factual bullet must be supported by at least one source object with publisher and url.",
    "- Do not include a bullet if no source supports it.",
    "- Do not list a source as used unless it directly supports at least one bullet.",
    "- Separate sources checked from sources used.",
    "- If the source URL is missing, do not use that source.",
    "- If match_confidence is low, summary_bullets must be [] and sources_used may be [].",
    "- Never return internal IDs like turn0search8, turn0search3, source_ids, or search result IDs."
  ].join("\n");

  const openaiResponse = await fetch(config.openaiEndpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${config.openaiApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.openaiModel,
      tools: [
        { type: "web_search" }
      ],
      tool_choice: "required",
      input: prompt
    })
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    throw new Error(`OpenAI API error (${openaiResponse.status}): ${errorText.slice(0, 320)}`);
  }

  const data = await openaiResponse.json();
  const text = extractResponseText(data);
  if (!text) {
    throw new Error("OpenAI did not return summary text.");
  }

  return parseSummaryJson(text, lockedArticle);
}

function extractResponseText(data) {
  if (data.output_text) return data.output_text.trim();

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" || content.type === "text")
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

function parseSummaryJson(text, lockedArticle) {
  const trimmed = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);
    return normalizeSummaryResult(parsed, lockedArticle);
  } catch (error) {
    return lowConfidenceResult("No reliable free coverage found.", { lockedArticle });
  }
}

function normalizeSummaryResult(parsed, fallbackLockedArticle) {
  const matchConfidence = normalizeRating(parsed.match_confidence || parsed.matchConfidence);
  const sourceQuality = normalizeRating(parsed.source_quality || parsed.sourceQuality);
  const sourcesUsed = normalizeSources(parsed.sources_used || parsed.sourcesUsed);
  const summaryBullets = normalizeSummaryBullets(parsed.summary_bullets || parsed.summaryBullets || parsed.summary, sourcesUsed);
  const fallbackSource = sourcesUsed[0] || {};
  const lockedArticle = normalizeLockedArticle(parsed.locked_article || parsed.lockedArticle, fallbackLockedArticle);
  const bestFreeMatch = normalizeBestFreeMatch(parsed.best_free_match || parsed.bestFreeMatch, fallbackSource);
  const sourceUrl = bestFreeMatch.url || String(parsed.source_url || parsed.sourceUrl || fallbackSource.url || "").trim();
  const sourceTitle = bestFreeMatch.title || String(parsed.source_title || parsed.sourceTitle || fallbackSource.title || "Free coverage found").trim();
  const sourcesCheckedCount = Math.max(Number(parsed.sources_checked_count || parsed.sourcesCheckedCount || sourcesUsed.length || 0), sourcesUsed.length);
  const missingContext = String(parsed.missing_context || parsed.missingContext || parsed.key_missing_context || parsed.keyMissingContext || "").trim();
  const warning = String(parsed.warning || "").trim();

  if (matchConfidence === "low" || summaryBullets.length === 0 || sourcesUsed.length === 0 || !sourceUrl) {
    return lowConfidenceResult(warning || "No reliable free coverage found.", {
      lockedArticle,
      bestFreeMatch,
      sourceTitle,
      sourceUrl,
      sourceQuality,
      missingContext,
      sourcesCheckedCount
    });
  }

  return {
    matchConfidence,
    sourceQuality,
    lockedArticle,
    bestFreeMatch,
    sourceTitle,
    sourceUrl,
    summary: summaryBullets.map((bullet) => bullet.text).join("\n"),
    summaryBullets,
    sourcesUsed,
    sourcesCheckedCount,
    missingContext,
    keyMissingContext: missingContext,
    warning: matchConfidence === "medium"
      ? warning || "This free source appears related, but may not fully match every detail of the locked article."
      : warning
  };
}

function lowConfidenceResult(warning, overrides = {}) {
  const lockedArticle = overrides.lockedArticle || buildLockedArticle("", "");
  return {
    matchConfidence: "low",
    sourceQuality: overrides.sourceQuality || "low",
    lockedArticle,
    bestFreeMatch: overrides.bestFreeMatch || {},
    sourceTitle: overrides.sourceTitle || "No reliable free coverage found",
    sourceUrl: overrides.sourceUrl || "",
    summary: "",
    summaryBullets: [],
    sourcesUsed: [],
    sourcesCheckedCount: Number(overrides.sourcesCheckedCount || 0),
    bestMatchSource: "",
    missingContext: overrides.missingContext || "Brevi could not access the original paywalled article body, so details unique to that article may be missing.",
    keyMissingContext: overrides.missingContext || "Brevi could not access the original paywalled article body, so details unique to that article may be missing.",
    warning
  };
}

function normalizeRating(value) {
  const rating = String(value || "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(rating) ? rating : "low";
}

function normalizeSummaryBullets(value, sourcesUsed) {
  const sourceByUrl = new Map(sourcesUsed.map((source) => [normalizeUrl(source.url), source]));
  const sourceByPublisher = new Map(sourcesUsed.map((source) => [normalizeName(source.publisher), source]));
  const items = Array.isArray(value) ? value : String(value || "")
    .split("\n")
    .map((line) => ({ text: line.replace(/^[-*]\s*/, ""), sources: [] }));

  return items
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), sources: [] };
      }

      const rawSources = Array.isArray(item.sources)
        ? item.sources
        : (Array.isArray(item.source_ids) ? item.source_ids : item.sourceIds || []);
      const sources = rawSources
        .map((source) => normalizeBulletSource(source, sourceByUrl, sourceByPublisher))
        .filter(Boolean);

      return {
        text: String(item.text || item.bullet || "").trim(),
        sources
      };
    })
    .filter((item) => item.text && item.sources.length > 0)
    .slice(0, 5);
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((source, index) => {
      const url = String(source?.url || "").trim();
      if (!url || seen.has(normalizeUrl(url))) return null;
      seen.add(normalizeUrl(url));
      const publisher = sanitizePublisher(source.publisher) || publisherFromUrl(url);

      return {
        id: `S${index + 1}`,
        publisher,
        title: String(source.title || "").trim(),
        url,
        date: String(source.date || "").trim(),
        reasonUsed: String(source.reason_used || source.reasonUsed || "").trim()
      };
    })
    .filter(Boolean);
}

function normalizeBulletSource(source, sourceByUrl, sourceByPublisher) {
  if (typeof source === "string") {
    const normalized = normalizeName(source);
    return sourceByPublisher.get(normalized) || null;
  }

  const url = String(source?.url || "").trim();
  const publisher = sanitizePublisher(source?.publisher) || (url ? publisherFromUrl(url) : "");
  const matched = url ? sourceByUrl.get(normalizeUrl(url)) : sourceByPublisher.get(normalizeName(publisher));
  if (!matched?.url) return null;

  return {
    publisher: matched.publisher || publisher,
    url: matched.url
  };
}

function normalizeLockedArticle(value, fallback) {
  return {
    title: String(value?.title || fallback?.title || "").trim(),
    domain: String(value?.domain || fallback?.domain || "").trim(),
    url: String(value?.url || fallback?.url || "").trim()
  };
}

function normalizeBestFreeMatch(value, fallback = {}) {
  const url = String(value?.url || fallback.url || "").trim();
  const publisher = sanitizePublisher(value?.publisher) || sanitizePublisher(fallback.publisher) || (url ? publisherFromUrl(url) : "");
  return {
    publisher,
    title: String(value?.title || fallback.title || "").trim(),
    url,
    date: String(value?.date || fallback.date || "").trim(),
    reason: String(value?.reason || fallback.reasonUsed || "").trim()
  };
}

function buildLockedArticle(title, articleUrl) {
  const url = cleanText(articleUrl, 2000);
  return {
    title: cleanText(title),
    domain: publisherFromUrl(url),
    url
  };
}

function publisherFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

function sanitizePublisher(value) {
  const publisher = String(value || "").trim();
  return /^turn\d+|search\d+|result\d+|source[_-]?\d+/i.test(publisher) ? "" : publisher;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
