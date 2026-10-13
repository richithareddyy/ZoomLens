// Turns an image of the shared screen into an answer. Describe and Explain
// differ only in their prompts. describe.js reuses these from the command line.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.VISION_MODEL;

export const PROMPTS = {
  describe: `You are helping someone who is watching a screen share in a Zoom meeting and wants to know what is currently on screen.

Describe what you see in plain language. Lead with the single most important thing, then fill in supporting detail. Name what the content actually is (a spreadsheet, a slide, a code editor, a chart) and report concrete specifics (real numbers, real labels, real headings) rather than vague summary.

Keep it under 120 words. Write for someone who may have looked away for a minute and needs to catch up quickly. No preamble, no "this screenshot shows". Just say what is there.`,

  explain: `You are helping someone who is watching a screen share in a Zoom meeting and wants to understand what the content MEANS, not merely what it says.

Go past transcription. Explain the structure and the reasoning behind it: what a chart's shape actually implies, why a diagram is laid out the way it is, what relationship the columns of a table encode, what a piece of code is for. If something is being argued or demonstrated, say what the point appears to be.

Be concrete and specific to what is on screen. Where the intent is genuinely ambiguous, say so rather than inventing a rationale. Under 180 words. No preamble.`,

  ask: `You are answering a question about a screen being shared in a Zoom meeting.

Answer only what was asked, using the image as the source of truth. Be concrete and specific about what is actually visible: real numbers, real labels, real headings. Do not describe the whole screen unless that is what was asked for.

If the answer genuinely is not visible on screen, say so plainly rather than guessing. Under 140 words. No preamble.`,

  followup: `You are answering one clarifying question about a screen share in a Zoom meeting.

You are given your previous answer about this screen and a follow-up question. Answer only that question, using the image as the source of truth. Stay tightly scoped. Do not re-describe the whole screen.

If the answer genuinely is not visible on screen, say so plainly instead of guessing. Under 120 words. No preamble.`,

  changed: `You describe a screen share in a Zoom meeting for a participant who is blind or has low vision and listens with a screen reader. They can hear the presenter, so give them what is only visible, not what the presenter would be saying anyway.

If you are given your previous description, say only what is new or different now: a new slide, new numbers, a changed chart, another part of a page. If nothing a viewer would care about has changed, reply with exactly: No meaningful change.

Without a previous description, say what kind of content is shown and its main point.

Lead with the most important fact. One to three short sentences, under 50 words. No preamble.`,

  colors: `You are helping a participant with a color vision deficiency read a screen share in a Zoom meeting.

Say what the colors on screen mean. For each color that carries meaning (a status, a category, a chart series, a heatmap scale, a map region), say what it stands for and which items have it, naming the items by their labels, text, values or positions. Use a legend if there is one. If two colors look alike, say how else to tell them apart, if anything does.

If color carries no meaning here, say so in one sentence. Under 150 words. No preamble.`,

  colorcheck: `You check a screen share in a Zoom meeting for a participant with a color vision deficiency.

Decide whether something on screen is told apart by color alone: statuses, categories, chart series or a scale, with no text, label, pattern or shape carrying the same information next to it. If so, write one short sentence saying what is told apart only by color, for example: This chart tells its two lines apart only by color.

If nothing is, or your previous note already says this about the same content, reply with exactly: No meaningful change.`,
};

// Describe should feel immediate; Explain is worth more thinking.
export const EFFORT = {
  describe: "low", explain: "high", followup: "low", ask: "low", changed: "low",
  colors: "medium", colorcheck: "low",
};

// Answers are read aloud by screen readers, where markdown comes out as noise.
// "Item: value" lines read fine aloud, and the panel shows them as a list.
const SPOKEN = `

Write plain text with no markdown, asterisks, hashes or bullet characters. When the answer is naturally a set of items that each have a status, value or change (project statuses, metrics, a chart's series), put each item on its own line as "Item: value", for example "Checkout error rate: 1.4% to 3.6%, rising". If there are separate groups, put a short heading line ending in a colon above each. Otherwise write plain sentences. If a mouse pointer, laser pointer or annotation is visible, say what it is on.`;

// With Color Assist on, every answer has to work without seeing color.
const COLOR_SAFE = `

The participant has a color vision deficiency. Never identify anything by its color alone: refer to it by its label, text, value, position or shape. Where color carries meaning, state the meaning itself, and you may add the color in brackets so it can be matched up, for example: Authentication Rewrite is blocked (red). Pixel analysis of the screen may be given below; use it, but trust what you see in the image where they disagree.`;

// A display capture includes the Zoom window, tiles and this panel. Early answers
// described the panel back to the user, so the model is told to ignore it.
const IGNORE_OWN_INTERFACE = `

The image may be a photograph of an entire computer display rather than the shared content alone. If so, it will contain the Zoom meeting window, participant video tiles and name labels, browser tabs and bookmarks, the dock, the menu bar, and a panel titled "ZoomLens" with its own buttons and earlier answers.

None of that is the shared content. Ignore all of it, and never mention the ZoomLens panel, its controls, or its own previous answer. Describe only what is being presented.`;

const client = new Anthropic();

// previous is the last answer on this session; followup needs it for scope.
// colors is the pixel analysis from colors.js, when Color Assist is on.
export async function produceAnswer({ jpeg, mode, question, previous, colorSafe = false, colors = null }) {
  if (!MODEL) throw new Error("VISION_MODEL is not set in .env");
  if (!PROMPTS[mode]) throw new Error(`Unknown mode: ${mode}`);
  if (mode === "followup" && !previous) {
    throw new Error("Ask for a description or an explanation first, then follow up on it.");
  }

  const started = Date.now();

  const content = [
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
    },
  ];

  if (colors) content.push({ type: "text", text: colors });

  if (mode === "followup") {
    content.push({
      type: "text",
      text: `Your previous answer about this screen:\n\n${previous}\n\nFollow-up question: ${question}`,
    });
  } else if (mode === "changed") {
    content.push({
      type: "text",
      text: previous
        ? `Your previous description:\n\n${previous}\n\nWhat is different now?`
        : "Describe what is on screen.",
    });
  } else if (mode === "colorcheck") {
    content.push({
      type: "text",
      text: previous ? `Your previous note:\n\n${previous}\n\nCheck this screen.` : "Check this screen.",
    });
  } else if (mode === "colors") {
    content.push({ type: "text", text: "What do the colors mean?" });
  } else if (mode === "ask") {
    content.push({ type: "text", text: question });
  } else {
    content.push({ type: "text", text: mode === "explain" ? "Explain this." : "Describe this." });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: PROMPTS[mode] + SPOKEN + (colorSafe || mode.startsWith("color") ? COLOR_SAFE : "") + IGNORE_OWN_INTERFACE,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT[mode] },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to answer about this screen.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("The model returned nothing.");

  return { text, ms: Date.now() - started, usage: response.usage };
}

// SDK errors in words a participant can act on.
export function explainFailure(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The AI service rejected our credentials. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Too many requests to the AI service just now. Try again in a moment.";
  }
  if (error instanceof Anthropic.APIError) {
    return `The AI service returned an error (${error.status}). Try again.`;
  }
  return error.message;
}
