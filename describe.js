// Runs the panel's prompts against a saved snapshot from the command line.
//
// Usage:
//   node describe.js                              # describe newest snapshot
//   node describe.js explain                      # explain newest snapshot
//   node describe.js followup "why two axes?"     # ask about the last answer
//   node describe.js describe snapshots/x.jpg     # a specific image
//
// Requires ANTHROPIC_API_KEY in the environment (or a .env entry).

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { PROMPTS, EFFORT } from "./answer.js";

const SNAPSHOT_DIR = "snapshots";
const MEMORY_FILE = ".last-answer.json";
const MODEL = process.env.VISION_MODEL;

if (!MODEL) {
  console.error("ERROR: VISION_MODEL is not set. Add it to .env, see .env.example.");
  process.exit(1);
}

const args = process.argv.slice(2);
let mode = "describe";
let imageArg = null;
let question = null;

if (args.length) {
  if (["describe", "explain", "followup"].includes(args[0])) {
    mode = args[0];
    const rest = args.slice(1);
    // for followup the rest is the question, plus an optional image path
    if (mode === "followup") {
      question = rest.filter((a) => !a.endsWith(".jpg") && !a.endsWith(".png")).join(" ");
      imageArg = rest.find((a) => a.endsWith(".jpg") || a.endsWith(".png")) ?? null;
    } else {
      imageArg = rest[0] ?? null;
    }
  } else {
    imageArg = args[0];
  }
}

if (mode === "followup" && !question) {
  console.error('ERROR: followup needs a question, e.g.:');
  console.error('   node describe.js followup "what do the red bars mean?"');
  process.exit(1);
}

function newestSnapshot() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return null;
  const files = fs
    .readdirSync(SNAPSHOT_DIR)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(SNAPSHOT_DIR, files[0].f) : null;
}

const imagePath = imageArg ?? newestSnapshot();

if (!imagePath || !fs.existsSync(imagePath)) {
  console.error("ERROR: no snapshot image found.");
  console.error("   Run `node snapshot.js` first to decode one from a capture.");
  process.exit(1);
}

const mediaType = /\.png$/i.test(imagePath) ? "image/png" : "image/jpeg";
const imageData = fs.readFileSync(imagePath).toString("base64");

const client = new Anthropic();

const content = [
  { type: "image", source: { type: "base64", media_type: mediaType, data: imageData } },
];

if (mode === "followup") {
  let previous = "";
  if (fs.existsSync(MEMORY_FILE)) {
    previous = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")).answer ?? "";
  }
  if (!previous) {
    console.error("ERROR: no previous answer to follow up on.");
    console.error("   Run `node describe.js` or `node describe.js explain` first.");
    process.exit(1);
  }
  content.push({
    type: "text",
    text: `Your previous answer about this screen:\n\n${previous}\n\nFollow-up question: ${question}`,
  });
} else {
  content.push({ type: "text", text: mode === "explain" ? "Explain this." : "Describe this." });
}

const effort = EFFORT[mode];

console.log(`Image:  ${imagePath} (${(fs.statSync(imagePath).size / 1024).toFixed(0)} KB)`);
console.log(`Mode:   ${mode}${question ? `: "${question}"` : ""}`);
console.log(`Model:  ${MODEL} (effort: ${effort})\n`);

const started = Date.now();

let response;
try {
  response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: PROMPTS[mode],
    thinking: { type: "adaptive" },
    output_config: { effort },
    messages: [{ role: "user", content }],
  });
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("Authentication failed. Check ANTHROPIC_API_KEY.");
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("Rate limited. Wait a moment and retry.");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`API error ${error.status}: ${error.message}`);
  } else {
    console.error("Request failed:", error.message);
  }
  process.exit(1);
}

if (response.stop_reason === "refusal") {
  console.error("The model declined to answer.");
  console.error(response.stop_details?.explanation ?? "");
  process.exit(1);
}

const answer = response.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n")
  .trim();

console.log("-".repeat(66));
console.log(answer);
console.log("-".repeat(66));

const seconds = ((Date.now() - started) / 1000).toFixed(1);
const { input_tokens, output_tokens } = response.usage;
console.log(`${seconds}s, ${input_tokens} in / ${output_tokens} out tokens`);

// saved so a later `followup` has something to scope itself to
fs.writeFileSync(
  MEMORY_FILE,
  JSON.stringify({ mode, image: imagePath, answer, at: new Date().toISOString() }, null, 2)
);
