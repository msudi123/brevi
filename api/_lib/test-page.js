export function renderTestPaywallPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:title" content="OpenAI announces GPT-4.1 for developers">
    <title>OpenAI announces GPT-4.1 for developers</title>
    <style>
      body {
        max-width: 760px;
        margin: 56px auto;
        padding: 0 20px;
        color: #17202a;
        font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
        line-height: 1.65;
      }

      h1 {
        font-size: 42px;
        line-height: 1.1;
      }

      .subscription-wall {
        margin-top: 28px;
        padding: 22px;
        border: 2px dashed #777;
        border-radius: 8px;
        background: #f6f6f6;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <article>
      <h1>OpenAI announces GPT-4.1 for developers</h1>
      <p>This is a local test article for Brevi. The next box intentionally contains paywall language and a common paywall class.</p>
      <div class="subscription-wall">
        <strong>Subscribe to continue reading</strong>
        <p>This article is for subscribers. Sign in to continue reading.</p>
      </div>
    </article>
  </body>
</html>`;
}
