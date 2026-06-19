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
    "summary: array of 3-5 concise bullet strings, or [] when match_confidence is low",
    "key_missing_context: string describing what may be missing compared with the original paywalled article",
    "source_url: string",
    "source_title: string",
    "warning: string; include a warning if this is not clearly the same story"
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
  const summary = normalizeSummary(parsed.summary);
  const sourceUrl = String(parsed.source_url || parsed.sourceUrl || "").trim();
  const sourceTitle = String(parsed.source_title || parsed.sourceTitle || "Free coverage found").trim();
  const keyMissingContext = String(parsed.key_missing_context || parsed.keyMissingContext || "").trim();
  const warning = String(parsed.warning || "").trim();

  if (matchConfidence === "low") {
    return lowConfidenceResult(warning || "No reliable free coverage was found for the same story.", {
      sourceTitle,
      sourceUrl,
      sourceQuality,
      keyMissingContext
    });
  }

  return {
    matchConfidence,
    sourceQuality,
    sourceTitle,
    sourceUrl,
    summary: summary.join("\n"),
    summaryBullets: summary,
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
    keyMissingContext: overrides.keyMissingContext || "Brevi could not verify a free source covering the same story.",
    warning
  };
}

function normalizeRating(value) {
  const rating = String(value || "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(rating) ? rating : "low";
}

function normalizeSummary(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, ""));

  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 5);
}
