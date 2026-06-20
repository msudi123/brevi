import test from "node:test";
import assert from "node:assert/strict";
import {
  domainFromUrl,
  isNearIdenticalPath,
  isNearIdenticalTitle,
  isValidOpenWebSource,
  noReliableCoverageResult,
  normalizeUrl
} from "../api/_lib/openai.js";

const lockedArticle = {
  title: "Acme reports record profits after merger",
  domain: "locked.example",
  url: "https://locked.example/business/acme-record-profits?utm_source=newsletter"
};

const usableText = [
  "Acme reported record profits after completing its merger, according to public filings and company statements.",
  "The company said revenue increased across several divisions, while analysts pointed to cost savings from the deal.",
  "Executives said the integration plan remains on schedule and that further updates will be shared next quarter."
].join(" ").repeat(8);

test("normalizeUrl removes tracking, hashes, www, and trailing slash", () => {
  assert.equal(
    normalizeUrl("https://www.example.com/story/?utm_source=x&fbclid=123#section"),
    "https://example.com/story"
  );
});

test("domainFromUrl normalizes host names", () => {
  assert.equal(domainFromUrl("https://www.Example.com/path"), "example.com");
  assert.equal(domainFromUrl("example.com/path"), "example.com");
});

test("near-identical title and path helpers detect same-article signals", () => {
  assert.equal(
    isNearIdenticalTitle("Acme reports record profits after merger", "Acme reports record profits after merger"),
    true
  );
  assert.equal(
    isNearIdenticalPath("https://a.example/business/acme-record-profits", "https://b.example/business/acme-record-profits/"),
    true
  );
});

test("isValidOpenWebSource rejects exact original URL", async () => {
  const result = await isValidOpenWebSource({ url: lockedArticle.url }, lockedArticle, {
    fetchPage: neverFetch
  });
  assert.deepEqual(result, { valid: false, reason: "same_as_locked_article" });
});

test("isValidOpenWebSource rejects normalized original URL duplicate", async () => {
  const result = await isValidOpenWebSource({
    url: "https://www.locked.example/business/acme-record-profits/#comments"
  }, lockedArticle, {
    fetchPage: neverFetch
  });
  assert.deepEqual(result, { valid: false, reason: "same_as_locked_article" });
});

test("isValidOpenWebSource rejects same-domain candidates", async () => {
  const result = await isValidOpenWebSource({
    url: "https://locked.example/free/acme-record-profits"
  }, lockedArticle, {
    fetchPage: neverFetch
  });
  assert.deepEqual(result, { valid: false, reason: "same_domain" });
});

test("isValidOpenWebSource rejects canonical duplicates", async () => {
  const result = await isValidOpenWebSource({
    url: "https://wire.example/business/acme-story"
  }, lockedArticle, {
    page: {
      ok: true,
      finalUrl: "https://wire.example/business/acme-story",
      canonicalUrl: lockedArticle.url,
      title: "Acme reports record profits after merger",
      text: usableText
    }
  });
  assert.deepEqual(result, { valid: false, reason: "duplicate" });
});

test("isValidOpenWebSource rejects same-article mirrors on other domains", async () => {
  const result = await isValidOpenWebSource({
    url: "https://mirror.example/business/acme-record-profits"
  }, lockedArticle, {
    page: {
      ok: true,
      finalUrl: "https://mirror.example/business/acme-record-profits",
      canonicalUrl: "https://mirror.example/business/acme-record-profits",
      title: "Acme reports record profits after merger",
      text: usableText
    }
  });
  assert.deepEqual(result, { valid: false, reason: "duplicate" });
});

test("isValidOpenWebSource rejects previously shown final URLs", async () => {
  const result = await isValidOpenWebSource({
    url: "https://redirect.example/acme"
  }, lockedArticle, {
    excludedUrls: ["https://wire.example/business/acme-story"],
    page: {
      ok: true,
      finalUrl: "https://wire.example/business/acme-story",
      canonicalUrl: "https://wire.example/business/acme-story",
      title: "Acme posts record profits after merger",
      text: usableText
    }
  });
  assert.deepEqual(result, { valid: false, reason: "previously_shown" });
});

test("isValidOpenWebSource rejects paywalled pages", async () => {
  const result = await isValidOpenWebSource({
    url: "https://wire.example/business/acme-story"
  }, lockedArticle, {
    page: {
      ok: true,
      finalUrl: "https://wire.example/business/acme-story",
      canonicalUrl: "https://wire.example/business/acme-story",
      title: "Acme reports record profits after merger",
      text: `${usableText} Subscribe to continue reading this article.`
    }
  });
  assert.deepEqual(result, { valid: false, reason: "paywalled" });
});

test("isValidOpenWebSource rejects snippet-only or thin pages", async () => {
  const result = await isValidOpenWebSource({
    url: "https://wire.example/business/acme-story",
    snippet: "Acme reported record profits."
  }, lockedArticle, {
    page: {
      ok: true,
      finalUrl: "https://wire.example/business/acme-story",
      canonicalUrl: "https://wire.example/business/acme-story",
      title: "Acme reports record profits",
      text: "Acme reported record profits."
    }
  });
  assert.deepEqual(result, { valid: false, reason: "no_usable_content" });
});

test("isValidOpenWebSource accepts different-domain pages with usable text", async () => {
  const result = await isValidOpenWebSource({
    url: "https://wire.example/business/acme-story",
    title: "Acme posts record profits after merger"
  }, lockedArticle, {
    page: {
      ok: true,
      finalUrl: "https://wire.example/business/acme-story",
      canonicalUrl: "https://wire.example/business/acme-story",
      title: "Acme posts record profits after merger",
      text: usableText
    }
  });
  assert.equal(result.valid, true);
  assert.equal(result.finalUrl, "https://wire.example/business/acme-story");
  assert.equal(result.text.length >= 500, true);
});

test("noReliableCoverageResult returns the required empty no-coverage shape", () => {
  const result = noReliableCoverageResult({
    lockedArticle,
    sourceValidation: {
      originalArticleExcluded: true,
      excludedSources: [{ url: lockedArticle.url, reason: "same_as_locked_article" }],
      validOpenWebSourcesCount: 0
    },
    sourcesCheckedCount: 1
  });

  assert.equal(result.status, "no_reliable_free_coverage");
  assert.deepEqual(result.summaryBullets, []);
  assert.deepEqual(result.sourcesUsed, []);
  assert.deepEqual(result.bestFreeMatch, {});
  assert.equal(result.sourceValidation.validOpenWebSourcesCount, 0);
  assert.equal(result.source_validation.valid_open_web_sources_count, 0);
});

async function neverFetch() {
  throw new Error("fetch should not be called");
}
