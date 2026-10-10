// Website demonstrations only. Nothing here connects to Zoom or calls a model.
// Questions are matched against a small, fixed set of example answers written
// for this page, and the page says so beneath the demo.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileQuery = matchMedia("(max-width: 760px)");
const isMobile = () => mobileQuery.matches;
const THINK_MS = reduceMotion ? 0 : 650;
const FALLBACK =
  "This demo understands a few example questions. Try asking what changed, what this means, or for a summary.";

// --- Scene content ----------------------------------------------------------

function sheetHTML() {
  const cols = [["Segment"], ["Q1"], ["Q2"], ["Q3", "q3"], ["Change", "change"]];
  const rows = [
    ["Enterprise", "ent", "412", "438", "491", ["+12%", "pos"]],
    ["Mid-market", null, "286", "301", "309", ["+3%", "pos"]],
    ["Self-serve", null, "174", "169", "163", ["−4%", "neg"]],
    ["Expenses", "opex", "530", "548", "570", ["+4%", "neg"]],
  ];
  const trigger = (spot, label) =>
    `data-spot="${spot}" class="spot" role="button" tabindex="0" aria-label="Ask about ${label}"`;
  const head = cols.map(([name, spot]) =>
    spot ? `<th ${trigger(spot, `the ${name} column`)}>${name}</th>` : `<th>${name}</th>`).join("");
  const body = rows.map(([label, rowSpot, q1, q2, q3, [chg, tone]]) => {
    const cell = (value, colSpot, cls = "") => {
      const spots = [rowSpot, colSpot].filter(Boolean).join(" ");
      return `<td${spots ? ` data-spot="${spots}"` : ""}${cls ? ` class="${cls}"` : ""}>${value}</td>`;
    };
    const first = rowSpot ? `<td ${trigger(rowSpot, `the ${label} row`)}>${label}</td>` : `<td>${label}</td>`;
    return `<tr>${first}${cell(q1)}${cell(q2)}${cell(q3, "q3")}${cell(chg, "change", tone)}</tr>`;
  }).join("");
  return `
    <h4 class="ctx">Q3 Revenue Analysis</h4>
    <p class="sub ctx">Revenue by segment, $k</p>
    <table class="sheet"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const spotAttr = (spot, label, cls = "") =>
  `class="spot ${cls}" data-spot="${spot}" role="button" tabindex="0" aria-label="Ask about ${label}"`;

const SCENES = {
  sheet: {
    html: sheetHTML,
    primary: "change",
    spots: {
      ent: { label: "Enterprise row", q: "What's happening with Enterprise?",
        a: "Enterprise is the strongest segment: 412 to 491 across three quarters, and up 12% on Q2 alone. It is carrying most of this quarter's growth." },
      q3: { label: "Q3 column", q: "What happened in Q3?",
        a: "Q3 is the latest quarter shown. Revenue across the three segments reached 963k, up from 908k in Q2, and nearly all of that increase came from Enterprise." },
      change: { label: "Change column", q: "What changed this quarter?",
        a: "Enterprise rose the most, up 12% on Q2. Mid-market grew 3%, self-serve slipped 4%, and operating expenses rose 4%." },
      opex: { label: "Expenses row", q: "What about expenses?",
        a: "Operating expenses rose 4% to 570k. Revenue grew about 6% overall, so expenses are rising, but more slowly than revenue." },
    },
    intents: {
      changed: "change", q3: "q3", expenses: "opex",
      revenue: { spot: "q3", a: "Revenue is up about 6% on Q2 overall, driven by Enterprise at +12%. Self-serve is the only segment that shrank." },
      matters: { spot: "ent", a: "Enterprise's +12% is the number that matters. It accounts for most of the quarter's growth, and it is the only segment growing faster than expenses." },
      summary: { spot: "change", a: "Revenue grew about 6% this quarter, almost entirely from Enterprise. Self-serve is shrinking and expenses are rising, though more slowly than revenue." },
      explain: { spot: "change", a: "This table tracks revenue for three customer segments over three quarters, with operating expenses underneath. The Change column compares Q3 with Q2." },
      trend: { spot: "q3", a: "Enterprise has grown every quarter, mid-market slowly too. Self-serve has declined two quarters running, from 174 to 163." },
      missed: "summary", point: "matters",
    },
    suggest: [["What changed?", "changed"], ["Which number matters most?", "matters"], ["Summarize this", "summary"]],
  },

  paper: {
    html: () => `
      <h4 class="ctx">Scaling Behaviour of Retrieval-Augmented Models</h4>
      <p class="sub ctx">Section 4 · Results</p>
      <div ${spotAttr("text", "the section text", "block paper-text")}>
        <span class="line" style="width:96%"></span><span class="line" style="width:88%"></span><span class="line" style="width:92%"></span>
      </div>
      <p ${spotAttr("result", "the results sentence", "paper-result")}>The retrieval-augmented method leads by 31 points at the largest training size.</p>
      <div ${spotAttr("fig", "Figure 3", "paper-fig")}>
        <span class="b" style="height:30%"></span><span style="height:34%"></span>
        <span class="b" style="height:46%"></span><span style="height:58%"></span>
        <span class="b" style="height:55%"></span><span style="height:78%"></span>
        <span class="b" style="height:61%"></span><span style="height:92%"></span>
      </div>
      <p class="paper-cap ctx">Figure 3. Accuracy against training set size.</p>`,
    primary: "fig",
    spots: {
      text: { label: "Section text", q: "Summarize this section",
        a: "This section reports how accuracy changes as the training set grows, comparing a retrieval-augmented method against a baseline." },
      result: { label: "Results sentence", q: "What's the main finding?",
        a: "Retrieval helps more as data grows. At small sizes the two methods are close; at the largest size shown, the retrieval-augmented method leads by 31 points." },
      fig: { label: "Figure 3", q: "What does this figure show?",
        a: "Figure 3 plots accuracy against training set size. In each pair, the lighter bar is the baseline and the darker one is the retrieval-augmented method. The gap widens as the data grows." },
    },
    intents: {
      figure: "fig", explain: "fig", finding: "result", point: "result",
      summary: "text", missed: "text", changed: "result",
      trend: { spot: "fig", a: "Both methods improve as data grows, but the retrieval-augmented one improves faster, so the gap widens from 4 points to 31." },
    },
    suggest: [["Explain this figure", "figure"], ["What's the main finding?", "finding"], ["Summarize this section", "summary"]],
  },

  dash: {
    html: () => `
      <h4 class="ctx">Funnel · last 8 weeks</h4>
      <div class="dash-kpis">
        <div class="ctx"><small>Visits</small><b>48.2k</b></div>
        <div ${spotAttr("conv", "conversion")}><small>Conversion</small><b>2.1%</b></div>
        <div ${spotAttr("mobile", "mobile share")}><small>Mobile share</small><b>64%</b></div>
      </div>
      <div ${spotAttr("chart", "the trend chart", "block")}>
        <svg class="dash-svg" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
          <polyline stroke="#9AA4B2" points="0,40 40,38 80,39 120,37 160,38 200,37 240,36 300,36"/>
          <polyline stroke="#2D8CFF" points="0,22 40,23 80,24 120,30 160,41 200,52 240,60 300,67"/>
        </svg>
      </div>`,
    primary: "conv",
    spots: {
      conv: { label: "Conversion", q: "Why did conversion drop?",
        a: "Conversion has fallen for about five weeks while visits stayed level, so fewer visitors are buying rather than fewer arriving. With mobile at 64% of traffic, the mobile experience is the first place to look." },
      mobile: { label: "Mobile share", q: "Why does mobile share matter here?",
        a: "At 64%, most visitors are on mobile, so anything that hurts the mobile experience moves the overall conversion rate more than a desktop problem would." },
      chart: { label: "Trend chart", q: "Summarize the trend",
        a: "Visits are flat to slightly up over eight weeks. Conversion held for the first three weeks, then fell steadily for the last five." },
    },
    intents: {
      drop: "conv", explain: "conv", point: "conv", trend: "chart", summary: "chart", missed: "chart",
      changed: { spot: "chart", a: "Conversion started falling around week four and has not recovered. Visits stayed level throughout." },
      unusual: { spot: "chart", a: "The timing. Visits are steady, but conversion turns down around week four and keeps falling. A change around then, such as a release or a campaign ending, is the usual cause." },
    },
    suggest: [["Why did this drop?", "drop"], ["What's unusual?", "unusual"], ["Summarize the trend", "trend"]],
  },

  slides: {
    html: () => `
      <div ${spotAttr("title", "the slide title", "slide-title")}><h4>Deployment options</h4></div>
      <p class="sub ctx">Comparing three approaches</p>
      <div class="slide">
        <div ${spotAttr("self", "the self-hosted option")}><b>Self-hosted</b>Full control, highest operating cost</div>
        <div ${spotAttr("managed", "the managed option", "pick")}><b>Managed</b>Lower cost, vendor runs upgrades</div>
        <div ${spotAttr("hybrid", "the hybrid option")}><b>Hybrid</b>Flexible, two systems to maintain</div>
      </div>`,
    primary: "title",
    spots: {
      title: { label: "Slide title", q: "What did I miss?",
        a: "The presenter is comparing three ways to deploy and has highlighted the managed option. That is the recommendation." },
      managed: { label: "Managed option", q: "What's the main point?",
        a: "Managed is being recommended, mainly for its lower operating cost. The vendor runs upgrades, so the team gives up some control to save running costs." },
      self: { label: "Self-hosted option", q: "What's the tradeoff here?",
        a: "Self-hosted gives full control but costs the most to run. It is presented as the option the team would be moving away from." },
      hybrid: { label: "Hybrid option", q: "Why not hybrid?",
        a: "Hybrid is flexible but means maintaining two systems. The slide frames that as extra work rather than a benefit." },
    },
    intents: {
      missed: "title", changed: "title", point: "managed", explain: "managed", tradeoff: "self", expenses: "managed",
      summary: { spot: "title", a: "Three deployment options: self-hosted, managed and hybrid. Managed is highlighted as the recommendation because it costs the least to run." },
    },
    suggest: [["What did I miss?", "missed"], ["What's the main point?", "point"], ["Summarize this slide", "summary"]],
  },
};

// Typed questions are matched to an intent, most specific first. A scene that
// has no answer for one intent falls through to the next that matches.
const INTENT_PATTERNS = [
  ["expenses", /expense|cost|opex|spend/],
  ["revenue", /revenue|sales|income/],
  ["changed", /chang/],
  ["q3", /\bq3\b|quarter|third/],
  ["figure", /figure|graph|chart|plot|bars?\b/],
  ["drop", /drop|fall|fell|decline|decreas|\bdown\b/],
  ["unusual", /unusual|odd|weird|anomal|stand(s)? out|surpris/],
  ["tradeoff", /trade.?off|downside|pros|cons|\bvs\b|versus|compare/],
  ["matters", /matter|most important|which number|key number|focus on/],
  ["finding", /finding|result|conclu/],
  ["missed", /miss|catch me up|what happened|late|behind/],
  ["point", /point|takeaway|recommend|argu/],
  ["trend", /trend|over time|direction/],
  ["summary", /summar|overview|recap|tl;?dr|gist/],
  ["explain", /explain|mean|understand|what is this|what's this|what am i looking/],
];

// --- Elements and state -------------------------------------------------------

const $ = (s, r = document) => r.querySelector(s);
const meeting = $("#meeting");
const screenEl = $("#screen");
const threadEl = $("#thread");
const form = $("#ask-form");
const input = $("#ask");
const stateEl = $("#lp-state");
const lensBtn = $("#ctl-lens");
const tabs = [...document.querySelectorAll(".tab")];
const segBtns = [...document.querySelectorAll(".seg-btn")];

const state = { scene: "sheet", lensOpen: true, timer: null, pendingQ: null };

// --- Resolving what to say ---------------------------------------------------

function fromSpot(scene, id) {
  const s = scene.spots[id];
  return s ? { spot: id, label: s.label, a: s.a } : null;
}

function fromIntent(scene, key) {
  let v = scene.intents[key];
  if (typeof v === "string" && scene.intents[v] && !scene.spots[v]) v = scene.intents[v]; // alias
  if (typeof v === "string") return fromSpot(scene, v);
  if (v) return { spot: v.spot, label: scene.spots[v.spot]?.label, a: v.a };
  return null;
}

function resolveTyped(text) {
  const scene = SCENES[state.scene];
  const q = text.toLowerCase();
  for (const [key, re] of INTENT_PATTERNS) {
    if (re.test(q)) {
      const hit = fromIntent(scene, key);
      if (hit) return hit;
    }
  }
  return { fallback: true, a: FALLBACK };
}

// --- The screen ----------------------------------------------------------------

function light(spot) {
  screenEl.querySelectorAll(".lit").forEach((el) => el.classList.remove("lit"));
  if (spot) screenEl.querySelectorAll(`[data-spot~="${spot}"]`).forEach((el) => el.classList.add("lit"));
  screenEl.classList.toggle("focusing", Boolean(spot));
}

// --- The thread, built exactly as the real panel builds it --------------------

const actionsEl = $("#zl-actions");
const pillText = $("#lp-state-text");

function setPill(kind, text) {
  stateEl.dataset.kind = kind;
  pillText.textContent = text;
}

function turn(cls = "") {
  const t = document.createElement("div");
  t.className = `zl-turn ${cls}`.trim();
  return t;
}

function askedTurn(text) {
  const t = turn("question");
  const a = document.createElement("div");
  a.className = "zl-asked";
  a.textContent = text;
  t.appendChild(a);
  return t;
}

function thinkingTurn(label) {
  const t = turn("pending");
  const row = document.createElement("div");
  row.className = "zl-thinking";
  row.setAttribute("role", "status");
  row.innerHTML = "<i></i><span></span>";
  row.querySelector("span").textContent = label;
  t.appendChild(row);
  return t;
}

function answerTurn(result) {
  const t = turn();
  const label = document.createElement("div");
  label.className = "zl-label";
  label.textContent = "Answer";
  const body = document.createElement("div");
  body.className = "zl-body";
  body.textContent = result.a;
  if (result.label) {
    const src = document.createElement("div");
    src.className = "zl-source";
    src.textContent = `Looking at: ${result.label}`;
    body.appendChild(src);
  }
  t.append(label, body);
  return t;
}

function showEmpty() {
  const p = document.createElement("p");
  p.className = "zl-empty";
  p.textContent = "Ask about the shared screen, or use a shortcut above.";
  threadEl.replaceChildren(p);
}

function trimThread() {
  const turns = threadEl.querySelectorAll(".zl-turn");
  for (let i = 0; i < turns.length - 10; i++) turns[i].remove();
}

function reveal(node) {
  // The newest question at the top, so its answer reads from the start.
  threadEl.scrollTop = node.offsetTop - threadEl.offsetTop - 8;
}

// question: what was typed, or what a screen region asks. null for Describe
// and Explain, which in the real panel send no visible question.
function ask(question, result, { instant = false, thinking = "Understanding shared screen…" } = {}) {
  clearTimeout(state.timer);
  state.pendingQ?.remove();
  state.pendingQ = null;
  threadEl.querySelector(".zl-empty")?.remove();
  threadEl.querySelector(".zl-turn.pending")?.remove();

  const q = question ? askedTurn(question) : null;
  if (q) threadEl.appendChild(q);
  light(result.spot || null);
  trimThread();

  const finish = () => {
    state.pendingQ = null;
    threadEl.querySelector(".zl-turn.pending")?.remove();
    const a = answerTurn(result);
    threadEl.appendChild(a);
    setPill("ok", "Ready");
    actionsEl.classList.add("compact");     // as the real panel does after an answer
    input.placeholder = "Ask a follow-up…";
    reveal(q || a);
  };

  if (instant || !THINK_MS) return finish();

  const pending = thinkingTurn(thinking);
  threadEl.appendChild(pending);
  reveal(q || pending);
  setPill("busy", "Understanding");
  state.pendingQ = q;
  state.timer = setTimeout(finish, THINK_MS);
}

// --- Scenes -------------------------------------------------------------------

function showScene(key, { instant = false } = {}) {
  const scene = SCENES[key];
  state.scene = key;
  clearTimeout(state.timer);
  state.pendingQ = null;
  screenEl.innerHTML = scene.html();          // authored above, never user input
  screenEl.setAttribute("aria-label", "Shared screen. Select a highlighted area to ask Zoom Lens about it.");
  showEmpty();
  setPill("ok", "Ready");
  const first = scene.spots[scene.primary];
  ask(first.q, fromSpot(scene, scene.primary), { instant });
}

// The real panel's two shortcuts, answered from this scenario's example set.
actionsEl.querySelectorAll(".zl-action").forEach((btn) => {
  btn.addEventListener("click", () => {
    const scene = SCENES[state.scene];
    const explain = btn.dataset.mode === "explain";
    const hit = fromIntent(scene, explain ? "explain" : "summary") || { fallback: true, a: FALLBACK };
    openLens();
    ask(null, hit, { thinking: explain ? "Analyzing what's being shown…" : "Understanding shared screen…" });
  });
});

function selectTab(i, opts) {
  tabs.forEach((t, j) => {
    t.setAttribute("aria-selected", String(i === j));
    t.tabIndex = i === j ? 0 : -1;
  });
  showScene(tabs[i].dataset.scene, opts);
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(i));
  tab.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    selectTab(next);
    tabs[next].focus();
  });
});

// Hotspots: any cell or block carrying data-spot. A cell in both a row and a
// column belongs to its row first.
function activateSpot(el) {
  const id = el.dataset.spot.split(" ")[0];
  const scene = SCENES[state.scene];
  const hit = fromSpot(scene, id);
  if (!hit) return;
  openLens();
  ask(scene.spots[id].q, hit);
}
screenEl.addEventListener("click", (e) => {
  const el = e.target.closest("[data-spot]");
  if (el && screenEl.contains(el)) activateSpot(el);
});
screenEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest('[role="button"][data-spot]');
  if (!el) return;
  e.preventDefault();
  activateSpot(el);
});

// --- Typing a question ---------------------------------------------------------

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  input.value = "";
  ask(text, resolveTyped(text));
  input.focus();
});

// --- ZoomLens open and closed, and the mobile views -------------------------------

function setPane(pane) {
  meeting.dataset.pane = pane;
  segBtns.forEach((b) => {
    const on = b.dataset.pane === pane;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  if (isMobile()) syncLensButton(pane === "lens");
}

function syncLensButton(open) {
  lensBtn.setAttribute("aria-pressed", String(open));
  lensBtn.dataset.tip = open ? "Close ZoomLens" : "Open ZoomLens";
}

function setLens(open) {
  state.lensOpen = open;
  if (isMobile()) { setPane(open ? "lens" : "screen"); return; }
  meeting.classList.toggle("lens-closed", !open);
  syncLensButton(open);
}
const openLens = () => {
  if (isMobile()) setPane("lens");
  else if (!state.lensOpen) setLens(true);
};

$("#lp-close").addEventListener("click", () => {
  setLens(false);
  lensBtn.focus();
});
lensBtn.addEventListener("click", () => {
  const open = isMobile() ? meeting.dataset.pane !== "lens" : !state.lensOpen;
  setLens(open);
});
segBtns.forEach((b, i) => {
  b.addEventListener("click", () => setPane(b.dataset.pane));
  b.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const other = segBtns[1 - i];
    setPane(other.dataset.pane);
    other.focus();
  });
});
mobileQuery.addEventListener("change", () => {
  meeting.classList.remove("lens-closed");
  state.lensOpen = true;
  setPane("screen");
  syncLensButton(!isMobile() || meeting.dataset.pane === "lens");
});

// --- Meeting controls: simulated ---------------------------------------------------

function toggleControl(btn, cls, onLabel, offLabel, onTip, offTip) {
  btn.addEventListener("click", () => {
    const off = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(off));
    btn.setAttribute("aria-label", off ? offLabel : onLabel);
    btn.dataset.tip = off ? offTip : onTip;
    meeting.classList.toggle(cls, off);
  });
}
toggleControl($("#ctl-mic"), "mic-off",
  "Mute microphone (simulated)", "Unmute microphone (simulated)", "Mute (simulated)", "Unmute (simulated)");
toggleControl($("#ctl-cam"), "cam-off",
  "Stop video (simulated)", "Start video (simulated)", "Stop video (simulated)", "Start video (simulated)");

// --- Try ZoomLens: point at where to begin, no modal ---------------------------------

document.querySelectorAll("[data-try]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("#demo").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    openLens();
    const target = $(".zl-field");
    setTimeout(() => {
      input.focus({ preventScroll: true });
      if (!reduceMotion) {
        target.classList.remove("attn");
        void target.offsetWidth;                   // restart the animation
        target.classList.add("attn");
      }
    }, reduceMotion ? 0 : 450);
  });
});

// --- Easter egg: three quick presses on the lens bring the screen into focus ------------

let presses = [];
$("#lp-logo").addEventListener("click", () => {
  const now = Date.now();
  presses = presses.filter((t) => now - t < 900).concat(now);
  if (presses.length < 3) return;
  presses = [];
  meeting.classList.add("focus-mode");
  setTimeout(() => meeting.classList.remove("focus-mode"), 2600);
});

// --- How it works: one meeting, four states -------------------------------------------

const howSteps = [...document.querySelectorAll(".how-step")];
const howViz = $("#how-viz");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

function setStep(i) {
  howSteps.forEach((s, j) => {
    s.setAttribute("aria-selected", String(i === j));
    s.tabIndex = i === j ? 0 : -1;
  });
  howViz.dataset.step = howSteps[i].dataset.step;
  howViz.setAttribute("aria-labelledby", howSteps[i].id);
}
howSteps.forEach((s, i) => {
  s.addEventListener("click", () => setStep(i));
  s.addEventListener("focus", () => setStep(i));
  if (finePointer) s.addEventListener("mouseenter", () => setStep(i));
  s.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + howSteps.length) % howSteps.length;
    howSteps[next].focus();
  });
});

// --- Architecture: trace the path to whatever is pointed at ---------------------------

const ARCH = [
  ["Zoom meeting",
   "The panel runs inside your Zoom meeting through the Zoom Apps SDK, which tells it which meeting it is in and who is asking. It holds a WebSocket connection to the server."],
  ["Screen capture",
   "framebuffer.js keeps recent screen-share video from the meeting in memory, so a decodable image is always available. While the meeting stream is unavailable, screen.js reads the participant's own display instead."],
  ["Decode",
   "decode.js turns the buffered video into a single still image at the moment someone asks. In testing this took roughly 25 to 110 milliseconds."],
  ["Answer",
   "answer.js sends the image and the question to a vision model, with instructions for the kind of question asked: describe, explain, or something specific."],
  ["Relay",
   "relay.js addresses the answer to the one session that asked. A reply is refused unless that session actually made the request, and there is no broadcast."],
];
const DEFAULT_ARCH = [$("#fe-label").textContent, $("#fe-text").textContent];
const flow = $("#flow");
const nodes = [...flow.querySelectorAll(".node")];
const links = [...flow.querySelectorAll(".link")];

function trace(i) {
  flow.classList.toggle("tracing", i !== null);
  nodes.forEach((n, j) => {
    n.classList.toggle("lit", i !== null && j <= i);
    n.classList.toggle("current", j === i);
    n.setAttribute("aria-selected", String(j === i));
  });
  links.forEach((l, j) => l.classList.toggle("lit", i !== null && j < i));
  const [label, text] = i === null ? DEFAULT_ARCH : ARCH[i];
  $("#fe-label").textContent = label;
  $("#fe-text").textContent = text;
}
nodes.forEach((n, i) => {
  n.addEventListener("mouseenter", () => trace(i));
  n.addEventListener("focus", () => {
    nodes.forEach((m, j) => (m.tabIndex = j === i ? 0 : -1));
    trace(i);
  });
  n.addEventListener("click", () => trace(i));
  n.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    nodes[(i + step + nodes.length) % nodes.length].focus();
  });
});
flow.addEventListener("mouseleave", () => {
  if (!nodes.includes(document.activeElement)) trace(null);
});
flow.addEventListener("focusout", (e) => {
  if (!flow.contains(e.relatedTarget)) trace(null);
});

// --- Lens section: pointing at regions ------------------------------------------------

const callout = $("#callout p");
const regions = [...document.querySelectorAll(".hot-region")];
const defaultCallout = callout.textContent;
function point(region) {
  regions.forEach((r) => r.classList.toggle("active", r === region));
  callout.textContent = region ? region.dataset.say : defaultCallout;
}
regions.forEach((r) => {
  r.addEventListener("mouseenter", () => point(r));
  r.addEventListener("focus", () => point(r));
  r.addEventListener("click", () => point(r));
});
$(".lens-screen").addEventListener("mouseleave", () => {
  if (!regions.includes(document.activeElement)) point(null);
});

// --- Scroll: reveal whole sections, never individual paragraphs --------------------------

const toReveal = document.querySelectorAll(
  ".problem-copy, .mini-meeting, .how-grid, .lens-stage, .split-meeting, .facts, .stories, .flow");
if ("IntersectionObserver" in window && !reduceMotion) {
  toReveal.forEach((el) => el.classList.add("rise"));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  toReveal.forEach((el) => io.observe(el));
}

// --- Start ---------------------------------------------------------------------------

setPane("screen");
syncLensButton(!isMobile());
selectTab(0, { instant: true });
