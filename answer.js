// Turns an image of a shared screen into an answer for one participant.
//
// The prompts here are the product. The difference between Describe and Explain
// is not in the code, it is in what each one asks for.
//
// describe.js does the same thing from the command line against a saved file.
// This is the version the panel calls, so it takes an image in memory and
// returns text rather than printing it.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.VISION_MODEL;

const PROMPTS = {
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
};

// Describe should feel immediate. Explain is worth more thinking.
const EFFORT = { describe: "low", explain: "high", followup: "low", ask: "low" };

// When the image comes from this machine's display rather than the meeting's
// media stream, it contains the whole screen: the Zoom window, the participant
// tiles, and Zoom Lens itself. None of that is the shared content, and an answer
// that describes its own panel back to the person reading it is absurd.
const IGNORE_OWN_INTERFACE = `

The image may be a photograph of an entire computer display rather than the shared content alone. If so, it will contain the Zoom meeting window, participant video tiles and name labels, browser tabs and bookmarks, the dock, the menu bar, and a panel titled "Zoom Lens" showing Describe, Explain and Follow-up controls.

None of that is the shared content. Ignore all of it, and never mention the Zoom Lens panel, its controls, or its own previous answer. Describe only what is being presented.`;

const client = new Anthropic();

/**
 * @param {object}  opts
 * @param {Buffer}  opts.jpeg      the screen, decoded
 * @param {string}  opts.mode      describe | explain | followup
 * @param {string?} opts.question  the participant's question, followup only
 * @param {string?} opts.previous  the previous answer, so a followup has scope
 * @returns {Promise<{ text: string, ms: number, usage: object }>}
 */
export async function produceAnswer({ jpeg, mode, question, previous }) {
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

  if (mode === "followup") {
    content.push({
      type: "text",
      text: `Your previous answer about this screen:\n\n${previous}\n\nFollow-up question: ${question}`,
    });
  } else if (mode === "ask") {
    content.push({ type: "text", text: question });
  } else {
    content.push({ type: "text", text: mode === "explain" ? "Explain this." : "Describe this." });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: PROMPTS[mode] + IGNORE_OWN_INTERFACE,
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

// Turns an SDK failure into something a participant can act on, rather than a
// stack trace in a panel.
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
