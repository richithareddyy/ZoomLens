// Website demonstrations only. Nothing here connects to Zoom or calls a model.
// Every answer is written for this page and chosen by matching the question,
// and the page says so beneath the demo, along with which parts of the demo
// are in ZoomLens today and which are concepts.
//
// In answer text, [[phrase|tokens]] links a phrase to the parts of the screen
// that carry those tokens in data-spot. Tokens separated by spaces must all
// match; groups separated by commas are alternatives.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileQuery = matchMedia("(max-width: 760px)");
const isMobile = () => mobileQuery.matches;
const CAPTURE_MS = reduceMotion ? 0 : 320;
const READ_MS = reduceMotion ? 0 : 580;
const PRESENTER_MS = 9000;
const AWAY_MS = reduceMotion ? 0 : 2600;
const NO_WHY =
  "That isn't something the screen shows. It shows what happened, not the reason behind it.";
const NO_MORE =
  "That's everything this part of the screen shows. Try another part, or one of the questions below.";

const trig = (spot, label, cls = "") =>
  `class="spot ${cls}" data-spot="${spot}" role="button" tabindex="0" aria-label="Ask about ${label}"`;

const pct = (now, before) => Math.round(((now - before) / before) * 100);

// --- The spreadsheet ----------------------------------------------------------

const SHEET = [
  { id: "ent", label: "Enterprise", v: [412, 438, 491], f: 540 },
  { id: "mid", label: "Mid-market", v: [286, 301, 309], f: 318 },
  { id: "self", label: "Self-serve", v: [174, 169, 163], f: 158 },
  { id: "opex", label: "Expenses", v: [530, 548, 570], f: 585 },
];
const QUARTERS = ["q1", "q2", "q3"];

function sheetHTML(withForecast) {
  const head =
    `<th>Segment</th><th data-spot="q1">Q1</th><th data-spot="q2">Q2</th>` +
    `<th ${trig("q3", "the Q3 column")}>Q3</th>` +
    (withForecast ? `<th ${trig("q4", "the Q4 forecast column", "fc")}>Q4 <small>fcst</small></th>` : "") +
    `<th ${trig("change", "the Change column")}>Change</th>`;
  const body = SHEET.map((r) => {
    const cell = (col, value, cls = "") =>
      `<td data-spot="${r.id} ${col}" data-cell="${r.id}:${col}" class="${cls}" tabindex="-1" role="button" ` +
      `aria-label="${r.label}, ${col === "change" ? "change" : col.toUpperCase()}: ${value}">${value}</td>`;
    const change = pct(r.v[2], r.v[1]);
    const tone = (change > 0) !== (r.id === "opex") ? "pos" : "neg";
    return `<tr><td ${trig(r.id, `the ${r.label} row`)}>${r.label}</td>` +
      r.v.map((v, i) => cell(QUARTERS[i], v)).join("") +
      (withForecast ? cell("q4", r.f, "fc") : "") +
      cell("change", `${change > 0 ? "+" : "−"}${Math.abs(change)}%`, tone) + `</tr>`;
  }).join("");
  return `
    <h4 class="ctx">Q3 Revenue Analysis</h4>
    <p class="sub ctx">Revenue by segment, $k</p>
    <table class="sheet"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// One cell, answered from the numbers themselves.
function cellAnswer(rowId, col) {
  const r = SHEET.find((x) => x.id === rowId);
  const what = r.id === "opex" ? "Expenses" : r.label;
  let a;
  if (col === "q1") {
    a = `${what} in Q1: ${r.v[0]}k, the first quarter shown. It reached [[${r.v[2]}k by Q3|${r.id} q3]].`;
  } else if (col === "q2" || col === "q3") {
    const i = col === "q2" ? 1 : 2;
    const diff = r.v[i] - r.v[i - 1];
    a = `${what} in ${col.toUpperCase()}: ${r.v[i]}k, ` +
      `${diff >= 0 ? "up" : "down"} ${Math.abs(diff)}k (${Math.abs(pct(r.v[i], r.v[i - 1]))}%) on [[${i === 1 ? "Q1" : "Q2"}|${r.id} ${QUARTERS[i - 1]}]].`;
  } else if (col === "change") {
    const c = pct(r.v[2], r.v[1]);
    a = `${what} ${c >= 0 ? "rose" : "fell"} ${Math.abs(c)}% from Q2 to Q3, from [[${r.v[1]}k|${r.id} q2]] to [[${r.v[2]}k|${r.id} q3]].`;
  } else {
    const c = pct(r.f, r.v[2]);
    a = `MK's Q4 forecast for ${what.toLowerCase()} is ${r.f}k, ${c >= 0 ? "up" : "down"} ${Math.abs(c)}% on [[Q3|${r.id} q3]]. It's a forecast, not a result.`;
  }
  const colName = col === "change" ? "change" : col === "q4" ? "Q4 forecast" : col.toUpperCase();
  return { spot: `${r.id} ${col}`, ctx: r.id, label: `${r.label}, ${colName}`, a };
}

const sheetSpots = {
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
};
const sheetIntents = {
  changed: "change", q3: "q3", expenses: "opex", trend: "change", missed: "summary", point: "matters",
  revenue: { spot: "q3", a: "Revenue is up about 6% on Q2 overall, driven by [[Enterprise at +12%|ent change]]. [[Self-serve|self change]] is the only segment that shrank." },
  matters: { spot: "ent", a: "[[Enterprise's +12%|ent change]] is the number that matters. It accounts for most of the quarter's growth, and it is the only segment growing faster than expenses." },
  summary: { spot: "change", a: "Revenue grew about 6% this quarter, almost entirely from [[Enterprise|ent change]]. Self-serve is shrinking and expenses are rising, though more slowly than revenue." },
  explain: { spot: "change", a: "This table tracks revenue for three customer segments over three quarters, with expenses underneath. The [[Change column|change]] compares Q3 with Q2." },
};
const sheetKeywords = { "enterprise": "ent", "mid-market|mid market|midmarket|mid": "mid", "self-serve|self serve|self": "self",
  "expense|opex|cost": "opex", "q3|third quarter": "q3", "change": "change" };

// --- The paper ----------------------------------------------------------------

const FIG = { sizes: ["1k", "10k", "100k", "1M"], base: [30, 46, 55, 61], rag: [34, 58, 78, 92] };

function figureHTML() {
  const pairs = FIG.sizes.map((s, i) =>
    `<span class="pair" data-spot="fig p${i + 1}" data-pair="${i}" role="button" tabindex="-1" ` +
    `aria-label="Figure 3 at ${s} examples: baseline ${FIG.base[i]}, retrieval-augmented ${FIG.rag[i]}">` +
    `<span class="b" style="height:${FIG.base[i]}%"></span><span style="height:${FIG.rag[i]}%"></span>` +
    `<em>${s}</em></span>`).join("");
  return `<div class="paper-fig" data-spot="fig">${pairs}</div>`;
}

function pairAnswer(i) {
  const gap = FIG.rag[i] - FIG.base[i];
  const where = i === 0 ? "the smallest size" : i === 3 ? "the largest size" : `${FIG.sizes[i]} examples`;
  const next = i < 3
    ? ` The gap grows to [[${FIG.rag[3] - FIG.base[3]} points at 1M|p4]].`
    : ` It started at [[${FIG.rag[0] - FIG.base[0]} points at 1k|p1]].`;
  return { spot: `fig p${i + 1}`, ctx: "fig", label: `Figure 3, ${FIG.sizes[i]} examples`,
    a: `At ${where} the baseline scores ${FIG.base[i]} and the retrieval-augmented method ${FIG.rag[i]}, a ${gap} point gap.${next}` };
}

// --- The dashboard --------------------------------------------------------------

function chartPoints(values) {
  const step = 300 / (values.length - 1);
  return values.map((y, i) => `${Math.round(i * step)},${y}`).join(" ");
}

function dashHTML(week9) {
  const visits = week9 ? [40, 38, 39, 37, 38, 37, 36, 36, 35] : [40, 38, 39, 37, 38, 37, 36, 36];
  const conv = week9 ? [22, 23, 24, 30, 41, 52, 60, 67, 72] : [22, 23, 24, 30, 41, 52, 60, 67];
  const kpi = (spot, label, name, value, delta) =>
    `<div ${spot ? trig(spot, label) : 'class="ctx"'}><small>${name}</small><b>${value}</b>${delta ? `<i class="delta">${delta}</i>` : ""}</div>`;
  return `
    <h4 class="ctx">Funnel · last ${week9 ? 9 : 8} weeks</h4>
    <div class="dash-kpis">
      ${kpi(null, "", "Visits", week9 ? "49.0k" : "48.2k", week9 ? "+0.8k" : "")}
      ${kpi("conv", "conversion", "Conversion", week9 ? "1.9%" : "2.1%", week9 ? "−0.2 pts" : "")}
      ${kpi("mobile", "mobile share", "Mobile share", week9 ? "66%" : "64%", week9 ? "+2 pts" : "")}
    </div>
    <div ${trig("chart", "the trend chart", "block dash-chart")}>
      <svg class="dash-svg" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
        <polyline stroke="#9AA4B2" points="${chartPoints(visits)}"/>
        <polyline stroke="#2D8CFF" points="${chartPoints(conv)}"/>
      </svg>
      <span class="chart-zone early" data-spot="chart early"></span><span class="chart-zone late" data-spot="chart late"></span>
      ${week9 ? '<span class="chart-zone w9" data-spot="chart w9"></span>' : ""}
    </div>`;
}

// --- Scenes. Each is a sequence of frames: what the presenter shows over time. --
// change: what the presenter did to reach this frame, said after "MK".
// changed: what to highlight when catching someone up on it.

const SCENES = {
  sheet: { frames: [
    { status: "Last edited 2 days ago", where: "the Q3 revenue sheet",
      contents: "revenue for three customer segments over three quarters, with expenses underneath",
      html: () => sheetHTML(false), primary: "change", spots: sheetSpots, intents: sheetIntents, keywords: sheetKeywords,
      suggest: ["Which number matters most?", "What about expenses?", "Summarize this"] },
    { status: "Edited just now", where: "the Q3 revenue sheet, now with a Q4 forecast",
      contents: "revenue for three segments over three quarters, a Q4 forecast, and expenses",
      change: "added a [[Q4 forecast column|q4]] to the sheet. [[Enterprise is forecast at 540k|ent q4]], and revenue overall at about 1,016k, up 6% on Q3",
      changed: "q4", focus: "q4",
      html: () => sheetHTML(true), primary: "q4",
      spots: { ...sheetSpots,
        q4: { label: "Q4 forecast column", q: "What's the Q4 forecast?",
          a: "MK's forecast has revenue reaching about 1,016k in Q4, up 6% on Q3. [[Enterprise is forecast at 540k|ent q4]], still the main source of growth, and [[self-serve keeps shrinking, to 158k|self q4]].",
          why: "The sheet shows the forecast numbers but not how they were made, so it can't say what they're based on.",
          more: "[[Expenses are forecast at 585k|opex q4]], up 3%, so revenue would keep growing faster than costs." } },
      intents: sheetIntents,
      keywords: { ...sheetKeywords, "q4|forecast|fourth|next quarter": "q4" },
      suggest: ["What's the Q4 forecast?", "What about expenses?", "Summarize this"] },
  ] },

  paper: { frames: [
    { status: "Page 6 of 14", where: "the results section of the paper",
      contents: "a results section comparing a retrieval-augmented method with a baseline, and Figure 3",
      html: () => `
        <h4 class="ctx">Scaling Behaviour of Retrieval-Augmented Models</h4>
        <p class="sub ctx">Section 4 · Results</p>
        <div ${trig("text", "the section text", "block paper-text")}>
          <span class="line" style="width:96%"></span><span class="line" style="width:88%"></span>
        </div>
        <p ${trig("result", "the results sentence", "paper-result")}>The retrieval-augmented method leads by 31 points at the largest training size.</p>
        ${figureHTML()}
        <p ${trig("fig", "Figure 3", "paper-cap")}>Figure 3. Accuracy against training set size. Lighter bars: baseline.</p>`,
      primary: "fig",
      spots: {
        fig: { label: "Figure 3", q: "What does this figure show?",
          a: "Figure 3 plots accuracy against training set size. In each pair, the lighter bar is the baseline and the darker one is the retrieval-augmented method. The gap is [[small at first|p1]] and [[widest at the largest size|p4]].",
          why: "The figure shows that the gap widens, not why. The reason would be in the paper's text, which isn't readable on this part of the screen.",
          more: "The gap grows at every step: [[4 points|p1]], then [[12|p2]], then [[23|p3]], and [[31 at the largest size|p4]]." },
        result: { label: "Results sentence", q: "What's the main finding?",
          a: "Retrieval helps more as data grows. At [[small sizes|p1]] the two methods are close; at [[the largest size|p4]] the retrieval-augmented method leads by 31 points.",
          why: "The sentence states the size of the lead but not its cause. That would be in the discussion section, which isn't on screen.",
          more: "At the smallest training size the two methods are [[within 4 points|p1]]. The 31 point lead only appears [[at the largest size|p4]]." },
        text: { label: "Section text", q: "Summarize this section",
          a: "This section reports how accuracy changes as the training set grows, comparing a retrieval-augmented method against a baseline. The headline is in [[the results sentence|result]].",
          more: "It compares two methods at four training set sizes and reports accuracy for each, summarised in [[Figure 3|fig]]." },
      },
      intents: {
        figure: "fig", explain: "fig", finding: "result", point: "result", summary: "text", changed: "result",
        trend: { spot: "fig", a: "Both methods improve as data grows, but the retrieval-augmented one improves faster, so the gap widens from [[4 points|p1]] to [[31|p4]]." },
      },
      keywords: { "figure|chart|graph|bars": "fig", "result|finding|sentence": "result", "section|text|paragraph": "text" },
      suggest: ["What's the main finding?", "Explain this figure", "Summarize this section"] },
    { status: "Page 7 of 14", where: "Section 5 of the paper, Limitations",
      contents: "the paper's limitations section: two limitations and one piece of future work",
      change: "scrolled past the results to Section 5, Limitations. It lists [[two limitations|lim1, lim2]]: gains shrink on questions that need several documents, and only English text was tested",
      changed: "lim1, lim2", focus: "lims",
      html: () => `
        <h4 class="ctx">Scaling Behaviour of Retrieval-Augmented Models</h4>
        <p ${trig("lims", "the section heading", "sub section-head")}>Section 5 · Limitations</p>
        <ul class="lims">
          <li ${trig("lim1", "the first limitation")}>Gains shrink on questions that need reasoning across several documents.</li>
          <li ${trig("lim2", "the second limitation")}>All experiments use English text only.</li>
        </ul>
        <p ${trig("future", "the future work", "paper-result")}>Future work: test multi-document reasoning directly.</p>`,
      primary: "lims",
      spots: {
        lims: { label: "Limitations section", q: "What are the limitations?",
          a: "Section 5 lists [[two limitations|lim1, lim2]] and [[one piece of future work|future]]. The method helps less on questions spread across several documents, and it was only tested on English.",
          more: "The [[future work|future]] targets the first limitation directly." },
        lim1: { label: "First limitation", q: "What's the first limitation?",
          a: "Gains shrink on questions that need reasoning across several documents. The method helps most when the answer sits in one place.",
          why: "The section states the limitation but not its cause." },
        lim2: { label: "Second limitation", q: "What's the second limitation?",
          a: "Every experiment used English text, so the results may not hold for other languages." },
        future: { label: "Future work", q: "What's the future work?",
          a: "The authors plan to test multi-document reasoning directly, which is [[the first limitation|lim1]]." },
      },
      intents: { explain: "lims", summary: "lims", point: "lims", finding: "lim1" },
      keywords: { "limit|weakness|drawback": "lims", "future|next step|plan": "future", "english|language": "lim2", "document": "lim1" },
      suggest: ["What's the first limitation?", "What's the future work?", "Summarize this section"] },
  ] },

  dash: { frames: [
    { status: "Updated Monday 9:00", where: "the funnel dashboard",
      contents: "eight weeks of visits and conversion, and the share of mobile traffic",
      html: () => dashHTML(false), primary: "conv",
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
        drop: "conv", explain: "conv", point: "conv", trend: "chart", summary: "chart",
        changed: { spot: "chart", a: "Conversion [[started falling around week four|late]] and has not recovered. Visits stayed level throughout." },
        unusual: { spot: "chart", a: "The timing. Visits are steady, but conversion [[turns down around week four|late]] and keeps falling. A change around then, such as a release or a campaign ending, is the usual cause." },
      },
      keywords: { "conversion|convert": "conv", "mobile|phone": "mobile", "trend|chart|visit|traffic": "chart" },
      suggest: ["Why did conversion drop?", "What's unusual?", "Summarize the trend"] },
    { status: "Updated just now", where: "the funnel dashboard, refreshed with week 9",
      contents: "nine weeks of visits and conversion, and the share of mobile traffic",
      change: "refreshed the dashboard with [[week 9|w9]]. [[Conversion fell again, to 1.9%|conv]], and [[mobile share rose to 66%|mobile]]",
      changed: "conv, mobile, w9", focus: "conv",
      html: () => dashHTML(true), primary: "conv",
      spots: {
        conv: { label: "Conversion", q: "Why did conversion drop?",
          a: "Conversion is down to 1.9% after [[week 9|w9]], the sixth week of decline while visits held steady. With [[mobile now 66% of traffic|mobile]], the mobile experience is still the first place to look.",
          why: "The dashboard shows when conversion fell, not why. Mobile is the likely place to look because it is two thirds of the traffic, but conversion isn't split by device here.",
          more: "Conversion [[held for three weeks|early]], then fell in [[each of the last six|late]]. Week 9 alone took off another 0.2 points." },
        mobile: { label: "Mobile share", q: "Why does mobile share matter here?",
          a: "Mobile rose to 66% of traffic this week, so [[overall conversion|conv]] depends even more on how well the mobile experience works.",
          more: "Two thirds of visitors are now on a phone, up from 64% last week." },
        chart: { label: "Trend chart", q: "Summarize the trend",
          a: "Visits edged up to 49.0k. Conversion [[held for three weeks|early]], then [[fell for six|late]], and [[week 9|w9]] is the lowest yet.",
          more: "The gap between the two lines is now the widest it has been." },
      },
      intents: {
        drop: "conv", explain: "conv", point: "conv", trend: "chart", summary: "chart",
        unusual: { spot: "chart", a: "Visits are rising slightly while conversion keeps falling: [[week 9|w9]] is the lowest week yet. A change around week four, such as a release or a campaign ending, is the usual cause." },
      },
      keywords: { "conversion|convert": "conv", "mobile|phone": "mobile", "trend|chart|visit|traffic|week": "chart" },
      suggest: ["Why did conversion drop?", "Why does mobile share matter?", "Summarize the trend"] },
  ] },

  slides: { frames: [
    { title: "Deployment options", primary: "title", where: "slide 1, deployment options",
      contents: "three deployment options, with managed highlighted",
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
          a: "MK is comparing three ways to deploy and has highlighted [[managed|managed]] as the recommendation." },
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
      suggest: ["What's the main point?", "What's the tradeoff?", "Summarize this slide"] },
    { title: "Cost comparison", primary: "title", where: "slide 2, cost comparison",
      contents: "the annual running cost of each deployment option",
      change: "moved to slide 2, a cost comparison: [[managed is cheapest at 28k a year|cman]]",
      changed: "cman", focus: "cman",
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
        cman: { label: "Managed cost", q: "Which option is cheapest?",
          a: "Managed, at 28k a year: the lowest of the three, and 14k less than [[self-hosted|cself]].",
          why: "This slide doesn't break the cost down. The previous one said the vendor runs upgrades, which is work the team no longer pays for." },
        cself: { label: "Self-hosted cost", q: "What does self-hosted cost?",
          a: "42k a year, the most expensive option, and half as much again as [[managed|cman]]." },
        chyb: { label: "Hybrid cost", q: "And hybrid?",
          a: "35k a year, between [[managed|cman]] and [[self-hosted|cself]]." },
      },
      intents: { point: "cman", explain: "title", expenses: "title", tradeoff: "cself",
        summary: { spot: "title", a: "Annual costs: [[managed 28k|cman]], [[hybrid 35k|chyb]], [[self-hosted 42k|cself]]. Managed is the cheapest by a clear margin." } },
      keywords: { "cheap|lowest|least": "cman", "managed": "cman", "self-hosted|self hosted|self": "cself", "hybrid": "chyb" },
      suggest: ["Which option is cheapest?", "What does self-hosted cost?", "Summarize this slide"] },
    { title: "Rollout timeline", primary: "title", where: "slide 3, the rollout timeline",
      contents: "a three-phase rollout plan across Q1 to Q3",
      change: "moved to slide 3, the rollout plan: a [[pilot in Q1|pilot]], [[everyone moving in Q2|migrate]], and [[the old servers retired in Q3|retire]]",
      changed: "pilot, migrate, retire", focus: "title",
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
          a: "Two teams move first in Q1, to find problems before everyone else switches.",
          why: "So problems are found with two teams rather than all of them." },
        migrate: { label: "Migration phase", q: "When does everyone move?",
          a: "Every team moves in Q2, after the [[pilot|pilot]]." },
        retire: { label: "Retirement phase", q: "When are the old servers retired?",
          a: "In Q3, once nothing depends on them any more." },
      },
      intents: { point: "title", explain: "title", trend: "title", q3: "retire",
        summary: { spot: "title", a: "Three phases: [[pilot in Q1|pilot]], [[migration in Q2|migrate]], [[retire the old servers in Q3|retire]]." } },
      keywords: { "pilot": "pilot", "migrat|move|everyone": "migrate", "retire|old server|server": "retire" },
      suggest: ["When does everyone move?", "What happens in the pilot?", "Summarize this slide"] },
    { title: "Decision needed", primary: "title", where: "the last slide, a decision",
      contents: "a request for a decision, with a deadline and an owner",
      change: "moved to the last slide, asking for a decision: [[approve the managed option|decision]] [[by Friday|due]]",
      changed: "decision, due", focus: "decision",
      html: () => `
        <div ${trig("title", "the slide title", "slide-title")}><h4>Decision needed</h4></div>
        <div class="ask-slide">
          <p ${trig("decision", "the decision", "decision")}>Approve the managed option</p>
          <p ${trig("due", "the deadline", "due")}>Needed by Friday · Owner: JL</p>
        </div>`,
      spots: {
        title: { label: "Slide title", q: "What's this slide about?",
          a: "MK is asking for a decision: [[approve the managed option|decision]], [[by Friday|due]]." },
        decision: { label: "The decision", q: "What are they asking for?",
          a: "Approval to go with managed, the cheapest option to run.",
          why: "Earlier slides showed it costs the least, 28k a year against 35k and 42k." },
        due: { label: "Deadline", q: "When is it needed?",
          a: "By Friday. JL owns the decision." },
      },
      intents: { point: "decision", explain: "decision",
        summary: { spot: "title", a: "A request to [[approve the managed option|decision]] [[by Friday|due]]." } },
      keywords: { "decision|approv|asking": "decision", "friday|deadline|when|owner": "due" },
      suggest: ["What are they asking for?", "When is it needed?", "Summarize this slide"] },
  ] },
};

// Typed questions, most specific first. A scene with no answer for one intent
// falls through to the next that matches.
const INTENT_PATTERNS = [
  ["missed", /miss|catch me up|while i was|behind|zoned out|look(ed)? away/],
  ["expenses", /expense|cost|opex|spend/],
  ["revenue", /revenue|sales|income/],
  ["changed", /chang/],
  ["q3", /\bq3\b|third quarter|this quarter/],
  ["figure", /figure|graph|chart|plot|bars?\b/],
  ["drop", /drop|fall|fell|decline|decreas|\bdown\b/],
  ["unusual", /unusual|odd|weird|anomal|stand(s)? out|surpris/],
  ["tradeoff", /trade.?off|downside|pros|cons|\bvs\b|versus|compare/],
  ["matters", /matter|most important|which number|key number|focus on/],
  ["finding", /finding|result|conclu/],
  ["point", /point|takeaway|recommend|argu/],
  ["trend", /trend|over time|direction/],
  ["summary", /summar|overview|recap|tl;?dr|gist/],
  ["explain", /explain|mean|understand|what is this|what's this|what am i looking/],
];

// --- Elements and state -------------------------------------------------------

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
const awayBtn = $("#away-btn");
const hintEl = $("#spot-hint");
const awayStatus = $("#away-status");
const tabs = [...document.querySelectorAll(".tab")];
const segBtns = [...document.querySelectorAll(".seg-btn")];

const state = {
  scene: "sheet", frame: 0, lastSeen: 0, lastSpot: null, lastQ: "", used: new Set(),
  lensOpen: true, timer: null, pendingQ: null,
  presenterTimer: null, presenterPaused: false, demoVisible: true, cursor: null,
  away: false, asked: 0, asPresenter: false,
};

const scene = () => SCENES[state.scene];
const view = () => scene().frames[state.frame];
const atEnd = () => state.frame >= scene().frames.length - 1;

// --- Resolving what to say ----------------------------------------------------

function fromSpot(id, field = "a") {
  const s = view().spots[id];
  if (!s) return null;
  return { spot: id, label: s.label, a: s[field] ?? (field === "why" ? NO_WHY : NO_MORE), field };
}

function fromIntent(key) {
  const v0 = view();
  if (key === "missed" || (key === "changed" && (state.frame > state.lastSeen || !v0.intents?.changed))) return catchUp();
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

const plain = (t) => t.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, "$1");

// The presenter kept going. This says what changed since the last question,
// linking only to what is still on screen.
function catchUp() {
  const frames = scene().frames;
  const now = frames[state.frame];
  if (state.frame === state.lastSeen) {
    return { spot: null, catchUp: true, label: "changes since your last question",
      a: `Nothing has changed since your last question. MK is still on ${now.where}.` };
  }
  const steps = frames.slice(state.lastSeen + 1, state.frame + 1);
  const said = steps.map((f, i) => (i === steps.length - 1 ? f.change : plain(f.change)));
  const a = `While you were away, MK ${said[0]}.` + said.slice(1).map((c) => ` Then they ${c}.`).join("");
  return { spot: now.changed, ctx: now.focus, catchUp: true,
    label: "changes since your last question", a };
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
      return { offscreen: true, a: `I can't see anything about ${thing} on the shared screen right now. It shows ${view().contents}.` };
    }
  }
  // "why?", "why is enterprise up?"
  if (/^(why|how come)\b/.test(q) && !/matter/.test(q)) {
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
  return { offscreen: true,
    a: `I can't answer that from what's on screen. It shows ${view().contents}. Questions I can answer here:` };
}

// Questions worth asking next, given what was just answered.
function suggestionsFor(result) {
  const out = [];
  const id = result.ctx || result.spot;
  const s = view().spots[id];
  if (s && !result.offscreen) {
    if (s.why && !state.used.has(`${id}:why`)) out.push("Why?");
    if (s.more && !state.used.has(`${id}:more`)) out.push("Tell me more");
  }
  for (const q of view().suggest) {
    if (q.toLowerCase() !== state.lastQ.toLowerCase()) out.push(q);
  }
  return [...new Set(out)].slice(0, 3);
}

// --- The screen ---------------------------------------------------------------

const sel = (tokens) => tokens.split(",").map((group) =>
  group.trim().split(/\s+/).map((t) => `[data-spot~="${t}"]`).join("")).join(", ");

function light(spot) {
  screenEl.querySelectorAll(".lit").forEach((el) => el.classList.remove("lit"));
  if (spot) screenEl.querySelectorAll(sel(spot)).forEach((el) => el.classList.add("lit"));
  screenEl.classList.toggle("focusing", Boolean(spot));
}

// Answers point back: a linked phrase shows exactly where it came from.
let pointTimer = null;
function pointAt(tokens, { hold = 0, flash = false } = {}) {
  clearTimeout(pointTimer);
  screenEl.querySelectorAll(".pointed").forEach((el) => el.classList.remove("pointed", "flash"));
  screenEl.classList.toggle("pointing", Boolean(tokens));
  if (!tokens) return;
  screenEl.querySelectorAll(sel(tokens)).forEach((el) => {
    el.classList.add("pointed");
    if (flash && !reduceMotion) { void el.offsetWidth; el.classList.add("flash"); }
  });
  if (hold) pointTimer = setTimeout(() => pointAt(null), hold);
}

function markNew() {
  const f = view();
  if (state.frame > state.lastSeen && f.changed) {
    screenEl.querySelectorAll(sel(f.changed)).forEach((el) => el.classList.add("is-new"));
  }
}

function renderScreen() {
  screenEl.classList.remove("focusing", "pointing", "changed");
  screenEl.innerHTML = statusBar() + view().html();   // authored here, never user input
  markNew();
  if (state.scene === "slides") placeCursor();
  setHint(null);
}

function statusBar() {
  const f = view();
  const n = scene().frames.length;
  const label = state.scene === "slides" ? `Slide ${state.frame + 1} of ${n}` : f.status;
  const pause = state.scene === "slides" && !atEnd()
    ? `<button type="button" class="deck-pause" aria-pressed="${state.presenterPaused}">${state.presenterPaused ? "Resume presenter" : "Pause presenter"}</button>`
    : "";
  return `<div class="deck-bar"><span>${label}</span>${pause}</div>`;
}

// The line under the screen names whatever is under the pointer or focus.
const DEFAULT_HINT_FINE = "Select part of the screen, or drag a box around anything";
const DEFAULT_HINT_TOUCH = "Tap part of the screen, or use Draw a box";
function setHint(el) {
  if (!el) {
    hintEl.innerHTML = `<span class="hint-fine">${DEFAULT_HINT_FINE}</span><span class="hint-touch">${DEFAULT_HINT_TOUCH}</span>`;
    return;
  }
  const label = el.getAttribute("aria-label");
  hintEl.textContent = /^Ask/.test(label) ? label : `Ask about ${label}`;
}
screenEl.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[role=button][data-spot]");
  setHint(el && screenEl.contains(el) ? el : null);
});
screenEl.addEventListener("mouseleave", () => setHint(document.activeElement?.closest?.("#screen [role=button]") || null));
screenEl.addEventListener("focusin", (e) => {
  const el = e.target.closest("[role=button][data-spot]");
  if (el) setHint(el);
});
screenEl.addEventListener("focusout", (e) => {
  if (!screenEl.contains(e.relatedTarget)) setHint(null);
});

// --- The thread, built as the real panel builds it ------------------------------

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
    // A span, not a button, so a long phrase wraps like the text around it.
    const b = document.createElement("span");
    b.setAttribute("role", "button");
    b.tabIndex = 0;
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
  const next = suggestionsFor(result);
  if (next.length) {
    const row = document.createElement("div");
    row.className = "zl-suggest";
    row.setAttribute("aria-label", "Suggested questions");
    next.forEach((q) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = q;
      row.appendChild(b);
    });
    t.appendChild(row);
  }
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

// question: what was typed, chosen or asked by a region. null for Describe and
// Explain, which in the real panel send no visible question.
function ask(question, result, { instant = false, thinking } = {}) {
  clearTimeout(state.timer);
  state.pendingQ?.remove();
  state.pendingQ = null;
  threadEl.querySelector(".zl-empty")?.remove();
  threadEl.querySelector(".zl-turn.pending")?.remove();
  threadEl.querySelectorAll(".zl-suggest").forEach((s) => s.remove());
  screenEl.querySelectorAll(".focus-box.placed").forEach((b) => b.remove());
  state.lastSeen = state.frame;
  screenEl.querySelectorAll(".is-new").forEach((el) => el.classList.remove("is-new"));
  clearNotice();
  state.lastQ = question || "";
  if (result.field && result.field !== "a") state.used.add(`${result.spot}:${result.field}`);
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
    if (!result.offscreen && (result.ctx || result.spot)) state.lastSpot = result.ctx || result.spot;
    setPill("ok", "Ready");
    actionsEl.classList.add("compact");
    input.placeholder = "Ask a follow-up…";
    reveal(q || a);
  };

  if (instant || !(CAPTURE_MS + READ_MS)) return finish();

  // Two honest stages, as in the product: the screen is captured, then read.
  const reading = thinking ||
    (result.catchUp ? "Comparing with what you last saw…" : result.label ? `Looking at: ${result.label}…` : "Reading the shared screen…");
  const pending = thinkingTurn("Capturing the shared screen…");
  threadEl.appendChild(pending);
  reveal(q || pending);
  setPill("busy", "Understanding");
  state.pendingQ = q;
  state.timer = setTimeout(() => {
    pending.querySelector(".zl-thinking span").textContent = reading;
    state.timer = setTimeout(finish, READ_MS);
  }, CAPTURE_MS);
}

// Linked phrases point at their source on hover or focus. A click brings the
// screen into view, and on a phone switches to it.
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
threadEl.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("zl-ref")) {
    e.preventDefault();
    e.target.click();
  }
});
threadEl.addEventListener("click", (e) => {
  const r = e.target.closest(".zl-ref");
  if (r) {
    if (isMobile()) setPane("screen");
    const box = screenEl.getBoundingClientRect();
    if (box.top < 64 || box.bottom > innerHeight) {
      screenEl.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }
    pointAt(r.dataset.ref, { hold: 3500, flash: true });
    return;
  }
  const chip = e.target.closest(".zl-suggest button");
  if (chip) return askTyped(chip.textContent);
  if (e.target.closest(".zl-notice button")) return askTyped("What did I miss?");
});

function askTyped(text) {
  openLens();
  ask(text, resolveTyped(text));
}

// --- The screen changed: a quiet notice, not an interruption ---------------------

function clearNotice() {
  threadEl.querySelector(".zl-notice")?.remove();
  segBtns.find((b) => b.dataset.pane === "lens")?.classList.remove("has-news");
}

function showNotice() {
  const n = state.frame - state.lastSeen;
  if (n <= 0) return clearNotice();
  let note = threadEl.querySelector(".zl-notice");
  if (!note) {
    note = document.createElement("div");
    note.className = "zl-notice";
    note.innerHTML = '<span></span><button type="button">What did I miss?</button>';
  }
  threadEl.querySelector(".zl-empty")?.remove();
  note.querySelector("span").textContent =
    n === 1 ? "The screen changed since you last asked." : `The screen changed ${n} times since you last asked.`;
  threadEl.appendChild(note);
  threadEl.scrollTop = threadEl.scrollHeight;
  if (isMobile() && meeting.dataset.pane !== "lens") {
    segBtns.find((b) => b.dataset.pane === "lens")?.classList.add("has-news");
  }
}

// --- Scenes -------------------------------------------------------------------

function showScene(key, { instant = false } = {}) {
  state.scene = key;
  state.frame = 0;
  state.lastSeen = 0;
  state.lastSpot = null;
  state.used.clear();
  state.cursor = null;
  clearTimeout(state.timer);
  state.pendingQ = null;
  renderScreen();
  screenEl.setAttribute("aria-label", "Shared screen. Select part of it to ask ZoomLens about it, or drag a box across it.");
  showEmpty();
  clearNotice();
  setPill("ok", "Ready");
  const v = view();
  ask(v.spots[v.primary].q, fromSpot(v.primary), { instant });
  updateAwayBtn();
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
    const hit = fromIntent(explain ? "explain" : "summary") || fromSpot(view().primary);
    openLens();
    ask(null, hit, { thinking: explain ? "Analyzing what's being shown…" : "Understanding shared screen…" });
  });
});

// --- Selecting part of the screen ----------------------------------------------

function activateSpot(el) {
  openLens();
  if (el.dataset.cell) {
    const [row, col] = el.dataset.cell.split(":");
    const name = SHEET.find((x) => x.id === row).label;
    const q = col === "change" ? `How did ${name} change?`
      : col === "q4" ? `What's the ${name} forecast?`
      : `What about ${name} in ${col.toUpperCase()}?`;
    return ask(q, cellAnswer(row, col));
  }
  if (el.dataset.pair) {
    return ask(`What about ${FIG.sizes[+el.dataset.pair]} examples?`, pairAnswer(+el.dataset.pair));
  }
  const id = el.dataset.spot.split(" ").find((t) => view().spots[t]);
  if (id) ask(view().spots[id].q, fromSpot(id));
}

let suppressClick = false;
screenEl.addEventListener("click", (e) => {
  if (suppressClick) return;
  if (e.target.closest(".deck-pause")) return togglePresenter();
  const el = e.target.closest("[data-cell], [data-pair], [data-spot]");
  if (el && screenEl.contains(el)) activateSpot(el);
});

// Enter or Space asks. Arrow keys move between cells, like a spreadsheet, and
// between the bars of a figure.
screenEl.addEventListener("keydown", (e) => {
  const el = e.target.closest('[role="button"][data-spot]');
  if (!el) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    return activateSpot(el);
  }
  const move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
  if (!move) return;
  const cell = el.closest("td, th");
  if (cell) {
    e.preventDefault();
    const rows = [...screenEl.querySelectorAll(".sheet tr")];
    let r = rows.indexOf(cell.parentElement), c = cell.cellIndex;
    for (;;) {
      r += move[0]; c += move[1];
      const target = rows[r]?.cells[c];
      if (!target) return;
      if (target.getAttribute("role") === "button") return target.focus();
    }
  }
  const pair = el.closest(".pair");
  if (pair && move[1]) {
    e.preventDefault();
    const pairs = [...screenEl.querySelectorAll(".pair")];
    pairs[pairs.indexOf(pair) + move[1]]?.focus();
  }
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
    ask("What's in this area?", { offscreen: true, a: "There isn't much in that part of the screen. Try a row, a column, or a chart." });
    setTimeout(() => box.remove(), 1200);
    return;
  }
  ask("What's in this area?", fromSpot(ranked[0][0]));
  box.classList.add("placed");
}

// --- The presenter keeps going ----------------------------------------------------

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

// Slides move on by themselves, as a presenter talks through them. The other
// screens change when you look away.
function startPresenter() {
  stopPresenter();
  if (state.scene !== "slides" || state.presenterPaused || state.away || atEnd()) return;
  state.presenterTimer = setTimeout(() => {
    if (!state.demoVisible || document.hidden) return startPresenter();
    advanceFrame();
    startPresenter();
  }, PRESENTER_MS);
}

function advanceFrame() {
  if (atEnd()) return;
  state.frame += 1;
  renderScreen();
  if (!reduceMotion) {
    void screenEl.offsetWidth;
    screenEl.classList.add("changed");
  }
  setPill("info", "Screen changed");
  setTimeout(() => { if (stateEl.dataset.kind === "info") setPill("ok", "Ready"); }, 2600);
  showNotice();
  updateAwayBtn();
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

// --- Look away: the meeting carries on without you ----------------------------------

function updateAwayBtn() {
  awayBtn.disabled = state.away;
  awayBtn.textContent = atEnd() ? "Start the meeting over" : "Look away for 20 seconds";
}

function lookAway() {
  if (state.away) return;
  if (atEnd()) {
    showScene(state.scene);
    awayStatus.textContent = "The meeting started over.";
    return;
  }
  state.away = true;
  stopPresenter();
  setDrawMode(false);
  pointAt(null);
  updateAwayBtn();
  if (isMobile()) setPane("screen");
  meeting.classList.add("away");
  awayStatus.textContent = "You looked away. MK keeps presenting.";

  const steps = Math.min(state.scene === "slides" ? 2 : 1, scene().frames.length - 1 - state.frame);
  for (let i = 1; i <= steps; i++) setTimeout(advanceFrame, (AWAY_MS * i) / (steps + 1));
  setTimeout(() => {
    state.away = false;
    meeting.classList.remove("away");
    updateAwayBtn();
    const n = state.frame - state.lastSeen;
    awayStatus.textContent =
      `You're back. The screen changed ${n === 1 ? "once" : `${n} times`}. Ask ZoomLens what you missed.`;
    startPresenter();
  }, AWAY_MS + 20);
}
awayBtn.addEventListener("click", lookAway);

// --- See it as the presenter ------------------------------------------------------

const viewBtn = $("#view-toggle");
const viewNote = $("#view-note");
const pvStrip = $("#pv-strip");
const shareTag = $(".m-share-tag");
const mkTile = $(".tile.speaking span");
const youTile = $("#you-tile span");

function updatePresenterStrip() {
  const n = state.asked;
  pvStrip.textContent = n
    ? `You've asked ZoomLens ${n} question${n === 1 ? "" : "s"} in this meeting. None of them appear on MK's screen.`
    : "You haven't asked ZoomLens anything yet. When you do, none of it appears on MK's screen.";
}

function setPresenterView(on) {
  state.asPresenter = on;
  demo.classList.toggle("as-presenter", on);
  viewBtn.setAttribute("aria-pressed", String(on));
  viewBtn.textContent = on ? "Back to your view" : "See it as the presenter";
  viewNote.textContent = on
    ? "This is what MK, the presenter, sees."
    : "This is your view, with ZoomLens open.";
  shareTag.textContent = on ? "You are sharing your screen" : "MK is sharing their screen";
  mkTile.textContent = on ? "You" : "MK";
  youTile.textContent = on ? "SL" : "You";
  screenEl.inert = on;
  $("#lens-panel").inert = on;
  awayBtn.hidden = on;
  if (on) {
    setDrawMode(false);
    pointAt(null);
    if (isMobile()) setPane("screen");
  }
  updatePresenterStrip();
}
viewBtn.addEventListener("click", () => setPresenterView(!state.asPresenter));

// --- Typing a question ----------------------------------------------------------

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
    if (on && pane === "lens") b.classList.remove("has-news");
  });
}

function syncLensButton(open) {
  lensBtn.setAttribute("aria-pressed", String(open));
  lensBtn.dataset.tip = open ? "Close ZoomLens" : "Open ZoomLens";
}

function setLens(open) {
  state.lensOpen = open;
  meeting.classList.toggle("lens-closed", !open);
  syncLensButton(open);
}

// On a phone the panel sits under the screen, so bring it into view when an
// answer is on its way.
const openLens = () => {
  if (!state.lensOpen) setLens(true);
  if (!isMobile()) return;
  const r = $("#lens-panel").getBoundingClientRect();
  if (r.top < 64 || r.bottom > innerHeight) {
    $("#lens-panel").scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }
};

$("#lp-close").addEventListener("click", () => {
  setLens(false);
  lensBtn.focus();
});
lensBtn.addEventListener("click", () => setLens(!state.lensOpen));
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
  syncLensButton(true);
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
    if (!state.lensOpen) setLens(true);
    (isMobile() ? $(".zl-composer") : demo)
      .scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
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

function setStep(i) {
  howSteps.forEach((s, j) => {
    s.setAttribute("aria-selected", String(i === j));
    s.tabIndex = i === j ? 0 : -1;
  });
  howViz.dataset.step = howSteps[i].dataset.step;
  howViz.setAttribute("aria-labelledby", howSteps[i].id);
}
// Only the chosen step shows its description, and they differ in length.
// Reserve the tallest so the page below does not move when the step changes.
const howList = $(".how-steps");
function reserveHowHeight() {
  howList.style.minHeight = "";
  const chosen = howSteps.findIndex((s) => s.getAttribute("aria-selected") === "true");
  let tallest = 0;
  howSteps.forEach((_, i) => {
    setStep(i);
    tallest = Math.max(tallest, howList.offsetHeight);
  });
  setStep(Math.max(0, chosen));
  howList.style.minHeight = `${tallest}px`;
}
reserveHowHeight();
let howResize = null;
addEventListener("resize", () => {
  clearTimeout(howResize);
  howResize = setTimeout(reserveHowHeight, 150);
});

howSteps.forEach((s, i) => {
  s.addEventListener("click", () => setStep(i));
  s.addEventListener("focus", () => setStep(i));
  s.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + howSteps.length) % howSteps.length;
    howSteps[next].focus();
  });
});

// --- Architecture: trace the path to whatever is chosen -----------------

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
flow.addEventListener("focusout", (e) => {
  if (!flow.contains(e.relatedTarget)) trace(null);
});

// --- Engineering: each problem with a small simulation of how it is solved ---
// These run in the browser and only model the mechanism; the numbers used are
// the real defaults (a 5 second gap and 60 questions a day).

const engTabs = [...document.querySelectorAll(".eng-tab")];
function selectEng(i, focus = false) {
  engTabs.forEach((t, j) => {
    t.setAttribute("aria-selected", String(i === j));
    t.tabIndex = i === j ? 0 : -1;
    $("#" + t.getAttribute("aria-controls")).hidden = i !== j;
  });
  if (focus) engTabs[i].focus();
}
engTabs.forEach((t, i) => {
  t.addEventListener("click", () => selectEng(i));
  t.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    selectEng((i + step + engTabs.length) % engTabs.length, true);
  });
});

// A two-option switch inside a simulation.
function simSwitch(root, attr, onChange) {
  const opts = [...root.querySelectorAll(`[data-${attr}]`)];
  opts.forEach((b) => b.addEventListener("click", () => {
    opts.forEach((o) => o.setAttribute("aria-checked", String(o === b)));
    onChange(b.dataset[attr]);
  }));
  return () => opts.find((o) => o.getAttribute("aria-checked") === "true").dataset[attr];
}

// 1. A video stream is not a stack of pictures.
(() => {
  const root = $('[data-sim="stream"]');
  if (!root) return;
  const units = Array.from({ length: 24 }, (_, i) =>
    i === 0 ? "SPS" : i === 1 ? "PPS" : (i - 2) % 8 === 0 ? "I" : "P");
  const list = root.querySelector(".units");
  list.innerHTML = units.map((u) => `<li class="u-${u.toLowerCase()}">${u}</li>`).join("");
  const cells = [...list.children];
  const range = root.querySelector("input[type=range]");
  const out = root.querySelector(".sim-result");
  const keep = simSwitch(root, "keep", draw);

  function draw() {
    const now = Number(range.value);
    let key = now;
    while (units[key] !== "I") key--;
    const kept = keep() === "last" ? [now] : [0, 1, ...Array.from({ length: now - key + 1 }, (_, i) => key + i)];
    cells.forEach((c, i) => {
      c.classList.toggle("future", i > now);
      c.classList.toggle("kept", kept.includes(i));
    });
    const ok = keep() === "clip" || units[now] === "I";
    root.classList.toggle("bad", !ok);
    out.textContent = keep() === "last"
      ? (units[now] === "I"
        ? "Decodable, but only by luck: the latest unit happens to be a keyframe."
        : "Not decodable. A P unit only describes how the picture changed since earlier ones.")
      : `Decodable: the parameter sets, the latest keyframe and the ${now - key} changes since it. ${kept.length} units in memory.`;
  }
  range.addEventListener("input", draw);
  draw();
})();

// 2. Privacy has to live where it cannot be edited.
(() => {
  const root = $('[data-sim="privacy"]');
  if (!root) return;
  const log = root.querySelector(".sim-log");
  const box = (who) => root.querySelector(`[data-who="${who}"]`);
  let asked = false;
  const say = (lines, who, got, ok) => {
    // lines[0] is the outcome, lines[1] what was attempted; newest shows first.
    lines.forEach((l, i) => {
      const li = document.createElement("li");
      li.textContent = l;
      if (i === 0 && !ok) li.className = "refused";
      log.prepend(li);
    });
    while (log.children.length > 6) log.lastChild.remove();
    const b = box(who);
    b.querySelector("[data-got]").textContent = got;
    b.classList.remove("hit", "no");
    void b.offsetWidth;
    b.classList.add(ok ? "hit" : "no");
  };
  root.querySelector('[data-act="ask"]').addEventListener("click", () => {
    asked = true;
    say(["Server sends the answer to your session only. AR and JL receive nothing.",
         "You ask. The request is recorded on your session."], "you", "Your answer", true);
  });
  root.querySelector('[data-act="snoop"]').addEventListener("click", () => {
    say(["Refused. There is no way to send to everyone: every message is addressed to one session.",
         "JL's modified panel asks to receive all answers."], "jl", "Refused", false);
  });
  root.querySelector('[data-act="steal"]').addEventListener("click", () => {
    say([asked
      ? "Refused. That request belongs to your session, not JL's, so the reply cannot go to JL."
      : "Refused. No request with that id is waiting on JL's session.",
      "JL sends your request id from JL's own session."], "jl", "Refused", false);
  });
})();

// 3. A meeting stream that would not start.
(() => {
  const root = $('[data-sim="sources"]');
  if (!root) return;
  const SRC = {
    stream: ["Meeting stream", "Answers are labelled as coming from the meeting's screen share."],
    display: ["Your own display", "Answers are labelled as coming from your display, not the meeting stream. The capture can include anything else on your screen."],
    recording: ["A recording", "Answers are labelled as coming from a recording, not the live meeting."],
  };
  const boxes = [...root.querySelectorAll("[data-src]")];
  const name = root.querySelector("[data-src-name]");
  const label = root.querySelector("[data-src-label]");
  function draw() {
    const first = boxes.find((b) => b.checked);
    boxes.forEach((b) => b.closest("li").classList.toggle("used", b === first));
    if (!first) {
      name.textContent = "No source";
      label.textContent = "ZoomLens says it cannot see a shared screen instead of guessing.";
      return;
    }
    [name.textContent, label.textContent] = SRC[first.dataset.src];
  }
  boxes.forEach((b) => b.addEventListener("change", draw));
  draw();
})();

// 4. Limits that a reload cannot reset.
(() => {
  const root = $('[data-sim="limits"]');
  if (!root) return;
  const GAP = 5, CAP = 60;
  const askBtn = root.querySelector('[data-lim="ask"]');
  const count = root.querySelector("[data-lim-count]");
  const fill = root.querySelector("[data-lim-fill]");
  const msg = root.querySelector("[data-lim-msg]");
  let used = 0, last = -Infinity, tick = null;
  const mode = simSwitch(root, "count", () => {
    used = 0; last = -Infinity; draw();
    msg.textContent = "Counter cleared. Ask a few times, then try reopening the panel.";
  });
  const wait = () => Math.max(0, Math.ceil(GAP - (Date.now() - last) / 1000));
  function draw() {
    count.textContent = `${used} / ${CAP}`;
    fill.style.width = `${(used / CAP) * 100}%`;
    const w = wait();
    askBtn.textContent = w ? `Ask (wait ${w}s)` : "Ask";
    if (!w && tick) { clearInterval(tick); tick = null; }
  }
  askBtn.addEventListener("click", () => {
    const w = wait();
    if (w) { msg.textContent = `Refused. The panel says: wait ${w} more second${w === 1 ? "" : "s"}.`; return; }
    if (used >= CAP) { msg.textContent = "Refused. The daily limit is reached."; return; }
    used += 1; last = Date.now();
    msg.textContent = `Answered. The next question is allowed in ${GAP} seconds.`;
    if (!tick) tick = setInterval(draw, 250);
    draw();
  });
  root.querySelector('[data-lim="reopen"]').addEventListener("click", () => {
    if (mode() === "connection") {
      used = 0; last = -Infinity;
      msg.textContent = "Reopened. A new connection, so the count and the wait started again from zero. Reopening is a way around the limit.";
    } else {
      msg.textContent = `Reopened. Still ${used} of ${CAP} today${wait() ? `, and still ${wait()} seconds to wait` : ""}: both are counted per participant, not per connection.`;
    }
    draw();
  });
  draw();
})();

// 5. An assistant that described itself.
(() => {
  const root = $('[data-sim="self"]');
  if (!root) return;
  const answer = root.querySelector("[data-self-a]");
  const capture = root.querySelector(".capture");
  const A = {
    off: "A Zoom meeting. On the right is a panel called ZoomLens with Describe screen and Explain this buttons and an earlier answer. Behind it, a slide is being shared.",
    on: "A slide comparing three deployment options, with the middle one highlighted as the recommendation.",
  };
  const draw = (v) => {
    answer.textContent = A[v];
    capture.dataset.about = v === "on" ? "share" : "panel";
  };
  simSwitch(root, "ins", draw);
  draw("on");
})();

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

// --- Lens section: choosing regions --------------------------------------

const callout = $("#callout p");
const regions = [...document.querySelectorAll(".hot-region")];
const defaultCallout = callout.textContent;
function point(region) {
  regions.forEach((r) => r.classList.toggle("active", r === region));
  callout.textContent = region ? region.dataset.say : defaultCallout;
}
regions.forEach((r) => {
  r.addEventListener("focus", () => point(r));
  r.addEventListener("click", () => point(r));
});

// --- Scroll: reveal whole sections, never individual paragraphs -------------

const toReveal = document.querySelectorAll(
  ".problem-copy, .mini-meeting, .how-grid, .lens-stage, .split-meeting, .facts, .eng, .flow, .tl, .faq-list");
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
syncLensButton(true);
tlReset();
updatePresenterStrip();
selectTab(0, { instant: true });
