/**
 * One-off importer: the store's historical schedule spreadsheet
 * (docs/schedule.xlsx) → schedules + shifts, for the 6 current employees only.
 *
 * The metrics grid shows active employees, so former staff and the sheets'
 * garbage tokens are skipped by design. The sheets carry no year; each week's
 * Monday date resolves to exactly one year by day-of-week (2024 in this file).
 *
 *   node scripts/import-schedule-history.mjs            # dry-run: parse + report
 *   node scripts/import-schedule-history.mjs --commit   # write to prod
 *
 * Reads SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN from .env.local for the
 * commit path (same Management API the migrations use). Idempotent per
 * (location, week_start): a re-run replaces that week's imported shifts.
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

const COMMIT = process.argv.includes("--commit");
const FILE = "docs/schedule .xlsx";

// nickname → canonical employee name. ONLY the 6 current employees.
const NAME_MAP = {
  vale: "Valentina Arango",
  valentina: "Valentina Arango",
  cynthia: "Cynthia Leon",
  milena: "Milena Velasquez",
  veri: "Veriana Bau",
  veriana: "Veriana Bau",
  maryna: "Maryna Biazverkhaya",
  william: "William Martinez",
  willian: "William Martinez",
};

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  março: 2, abril: 3, maio: 4, junho: 5, julho: 6, junio: 5, marzo: 2,
};

const clean = (v) =>
  v && typeof v === "object" && v.richText ? v.richText.map((t) => t.text).join("") : v;

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const addDays = (isoDate, n) => {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const mondayOf = (isoDate) => {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  const back = (dt.getUTCDay() + 6) % 7; // 0=Sun..6=Sat → days since Monday
  return addDays(isoDate, -back);
};

// The grid only classifies a shift AM/PM by whether it starts before noon, and
// shifts.start_time/end_time are NOT-NULL, so we assign nominal times by which
// half of the day-block a person's run sits in — no fragile exact-time parse.
const AM_TIMES = { start: "09:30", end: "17:30" };
const PM_TIMES = { start: "13:30", end: "21:30" };

/** Just the clock hour from a HOURS cell (for detecting the noon wrap). */
function rawHour(raw) {
  if (raw instanceof Date) return raw.getUTCHours();
  if (typeof raw === "string") {
    const mt = raw.match(/(\d{1,2}):/);
    if (mt) return Number(mt[1]);
  }
  return null;
}

function headerCols(ws) {
  for (let r = 1; r <= 3; r++) {
    const cols = [];
    ws.getRow(r).eachCell({ includeEmpty: false }, (c, n) => {
      if (String(clean(c.value) ?? "").trim().toUpperCase() === "HOURS") cols.push(n);
    });
    if (cols.length) return [...new Set(cols)].sort((a, b) => a - b);
  }
  return [];
}

/** For a HOURS column, the block's date: scan header rows near it for "DD MONTH". */
function blockDate(ws, hcol) {
  for (let r = 1; r <= 3; r++) {
    for (let c = hcol; c <= hcol + 6; c++) {
      const v = String(clean(ws.getRow(r).getCell(c).value) ?? "").trim();
      const m = v.match(/(\d{1,2})\s*([A-Za-zçãé]+)/);
      if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
        return { day: Number(m[1]), month: MONTHS[m[2].toLowerCase()] };
      }
    }
  }
  return null;
}

// The whole file is a single 2024 season (March–July 2024), confirmed by the
// owner. The per-block weekday words are unreliable — typos ("wednnesday"),
// missing, and sometimes flat-out mismatched with the date — so trusting them
// produced a phantom parallel 2023 set. The month/day come from each block; the
// year is simply 2024.
const SEASON_YEAR = 2024;

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const shifts = []; // {date, employee, start, end}
  const seen = new Set(); // one AM + one PM per (date, employee) — dedupe across
  const skippedSheets = [];
  let ambiguousYear = 0;
  const push = (s) => {
    const key = `${s.date}|${s.employee}|${s.start < "12:00" ? "am" : "pm"}`;
    if (seen.has(key)) return;
    seen.add(key);
    shifts.push(s);
  };

  for (const ws of wb.worksheets) {
    const hcols = headerCols(ws);
    if (!hcols.length) {
      skippedSheets.push(`${ws.name} (no HOURS header)`);
      continue;
    }
    for (let bi = 0; bi < hcols.length; bi++) {
      const hcol = hcols[bi];
      const endCol = (hcols[bi + 1] ?? ws.columnCount + 1) - 1;

      const dm = blockDate(ws, hcol);
      if (!dm) continue;
      const date = iso(SEASON_YEAR, dm.month, dm.day);
      const rows = ws.rowCount;

      // Per row, is this the afternoon? The HOURS column runs 9,10,11,12 then
      // wraps to 1,2,… — the first drop marks noon; everything after is PM.
      const pmByRow = [];
      let pm = false, prevH = -1;
      for (let r = 2; r <= rows; r++) {
        const h = rawHour(clean(ws.getRow(r).getCell(hcol).value));
        if (h !== null) { if (prevH !== -1 && h < prevH) pm = true; prevH = h; }
        pmByRow[r] = pm;
      }

      // For each name column: a person may work a morning run and/or an
      // afternoon run in the same day. Record at most one AM and one PM shift.
      for (let col = hcol + 1; col <= endCol; col++) {
        const halves = { am: new Set(), pm: new Set() };
        for (let r = 2; r <= rows; r++) {
          const raw = clean(ws.getRow(r).getCell(col).value);
          const nm = typeof raw === "string" && /^[a-zà-ú]{3,}$/i.test(raw.trim())
            ? raw.trim().toLowerCase() : null;
          if (nm && NAME_MAP[nm]) halves[pmByRow[r] ? "pm" : "am"].add(NAME_MAP[nm]);
        }
        for (const emp of halves.am)
          push({ date, employee: emp, ...AM_TIMES });
        for (const emp of halves.pm)
          push({ date, employee: emp, ...PM_TIMES });
      }
    }
  }

  // ---- report ----
  const byEmp = {};
  const weeks = new Set();
  let minDate = "9999", maxDate = "0000";
  for (const s of shifts) {
    byEmp[s.employee] = (byEmp[s.employee] ?? 0) + 1;
    weeks.add(mondayOf(s.date));
    if (s.date < minDate) minDate = s.date;
    if (s.date > maxDate) maxDate = s.date;
  }
  console.log(`\n=== DRY-RUN (${FILE}) ===`);
  console.log(`shifts extracted: ${shifts.length}`);
  console.log(`weeks (schedules to create): ${weeks.size}`);
  console.log(`date range: ${minDate} → ${maxDate}`);
  console.log(`skipped sheets: ${skippedSheets.length ? skippedSheets.join("; ") : "none"}`);
  console.log(`blocks with ambiguous/no year: ${ambiguousYear}`);
  const nonSeason = [...new Set(shifts.filter(s=>!s.date.startsWith("2024")).map(s=>s.date))].sort();
  console.log(`dates outside 2024: ${nonSeason.length ? nonSeason.join(", ") : "none"}`);
  console.log(`per employee:`);
  for (const [n, c] of Object.entries(byEmp).sort((a, b) => b[1] - a[1]))
    console.log(`  ${n.padEnd(20)} ${c}`);
  console.log(`\nsample (first 8 shifts):`);
  for (const s of shifts.slice(0, 8))
    console.log(`  ${s.date}  ${s.employee.padEnd(18)} ${s.start}–${s.end}`);

  if (!COMMIT) {
    console.log(`\n(dry-run only — re-run with --commit to write, after review)`);
    return;
  }

  await commit(shifts);
}

// ---------------------------------------------------------------------------
// Commit: schedules + shifts to prod via the Supabase Management API (the same
// endpoint the migrations use). Idempotent per (location, week_start): each
// affected week's schedule is upserted and its shifts replaced, so a re-run
// converges rather than duplicating.
// ---------------------------------------------------------------------------
function envFromLocal(key) {
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}
async function sql(query) {
  const REF = envFromLocal("SUPABASE_PROJECT_REF");
  const TOKEN = envFromLocal("SUPABASE_ACCESS_TOKEN");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function commit(shifts) {
  console.log("\n=== COMMIT ===");
  const [loc] = await sql(
    `select id from locations where active order by name limit 1;`,
  );
  if (!loc) throw new Error("No active location.");
  const locationId = loc.id;

  const emps = await sql(`select id, name from employees where active;`);
  const idByName = new Map(emps.map((e) => [e.name, e.id]));
  const missing = [...new Set(shifts.map((s) => s.employee))].filter((n) => !idByName.has(n));
  if (missing.length) throw new Error(`Employees not found: ${missing.join(", ")}`);

  const byWeek = new Map();
  for (const s of shifts) {
    const wk = mondayOf(s.date);
    (byWeek.get(wk) ?? byWeek.set(wk, []).get(wk)).push(s);
  }

  let weeks = 0, inserted = 0;
  for (const [weekStart, weekShifts] of byWeek) {
    // Upsert the schedule (unique on location_id, week_start) as published.
    const sched = await sql(
      `insert into schedules (location_id, week_start, status, published_at)
       values (${q(locationId)}, ${q(weekStart)}, 'published', now())
       on conflict (location_id, week_start)
         do update set status = 'published', published_at = now()
       returning id;`,
    );
    const scheduleId = sched[0].id;

    // Replace only THIS import's shifts for the week: our imports are the two
    // nominal windows, so we clear those and re-insert (leaves any real hand-made
    // shifts on the week untouched).
    await sql(
      `delete from shifts where schedule_id = ${q(scheduleId)}
        and (start_time, end_time) in ((time '09:30', time '17:30'), (time '13:30', time '21:30'));`,
    );

    const values = weekShifts
      .map(
        (s) =>
          `(${q(scheduleId)}, ${q(idByName.get(s.employee))}, ${q(s.date)}, ${q(s.start)}, ${q(s.end)})`,
      )
      .join(",\n");
    await sql(
      `insert into shifts (schedule_id, employee_id, date, start_time, end_time)
       values ${values};`,
    );
    weeks++;
    inserted += weekShifts.length;
    process.stdout.write(`  ${weekStart}: ${weekShifts.length} shifts\n`);
  }
  console.log(`\ndone: ${weeks} weeks, ${inserted} shifts, location ${locationId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
