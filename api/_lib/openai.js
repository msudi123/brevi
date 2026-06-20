import { cleanText } from "./text.js";

const MIN_USABLE_TEXT_LENGTH = 500;
const MAX_VALIDATED_SOURCES = 4;
const PAYWALL_PATTERNS = [
  /subscribe to continue/i,
  /subscription required/i,
  /this article is for subscribers/i,
  /already a subscriber/i,
  /sign in to continue reading/i,
  /continue reading with a subscription/i,
  /create a free account or subscribe/i,
  /you have reached your article limit/i,
  /you've reached your article limit/i,
  /unlock this article/i,
  /premium content/i
];

export async function summarizeWithOpenAI({ title, articleUrl, config }) {
  const lockedArticle = buildLockedArticle(title, articleUrl);
  const candidates = await discoverOpenWebCandidates({ lockedArticle, config });
  const validation = await validateOpenWebSources(candidates, lockedArticle);

  if (validation.validSources.length === 0) {
    const samePublisherResults = validation.excludedSources.filter((source) => source.reason === "same_domain").length;
    const warning = samePublisherResults > 0
      ? "Brevi could not find separate open-web coverage of this story."
      : "No reliable free coverage found.";
    return noReliableCoverageResult({
      lockedArticle,
      sourceValidation: validation.sourceValidation,
      sourcesCheckedCount: candidates.length,
      warning
    });
  }

  const summary = await summarizeValidatedSources({
    lockedArticle,
    validatedSources: validation.validSources,
    sourceValidation: validation.sourceValidation,
    config
  });

  return enforceValidatedSources(summary, {
    lockedArticle,
    validatedSources: validation.validSources,
    sourceValidation: validation.sourceValidation,
    sourcesCheckedCount: candidates.length
  });
}

async function discoverOpenWebCandidates({ lockedArticle, config }) {
  const prompt = [
    "You are Brevi's source discovery worker.",
    "",
    "The locked article is only a search seed. Do not summarize it. Do not use it as a source.",
    "",
    `Locked article title: ${lockedArticle.title}`,
    `Locked article domain: ${lockedArticle.domain}`,
    `Locked article URL: ${lockedArticle.url}`,
    "",
    "Use web search to find separate free/open-web articles that clearly cover the same story.",
    "Prefer different publishers/domains. The original publisher/domain must not be treated as a valid source.",
    "",
    "Return JSON only:",
    "{",
    "  \"candidates\": [",
    "    {",
    "      \"publisher\": \"\",",
    "      \"title\": \"\",",
    "      \"url\": \"\",",
    "      \"date\": \"\",",
    "      \"snippet\": \"\",",
    "      \"reason\": \"why this appears to cover the same story\"",
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Do not include the locked article URL.",
    "- Do not include internal search IDs.",
    "- Do not include a result with a missing URL.",
    "- Include at most 8 candidates."
  ].join("\n");

  const response = await callOpenAI({
    config,
    input: prompt,
    tools: [{ type: "web_search" }],
    toolChoice: "required"
  });
  const parsed = parseJsonObject(response);
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  return normalizeCandidateSources(candidates).slice(0, 8);
}

async function summarizeValidatedSources({ lockedArticle, validatedSources, sourceValidation, config }) {
  const sourcePayload = validatedSources.map((source, index) => ({
    id: `S${index + 1}`,
    publisher: source.publisher,
    title: source.title,
    url: source.url,
    final_url: source.finalUrl,
    canonical_url: source.canonicalUrl,
    date: source.date,
    reason: source.reason,
    text: source.text
  }));

  const prompt = [
    "You are Brevi, a careful open-web news summarizer.",
    "",
    "Brevi must not summarize the original locked article. The locked article is only a search target.",
    "",
    "Rules:",
    "- Do not use the locked article URL as a source.",
    "- Do not cite the locked article as supporting evidence.",
    "- Do not list the locked article under sources_used.",
    "- Do not set the locked article as best_free_match.",
    "- Only summarize the validated separate free/open-web sources provided below.",
    "- Every factual bullet must be supported by at least one validated source object with publisher and url.",
    "- Do not invent facts.",
    "- Do not show internal search IDs to the user.",
    "- If no separate reliable free source is found, return status no_reliable_free_coverage and no bullets.",
    "",
    `Locked article title: ${lockedArticle.title}`,
    `Locked article domain: ${lockedArticle.domain}`,
    `Locked article URL: ${lockedArticle.url}`,
    "",
    "Validated open-web sources JSON:",
    JSON.stringify(sourcePayload, null, 2),
    "",
    "Return JSON only with exactly these snake_case keys:",
    "locked_article: object with title, domain, url",
    "best_free_match: object with publisher, title, url, date, reason",
    "source_validation: object exactly matching the provided source_validation object",
    "summary_bullets: array of objects with text and sources",
    "summary_bullets[].sources: array of objects with publisher and url",
    "sources_used: array of objects with publisher, title, url, date, reason_used",
    "status: success | no_reliable_free_coverage",
    "match_confidence: high | medium | low",
    "source_quality: high | medium | low",
    "sources_checked_count: number",
    "missing_context: string describing what may be missing compared with the original paywalled article",
    "warning: string",
    "read_original_recommendation: object with label, confidence, reason, open_web_coverage_strength, possible_unique_value, why, cta_primary",
    "",
    "Provided source_validation object:",
    JSON.stringify(toSnakeSourceValidation(sourceValidation), null, 2)
  ].join("\n");

  const response = await callOpenAI({
    config,
    input: prompt,
    tools: [],
    toolChoice: undefined
  });
  return parseSummaryJson(response, lockedArticle, sourceValidation);
}

async function callOpenAI({ config, input, tools, toolChoice }) {
  const body = {
    model: config.openaiModel,
    input
  };
  if (tools?.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const openaiResponse = await fetch(config.openaiEndpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${config.openaiApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
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
  return text;
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

function parseJsonObject(text) {
  const trimmed = String(text || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);
  } catch (error) {
    return null;
  }
}

function parseSummaryJson(text, lockedArticle, sourceValidation) {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return noReliableCoverageResult({
      lockedArticle,
      sourceValidation,
      warning: "No reliable free coverage found."
    });
  }
  return normalizeSummaryResult(parsed, lockedArticle, sourceValidation);
}

function normalizeSummaryResult(parsed, fallbackLockedArticle, fallbackSourceValidation) {
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
  const sourceValidation = normalizeSourceValidation(parsed.source_validation || parsed.sourceValidation, fallbackSourceValidation);
  const readOriginalRecommendation = normalizeReadOriginalRecommendation(
    parsed.read_original_recommendation || parsed.readOriginalRecommendation,
    {
      matchConfidence,
      sourceQuality,
      sourcesUsedCount: sourcesUsed.length,
      sourcesCheckedCount,
      lockedArticle,
      bestFreeMatch
    }
  );

  if (
    parsed.status === "no_reliable_free_coverage" ||
    sourceValidation.validOpenWebSourcesCount === 0 ||
    matchConfidence === "low" ||
    summaryBullets.length === 0 ||
    sourcesUsed.length === 0 ||
    !sourceUrl
  ) {
    return noReliableCoverageResult({
      lockedArticle,
      sourceValidation,
      sourcesCheckedCount,
      warning: warning || "No reliable free coverage found.",
      readOriginalRecommendation
    });
  }

  return {
    status: "success",
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
    sourceValidation,
    source_validation: toSnakeSourceValidation(sourceValidation),
    missingContext,
    keyMissingContext: missingContext,
    readOriginalRecommendation,
    warning: matchConfidence === "medium"
      ? warning || "This free source appears related, but may not fully match every detail of the locked article."
      : warning
  };
}

function enforceValidatedSources(result, context) {
  const validByUrl = new Map(context.validatedSources.map((source) => [normalizeUrl(source.url), source]));
  const validFinalByUrl = new Map(context.validatedSources.map((source) => [normalizeUrl(source.finalUrl), source]));
  const sourceValidation = context.sourceValidation;
  const sourcesUsed = normalizeSources(result.sourcesUsed)
    .filter((source) => validByUrl.has(normalizeUrl(source.url)) || validFinalByUrl.has(normalizeUrl(source.url)));
  const summaryBullets = normalizeSummaryBullets(result.summaryBullets, sourcesUsed);
  const bestFreeMatch = sourcesUsed.find((source) => normalizeUrl(source.url) === normalizeUrl(result.bestFreeMatch?.url)) || sourcesUsed[0] || {};

  if (sourcesUsed.length === 0 || summaryBullets.length === 0) {
    return noReliableCoverageResult({
      lockedArticle: context.lockedArticle,
      sourceValidation,
      sourcesCheckedCount: context.sourcesCheckedCount,
      warning: "No reliable free coverage found.",
      readOriginalRecommendation: result.readOriginalRecommendation
    });
  }

  return {
    ...result,
    status: "success",
    lockedArticle: context.lockedArticle,
    bestFreeMatch: normalizeBestFreeMatch(bestFreeMatch),
    sourceTitle: bestFreeMatch.title || result.sourceTitle || "Free coverage found",
    sourceUrl: bestFreeMatch.url || result.sourceUrl || "",
    sourcesUsed,
    summaryBullets,
    summary: summaryBullets.map((bullet) => bullet.text).join("\n"),
    sourcesCheckedCount: context.sourcesCheckedCount,
    sourceValidation,
    source_validation: toSnakeSourceValidation(sourceValidation)
  };
}

function normalizeCandidateSources(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((source) => {
      const url = String(source?.url || "").trim();
      const normalized = normalizeUrl(url);
      if (!url || !normalized || seen.has(normalized)) return null;
      seen.add(normalized);
      const publisher = sanitizePublisher(source.publisher) || publisherFromUrl(url);
      return {
        publisher,
        title: cleanText(source.title || "", 300),
        url,
        date: cleanText(source.date || "", 80),
        snippet: cleanText(source.snippet || source.description || "", 600),
        reason: cleanText(source.reason || "", 500)
      };
    })
    .filter(Boolean);
}

async function validateOpenWebSources(candidates, lockedArticle) {
  const excludedSources = [];
  const validSources = [];

  for (const candidate of candidates) {
    const validation = await isValidOpenWebSource(candidate, lockedArticle);
    if (!validation.valid) {
      excludedSources.push({
        url: candidate.url || "",
        reason: validation.reason
      });
      continue;
    }

    validSources.push({
      ...candidate,
      publisher: candidate.publisher || publisherFromUrl(validation.finalUrl || candidate.url),
      title: validation.title || candidate.title,
      url: candidate.url,
      finalUrl: validation.finalUrl || candidate.url,
      canonicalUrl: validation.canonicalUrl || "",
      text: cleanText(validation.text, 6000)
    });

    if (validSources.length >= MAX_VALIDATED_SOURCES) break;
  }

  const sourceValidation = {
    originalArticleExcluded: true,
    excludedSources,
    validOpenWebSourcesCount: validSources.length
  };

  return { validSources, excludedSources, sourceValidation };
}

export async function isValidOpenWebSource(source, lockedArticle, options = {}) {
  const url = String(source?.url || "").trim();
  if (!url) return invalid("no_usable_content");

  const lockedUrl = lockedArticle?.url || "";
  const sourceNormalized = normalizeUrl(url);
  const lockedNormalized = normalizeUrl(lockedUrl);
  if (!sourceNormalized || !lockedNormalized) return invalid("no_usable_content");
  if (sourceNormalized === lockedNormalized) return invalid("same_as_locked_article");

  const sourceDomain = domainFromUrl(url);
  const lockedDomain = domainFromUrl(lockedUrl || lockedArticle?.domain || "");
  if (sourceDomain && lockedDomain && sourceDomain === lockedDomain) return invalid("same_domain");

  let page = options.page || source.page || null;
  if (!page) {
    const fetchPage = options.fetchPage || fetchArticlePage;
    page = await fetchPage(url);
  }

  if (!page?.ok) return invalid("no_usable_content");

  const finalUrl = page.finalUrl || url;
  if (normalizeUrl(finalUrl) === lockedNormalized) return invalid("same_as_locked_article");
  if (domainFromUrl(finalUrl) === lockedDomain) return invalid("same_domain");

  const canonicalUrl = page.canonicalUrl || "";
  if (canonicalUrl && normalizeUrl(canonicalUrl) === lockedNormalized) return invalid("duplicate");
  if (canonicalUrl && domainFromUrl(canonicalUrl) === lockedDomain) return invalid("same_domain");

  const pageTitle = page.title || source.title || "";
  if (
    sourceDomain === lockedDomain &&
    (isNearIdenticalTitle(pageTitle, lockedArticle.title) || isNearIdenticalPath(finalUrl, lockedUrl))
  ) {
    return invalid("duplicate");
  }
  if (isNearIdenticalTitle(pageTitle, lockedArticle.title) && isNearIdenticalPath(finalUrl, lockedUrl)) {
    return invalid("duplicate");
  }

  if (page.isPaywalled || looksPaywalled(page.text || page.html || "")) return invalid("paywalled");
  const usableText = cleanText(page.text || extractUsableText(page.html || ""), 8000);
  if (usableText.length < MIN_USABLE_TEXT_LENGTH) return invalid("no_usable_content");

  return {
    valid: true,
    finalUrl,
    canonicalUrl,
    title: cleanText(pageTitle, 300),
    text: usableText
  };
}

function invalid(reason) {
  return { valid: false, reason };
}

async function fetchArticlePage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "BreviBot/1.0 (+https://brevi-psi.vercel.app)"
      }
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/html|text/i.test(contentType)) {
      return { ok: false, finalUrl: response.url || url };
    }
    const html = await response.text();
    return {
      ok: true,
      finalUrl: response.url || url,
      canonicalUrl: extractCanonicalUrl(html, response.url || url),
      title: extractHtmlTitle(html),
      text: extractUsableText(html),
      html,
      isPaywalled: looksPaywalled(html)
    };
  } catch (error) {
    return { ok: false, finalUrl: url };
  } finally {
    clearTimeout(timeout);
  }
}

function extractCanonicalUrl(html, baseUrl) {
  const match = String(html || "").match(/<link[^>]+rel=["']canonical["'][^>]*>/i)
    || String(html || "").match(/<link[^>]+rel=canonical[^>]*>/i);
  const href = match?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) return "";
  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return "";
  }
}

function extractHtmlTitle(html) {
  const og = String(html || "").match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  const title = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return cleanText(decodeHtml(og || title || ""), 300);
}

function extractUsableText(html) {
  return cleanText(
    decodeHtml(String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")),
    12000
  );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function looksPaywalled(value) {
  const text = String(value || "");
  return PAYWALL_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeSourceValidation(value, fallback = {}) {
  const excluded = Array.isArray(value?.excluded_sources)
    ? value.excluded_sources
    : Array.isArray(value?.excludedSources)
      ? value.excludedSources
      : fallback.excludedSources || [];
  const count = Number(
    value?.valid_open_web_sources_count
    ?? value?.validOpenWebSourcesCount
    ?? fallback.validOpenWebSourcesCount
    ?? 0
  );
  return {
    originalArticleExcluded: value?.original_article_excluded ?? value?.originalArticleExcluded ?? fallback.originalArticleExcluded ?? true,
    excludedSources: excluded.map((source) => ({
      url: String(source?.url || "").trim(),
      reason: normalizeExclusionReason(source?.reason)
    })),
    validOpenWebSourcesCount: Number.isFinite(count) ? count : 0
  };
}

function toSnakeSourceValidation(value = {}) {
  const normalized = normalizeSourceValidation(value);
  return {
    original_article_excluded: normalized.originalArticleExcluded,
    excluded_sources: normalized.excludedSources,
    valid_open_web_sources_count: normalized.validOpenWebSourcesCount
  };
}

function normalizeExclusionReason(value) {
  const reason = String(value || "").trim();
  return [
    "same_as_locked_article",
    "same_domain",
    "paywalled",
    "duplicate",
    "no_usable_content"
  ].includes(reason) ? reason : "no_usable_content";
}

export function noReliableCoverageResult({
  lockedArticle,
  sourceValidation,
  sourcesCheckedCount = 0,
  warning = "No reliable free coverage found.",
  readOriginalRecommendation
} = {}) {
  const normalizedLockedArticle = lockedArticle || buildLockedArticle("", "");
  const normalizedSourceValidation = normalizeSourceValidation(sourceValidation, {
    originalArticleExcluded: true,
    excludedSources: [],
    validOpenWebSourcesCount: 0
  });
  return {
    status: "no_reliable_free_coverage",
    matchConfidence: "low",
    sourceQuality: "low",
    lockedArticle: normalizedLockedArticle,
    bestFreeMatch: {},
    sourceTitle: "No reliable free coverage found",
    sourceUrl: "",
    summary: "",
    summaryBullets: [],
    sourcesUsed: [],
    sourcesCheckedCount: Number(sourcesCheckedCount || 0),
    bestMatchSource: "",
    sourceValidation: normalizedSourceValidation,
    source_validation: toSnakeSourceValidation(normalizedSourceValidation),
    missingContext: "Brevi found the original article, but could not find a separate open-web source that clearly covers the same story.",
    keyMissingContext: "Brevi found the original article, but could not find a separate open-web source that clearly covers the same story.",
    readOriginalRecommendation: normalizeReadOriginalRecommendation(readOriginalRecommendation, {
      matchConfidence: "low",
      sourceQuality: "low",
      sourcesUsedCount: 0,
      sourcesCheckedCount: Number(sourcesCheckedCount || 0),
      lockedArticle: normalizedLockedArticle,
      bestFreeMatch: {}
    }),
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
      const normalized = normalizeUrl(url);
      if (!url || !normalized || seen.has(normalized)) return null;
      seen.add(normalized);
      const publisher = sanitizePublisher(source.publisher) || publisherFromUrl(url);

      return {
        id: source.id || `S${index + 1}`,
        publisher,
        title: String(source.title || "").trim(),
        url,
        date: String(source.date || "").trim(),
        reasonUsed: String(source.reason_used || source.reasonUsed || source.reason || "").trim()
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

function normalizeReadOriginalRecommendation(value, context = {}) {
  const label = normalizeRecommendationLabel(value?.label);
  const confidence = normalizeRating(value?.confidence || (context.matchConfidence === "low" ? "low" : "medium"));
  const coverageStrength = normalizeCoverageStrength(value?.open_web_coverage_strength || value?.openWebCoverageStrength, context);
  const ctaPrimary = normalizeCtaPrimary(value?.cta_primary || value?.ctaPrimary, label);
  const possibleUniqueValue = normalizeUniqueValue(value?.possible_unique_value || value?.possibleUniqueValue);
  const why = normalizeWhyList(value?.why);
  const reason = cleanText(value?.reason || defaultRecommendationReason(label, coverageStrength), 500);

  return {
    label,
    confidence,
    reason,
    openWebCoverageStrength: coverageStrength,
    possibleUniqueValue,
    why: why.length ? why : defaultRecommendationWhy(label, context),
    ctaPrimary
  };
}

function normalizeRecommendationLabel(value) {
  const label = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  return ["yes", "maybe", "probably_not"].includes(label) ? label : "maybe";
}

function normalizeCoverageStrength(value, context) {
  const strength = String(value || "").trim().toLowerCase();
  if (["strong", "moderate", "weak"].includes(strength)) return strength;
  if (context.matchConfidence === "high" && context.sourcesUsedCount > 1) return "strong";
  if (context.matchConfidence === "low") return "weak";
  return "moderate";
}

function normalizeCtaPrimary(value, label) {
  const cta = String(value || "").trim().toLowerCase();
  if (cta === "open_free_source" || cta === "open_original") return cta;
  return label === "probably_not" ? "open_free_source" : "open_original";
}

function normalizeUniqueValue(value) {
  const allowed = new Set([
    "exclusive reporting",
    "original quotes",
    "deeper analysis",
    "local context",
    "expert commentary",
    "original data"
  ]);

  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => allowed.has(item)))]
    .slice(0, 6);
}

function normalizeWhyList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 160))
    .filter(Boolean)
    .slice(0, 5);
}

function defaultRecommendationReason(label, coverageStrength) {
  if (label === "yes") {
    return "The original may include reporting, analysis, quotes, or specialist context that Brevi cannot verify from free sources.";
  }

  if (label === "probably_not") {
    return "Open-web coverage appears sufficient for the main facts. The original may still be useful if you prefer the publisher's full reporting.";
  }

  if (coverageStrength === "weak") {
    return "Brevi could not verify enough open-web coverage, so the original may be useful for the publisher's full reporting.";
  }

  return "Open-web sources cover the core facts, but the original may include extra reporting, quotes, or analysis that Brevi cannot verify.";
}

function defaultRecommendationWhy(label, context) {
  if (context.matchConfidence === "low") {
    return [
      "No reliable free match was found",
      "The original article body is unavailable",
      "Unique details may be missing"
    ];
  }

  if (label === "probably_not") {
    return [
      "Best free match found",
      "Core facts appear covered",
      "The original may still include publisher-specific details"
    ];
  }

  return [
    "Best free match found",
    "Core facts are covered",
    "The original article body is unavailable",
    "Unique details may be missing"
  ];
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
  return domainFromUrl(value);
}

export function domainFromUrl(value) {
  const raw = String(value || "").trim();
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
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

export function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    return String(value || "").trim().replace(/\/+$/, "");
  }
}

export function isNearIdenticalTitle(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 || right.length === 0) return false;
  return jaccard(left, right) >= 0.86;
}

export function isNearIdenticalPath(a, b) {
  const left = pathTokens(a);
  const right = pathTokens(b);
  if (left.length === 0 || right.length === 0) return false;
  return jaccard(left, right) >= 0.82;
}

function pathTokens(value) {
  try {
    return tokenize(new URL(value).pathname.replace(/\.[a-z0-9]+$/i, ""));
  } catch (error) {
    return [];
  }
}

function tokenize(value) {
  return [...new Set(String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["the", "and", "for", "with", "from", "that", "this"].includes(token)))];
}

function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}
