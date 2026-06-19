import { loadLocalEnv } from "./_lib/env.js";
import { getConfig } from "./_lib/env.js";
import { sendCors, sendHtml } from "./_lib/http.js";
import { renderTestPaywallPage } from "./_lib/test-page.js";

loadLocalEnv();

export default async function handler(request, response) {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    sendCors(response, config);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  sendHtml(response, 200, renderTestPaywallPage(), config);
}
