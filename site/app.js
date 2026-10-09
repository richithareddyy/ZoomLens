// Website demonstrations only. Nothing here connects to Zoom; the answers are
// illustrative examples written for the page, and are labelled as such.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const SCENES = {
  sheet: {
    screen: `
      <h4>Q3 Revenue Analysis</h4>
      <p class="sub">Revenue by segment, $k</p>
      <table class="sheet">
        <thead><tr><th>Segment</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Change</th></tr></thead>
        <tbody>
          <tr class="hl"><td>Enterprise</td><td>412</td><td>438</td><td>491</td><td class="pos">+12%</td></tr>
          <tr><td>Mid-market</td><td>286</td><td>301</td><td>309</td><td class="pos">+3%</td></tr>
          <tr><td>Self-serve</td><td>174</td><td>169</td><td>163</td><td class="neg">−4%</td></tr>
          <tr><td>Operating expenses</td><td>530</td><td>548</td><td>570</td><td class="neg">+4%</td></tr>
        </tbody>
      </table>`,
    q: "What changed this quarter?",
    a: "Enterprise revenue rose the most, up 12% on Q2. Self-serve slipped 4%, and operating expenses grew 4%.",
  },
  paper: {
    screen: `
      <h4>Scaling Behaviour of Retrieval-Augmented Models</h4>
      <p class="sub">Section 4 · Results</p>
      <div class="paper-lines"><i style="width:96%"></i><i style="width:88%"></i><i style="width:92%"></i></div>
      <div class="paper-fig" aria-label="Bar chart">
        <span class="b" style="height:30%"></span><span style="height:34%"></span>
        <span class="b" style="height:46%"></span><span style="height:58%"></span>
        <span class="b" style="height:55%"></span><span style="height:78%"></span>
        <span class="b" style="height:61%"></span><span style="height:92%"></span>
      </div>
      <p class="paper-cap">Figure 3. Accuracy against training set size.</p>`,
    q: "What does this figure show?",
    a: "It compares accuracy as the training data grows. Both methods improve, but the highlighted one pulls clearly ahead once the dataset passes the midpoint.",
  },
  dash: {
    screen: `
      <h4>Funnel · last 8 weeks</h4>
      <div class="dash-kpis">
        <div><small>Visits</small><b>48.2k</b></div>
        <div><small>Conversion</small><b>2.1%</b></div>
        <div><small>Mobile share</small><b>64%</b></div>
      </div>
      <svg class="dash-svg" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
        <polyline stroke="#9AA4B2" points="0,40 40,38 80,39 120,37 160,38 200,37 240,36 300,36"/>
        <polyline stroke="#2D8CFF" points="0,22 40,23 80,24 120,30 160,41 200,52 240,60 300,67"/>
      </svg>`,
    q: "Why did conversion fall?",
    a: "The decline is concentrated in mobile traffic over the most recent weeks. Desktop is roughly flat, so this points at the mobile experience rather than overall demand.",
  },
  slides: {
    screen: `
      <h4>Deployment options</h4>
      <p class="sub">Comparing three approaches</p>
      <div class="slide">
        <div><b>Self-hosted</b>Full control, highest operating cost</div>
        <div class="pick"><b>Managed</b>Lower cost, vendor runs upgrades</div>
        <div><b>Hybrid</b>Flexible, two systems to maintain</div>
      </div>`,
    q: "What did I miss?",
    a: "The presenter is comparing three deployment approaches and is recommending the second, managed, mainly for its lower operating cost.",
  },
};

// --- Hero scene -------------------------------------------------------------

const screenEl = document.getElementById("screen");
const threadEl = document.getElementById("thread");
let pendingAnswer = null;

function bubble(cls, who, text) {
  const b = document.createElement("div");
  b.className = `bubble ${cls}`;
  if (who) {
    const w = document.createElement("span");
    w.className = "who";
    w.textContent = who;
    b.appendChild(w);
  }
  b.appendChild(document.createTextNode(text));
  return b;
}

function showScene(key) {
  const scene = SCENES[key];
  if (!scene) return;
  clearTimeout(pendingAnswer);

  screenEl.innerHTML = scene.screen;          // authored here, not user input
  threadEl.replaceChildren(bubble("q", "You", scene.q));

  const finish = () => threadEl.appendChild(bubble("a", "ZoomLens", scene.a));
  if (reduceMotion) return finish();

  const dots = document.createElement("div");
  dots.className = "dots";
  dots.setAttribute("aria-label", "ZoomLens is thinking");
  dots.innerHTML = "<i></i><i></i><i></i>";
  threadEl.appendChild(dots);
  pendingAnswer = setTimeout(() => { dots.remove(); finish(); }, 900);
}

const tabs = [...document.querySelectorAll(".tab")];
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => select(i));
  tab.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    select(next);
    tabs[next].focus();
  });
});

function select(i) {
  tabs.forEach((t, j) => {
    t.setAttribute("aria-selected", String(i === j));
    t.tabIndex = i === j ? 0 : -1;
  });
  showScene(tabs[i].dataset.scene);
}

// --- Mobile: the meeting becomes two views rather than being squeezed ------

const meeting = document.querySelector(".meeting");
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".seg-btn").forEach((b) =>
      b.setAttribute("aria-selected", String(b === btn)));
    meeting.dataset.paneActive = btn.dataset.pane;
  });
});

// --- Meeting controls: visual only --------------------------------------

document.querySelectorAll("[data-toggle]").forEach((ctl) => {
  ctl.addEventListener("click", () => ctl.classList.toggle("off"));
});

// --- Lens regions ---------------------------------------------------------

const callout = document.querySelector("#callout p");
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
document.querySelector(".lens-screen").addEventListener("mouseleave", () => {
  if (!regions.includes(document.activeElement)) point(null);
});

// --- Scroll: reveal sections, and focus the shared screen ------------------

const toReveal = document.querySelectorAll(
  ".problem-copy, .mini-meeting, .step, .story, .node, .split-meeting, .fact-col, .lens-stage");
toReveal.forEach((el) => el.classList.add("rise"));

if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }
  }, { threshold: 0.15 });
  toReveal.forEach((el) => io.observe(el));

  // As the hero leaves view, outline the shared screen: meeting, then screen.
  new IntersectionObserver(([e]) => {
    screenEl.classList.toggle("focused", e.intersectionRatio < 0.85);
  }, { threshold: [0.85] }).observe(document.querySelector(".hero"));
} else {
  toReveal.forEach((el) => el.classList.add("in"));
}

select(0);
