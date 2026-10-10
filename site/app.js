// Website demonstrations only. Nothing here connects to Zoom or calls a model.
// Questions are matched against a fixed set of example answers written for this
// page, and the page says so beneath the demo.
//
// In answer text, [[phrase|tokens]] links a phrase to the parts of the screen
// that carry every one of those tokens in data-spot.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileQuery = matchMedia("(max-width: 760px)");
const isMobile = () => mobileQuery.matches;
const THINK_MS = reduceMotion ? 0 : 650;
const PRESENTER_MS = 9000;
const FALLBACK =
  "This demo understands a few example questions. Try asking what changed, what this means, or for a summary.";
const NO_WHY =
  "That isn't something the screen shows. It shows what happened, not the reason behind it.";
const NO_MORE =
  "That's everything this part of the screen shows. Try another row, column or chart.";

// --- Scene markup -----------------------------------------------------------

const trig = (spot, label, cls = "") =>
  `class="spot ${cls}" data-spot="${spot}" role="button" tabindex="0" aria-label="Ask about ${label}"`;

function sheetHTML() {
  const cols = [["Segment"], ["Q1", "q1"], ["Q2", "q2"], ["Q3", "q3", true], ["Change", "change", true]];
  const rows = [
    ["Enterprise", "ent", ["412", "438", "491"], ["+12%", "pos"]],
    ["Mid-market", "mid", ["286", "301", "309"], ["+3%", "pos"]],
    ["Self-serve", "self", ["174", "169", "163"], ["−4%", "neg"]],
    ["Expenses", "opex", ["530", "548", "570"], ["+4%", "neg"]],
  ];
  const head = cols.map(([name, tok, isSpot]) =>
    isSpot ? `<th ${trig(tok, `the ${name} column`)}>${name}</th>`
           : `<th${tok ? ` data-spot="${tok}"` : ""}>${name}</th>`).join("");
  const body = rows.map(([label, row, vals, [chg, tone]]) => {
    const cells = vals.map((v, i) => `<td data-spot="${row} ${cols[i + 1][1]}">${v}</td>`).join("");
    return `<tr><td ${trig(row, `the ${label} row`)}>${label}</td>${cells}` +
           `<td data-spot="${row} change" class="${tone}">${chg}</td></tr>`;
  }).join("");
  return `
    <h4 class="ctx">Q3 Revenue Analysis</h4>
    <p class="sub ctx">Revenue by segment, $k</p>
    <table class="sheet"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// --- Scenes -----------------------------------------------------------------

const SCENES = {
  sheet: {
    html: sheetHTML,
    primary: "change",
    spots: {
      change: { label: "Change column", q: "What changed this quarter?",
        a: "[[Enterprise rose the most|ent change]], up 12% on Q2. [[Mid-market grew 3%|mid change]], [[self-serve slipped 4%|self change]], and [[expenses rose 4%|opex change]].",
        why: "Almost all of the growth came from Enterprise, which added [[53k on Q2|ent q3]]. Mid-market added 8k and self-serve lost 6k.",
        more: "Across all three quarters, Enterprise is up 19%, from [[412|ent q1]] to [[491|ent q3]]. Mid-market is up 8% and self-serve is down 6%." },
      ent: { label: "Enterprise row", q: "What's happening with Enterprise?",
        a: "Enterprise is the strongest segment: [[412|ent q1]] to [[491|ent q3]] across three quarters, and [[up 12% on Q2|ent change]] alone. It is carrying most of this quarter's growth.",
        why: "The sheet shows how much Enterprise grew, not why. It doesn't break revenue down by customer or deal, so the reason isn't on screen.",
        more: "Enterprise went [[412|ent q1]], [[438|ent q2]], [[491|ent q3]]: up 6% and then 12%, so its growth is speeding up." },
      mid: { label: "Mid-market row", q: "What about mid-market?",
        a: "Mid-market grew 3% on Q2, from [[301|mid q2]] to [[309|mid q3]]. Steady, but slower than [[expenses|opex change]], which rose 4%.",
        more: "[[286|mid q1]], [[301|mid q2]], [[309|mid q3]]: up 5% and then 3%. Still growing, but slowing." },
      self: { label: "Self-serve row", q: "What about self-serve?",
        a: "Self-serve is the only segment shrinking: [[174|self q1]], then [[169|self q2]], now [[163|self q3]]. That is [[down 4% on Q2|self change]].",
        more: "Down 3% and then 4%, so the decline is getting slightly steeper. Across the three quarters it has lost about 6%." },
      q3: { label: "Q3 column", q: "What happened in Q3?",
        a: "Q3 is the latest quarter. Revenue across the three segments reached 963k, up from 908k in Q2, and nearly all of that came from [[Enterprise|ent q3]].",
        more: "Revenue of 963k against [[570k of expenses|opex q3]]. Revenue grew about 6% this quarter, faster than expenses did." },
      opex: { label: "Expenses row", q: "What about expenses?",
        a: "Expenses rose 4% to [[570k|opex q3]]. Revenue grew about 6% overall, so costs are rising, but more slowly than revenue.",
        why: "The sheet shows expenses rising each quarter but doesn't break them down, so it can't say what drove the increase.",
        more: "[[530|opex q1]], [[548|opex q2]], [[570|opex q3]]: up about 3% and then 4%." },
    },
    intents: {
      changed: "change", q3: "q3", expenses: "opex", trend: "change", missed: "summary", point: "matters",
      revenue: { spot: "q3", a: "Revenue is up about 6% on Q2 overall, driven by [[Enterprise at +12%|ent change]]. [[Self-serve|self change]] is the only segment that shrank." },
      matters: { spot: "ent", a: "[[Enterprise's +12%|ent change]] is the number that matters. It accounts for most of the quarter's growth, and it is the only segment growing faster than expenses." },
      summary: { spot: "change", a: "Revenue grew about 6% this quarter, almost entirely from [[Enterprise|ent change]]. Self-serve is shrinking and expenses are rising, though more slowly than revenue." },
      explain: { spot: "change", a: "This table tracks revenue for three customer segments over three quarters, with expenses underneath. The [[Change column|change]] compares Q3 with Q2." },
    },
    keywords: { "enterprise": "ent", "mid-market|mid market|midmarket|mid": "mid", "self-serve|self serve|self": "self",
                "expense|opex|cost": "opex", "q3|third quarter": "q3", "change": "change" },
  },

  paper: {
    html: () => `
      <h4 class="ctx">Scaling Behaviour of Retrieval-Augmented Models</h4>
      <p class="sub ctx">Section 4 · Results</p>
      <div ${trig("text", "the section text", "block paper-text")}>
        <span class="line" style="width:96%"></span><span class="line" style="width:88%"></span><span class="line" style="width:92%"></span>
      </div>
      <p ${trig("result", "the results sentence", "paper-result")}>The retrieval-augmented method leads by 31 points at the largest training size.</p>
      <div ${trig("fig", "Figure 3", "paper-fig")}>
        <span class="b" data-spot="fig small" style="height:30%"></span><span data-spot="fig small" style="height:34%"></span>
        <span class="b" data-spot="fig" style="height:46%"></span><span data-spot="fig" style="height:58%"></span>
        <span class="b" data-spot="fig" style="height:55%"></span><span data-spot="fig" style="height:78%"></span>
        <span class="b" data-spot="fig large" style="height:61%"></span><span data-spot="fig large" style="height:92%"></span>
      </div>
      <p class="paper-cap ctx">Figure 3. Accuracy against training set size.</p>`,
    primary: "fig",
    spots: {
      fig: { label: "Figure 3", q: "What does this figure show?",
        a: "Figure 3 plots accuracy against training set size. In each pair, the lighter bar is the baseline and the darker one is the retrieval-augmented method. The gap is [[small at first|small]] and [[widest at the largest size|large]].",
        why: "The figure shows that the gap widens, not why. The reason would be in the paper's text, which isn't readable on this part of the screen.",
        more: "The gap grows at every step: 4 points, then 12, then 23, and [[31 at the largest size|large]]." },
      result: { label: "Results sentence", q: "What's the main finding?",
        a: "Retrieval helps more as data grows. At [[small sizes|small]] the two methods are close; at [[the largest size|large]] the retrieval-augmented method leads by 31 points.",
        why: "The sentence states the size of the lead but not its cause. That would be in the discussion section, which isn't on screen.",
        more: "At the smallest training size the two methods are [[within 4 points|small]]. The 31 point lead only appears [[at the largest size|large]]." },
      text: { label: "Section text", q: "Summarize this section",
        a: "This section reports how accuracy changes as the training set grows, comparing a retrieval-augmented method against a baseline. The headline is in [[the results sentence|result]].",
        more: "It compares two methods at four training set sizes and reports accuracy for each, summarised in [[Figure 3|fig]]." },
    },
    intents: {
      figure: "fig", explain: "fig", finding: "result", point: "result", summary: "text", missed: "text", changed: "result",
      trend: { spot: "fig", a: "Both methods improve as data grows, but the retrieval-augmented one improves faster, so the gap widens from [[4 points|small]] to [[31|large]]." },
    },
    keywords: { "figure|chart|graph|bars": "fig", "result|finding|sentence": "result", "section|text|paragraph": "text" },
  },

  dash: {
    html: () => `
      <h4 class="ctx">Funnel · last 8 weeks</h4>
      <div class="dash-kpis">
        <div class="ctx"><small>Visits</small><b>48.2k</b></div>
        <div ${trig("conv", "conversion")}><small>Conversion</small><b>2.1%</b></div>
        <div ${trig("mobile", "mobile share")}><small>Mobile share</small><b>64%</b></div>
      </div>
      <div ${trig("chart", "the trend chart", "block dash-chart")}>
        <svg class="dash-svg" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
          <polyline stroke="#9AA4B2" points="0,40 40,38 80,39 120,37 160,38 200,37 240,36 300,36"/>
          <polyline stroke="#2D8CFF" points="0,22 40,23 80,24 120,30 160,41 200,52 240,60 300,67"/>
        </svg>
        <span class="chart-zone early" data-spot="chart early"></span><span class="chart-zone late" data-spot="chart late"></span>
      </div>`,
    primary: "conv",
    spots: {
      conv: { label: "Conversion", q: "Why did conversion drop?",
        a: "Conversion has [[fallen for about five weeks|late]] while visits stayed level, so fewer visitors are buying rather than fewer arriving. With [[mobile at 64% of traffic|mobile]], the mobile experience is the first place to look.",
        why: "The dashboard shows when conversion fell, not why. It points at mobile because mobile is most of the traffic, but it doesn't show conversion split by device.",
        more: "Conversion [[held for three weeks|early]], then fell in [[each of the last five|late]]. Visits stayed level the whole time." },
      mobile: { label: "Mobile share", q: "Why does mobile share matter here?",
        a: "At 64%, most visitors are on mobile, so anything that hurts the mobile experience moves [[the overall conversion rate|conv]] more than a desktop problem would.",
        more: "64% means roughly two in every three visitors are on a phone." },
      chart: { label: "Trend chart", q: "Summarize the trend",
        a: "Visits are flat to slightly up over eight weeks. Conversion [[held for the first three|early]], then [[fell steadily for the last five|late]].",
        more: "The two lines part ways from week four: visits edge up while conversion falls every week after." },
    },
    intents: {
      drop: "conv", explain: "conv", point: "conv", trend: "chart", summary: "chart", missed: "chart",
      changed: { spot: "chart", a: "Conversion [[started falling around week four|late]] and has not recovered. Visits stayed level throughout." },
      unusual: { spot: "chart", a: "The timing. Visits are steady, but conversion [[turns down around week four|late]] and keeps falling. A change around then, such as a release or a campaign ending, is the usual cause." },
    },
    keywords: { "conversion|convert": "conv", "mobile|phone": "mobile", "trend|chart|visit|traffic": "chart" },
  },

  // The presenter moves through this deck on their own.
  slides: {
    deck: [
      { title: "Deployment options", primary: "title",
        summary: "three deployment options, with managed highlighted as the recommendation",
        html: () => `
          <div ${trig("title", "the slide title", "slide-title")}><h4>Deployment options</h4></div>
          <p class="sub ctx">Comparing three approaches</p>
          <div class="slide">
            <div ${trig("self", "the self-hosted option")}><b>Self-hosted</b>Full control, highest operating cost</div>
            <div ${trig("managed", "the managed option", "pick")}><b>Managed</b>Lower cost, vendor runs upgrades</div>
            <div ${trig("hybrid", "the hybrid option")}><b>Hybrid</b>Flexible, two systems to maintain</div>
          </div>`,
        spots: {
          title: { label: "Slide title", q: "What's this slide about?",
            a: "The presenter is comparing three ways to deploy and has highlighted [[managed|managed]] as the recommendation." },
          managed: { label: "Managed option", q: "What's the main point?",
            a: "[[Managed|managed]] is being recommended, mainly for its lower operating cost. The vendor runs upgrades, so the team gives up some control to save running costs.",
            why: "The slide gives cost as the reason: managed has the lowest operating cost of the three." },
          self: { label: "Self-hosted option", q: "What's the tradeoff here?",
            a: "[[Self-hosted|self]] gives full control but costs the most to run. It is presented as the option to move away from.",
            why: "Because of its operating cost, which is the slide's main concern." },
          hybrid: { label: "Hybrid option", q: "Why not hybrid?",
            a: "[[Hybrid|hybrid]] is flexible but means maintaining two systems. The slide frames that as extra work rather than a benefit." },
        },
        intents: { point: "managed", explain: "managed", tradeoff: "self", expenses: "managed",
          summary: { spot: "title", a: "Three deployment options: [[self-hosted|self]], [[managed|managed]] and [[hybrid|hybrid]]. Managed is highlighted as the recommendation because it costs the least to run." } },
        keywords: { "managed": "managed", "self-hosted|self hosted|self": "self", "hybrid": "hybrid" },
      },
      { title: "Cost comparison", primary: "title",
        summary: "annual running costs, with managed cheapest at 28k against 35k for hybrid and 42k for self-hosted",
        html: () => `
          <div ${trig("title", "the slide title", "slide-title")}><h4>Cost comparison</h4></div>
          <p class="sub ctx">Annual running cost</p>
          <div class="cost-bars">
            <div ${trig("cself", "self-hosted cost", "cost-row")}><span>Self-hosted</span><i style="--w:100%"></i><b>$42k</b></div>
            <div ${trig("cman", "managed cost", "cost-row best")}><span>Managed</span><i style="--w:67%"></i><b>$28k</b></div>
            <div ${trig("chyb", "hybrid cost", "cost-row")}><span>Hybrid</span><i style="--w:83%"></i><b>$35k</b></div>
          </div>`,
        spots: {
          title: { label: "Slide title", q: "What's this slide about?",
            a: "Annual running cost for each option: [[managed is cheapest at 28k|cman]], [[hybrid 35k|chyb]], [[self-hosted 42k|cself]]." },
          cman: { label: "Managed cost", q: "What does managed cost?",
            a: "28k a year, the lowest of the three, and 14k less than [[self-hosted|cself]].",
            why: "This slide doesn't break the cost down. The previous one said the vendor runs upgrades, which is work the team no longer pays for." },
          cself: { label: "Self-hosted cost", q: "What does self-hosted cost?",
            a: "42k a year, the most expensive option, and half as much again as [[managed|cman]]." },
          chyb: { label: "Hybrid cost", q: "And hybrid?",
            a: "35k a year, between [[managed|cman]] and [[self-hosted|cself]]." },
        },
        intents: { point: "cman", explain: "title", expenses: "title", tradeoff: "cself",
          summary: { spot: "title", a: "Annual costs: [[managed 28k|cman]], [[hybrid 35k|chyb]], [[self-hosted 42k|cself]]. Managed is the cheapest by a clear margin." } },
        keywords: { "managed": "cman", "self-hosted|self hosted|self": "cself", "hybrid": "chyb" },
      },
      { title: "Rollout timeline", primary: "title",
        summary: "the rollout plan, a pilot in Q1, full migration in Q2 and the old servers retired in Q3",
        html: () => `
          <div ${trig("title", "the slide title", "slide-title")}><h4>Rollout timeline</h4></div>
          <p class="sub ctx">If managed is approved</p>
          <div class="timeline">
            <div ${trig("pilot", "the pilot phase", "phase")}><b>Q1</b>Pilot with two teams</div>
            <div ${trig("migrate", "the migration phase", "phase")}><b>Q2</b>Migrate all teams</div>
            <div ${trig("retire", "the retirement phase", "phase")}><b>Q3</b>Retire old servers</div>
          </div>`,
        spots: {
          title: { label: "Slide title", q: "What's this slide about?",
            a: "The rollout plan: a [[pilot in Q1|pilot]], [[full migration in Q2|migrate]], and [[the old servers retired in Q3|retire]]." },
          pilot: { label: "Pilot phase", q: "What happens in the pilot?",
            a: "Two teams move first in Q1, to find problems before everyone else switches." },
          migrate: { label: "Migration phase", q: "When does everyone move?",
            a: "Every team moves in Q2, after the [[pilot|pilot]]." },
          retire: { label: "Retirement phase", q: "When are the old servers retired?",
            a: "In Q3, once nothing depends on them any more." },
        },
        intents: { point: "title", explain: "title", trend: "title", q3: "retire",
          summary: { spot: "title", a: "Three phases: [[pilot in Q1|pilot]], [[migration in Q2|migrate]], [[retire the old servers in Q3|retire]]." } },
        keywords: { "pilot": "pilot", "migrat|move": "migrate", "retire|old server|server": "retire" },
      },
      { title: "Decision needed", primary: "title",
        summary: "a request to approve the managed option by Friday",
        html: () => `
          <div ${trig("title", "the slide title", "slide-title")}><h4>Decision needed</h4></div>
          <div class="ask-slide">
            <p ${trig("decision", "the decision", "decision")}>Approve the managed option</p>
            <p ${trig("due", "the deadline", "due")}>Needed by Friday · Owner: JL</p>
          </div>`,
        spots: {
          title: { label: "Slide title", q: "What's this slide about?",
            a: "The presenter is asking for a decision: [[approve the managed option|decision]], [[by Friday|due]]." },
          decision: { label: "The decision", q: "What are they asking for?",
            a: "Approval to go with managed, the cheapest option to run." },
          due: { label: "Deadline", q: "When is it needed?",
            a: "By Friday. JL owns the decision." },
        },
        intents: { point: "decision", explain: "decision",
          summary: { spot: "title", a: "A request to [[approve the managed option|decision]] [[by Friday|due]]." } },
        keywords: { "decision|approv": "decision", "friday|deadline|when|owner": "due" },
      },
    ],
  },
};

// Typed questions, most specific first. A scene with no answer for one intent
// falls through to the next that matches.
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

// --- Elements and state -----------------------------------------------------

const $ = (s, r = document) => r.querySelector(s);
const demo = $("#demo");
const meeting = $("#meeting");
const screenEl = $("#screen");
const threadEl = $("#thread");
const form = $("#ask-form");
const input = $("#ask");
const stateEl = $("#lp-state");
const pillText = $("#lp-state-text");
const actionsEl = $("#zl-actions");
const lensBtn = $("#ctl-lens");
const drawBtn = $("#draw-btn");
const tabs = [...document.querySelectorAll(".tab")];
const segBtns = [...document.querySelectorAll(".seg-btn")];

const state = {
  scene: "sheet", slide: 0, lastSeen: 0, lastSpot: null,
  lensOpen: true, timer: null, pendingQ: null,
  presenterTimer: null, presenterPaused: false, demoVisible: true, cursor: null,
  asked: 0, asPresenter: false,
};

// The scene, or the slide on screen when the scene is a deck.
const view = () => {
  const s = SCENES[state.scene];
  return s.deck ? s.deck[state.slide] : s;
};

// --- Resolving what to say --------------------------------------------------

function fromSpot(id, field = "a") {
  const s = view().spots[id];
  if (!s) return null;
  return { spot: id, label: s.label, a: s[field] ?? (field === "why" ? NO_WHY : NO_MORE) };
}

function fromIntent(key) {
  const v0 = view();
  if (SCENES[state.scene].deck && (key === "missed" || key === "changed")) return catchUp();
  let v = v0.intents?.[key];
  if (typeof v === "string" && v0.intents[v] && !v0.spots[v]) v = v0.intents[v];   // alias
  if (typeof v === "string") return fromSpot(v);
  if (v) return { spot: v.spot, label: v0.spots[v.spot]?.label, a: v.a };
  return null;
}

function keywordSpot(text) {
  for (const [pattern, spot] of Object.entries(view().keywords || {})) {
    if (new RegExp(`\\b(${pattern})`).test(text)) return spot;
  }
  return null;
}

// What a follow-up builds on: the last thing answered, if it is still on screen.
const context = () => (view().spots[state.lastSpot] ? state.lastSpot : view().primary);

// The presenter kept going while you weren't asking. This says what happened.
function catchUp() {
  const deck = SCENES.slides.deck;
  const now = deck[state.slide];
  const here = `slide ${state.slide + 1}, ${now.title.toLowerCase()}: ${now.summary}`;
  let a;
  if (state.slide === state.lastSeen) {
    a = `Nothing yet. The presenter is still on ${here}.`;
  } else {
    const missed = deck.slice(state.lastSeen + 1, state.slide)
      .map((s, i) => `slide ${state.lastSeen + 2 + i}, ${s.title.toLowerCase()}: ${s.summary}`);
    a = missed.length
      ? `While you were away they covered ${missed.join("; then ")}. They're now on ${here}.`
      : `They've moved on to ${here}.`;
  }
  return { spot: "title", label: `Slide ${state.slide + 1} of ${deck.length}`, a };
}

function resolveTyped(text) {
  const q = text.toLowerCase().trim();
  const words = q.split(/\s+/).length;

  // "what about mid-market?", "and hybrid?"
  const about = q.match(/^(what about|how about|and|what of)\s+(.+?)\??$/);
  if (about) {
    const spot = keywordSpot(about[2]);
    if (spot) return fromSpot(spot);
    const thing = about[2].replace(/^the\s+/, "");
    if (thing.split(/\s+/).length <= 3) {
      return { a: `I can't see anything about ${thing} on the shared screen right now. Ask about something that's showing.` };
    }
  }
  // "why?", "why is enterprise up?"
  if (/^(why|how come)\b/.test(q)) {
    const spot = keywordSpot(q) || (words <= 4 ? context() : null);
    if (spot) return fromSpot(spot, "why");
  }
  // "tell me more", "go on"
  if (/tell me more|more detail|elaborate|go on|expand on|^more\??$|^details?\??$/.test(q)) {
    return fromSpot(context(), "more");
  }

  for (const [key, re] of INTENT_PATTERNS) {
    if (re.test(q)) {
      const hit = fromIntent(key);
      if (hit) return hit;
    }
  }
  const spot = keywordSpot(q);
  if (spot) return fromSpot(spot);
  return { fallback: true, a: FALLBACK };
}

// --- The screen -------------------------------------------------------------

const sel = (tokens) => tokens.split(/\s+/).map((t) => `[data-spot~="${t}"]`).join("");

function light(spot) {
  screenEl.querySelectorAll(".lit").forEach((el) => el.classList.remove("lit"));
  if (spot) screenEl.querySelectorAll(sel(spot)).forEach((el) => el.classList.add("lit"));
  screenEl.classList.toggle("focusing", Boolean(spot));
}

// Answers point back: a linked phrase shows exactly where it came from.
let pointTimer = null;
function pointAt(tokens, hold = 0) {
  clearTimeout(pointTimer);
  screenEl.querySelectorAll(".pointed").forEach((el) => el.classList.remove("pointed"));
  screenEl.classList.toggle("pointing", Boolean(tokens));
  if (!tokens) return;
  screenEl.querySelectorAll(sel(tokens)).forEach((el) => el.classList.add("pointed"));
  if (hold) pointTimer = setTimeout(() => pointAt(null), hold);
}

function renderScreen() {
  const s = SCENES[state.scene];
  screenEl.classList.remove("focusing", "pointing", "changed");
  screenEl.innerHTML = s.deck ? deckBar() + view().html() : s.html();   // authored here, never user input
  if (s.deck) placeCursor();
}

// --- The thread, built as the real panel builds it --------------------------

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

function richText(parent, text) {
  const re = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zl-ref";
    b.dataset.ref = m[2];
    b.textContent = m[1];
    b.setAttribute("aria-label", `${m[1]}, show on the shared screen`);
    parent.appendChild(b);
    last = re.lastIndex;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function answerTurn(result) {
  const t = turn();
  const label = document.createElement("div");
  label.className = "zl-label";
  label.textContent = "Answer";
  const body = document.createElement("div");
  body.className = "zl-body";
  richText(body, result.a);
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
  threadEl.scrollTop = node.offsetTop - threadEl.offsetTop - 8;
}

// question: what was typed or what a region asks. null for Describe and
// Explain, which in the real panel send no visible question.
function ask(question, result, { instant = false, thinking = "Understanding shared screen…" } = {}) {
  clearTimeout(state.timer);
  state.pendingQ?.remove();
  state.pendingQ = null;
  threadEl.querySelector(".zl-empty")?.remove();
  threadEl.querySelector(".zl-turn.pending")?.remove();
  screenEl.querySelectorAll(".focus-box.placed").forEach((b) => b.remove());
  if (SCENES[state.scene].deck) state.lastSeen = state.slide;
  state.asked += 1;
  updatePresenterStrip();

  const q = question ? askedTurn(question) : null;
  if (q) threadEl.appendChild(q);
  light(result.spot || null);
  trimThread();

  const finish = () => {
    state.pendingQ = null;
    threadEl.querySelector(".zl-turn.pending")?.remove();
    const a = answerTurn(result);
    threadEl.appendChild(a);
    if (result.spot && !result.fallback) state.lastSpot = result.spot;
    setPill("ok", "Ready");
    actionsEl.classList.add("compact");
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

// Linked phrases point at their cells on hover or focus. On a phone the
// screen is a separate view, so a tap switches to it and shows the cells there.
threadEl.addEventListener("mouseover", (e) => {
  const r = e.target.closest(".zl-ref");
  if (r) pointAt(r.dataset.ref);
});
threadEl.addEventListener("mouseout", (e) => {
  if (e.target.closest(".zl-ref")) pointAt(null);
});
threadEl.addEventListener("focusin", (e) => {
  const r = e.target.closest(".zl-ref");
  if (r) pointAt(r.dataset.ref);
});
threadEl.addEventListener("focusout", (e) => {
  if (e.target.closest(".zl-ref")) pointAt(null);
});
threadEl.addEventListener("click", (e) => {
  const r = e.target.closest(".zl-ref");
  if (!r) return;
  if (isMobile()) setPane("screen");
  pointAt(r.dataset.ref, 3500);
});

// --- Scenes -----------------------------------------------------------------

function showScene(key, { instant = false } = {}) {
  state.scene = key;
  state.slide = 0;
  state.lastSeen = 0;
  state.lastSpot = null;
  state.cursor = null;
  clearTimeout(state.timer);
  state.pendingQ = null;
  renderScreen();
  screenEl.setAttribute("aria-label", "Shared screen. Select a highlighted area to ask Zoom Lens about it, or drag a box across part of it.");
  showEmpty();
  setPill("ok", "Ready");
  const v = view();
  ask(v.spots[v.primary].q, fromSpot(v.primary), { instant });
  startPresenter();
}

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

// The real panel's two shortcuts, answered from this scene's example set.
actionsEl.querySelectorAll(".zl-action").forEach((btn) => {
  btn.addEventListener("click", () => {
    const explain = btn.dataset.mode === "explain";
    const hit = fromIntent(explain ? "explain" : "summary") || { fallback: true, a: FALLBACK };
    openLens();
    ask(null, hit, { thinking: explain ? "Analyzing what's being shown…" : "Understanding shared screen…" });
  });
});

// --- Regions: select one, or draw a box across part of the screen -----------

function activateSpot(el) {
  const id = el.dataset.spot.split(" ").find((t) => view().spots[t]);
  if (!id) return;
  openLens();
  ask(view().spots[id].q, fromSpot(id));
}

let suppressClick = false;
screenEl.addEventListener("click", (e) => {
  if (suppressClick) return;
  if (e.target.closest(".deck-pause")) return togglePresenter();
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

// A mouse can drag a box at any time. A finger would scroll the page instead,
// so on touch screens the Draw a box button turns drawing on for one box.
function setDrawMode(on) {
  drawBtn.setAttribute("aria-pressed", String(on));
  screenEl.classList.toggle("drawmode", on);
}
drawBtn.addEventListener("click", () => {
  const on = drawBtn.getAttribute("aria-pressed") !== "true";
  setDrawMode(on);
  if (on && isMobile()) setPane("screen");
});

let drag = null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

screenEl.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest(".deck-pause")) return;
  if (e.pointerType !== "mouse" && !screenEl.classList.contains("drawmode")) return;
  const r = screenEl.getBoundingClientRect();
  drag = { id: e.pointerId, x0: e.clientX - r.left, y0: e.clientY - r.top, moved: false, box: null };
  drag.x1 = drag.x0; drag.y1 = drag.y0;
});

screenEl.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const r = screenEl.getBoundingClientRect();
  drag.x1 = clamp(e.clientX - r.left, 0, r.width);
  drag.y1 = clamp(e.clientY - r.top, 0, r.height);
  if (!drag.moved && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 6) {
    drag.moved = true;
    screenEl.setPointerCapture(e.pointerId);
    screenEl.querySelectorAll(".focus-box").forEach((b) => b.remove());
    drag.box = document.createElement("div");
    drag.box.className = "focus-box";
    drag.box.setAttribute("aria-hidden", "true");
    screenEl.appendChild(drag.box);
    screenEl.classList.add("drawing");
  }
  if (drag.moved) {
    Object.assign(drag.box.style, {
      left: `${Math.min(drag.x0, drag.x1)}px`, top: `${Math.min(drag.y0, drag.y1)}px`,
      width: `${Math.abs(drag.x1 - drag.x0)}px`, height: `${Math.abs(drag.y1 - drag.y0)}px`,
    });
  }
});

function endDrag(e, cancelled) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  screenEl.classList.remove("drawing");
  if (!d.moved) return;
  // The click that follows a drag is part of the drag, not a selection.
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 60);
  setDrawMode(false);
  if (cancelled) { d.box.remove(); return; }
  askAboutBox(d.box);
}
screenEl.addEventListener("pointerup", (e) => endDrag(e, false));
screenEl.addEventListener("pointercancel", (e) => endDrag(e, true));

// Whatever the box covers the largest share of is what gets asked about.
function askAboutBox(box) {
  const b = box.getBoundingClientRect();
  const spots = view().spots;
  const tally = {};
  screenEl.querySelectorAll("[data-spot]").forEach((el) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (!area) return;
    const ix = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
    const iy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
    for (const t of el.dataset.spot.split(" ")) {
      if (!spots[t]) continue;
      tally[t] ??= { cover: 0, total: 0 };
      tally[t].cover += ix * iy;
      tally[t].total += area;
    }
  });
  const ranked = Object.entries(tally)
    .map(([t, v]) => [t, v.cover / v.total, v.cover])
    .filter(([, share]) => share > 0.12)
    .sort((x, y) => y[1] - x[1] || y[2] - x[2]);

  openLens();
  if (!ranked.length) {
    ask("What's in this area?", { a: "There isn't much in that part of the screen. Try a row, a column, or a chart." });
    setTimeout(() => box.remove(), 1200);
    return;
  }
  ask("What's in this area?", fromSpot(ranked[0][0]));
  box.classList.add("placed");
}

// --- The presenter keeps going ----------------------------------------------

function deckBar() {
  const n = SCENES.slides.deck.length;
  const paused = state.presenterPaused;
  return `<div class="deck-bar"><span>Slide ${state.slide + 1} of ${n}</span>` +
    (state.slide < n - 1
      ? `<button type="button" class="deck-pause" aria-pressed="${paused}">${paused ? "Resume presenter" : "Pause presenter"}</button>`
      : `<span>Last slide</span>`) + `</div>`;
}

// The presenter's pointer, so a change reads as someone presenting rather
// than the page changing on its own.
function placeCursor() {
  const target = screenEl.querySelector(".pick, .best, .phase, .decision") || screenEl.querySelector("h4");
  if (!target) return;
  const s = screenEl.getBoundingClientRect(), t = target.getBoundingClientRect();
  if (!s.width) return;
  const to = { x: t.left - s.left + t.width * 0.7, y: t.top - s.top + t.height * 0.6 };
  const c = document.createElement("div");
  c.className = "presenter-cursor";
  c.setAttribute("aria-hidden", "true");
  c.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 1l11 7-5 1.2L6 14z" fill="#111" stroke="#fff" stroke-width="1.2"/></svg><span>MK</span>';
  const from = state.cursor || to;
  c.style.left = `${from.x}px`;
  c.style.top = `${from.y}px`;
  screenEl.appendChild(c);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    c.style.left = `${to.x}px`;
    c.style.top = `${to.y}px`;
  }));
  state.cursor = to;
}

function stopPresenter() {
  clearTimeout(state.presenterTimer);
  state.presenterTimer = null;
}

function startPresenter() {
  stopPresenter();
  if (state.scene !== "slides" || state.presenterPaused) return;
  if (state.slide >= SCENES.slides.deck.length - 1) return;
  state.presenterTimer = setTimeout(advanceSlide, PRESENTER_MS);
}

function advanceSlide() {
  // Only move on while someone can see it.
  if (!state.demoVisible || document.hidden) {
    state.presenterTimer = setTimeout(advanceSlide, 1500);
    return;
  }
  state.slide += 1;
  renderScreen();
  if (!reduceMotion) {
    screenEl.classList.remove("changed");
    void screenEl.offsetWidth;
    screenEl.classList.add("changed");
  }
  setPill("info", "Screen changed");
  setTimeout(() => { if (stateEl.dataset.kind === "info") setPill("ok", "Ready"); }, 2600);
  startPresenter();
}

function togglePresenter() {
  state.presenterPaused = !state.presenterPaused;
  const btn = screenEl.querySelector(".deck-pause");
  if (btn) {
    btn.setAttribute("aria-pressed", String(state.presenterPaused));
    btn.textContent = state.presenterPaused ? "Resume presenter" : "Pause presenter";
  }
  state.presenterPaused ? stopPresenter() : startPresenter();
}

if ("IntersectionObserver" in window) {
  new IntersectionObserver(([e]) => { state.demoVisible = e.isIntersecting; }, { threshold: 0.25 })
    .observe(demo);
}

// --- See it as the presenter ------------------------------------------------

const viewBtn = $("#view-toggle");
const viewNote = $("#view-note");
const pvStrip = $("#pv-strip");
const shareTag = $(".m-share-tag");
const mkTile = $(".tile.speaking span");
const youTile = $("#you-tile span");

function updatePresenterStrip() {
  const n = state.asked;
  pvStrip.textContent = n
    ? `You've asked Zoom Lens ${n} question${n === 1 ? "" : "s"} in this meeting. None of them appear on MK's screen.`
    : "You haven't asked Zoom Lens anything yet. When you do, none of it appears on MK's screen.";
}

function setPresenterView(on) {
  state.asPresenter = on;
  demo.classList.toggle("as-presenter", on);
  viewBtn.setAttribute("aria-pressed", String(on));
  viewBtn.textContent = on ? "Back to your view" : "See it as the presenter";
  viewNote.textContent = on
    ? "This is what MK, the presenter, sees."
    : "This is your view, with Zoom Lens open.";
  shareTag.textContent = on ? "You are sharing your screen" : "MK is sharing their screen";
  mkTile.textContent = on ? "You" : "MK";
  youTile.textContent = on ? "SL" : "You";
  screenEl.inert = on;
  $("#lens-panel").inert = on;
  if (on) {
    setDrawMode(false);
    pointAt(null);
    if (isMobile()) setPane("screen");
  }
  updatePresenterStrip();
}
viewBtn.addEventListener("click", () => setPresenterView(!state.asPresenter));

// --- Typing a question ------------------------------------------------------

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  input.value = "";
  ask(text, resolveTyped(text));
  input.focus();
});

// --- ZoomLens open and closed, and the phone views ---------------------------

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

// --- Meeting controls: simulated --------------------------------------------

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

// --- Try ZoomLens: point at where to begin, no modal ------------------------

document.querySelectorAll("[data-try]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.asPresenter) setPresenterView(false);
    demo.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
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

// --- Easter egg: three quick presses on the lens bring the screen into focus -

let presses = [];
$("#lp-logo").addEventListener("click", () => {
  const now = Date.now();
  presses = presses.filter((t) => now - t < 900).concat(now);
  if (presses.length < 3) return;
  presses = [];
  meeting.classList.add("focus-mode");
  setTimeout(() => meeting.classList.remove("focus-mode"), 2600);
});

// --- How it works: one meeting, four states ---------------------------------

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

// --- Architecture: trace the path to whatever is pointed at -----------------

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

// --- Timing: where the wait goes ---------------------------------------------
// Decode time is drawn from the range measured in testing. Model time is what
// the panel's waiting state is set for (EXPECTED_SECONDS in relay.js).

const TL_MODEL_S = { describe: 6, explain: 12 };
const tlModes = [...document.querySelectorAll(".tl-mode")];
const tlStages = Object.fromEntries([...document.querySelectorAll(".tl-stage")].map((s) => [s.dataset.stage, s]));
const tlRunBtn = $("#tl-run");
const tlClock = $("#tl-clock");
const tlStatus = $("#tl-status");
const tlDecodeSeg = $("#tl-seg-decode");
const tlFill = $("#tl-fill");
let tlMode = "describe";
let tlFrame = null;

function tlReset() {
  cancelAnimationFrame(tlFrame);
  tlFrame = null;
  Object.values(tlStages).forEach((s) => s.classList.remove("active", "done"));
  tlStages.decode.querySelector(".tl-t").textContent = "25 to 110 ms";
  tlStages.model.querySelector(".tl-t").textContent = `about ${TL_MODEL_S[tlMode]} s`;
  tlDecodeSeg.style.setProperty("--w", `${(0.07 / (TL_MODEL_S[tlMode] + 0.07)) * 100}%`);
  tlFill.style.width = "0%";
  tlClock.textContent = "0.00 s";
  tlRunBtn.textContent = "Run a question";
}

tlModes.forEach((b) => {
  b.addEventListener("click", () => {
    tlMode = b.dataset.mode;
    tlModes.forEach((m) => m.setAttribute("aria-checked", String(m === b)));
    tlReset();
    tlStatus.textContent = "";
  });
});

function tlRun() {
  tlReset();
  const decodeMs = 25 + Math.round(Math.random() * 85);
  const modelMs = TL_MODEL_S[tlMode] * 1000;
  const total = decodeMs + modelMs;
  const share = (decodeMs / total) * 100;
  tlDecodeSeg.style.setProperty("--w", `${share}%`);
  tlStages.buffer.classList.add("done");
  tlRunBtn.textContent = "Run again";
  tlStatus.textContent = `Running a ${tlMode === "describe" ? "Describe screen" : "Explain this"} question.`;

  const finish = () => {
    tlFrame = null;
    ["decode", "model", "relay"].forEach((k) => {
      tlStages[k].classList.remove("active");
      tlStages[k].classList.add("done");
    });
    tlStages.decode.querySelector(".tl-t").textContent = `${decodeMs} ms this time`;
    tlFill.style.width = "100%";
    tlClock.textContent = `${(total / 1000).toFixed(2)} s`;
    tlStatus.textContent =
      `Answered in ${(total / 1000).toFixed(2)} seconds. Decoding took ${decodeMs} ms, ` +
      `${share < 1 ? "under 1%" : `about ${Math.round(share)}%`} of the wait.`;
  };
  if (reduceMotion) return finish();

  const t0 = performance.now();
  const tick = (now) => {
    const t = now - t0;
    if (t >= total) return finish();
    tlClock.textContent = `${(t / 1000).toFixed(2)} s`;
    tlFill.style.width = `${(t / total) * 100}%`;
    const inDecode = t < decodeMs;
    tlStages.decode.classList.toggle("active", inDecode);
    tlStages.decode.classList.toggle("done", !inDecode);
    tlStages.model.classList.toggle("active", !inDecode);
    tlFrame = requestAnimationFrame(tick);
  };
  tlFrame = requestAnimationFrame(tick);
}
tlRunBtn.addEventListener("click", tlRun);

// --- Lens section: pointing at regions --------------------------------------

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

// --- Scroll: reveal whole sections, never individual paragraphs -------------

const toReveal = document.querySelectorAll(
  ".problem-copy, .mini-meeting, .how-grid, .lens-stage, .split-meeting, .facts, .stories, .flow, .tl, .faq-list");
if ("IntersectionObserver" in window && !reduceMotion) {
  toReveal.forEach((el) => el.classList.add("rise"));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  toReveal.forEach((el) => io.observe(el));
}

// --- Start ------------------------------------------------------------------

setPane("screen");
syncLensButton(!isMobile());
tlReset();
updatePresenterStrip();
selectTab(0, { instant: true });
