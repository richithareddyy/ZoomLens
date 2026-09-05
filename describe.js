// Zoom Lens: turns a screen-share snapshot into a plain-language answer.
//
// Three modes, matching the product spec:
//   describe:  what is on screen right now, in plain language
//   explain:   what the content MEANS: structure, relationships, intent
//   followup:  one scoped question about the previous describe/explain
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

const SNAPSHOT_DIR = "snapshots";
const MEMORY_FILE = ".last-answer.json";
// Which model to call, set in .env alongside the API key so the choice can be
// changed without touching the code.
const MODEL = process.env.VISION_MODEL;

if (!MODEL) {
  console.error("ERROR: VISION_MODEL is not set. Add it to .env, see .env.example.");
  process.exit(1);
}

// --- Prompts ---------------------------------------------------------------
// Each mode gets its own instructions. These are the product, really. The
// difference between Describe and Explain lives here, not in the code.

const PROMPTS = {
  describe: `You are helping someone who is watching a screen share in a Zoom meeting and wants to know what is currently on screen.

Describe what you see in plain language. Lead with the single most important thing, then fill in supporting detail. Name what the content actually is (a spreadsheet, a slide, a code editor, a chart) and report concrete specifics (real numbers, real labels, real headings) rather than vague summary.

Keep it under 120 words. Write for someone who may have looked away for a minute and needs to catch up quickly. No preamble, no "this screenshot shows". Just say what is there.`,

  explain: `You are helping someone who is watching a screen share in a Zoom meeting and wants to understand what the content MEANS, not merely what it says.

Go past transcription. Explain the structure and the reasoning behind it: what a chart's shape actually implies, why a diagram is laid out the way it is, what relationship the columns of a table encode, what a piece of code is for. If something is being argued or demonstrated, say what the point appears to be.

Be concrete and specific to what is on screen. Where the intent is genuinely ambiguous, say so rather than inventing a rationale. Under 180 words. No preamble.`,

  followup: `You are answering one clarifying question about a screen share in a Zoom meeting.

You are given your previous answer about this screen and a follow-up question. Answer only that question, using the image as the source of truth. Stay tightly scoped. Do not re-describe the whole screen.

If the answer genuinely is not visible on screen, say so plainly instead of guessing. Under 120 words. No preamble.`,
};

// --- Argument parsing ------------------------------------------------------

const args = process.argv.slice(2);
let mode = "describe";
let imageArg = null;
let question = null;

if (args.length) {
  if (["describe", "explain", "followup"].includes(args[0])) {
    mode = args[0];
    const rest = args.slice(1);
    // For followup the remaining text is the question; otherwise it's a path
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

// --- Pick the image --------------------------------------------------------

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

// --- Build the request -----------------------------------------------------

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

// Describe should feel instant; Explain is worth more reasoning.
const effort = mode === "explain" ? "high" : "low";

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

// Remember this answer so `followup` has something to scope itself to
fs.writeFileSync(
  MEMORY_FILE,
  JSON.stringify({ mode, image: imagePath, answer, at: new Date().toISOString() }, null, 2)
);
