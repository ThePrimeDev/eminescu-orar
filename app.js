const $ = (s) => document.querySelector(s);
const API = "/api/timetable";

const DESIGNS = [
  { id: "pills", name: "Pastile", list: false },
  { id: "mono", name: "Mono", list: false },
  { id: "glass", name: "Sticlă", list: false },
  { id: "script", name: "Cursiv", list: false },
  { id: "timeline", name: "Cronologie", list: true },
  { id: "cafe", name: "Cafea", list: true },
];
const COLORS = [
  ["Vișiniu", "#7a1f35"], ["Verde salvie", "#8fa886"], ["Bleumarin", "#1f3a5f"], ["Bej", "#d9c7a8"], ["Gri", "#6b7075"],
];

// ---- saved settings (localStorage) ----
const load = () => { try { return JSON.parse(localStorage.getItem("orar")) || {}; } catch { return {}; } };
const save = () => { try { localStorage.setItem("orar", JSON.stringify({ design: S.design, color: S.color, cls: S.cls })); } catch {} };
const S = { design: "pills", color: COLORS[1][1], cls: "", week: null, data: null, ...load() };
if (!DESIGNS.some((d) => d.id === S.design)) S.design = "pills";
if (!/^#[0-9a-f]{6}$/i.test(S.color)) S.color = COLORS[1][1];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const onColor = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#17202a" : "#fff";
};

// ---- controls ----
function buildControls() {
  $("#designs").innerHTML = DESIGNS.map((d) => `<button data-design="${d.id}">${d.name}</button>`).join("");
  $("#colors").innerHTML =
    COLORS.map(([n, h]) => `<button class="sw" style="--c:${h}" data-color="${h}" title="${n}" aria-label="${n}"></button>`).join("") +
    `<label class="custom sw" title="Altă culoare"><input type="color" id="pick" aria-label="Altă culoare" value="${S.color}"></label>`;
}

function syncControls() {
  document.querySelectorAll("[data-design]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.design === S.design));
  document.querySelectorAll("[data-w]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.w === S.week));
  const preset = COLORS.some(([, h]) => h === S.color.toLowerCase());
  document.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.color === S.color.toLowerCase()));
  const c = $(".custom");
  c.classList.toggle("on", !preset);
  c.style.setProperty("--c", S.color);
  $("#pick").value = S.color;
}

// ---- poster ----
function lessonsFor(d) {
  const w = S.week === 0 ? "10" : "01";
  return d.lessons.filter((l) => l.w === "11" || l.w === w);
}

function gridHTML(d, ls) {
  const per = Object.fromEntries(d.periods.map((p) => [p.n, p]));
  const n = Math.max(...ls.map((l) => l.p + l.len - 1));
  let h = `<div class="grid" style="--n:${n}">`;
  h += d.days.map((_, i) => (i % 2 ? "" : `<i class="bgc" style="--d:${i}"></i>`)).join("");
  h += d.days.map((x, i) => `<div class="dh" data-d="${i}" style="--d:${i}">${esc(x.slice(0, 3))}</div>`).join("");
  for (let p = 1; p <= n; p++) {
    h += `<i class="ln" style="--p:${p}"></i><div class="tm" style="--p:${p}"><b>${per[p]?.start || ""}</b></div>`;
  }
  const cells = {};
  ls.forEach((l) => (cells[l.d + "-" + l.p] ||= []).push(l));
  Object.values(cells).forEach((g, i) => {
    const f = g[0];
    h += `<div class="c" data-d="${f.d}" data-a="${i % 2}" style="--d:${f.d};--p:${f.p};--s:${Math.max(...g.map((l) => l.len))}">` +
      g.map((l) => `<div><b>${esc(l.short)}</b>${l.rooms.length ? `<small>${esc(l.rooms.join(", "))}</small>` : ""}</div>`).join("") + "</div>";
  });
  return h + "</div>";
}

function listHTML(d, ls) {
  const per = Object.fromEntries(d.periods.map((p) => [p.n, p]));
  let h = '<div class="list">';
  d.days.forEach((name, i) => {
    const day = ls.filter((l) => l.d === i).sort((a, b) => a.p - b.p);
    if (!day.length) return;
    h += `<div class="day"><h3>${esc(name.slice(0, 3))}</h3><i></i><ul>` +
      day.map((l) => {
        const t = `${per[l.p]?.start}–${per[l.p + l.len - 1]?.end || ""}`;
        return `<li><time>${t}</time><em>${esc(l.rooms.join(", "))}</em><b data-t="${t}">${esc(l.short)}${l.group ? " · " + esc(l.group) : ""}</b></li>`;
      }).join("") + "</ul></div>";
  });
  return h + "</div>";
}

function render() {
  const el = $("#poster"), d = S.data, des = DESIGNS.find((x) => x.id === S.design);
  el.className = "poster " + des.id;
  el.style.setProperty("--c", S.color);
  el.style.setProperty("--on", onColor(S.color));
  const ls = d && S.cls ? lessonsFor(d) : [];
  const title = des.id === "glass" || des.id === "timeline" ? "Class schedule" : des.id === "cafe" ? "Class schedule" : "orar";
  const sub = S.cls ? `${esc(S.cls)} · săpt. ${S.week === 0 ? "A" : "B"}` : "";
  el.innerHTML = `<div class="ttl"><h2>${title}</h2><div class="sub">${sub}</div></div>` +
    (ls.length ? (des.list ? listHTML(d, ls) : gridHTML(d, ls)) : `<p class="empty">${S.cls ? "Nu există ore pentru această săptămână." : "Alege clasa."}</p>`);
  $("#dl").disabled = !ls.length;
}

// ---- data ----
async function fetchData() {
  $("#msg").textContent = "Se încarcă…";
  try {
    const r = await fetch(`${API}?class=${encodeURIComponent(S.cls)}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    S.data = d;
    if (S.week === null) S.week = d.currentWeek ?? 0;
    const sel = $("#cls");
    if (sel.options.length < 2) sel.innerHTML = '<option value="">Alege clasa</option>' + d.classes.map((c) => `<option>${esc(c)}</option>`).join("");
    sel.value = S.cls;
    if (S.cls && sel.value !== S.cls) S.cls = "";
    $("#msg").textContent = "";
  } catch (e) {
    $("#msg").textContent = "Nu s-a putut încărca orarul: " + e.message;
  }
  syncControls(); render();
}

// ---- download (library loaded on first click) ----
let libP;
const lib = () => (libP ||= new Promise((ok, no) => {
  const s = document.createElement("script");
  s.src = "vendor/html-to-image.js"; s.onload = ok; s.onerror = () => no(new Error("Biblioteca nu s-a încărcat"));
  document.head.append(s);
}));

async function download() {
  const b = $("#dl"), t = b.textContent;
  b.disabled = true; b.textContent = "Se creează imaginea…";
  try {
    await lib(); await document.fonts.ready;
    const el = $("#poster");
    const o = { pixelRatio: 1080 / el.offsetWidth, cacheBust: true, style: { boxShadow: "none", margin: "0" } };
    if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) await htmlToImage.toPng(el, o); // Safari needs a warm-up pass
    const a = document.createElement("a");
    a.href = await htmlToImage.toPng(el, o);
    a.download = `orar-${S.cls.replace(/\s+/g, "")}.png`;
    a.click();
  } catch (e) {
    $("#msg").textContent = "Imaginea nu a putut fi creată: " + e.message;
  }
  b.textContent = t; b.disabled = false;
}

// ---- events ----
buildControls();
document.addEventListener("click", (e) => {
  const x = e.target.closest("button");
  if (!x) return;
  if (x.dataset.design) S.design = x.dataset.design;
  else if (x.dataset.color) S.color = x.dataset.color;
  else if (x.dataset.w) S.week = +x.dataset.w;
  else return;
  save(); syncControls(); render();
});
$("#pick").addEventListener("input", (e) => { S.color = e.target.value; save(); syncControls(); render(); });
$("#cls").addEventListener("change", (e) => { S.cls = e.target.value; save(); fetchData(); });
$("#dl").addEventListener("click", download);

fetchData();
