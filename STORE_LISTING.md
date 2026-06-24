# Brevi Chrome Web Store Listing Notes

## Name

Brevi — Source-Backed Article Summaries

## Short Description

Find open-web coverage for locked articles and get source-backed summaries in seconds.

## Detailed Description

Brevi helps readers understand paywalled news by finding freely available coverage of the same story and summarizing that free source in a clean sidebar.

What it does:
- Detects common paywall messages and subscription walls.
- Extracts the article title and URL.
- Searches for free coverage through the Brevi backend.
- Summarizes the best free source with OpenAI.
- Shows 5 free summaries per day.

Brevi does not bypass paywalls, unlock subscriber-only content, or copy the paywalled article. It summarizes freely available coverage found elsewhere.

## Reviewer Test Instructions

1. Load the extension.
2. Open the extension popup and confirm the backend URL is set.
3. Visit the test page: `https://brevi-psi.vercel.app/test-paywall` or local `http://127.0.0.1:8787/test-paywall`.
4. Confirm the Brevi sidebar opens automatically.
5. Confirm the sidebar shows a free source summary.
6. Confirm the popup usage counter increments.

## Privacy Summary

Brevi sends the current article title, URL, anonymous install ID, and optional email to the Brevi backend to provide summaries and enforce the free daily limit. Brevi uses Google Analytics to measure extension popup usage and non-sensitive product events, without sending article URLs or email addresses to Google Analytics. Brevi does not sell user data.
