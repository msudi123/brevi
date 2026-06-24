import { execFile } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const output = "brevi-extension.zip";
const files = [
  "manifest.json",
  "background.js",
  "content.js",
  "sidebar.html",
  "sidebar.css",
  "popup.html",
  "popup.css",
  "popup.js",
  "analytics.js",
  "icons"
];

if (existsSync(output)) {
  unlinkSync(output);
}

await execFileAsync("zip", ["-r", output, ...files]);
console.log(`Created ${output}`);
