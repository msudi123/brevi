import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { getConfig, loadLocalEnv } from "./api/_lib/env.js";
import {
  handleCreditCheckout,
  handleCreditConfirm,
  handleCredits,
  handleHealth,
  handleLemonWebhook,
  handleResetUsage,
  handleSupportMessage,
  handleSummarize,
  handleUsage
} from "./api/_lib/handlers.js";
import { sendCors, sendHtml, sendJson } from "./api/_lib/http.js";
import { handleSiteRequest } from "./api/_lib/site.js";
import { renderTestPaywallPage } from "./api/_lib/test-page.js";

loadLocalEnv();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

const server = createServer(async (request, response) => {
  const config = getConfig();

  try {
    if (request.method === "OPTIONS") {
      sendCors(response, config);
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || HOST}`);

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/assets/")) {
      await serveAsset(url.pathname, response, request.method);
      return;
    }

    if (request.method === "GET" && handleSiteRequest(request, response, config)) {
      return;
    }

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      await handleHealth(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/test-paywall") {
      sendHtml(response, 200, renderTestPaywallPage(), config);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/usage") {
      await handleUsage(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/credits") {
      await handleCredits(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/credits/checkout") {
      await handleCreditCheckout(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/credits/confirm") {
      await handleCreditConfirm(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/lemonsqueezy/webhook") {
      await handleLemonWebhook(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/support/message") {
      await handleSupportMessage(request, response);
      return;
    }

    if (request.method === "POST" && (url.pathname === "/api/usage/reset" || url.pathname === "/api/usage-reset")) {
      await handleResetUsage(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/summarize") {
      await handleSummarize(request, response);
      return;
    }

    sendJson(response, 404, {
      ok: false,
      message: "Route not found."
    }, config);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      ok: false,
      message: "Brevi backend failed."
    }, config);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Brevi backend running on http://${HOST}:${PORT}`);
});

async function serveAsset(pathname, response, method = "GET") {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  if (!safePath.startsWith("/assets/")) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const filePath = join(process.cwd(), safePath);
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": "public, max-age=86400"
    });
    response.end(method === "HEAD" ? undefined : content);
  } catch (error) {
    response.writeHead(404);
    response.end("Not found");
  }
}

function contentTypeFor(filePath) {
  if (extname(filePath).toLowerCase() === ".png") return "image/png";
  if (extname(filePath).toLowerCase() === ".svg") return "image/svg+xml";
  if (extname(filePath).toLowerCase() === ".ico") return "image/x-icon";
  if (extname(filePath).toLowerCase() === ".webmanifest") return "application/manifest+json";
  if (extname(filePath).toLowerCase() === ".json") return "application/json";
  if (extname(filePath).toLowerCase() === ".jpg" || extname(filePath).toLowerCase() === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
