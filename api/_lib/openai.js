import { cleanText } from "./text.js";

export async function summarizeWithOpenAI({ title, articleUrl, config }) {
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
    "- Do not invent facts.",
    "- Do not use the paywalled article body.",
    "- Do not claim this is a full replacement for the original article.",
    "- If confidence is low, do not summarize. Say no reliable free coverage was found.",
    "- If confidence is medium, summarize with a clear caution.",
    "",
    `Paywalled title: ${cleanText(title)}`,
    `Paywalled URL: ${cleanText(articleUrl, 2000)}`,
    "",
    "Return JSON only with exactly these snake_case keys:",
    "match_confidence: high | medium | low",
    "source_quality: high | medium | low",
    "summary_bullets: array of objects, each with text: string and source_ids: array of source IDs that support the bullet",
    "sources_used: array of objects with id, publisher, title, url, date, reason_used",
    "sources_checked_count: number",
    "best_match_source: source ID string from sources_used, or empty string",
    "key_missing_context: string describing what may be missing compared with the original paywalled article",
    "source_url: string",
    "source_title: string",
    "warning: string; include a warning if this is not clearly the same story",
    "",
    "Reference rules:",
    "- Every factual bullet must be supported by at least one source_id.",
    "- Do not include a bullet if no source supports it.",
    "- Do not list a source as used unless it directly supports at least one bullet.",
    "- Separate sources checked from sources used.",
    "- If the source URL is missing, do not use that source.",
    "- If match_confidence is low, summary_bullets must be [] and sources_used may be []."
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

  return parseSummaryJson(text);
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

function parseSummaryJson(text) {
  const trimmed = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);
    return normalizeSummaryResult(parsed);
  } catch (error) {
    return lowConfidenceResult("Brevi could not verify a reliable free source for the same story.");
  }
}

function normalizeSummaryResult(parsed) {
  const matchConfidence = normalizeRating(parsed.match_confidence || parsed.matchConfidence);
  const sourceQuality = normalizeRating(parsed.source_quality || parsed.sourceQuality);
  const sourcesUsed = normalizeSources(parsed.sources_used || parsed.sourcesUsed);
  const sourceIds = new Set(sourcesUsed.map((source) => source.id));
  const summaryBullets = normalizeSummaryBullets(parsed.summary_bullets || parsed.summaryBullets || parsed.summary, sourceIds);
  const fallbackSource = sourcesUsed[0] || {};
  const sourceUrl = String(parsed.source_url || parsed.sourceUrl || fallbackSource.url || "").trim();
  const sourceTitle = String(parsed.source_title || parsed.sourceTitle || fallbackSource.title || "Free coverage found").trim();
  const bestMatchSource = String(parsed.best_match_source || parsed.bestMatchSource || fallbackSource.id || "").trim();
  const sourcesCheckedCount = Math.max(Number(parsed.sources_checked_count || parsed.sourcesCheckedCount || sourcesUsed.length || 0), sourcesUsed.length);
  const keyMissingContext = String(parsed.key_missing_context || parsed.keyMissingContext || "").trim();
  const warning = String(parsed.warning || "").trim();

  if (matchConfidence === "low" || summaryBullets.length === 0 || sourcesUsed.length === 0 || !sourceUrl) {
    return lowConfidenceResult(warning || "No reliable free coverage was found for the same story.", {
      sourceTitle,
      sourceUrl,
      sourceQuality,
      keyMissingContext,
      sourcesCheckedCount
    });
  }

  return {
    matchConfidence,
    sourceQuality,
    sourceTitle,
    sourceUrl,
    summary: summaryBullets.map((bullet) => bullet.text).join("\n"),
    summaryBullets,
    sourcesUsed,
    sourcesCheckedCount,
    bestMatchSource,
    keyMissingContext,
    warning: matchConfidence === "medium"
      ? warning || "This free source appears related, but may not fully match every detail of the locked article."
      : warning
  };
}

function lowConfidenceResult(warning, overrides = {}) {
  return {
    matchConfidence: "low",
    sourceQuality: overrides.sourceQuality || "low",
    sourceTitle: overrides.sourceTitle || "No reliable free coverage found",
    sourceUrl: overrides.sourceUrl || "",
    summary: "",
    summaryBullets: [],
    sourcesUsed: [],
    sourcesCheckedCount: Number(overrides.sourcesCheckedCount || 0),
    bestMatchSource: "",
    keyMissingContext: overrides.keyMissingContext || "Brevi could not verify a free source covering the same story.",
    warning
  };
}

function normalizeRating(value) {
  const rating = String(value || "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(rating) ? rating : "low";
}

function normalizeSummaryBullets(value, sourceIds) {
  const items = Array.isArray(value) ? value : String(value || "")
    .split("\n")
    .map((line) => ({ text: line.replace(/^[-*]\s*/, ""), source_ids: [] }));

  return items
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), sourceIds: [] };
      }

      const ids = (Array.isArray(item.source_ids) ? item.source_ids : item.sourceIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => id && sourceIds.has(id));

      return {
        text: String(item.text || item.bullet || "").trim(),
        sourceIds: ids
      };
    })
    .filter((item) => item.text && item.sourceIds.length > 0)
    .slice(0, 5);
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((source, index) => {
      const url = String(source?.url || "").trim();
      const id = String(source?.id || source?.source_id || `S${index + 1}`).trim();
      if (!url || !id || seen.has(id)) return null;
      seen.add(id);

      return {
        id,
        publisher: String(source.publisher || "").trim(),
        title: String(source.title || "").trim(),
        url,
        date: String(source.date || "").trim(),
        reasonUsed: String(source.reason_used || source.reasonUsed || "").trim()
      };
    })
    .filter(Boolean);
}
