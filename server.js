import { createServer } from "node:http";
import { getConfig, loadLocalEnv } from "./api/_lib/env.js";
import { handleHealth, handleResetUsage, handleSummarize, handleUsage } from "./api/_lib/handlers.js";
import { sendCors, sendHtml, sendJson } from "./api/_lib/http.js";
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
