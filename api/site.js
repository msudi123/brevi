import { getConfig, loadLocalEnv } from "./_lib/env.js";
import { handleSiteRequest } from "./_lib/site.js";

loadLocalEnv();

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  const handled = handleSiteRequest(request, response, getConfig());
  if (!handled) {
    response.statusCode = 404;
    response.end("Not found");
  }
}
