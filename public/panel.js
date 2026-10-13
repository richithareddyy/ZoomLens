// The in-meeting panel. Gets the meeting and participant from the Zoom Apps SDK
// and holds a WebSocket to the backend carrying that identity, so answers can be
// addressed to this participant alone (docs/protocol.md). Reconnects with backoff.

const el = (id) => document.getElementById(id);

const ui = {
  state: el("state"), stateText: el("state-text"),
  notice: el("notice"), alert: el("alert"),
  thread: el("thread"), empty: el("empty"),
  composer: el("composer"), q: el("q"), send: el("send"),
  diag: el("diag"),
  dZoom: el("d-zoom"), dLink: el("d-link"), dMeeting: el("d-meeting"), dViewer: el("d-viewer"),
  actions: [...document.querySelectorAll("[data-mode]")],
  switches: [...document.querySelectorAll("[data-feature]")],
  colorsButton: el("btn-colors"),
};

// --- State ------------------------------------------------------------------

const KEEPALIVE_MS = 30000;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];

let identity = null;        // { meetingUUID } as the SDK reports it
let zoomState = "checking"; // checking | ok | outside | elsewhere | refused
let socket = null;
let identified = false;
let streamActive = false;
let subscribed = false;     // features re-sent on this connection
let pending = null;         // { id, mode, question } in flight
let hasAnswer = false;      // whether a follow-up has anything to follow
let attempt = 0;
let keepalive = null;
let closing = false;
let thinkingEl = null;
let lastNote = null;

// What this participant has switched on. Color Assist is remembered on this
// device, since someone who needs it needs it in every meeting.
const features = { changes: false, color: false };
try { features.color = localStorage.getItem("zoomlens-color") === "on"; } catch {}

const TITLES = {
  describe: "Description", explain: "Explanation", changed: "What changed",
  colors: "Colors", ask: "Answer", followup: "Answer",
};
const WORKING = {
  describe: "Reading the shared screen…",
  explain: "Working out what this shows…",
  changed: "Comparing with the last answer…",
  colors: "Reading the colors on screen…",
  ask: "Looking for the answer…",
  followup: "Looking for the answer…",
};

const shorten = (v) => (!v ? "unknown" : v.length > 24 ? `${v.slice(0, 21)}…` : v);
const now = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// --- Presentation -----------------------------------------------------------

// One status in the header; identifiers and SDK errors go to diagnostics.
function paint() {
  const open = socket?.readyState === WebSocket.OPEN;
  let kind, text, empty;

  if (pending) {
    [kind, text] = ["busy", "Analyzing"];
  } else if (!open) {
    [kind, text] = attempt > 2 ? ["err", "Can't reach ZoomLens"] : ["busy", "Connecting"];
    empty = attempt > 2 ? "ZoomLens can't reach its server. It keeps trying." : "Connecting…";
  } else if (zoomState === "outside") {
    [kind, text] = ["warn", "Development mode"];
    empty = "Open ZoomLens in a Zoom meeting to read a shared screen.";
  } else if (zoomState === "elsewhere") {
    [kind, text] = ["idle", "Not in a meeting"];
    empty = "Open ZoomLens from inside a meeting to use it.";
  } else if (zoomState === "refused" || !identified) {
    [kind, text] = ["err", "Not connected"];
    empty = "ZoomLens isn't connected to this meeting.";
  } else if (!streamActive) {
    [kind, text] = ["idle", "No shared screen"];
    empty = "Nobody is sharing their screen. ZoomLens is ready as soon as someone does.";
  } else {
    [kind, text] = ["ok", "Ready"];
    empty = "Press Describe screen for a summary of what's shared, or ask a question below.";
  }

  ui.state.dataset.kind = kind;
  ui.stateText.textContent = text;
  if (ui.empty && empty) ui.empty.textContent = empty;

  const ready = identified && streamActive && open && !pending;
  for (const b of ui.actions) b.disabled = !ready;
  for (const b of ui.switches) {
    b.disabled = !(identified && open);
    b.setAttribute("aria-checked", String(features[b.dataset.feature]));
  }
  ui.colorsButton.hidden = !features.color;
  if (!features.color && lastNote) {
    clearNote();
    lastNote = null;
  }
  ui.q.disabled = !ready;
  ui.send.disabled = !ready || !ui.q.value.trim();
  ui.q.placeholder = hasAnswer ? "Ask a follow-up…" : "Ask about the shared screen…";
  ui.diag.hidden = zoomState === "ok" && !location.search.includes("debug");
}

function showNotice(title, body) {
  ui.notice.hidden = false;
  const h = document.createElement("strong");
  h.textContent = `${title}. `;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "link";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => location.reload());
  ui.notice.replaceChildren(h, body, " ", retry);
}

function diag(field, value) {
  ui[field].textContent = value;
}

// --- Answers ----------------------------------------------------------------

// Answers are plain text so screen readers read them cleanly. For statuses and
// metrics the model writes one "Item: value" per line, optionally under a short
// heading line ending in a colon; two or more such lines become a list.
function render(text) {
  const out = document.createDocumentFragment();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const pair = (line) => line.match(/^([^:]{1,60}):\s+(.+)$/);
  const add = (tag, content, parent = out) => {
    const node = document.createElement(tag);
    node.textContent = content;
    parent.appendChild(node);
    return node;
  };

  for (let i = 0; i < lines.length;) {
    let end = i;
    while (end < lines.length && pair(lines[end])) end++;
    if (end - i >= 2) {
      const list = document.createElement("dl");
      for (; i < end; i++) {
        const [, item, value] = pair(lines[i]);
        const row = document.createElement("div");
        add("dt", item, row);
        add("dd", value, row);
        list.appendChild(row);
      }
      out.appendChild(list);
    } else if (/^[^:]{1,40}:$/.test(lines[i]) && pair(lines[i + 1] ?? "")) {
      add("h3", lines[i].slice(0, -1));
      i++;
    } else {
      add("p", lines[i]);
      i++;
    }
  }
  return out;
}

function meta(what, time = now()) {
  const m = document.createElement("div");
  m.className = "meta";
  const w = document.createElement("span");
  w.className = "what";
  w.textContent = what;
  const t = document.createElement("span");
  t.textContent = time ? `· ${time}` : "";
  m.append(w, t);
  return m;
}

function newTurn(className) {
  ui.empty?.remove();
  ui.empty = null;
  const turn = document.createElement("div");
  turn.className = `turn ${className}`.trim();
  return turn;
}

// Earlier answers step back so the newest is the one the eye lands on.
function dimOlder(except) {
  for (const t of ui.thread.querySelectorAll(".turn:not(.older)")) {
    if (t !== except && !t.classList.contains("asked")) t.classList.add("older");
  }
}

function addAsked(question) {
  const turn = newTurn("asked");
  const text = document.createElement("div");
  text.className = "text";
  text.textContent = question;
  turn.append(meta("You asked", null), text);
  ui.thread.appendChild(turn);
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

function addThinking(label) {
  const turn = newTurn("");
  const row = document.createElement("div");
  row.className = "thinking";
  row.textContent = label;
  turn.appendChild(row);
  ui.thread.appendChild(turn);
  thinkingEl = turn;
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

// The answer replaces the working row rather than appearing below it, and is
// shown from its top: scrolling to the bottom of a long answer leaves the
// reader at its last line.
function settle(title, text, { source = null, failed = false, retry = null } = {}) {
  const turn = thinkingEl ?? newTurn("");
  thinkingEl = null;
  turn.className = failed ? "turn failed" : "turn";

  const body = document.createElement("div");
  body.className = "text";
  body.appendChild(render(text));
  turn.replaceChildren(meta(title), body);

  if (source) {
    const s = document.createElement("div");
    s.className = "source";
    s.textContent = source;
    turn.appendChild(s);
  }
  if (retry) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link retry";
    b.textContent = "Try again";
    b.addEventListener("click", retry);
    turn.appendChild(b);
  }

  if (!turn.parentNode) ui.thread.appendChild(turn);
  dimOlder(turn);
  const pad = parseFloat(getComputedStyle(ui.thread).paddingTop) || 0;
  ui.thread.scrollTo({
    top: Math.max(0, turn.offsetTop - ui.thread.offsetTop - pad),
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

// Changes arrive unasked, so they are added without moving the reader: the log
// region announces them, and an answer being worked on stays last.
function addUpdate(title, text, className = "") {
  const turn = newTurn(className);
  const body = document.createElement("div");
  body.className = "text";
  body.appendChild(render(text));
  turn.append(meta(title), body);
  ui.thread.insertBefore(turn, thinkingEl);
  if (!thinkingEl) dimOlder(turn);
  const nearBottom = ui.thread.scrollHeight - ui.thread.scrollTop - ui.thread.clientHeight < 120;
  if (nearBottom && !thinkingEl) ui.thread.scrollTop = ui.thread.scrollHeight;
}

// Color Assist notes take one slot above the answers; a new note replaces the
// old one and the same note is never shown twice in a row.
function showNote(text) {
  if (text === lastNote) return;
  lastNote = text;

  const box = document.createElement("div");
  box.className = "alert-box";
  const title = document.createElement("strong");
  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "⚠ ";
  title.replaceChildren(mark, "Color Assist");
  const body = document.createElement("span");
  body.textContent = text;

  const row = document.createElement("div");
  row.className = "row";
  const explain = document.createElement("button");
  explain.type = "button";
  explain.className = "link";
  explain.textContent = "Explain colors";
  explain.addEventListener("click", () => send("colors"));
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "link quiet";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => {
    clearNote();
    ui.switches.find((b) => b.dataset.feature === "color").focus();
  });
  row.append(explain, dismiss);

  box.append(title, body, row);
  ui.alert.replaceChildren(box);
}

const clearNote = () => ui.alert.replaceChildren();

// --- Zoom identity ----------------------------------------------------------

async function getIdentity() {
  if (typeof zoomSdk === "undefined") {
    zoomState = "outside";
    diag("dZoom", "not available");
    return null;
  }

  let config;
  try {
    config = await zoomSdk.config({
      version: "0.16",
      capabilities: ["getMeetingUUID", "getUserContext"],
    });
  } catch (err) {
    const message = String(err?.message ?? err);
    if (/not supported by this browser/i.test(message)) {
      zoomState = "outside";
      diag("dZoom", "not available");
    } else {
      zoomState = "refused";
      diag("dZoom", `config failed: ${message}`);
      showNotice("Zoom declined the connection", "ZoomLens could not start in this meeting.");
    }
    return null;
  }

  const context = config?.runningContext ?? "unknown";
  if (context !== "inMeeting") {
    zoomState = "elsewhere";
    diag("dZoom", context);
    return null;
  }

  // Called one at a time so a failure names which call failed.
  const results = {};
  for (const name of ["getMeetingUUID", "getUserContext"]) {
    try { results[name] = await zoomSdk[name](); }
    catch (err) { results[name] = { error: String(err?.message ?? err) }; }
  }

  const meeting = results.getMeetingUUID;
  const user = results.getUserContext;

  diag("dMeeting", meeting?.error ? "refused" : shorten(meeting?.meetingUUID));
  diag("dViewer", user?.error ? "refused" : user?.screenName ?? "unknown");

  if (meeting?.error || user?.error) {
    zoomState = "refused";
    diag("dZoom", [meeting?.error && `getMeetingUUID: ${meeting.error}`,
                   user?.error && `getUserContext: ${user.error}`].filter(Boolean).join(" | "));
    showNotice("Zoom didn't say who is viewing",
               "Without that, answers can't be kept private to you.");
    return null;
  }

  zoomState = "ok";
  diag("dZoom", "connected");
  return { meetingUUID: meeting.meetingUUID };
}

// --- Connection -------------------------------------------------------------

function stopKeepalive() {
  if (keepalive) clearInterval(keepalive);
  keepalive = null;
}

// What a failed request is called, from the backend's error code and message.
function failure(msg) {
  if (msg.code === "rate_limited") return ["Limit reached", false];
  if (msg.code === "no_stream") return ["No shared screen", true];
  if (msg.code === "not_identified") return ["Not connected to the meeting", false];
  if (/no screen|screen to look at/i.test(msg.message)) return ["Couldn't read the screen", true];
  return ["Couldn't answer", true];
}

function connect() {
  closing = false;
  subscribed = false;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/ws`);
  diag("dLink", attempt ? `reconnecting, attempt ${attempt + 1}` : "connecting");

  socket.addEventListener("open", () => {
    attempt = 0;
    // The ticket is what identifies this panel; the meeting is only reported
    // so the server can notice if the SDK disagrees with Zoom's context.
    socket.send(JSON.stringify({
      type: "hello",
      ticket: document.querySelector('meta[name="zoomlens-ticket"]')?.content || null,
      meetingUUID: identity?.meetingUUID ?? null,
    }));

    // Proxies drop idle connections during quiet stretches of a meeting.
    stopKeepalive();
    keepalive = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, KEEPALIVE_MS);
  });

  socket.addEventListener("message", (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case "ready":
        identified = Boolean(msg.identified);
        streamActive = Boolean(msg.streamActive);
        diag("dLink", `connected, session ${msg.sessionId}`);
        // Inside a meeting but not verified: the page needs a fresh load from
        // Zoom, for example after the server restarted and forgot its tickets.
        if (!identified && zoomState === "ok") {
          showNotice("This panel couldn't be verified", "Reopen ZoomLens from the meeting's Apps menu.");
        } else if (identified) {
          ui.notice.hidden = true;
        }
        // The server forgets on disconnect, so ask again once per connection.
        // It sends ready again whenever sharing starts or stops.
        if (identified && !subscribed) {
          subscribed = true;
          for (const [feature, on] of Object.entries(features)) {
            if (on) socket.send(JSON.stringify({ type: "watch", feature, on }));
          }
        }
        break;

      case "watching": {
        const feature = msg.feature ?? "changes";
        if (!msg.on && msg.reason) {
          addUpdate(feature === "color" ? "Color Assist turned off" : "Screen changes turned off", msg.reason);
        }
        features[feature] = Boolean(msg.on);
        break;
      }

      case "update":
        if ((msg.feature ?? "changes") === "color") showNote(msg.text);
        else addUpdate("Screen changed", msg.text);
        return;

      case "answer":
        if (msg.id !== pending?.id) return;
        // Once the colors are explained, the note has done its job.
        if (pending.mode === "colors") clearNote();
        settle(TITLES[pending.mode], msg.text, { source: msg.note ?? null });
        pending = null;
        hasAnswer = true;
        break;

      case "error": {
        if (pending && (!msg.id || msg.id === pending.id)) {
          const [title, canRetry] = failure(msg);
          const { mode, question } = pending;
          pending = null;
          settle(title, msg.message, {
            failed: true,
            retry: canRetry ? () => send(mode, question, { again: true }) : null,
          });
        } else {
          addUpdate("ZoomLens", msg.message, "failed");
        }
        break;
      }

      default: // accepted, pong, or anything unknown
        return;
    }
    paint();
  });

  socket.addEventListener("close", () => {
    stopKeepalive();
    identified = false;
    streamActive = false;
    if (pending) {
      const { mode, question } = pending;
      pending = null;
      settle("Connection lost", "The connection dropped before an answer arrived.", {
        failed: true,
        retry: () => send(mode, question, { again: true }),
      });
    }
    diag("dLink", "disconnected");
    paint();

    if (closing) return;

    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    setTimeout(connect, wait);
  });

  socket.addEventListener("error", () => {
    // close follows, and handles the retry
    diag("dLink", "connection error");
  });
}

// --- Asking -----------------------------------------------------------------

function send(mode, question = null, { again = false } = {}) {
  if (socket?.readyState !== WebSocket.OPEN || pending) return;
  pending = { id: `r-${Date.now().toString(36)}`, mode, question };
  // Only the latest failure is worth retrying.
  for (const b of ui.thread.querySelectorAll(".retry")) b.remove();
  if (question && !again) addAsked(question);
  addThinking(WORKING[mode]);
  socket.send(JSON.stringify({ type: "request", id: pending.id, mode, question }));
  paint();
}

for (const button of ui.actions) {
  button.addEventListener("click", () => send(button.dataset.mode));
}

ui.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = ui.q.value.trim();
  if (!question || ui.q.disabled) return;
  ui.q.value = "";
  send(hasAnswer ? "followup" : "ask", question);
  ui.q.focus();
});

for (const button of ui.switches) {
  button.addEventListener("click", () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const { feature } = button.dataset;
    features[feature] = !features[feature];
    if (feature === "color") {
      try { localStorage.setItem("zoomlens-color", features.color ? "on" : "off"); } catch {}
    }
    socket.send(JSON.stringify({ type: "watch", feature, on: features[feature] }));
    paint();
  });
}

ui.q.addEventListener("input", paint);

window.addEventListener("beforeunload", () => {
  closing = true;
  stopKeepalive();
  socket?.close();
});

// --- Start ------------------------------------------------------------------

(async () => {
  identity = await getIdentity();
  // Connect even without an identity: being refused when asking is a clearer
  // failure than never connecting.
  connect();
  paint();
})();
