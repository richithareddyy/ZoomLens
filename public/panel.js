// The in-meeting panel. Gets the meeting and participant from the Zoom Apps SDK
// and holds a WebSocket to the backend carrying that identity, so answers can be
// addressed to this participant alone (docs/protocol.md). Reconnects with backoff.

const el = (id) => document.getElementById(id);

const ui = {
  state: el("state"), stateText: el("state-text"),
  notice: el("notice"),
  thread: el("thread"), empty: el("empty"),
  composer: el("composer"), q: el("q"), send: el("send"), hint: el("hint"),
  diag: el("diag"),
  dZoom: el("d-zoom"), dLink: el("d-link"), dMeeting: el("d-meeting"), dViewer: el("d-viewer"),
  actions: [...document.querySelectorAll(".action")],
};

// --- State ------------------------------------------------------------------

const KEEPALIVE_MS = 30000;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];

let identity = null;        // { meetingUUID, participantUUID, screenName }
let zoomState = "checking"; // checking | ok | outside | refused
let socket = null;
let identified = false;
let streamActive = false;
let pending = null;         // request id in flight
let hasAnswer = false;      // whether a follow-up has anything to follow
let attempt = 0;
let keepalive = null;
let closing = false;
let thinkingEl = null;

const shorten = (v) => (!v ? "unknown" : v.length > 24 ? `${v.slice(0, 21)}…` : v);

// --- Presentation -----------------------------------------------------------

// The header shows one plain status; identifiers and SDK errors go to diagnostics.
function paint() {
  const open = socket?.readyState === WebSocket.OPEN;
  let kind = "busy", text = "Connecting";

  if (pending) {
    kind = "busy"; text = "Understanding";
  } else if (!open) {
    kind = attempt > 2 ? "err" : "warn";
    text = attempt > 2 ? "Can't reach backend" : "Reconnecting";
  } else if (zoomState === "outside") {
    kind = "warn"; text = "Development mode";
  } else if (zoomState === "refused" || !identified) {
    kind = "err"; text = "Session not identified";
  } else if (!streamActive) {
    kind = "warn"; text = "Waiting for screen share";
  } else {
    kind = "ok"; text = "Ready";
  }

  ui.state.dataset.kind = kind;
  ui.stateText.textContent = text;

  const ready = identified && streamActive && open && !pending;
  for (const b of ui.actions) b.disabled = !ready;
  ui.q.disabled = !ready;
  ui.send.disabled = !ready || !ui.q.value.trim();
  ui.q.placeholder = hasAnswer ? "Ask a follow-up…" : "Ask about the shared screen…";

  ui.hint.textContent =
    pending        ? "Working on it."
    : !open        ? "Trying to reconnect."
    : !identified  ? "Open inside Zoom to ask about a shared screen."
    : !streamActive ? "Nobody is sharing a screen yet."
    : "Only you see your answers.";
}

function showNotice(title, body, onRetry) {
  ui.notice.hidden = false;
  ui.notice.innerHTML = "";
  const h = document.createElement("strong");
  h.textContent = title;
  const p = document.createElement("span");
  p.textContent = body;
  ui.notice.append(h, p);
  if (onRetry) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Retry";
    b.addEventListener("click", onRetry);
    ui.notice.appendChild(b);
  }
}

const hideNotice = () => { ui.notice.hidden = true; ui.notice.innerHTML = ""; };

function diag(field, value) {
  ui[field].textContent = value;
}

// --- The thread -------------------------------------------------------------

// While asking, follow the bottom. When an answer lands, show its top: scrolling
// to the bottom of a long answer leaves the reader at its last line.
function scrollDown() {
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

function revealTop(node) {
  const pad = parseFloat(getComputedStyle(ui.thread).paddingTop) || 0;
  ui.thread.scrollTo({
    top: Math.max(0, node.offsetTop - ui.thread.offsetTop - pad),
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function addAsked(text) {
  ui.empty?.remove();
  const turn = document.createElement("div");
  turn.className = "turn question";
  const asked = document.createElement("div");
  asked.className = "asked";
  asked.textContent = text;
  turn.appendChild(asked);
  ui.thread.appendChild(turn);
  scrollDown();
}

function addThinking(label) {
  ui.empty?.remove();
  const turn = document.createElement("div");
  turn.className = "turn";
  turn.innerHTML = `<div class="thinking"><i></i><span></span></div>`;
  turn.querySelector("span").textContent = label;
  ui.thread.appendChild(turn);
  thinkingEl = turn;
  scrollDown();
}

// The answer replaces the thinking row rather than appearing below it.
function settle(label, text, source, failed = false) {
  const turn = thinkingEl ?? document.createElement("div");
  thinkingEl = null;
  turn.className = failed ? "turn failed" : "turn";
  turn.innerHTML = "";

  const tag = document.createElement("div");
  tag.className = "label";
  tag.textContent = label;

  const body = document.createElement("div");
  body.className = "body";
  body.textContent = text;

  if (source) {
    const s = document.createElement("div");
    s.className = "source";
    s.textContent = source;
    body.appendChild(s);
  }

  turn.append(tag, body);
  if (!turn.parentNode) ui.thread.appendChild(turn);
  revealTop(turn);
}

// --- Zoom identity ----------------------------------------------------------

async function getIdentity() {
  if (typeof zoomSdk === "undefined") {
    zoomState = "outside";
    diag("dZoom", "not available");
    showNotice("Development mode", "Open inside Zoom to access live screen context.");
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
      showNotice("Development mode", "Open inside Zoom to access live screen context.");
    } else {
      zoomState = "refused";
      diag("dZoom", `config failed: ${message}`);
      showNotice("Zoom declined the connection",
                 "Zoom Lens could not start inside this meeting.",
                 () => location.reload());
    }
    return null;
  }

  const context = config?.runningContext ?? "unknown";
  if (context !== "inMeeting") {
    zoomState = "outside";
    diag("dZoom", context);
    showNotice("Not in a meeting", "Zoom Lens reads a shared screen, so it needs to run inside a meeting.");
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
    showNotice("Unable to identify the current Zoom session",
               "Zoom did not say who is viewing, so an answer could not be kept private.",
               () => location.reload());
    return null;
  }

  zoomState = "ok";
  diag("dZoom", "connected");
  hideNotice();
  return {
    meetingUUID: meeting.meetingUUID,
    participantUUID: user.participantUUID ?? null,
    screenName: user.screenName ?? null,
  };
}

// --- Connection -------------------------------------------------------------

function stopKeepalive() {
  if (keepalive) clearInterval(keepalive);
  keepalive = null;
}

function connect() {
  closing = false;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/ws`);
  diag("dLink", attempt ? `reconnecting, attempt ${attempt + 1}` : "connecting");

  socket.addEventListener("open", () => {
    attempt = 0;
    socket.send(JSON.stringify({
      type: "hello",
      meetingUUID: identity?.meetingUUID ?? null,
      participantUUID: identity?.participantUUID ?? null,
      screenName: identity?.screenName ?? null,
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
        break;

      case "accepted":
        addThinking(msg.mode === "explain" ? "Analyzing what's being shown…" : "Understanding shared screen…");
        break;

      case "answer":
        pending = null;
        hasAnswer = true;
        settle("Answer", msg.text, msg.note ?? null);
        // The shortcuts have done their job; the conversation needs the room.
        document.querySelector(".actions").classList.add("compact");
        break;

      case "error":
        pending = null;
        settle("Couldn't answer", msg.message, null, true);
        break;

      default: // pong, or anything unknown
        return;
    }
    paint();
  });

  socket.addEventListener("close", () => {
    stopKeepalive();
    identified = false;
    streamActive = false;
    if (pending) { pending = null; settle("Couldn't answer", "The connection dropped before an answer arrived.", null, true); }
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

function send(mode, question = null) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  pending = `r-${Date.now().toString(36)}`;
  if (question) addAsked(question);
  socket.send(JSON.stringify({ type: "request", id: pending, mode, question }));
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
