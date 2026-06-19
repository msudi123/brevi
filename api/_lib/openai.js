import { cleanText } from "./text.js";

export async function summarizeWithOpenAI({ title, articleUrl, config }) {
  const prompt = [
    "A browser extension user hit a paywall.",
    "Use web search to find the same story covered by a freely accessible source.",
    "Prefer reputable original reporting, wire services, public broadcasters, government or university pages, or clearly non-paywalled outlets.",
    "Do not summarize the paywalled page itself. Summarize only the best freely available version you find.",
    "If you cannot verify a free source, say that clearly in the summary.",
    "",
    `Paywalled title: ${cleanText(title)}`,
    `Paywalled URL: ${cleanText(articleUrl, 2000)}`,
    "",
    "Return JSON only with exactly these keys:",
    "sourceTitle: string",
    "sourceUrl: string",
    "summary: string containing 4-6 markdown bullet points"
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
    return {
      sourceTitle: parsed.sourceTitle || "Free coverage found",
      sourceUrl: parsed.sourceUrl || "",
      summary: parsed.summary || "No summary was returned."
    };
  } catch (error) {
    return {
      sourceTitle: "Free coverage found",
      sourceUrl: "",
      summary: trimmed
    };
  }
}
