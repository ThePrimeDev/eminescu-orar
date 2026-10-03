// Cloudflare Pages Function (served at /api/timetable): proxy + slimmer for eminescu.edupage.org public timetable.
// Deploy: dash.cloudflare.com -> Workers -> Create -> paste this -> Deploy.
// Use: https://YOUR-WORKER.workers.dev/?class=X%20A   (omit ?class to get only the class list)

const SCHOOL = "https://eminescu.edupage.org";
const TT_NUM = "70";      // timetable number from regularttGetData; may change when the school publishes a new version
const CACHE_SECONDS = 600;

const CORS = {
  "Content-Type": "application/json; charset=utf-8",
};

const HEADERS = { "content-type": "application/json; charset=UTF-8", origin: SCHOOL, referer: SCHOOL + "/" };
const WEEK_ONE_START = "2026-09-28"; // first Monday of validity; assumed to be Week A. Verify against the school's site.

// Ask maindbi which timetable number applies today (the "dates" table maps date -> tt_num).
async function currentTtNum() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const year = +today.slice(0, 4) - (today.slice(5, 7) < "08" ? 1 : 0); // school year starts in autumn
    const res = await fetch(`${SCHOOL}/rpr/server/maindbi.js?__func=mainDBIAccessor`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        __args: [null, year, { vt_filter: { datefrom: today, dateto: today } },
          { op: "fetch", needed_part: { dates: ["tt_num", "tt_day"] }, needed_combos: {} }],
        __gsh: "00000000",
      }),
    });
    const j = await res.json();
    const rows = j.r.tables.find((t) => t.id === "dates").data_rows;
    return rows[0]?.tt_num || TT_NUM;
  } catch {
    return TT_NUM; // fall back to the hardcoded number
  }
}

// 0 = Week A, 1 = Week B, alternating from WEEK_ONE_START
function currentWeek() {
  const mondayMs = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return +x; };
  const weeks = Math.round((mondayMs(new Date()) - mondayMs(WEEK_ONE_START)) / (7 * 864e5));
  return ((weeks % 2) + 2) % 2;
}

async function loadRaw() {
  const ttNum = await currentTtNum();
  const res = await fetch(`${SCHOOL}/timetable/server/regulartt.js?__func=regularttGetData`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ __args: [null, String(ttNum)], __gsh: "00000000" }),
  });
  if (!res.ok) throw new Error("EduPage returned " + res.status);
  const json = await res.json();
  const tables = json.r.dbiAccessorRes.tables;
  const T = {};
  for (const t of tables) if (t.data_rows) T[t.id] = Object.fromEntries(t.data_rows.map((r) => [r.id, r]));
  return { T, globals: Object.values(T.globals)[0] };
}

function build(T, globals, className) {
  const classes = Object.values(T.classes).map((c) => ({ id: c.id, name: c.name }));
  const out = {
    validity: globals.settings?.m_strDateBellowTimeTable || "",
    currentWeek: currentWeek(),
    classes: classes.map((c) => c.name),
    days: Object.values(T.days).map((d) => d.name),
    weeks: Object.values(T.weeks).map((w) => w.short),
    periods: Object.values(T.periods).map((p) => ({ n: +p.period, start: p.starttime, end: p.endtime })),
    lessons: [],
  };
  const cls = classes.find((c) => c.name === className);
  if (!cls) return out;

  for (const card of Object.values(T.cards)) {
    if (!card.days || !card.days.includes("1")) continue; // unplaced cards
    const l = T.lessons[card.lessonid];
    if (!l || !l.classids.includes(cls.id)) continue;
    const groups = l.groupids.map((g) => T.groups[g]).filter((g) => g && !g.entireclass).map((g) => g.name);
    out.lessons.push({
      d: card.days.indexOf("1"),
      p: +card.period,
      len: l.durationperiods || 1,
      w: card.weeks || "11", // "11" every week, "10" week A only, "01" week B only
      subject: T.subjects[l.subjectid]?.name || "?",
      short: T.subjects[l.subjectid]?.short || "?",
      teachers: l.teacherids.map((t) => T.teachers[t]?.short).filter(Boolean),
      group: [...new Set(groups)].join(", "),
      rooms: card.classroomids.map((r) => T.classrooms[r]?.short).filter(Boolean),
    });
  }
  return out;
}

export async function onRequestGet({ request, waitUntil }) {
  const className = new URL(request.url).searchParams.get("class") || "";
  try {
    const cache = caches.default;
    const key = new Request(new URL("/__cache/" + encodeURIComponent(className), request.url).href);
    const hit = await cache.match(key);
    if (hit) return hit;
    const { T, globals } = await loadRaw();
    const res = new Response(JSON.stringify(build(T, globals, className)), {
      headers: { ...CORS, "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    });
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: CORS });
  }
}
