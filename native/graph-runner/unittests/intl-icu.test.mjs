import { installIcu } from "../guest/env/icu.mjs";
if (!globalThis.Intl) globalThis.Intl = {};
installIcu();
const results = [];
for (const locale of ["en-US", "de-DE", "sv-SE", "tr-TR", "ja-JP", "ar-EG"]) {
  for (const options of [{}, { numeric: true }, { sensitivity: "base" }, { caseFirst: "upper" }, { ignorePunctuation: true }]) {
    results.push(["z", "ä", "A", "a", "a-2", "a10", "a2", "İ", "i"].sort(new Intl.Collator(locale, options).compare));
  }
  for (const options of [{}, { style: "percent", maximumFractionDigits: 1 }, { style: "currency", currency: "EUR" }, { minimumFractionDigits: 4 }]) {
    results.push(new Intl.NumberFormat(locale, options).format(1234.567));
  }
  for (const numeric of ["auto", "always"]) {
    for (const value of [-2, -1, 0, 1, 2]) results.push(new Intl.RelativeTimeFormat(locale, { numeric }).format(value, "day"));
  }
  for (const type of ["conjunction", "disjunction", "unit"]) results.push(new Intl.ListFormat(locale, { type }).format(["a", "b", "c"]));
  for (const timeZone of ["UTC", "Europe/Amsterdam", "America/New_York", "Asia/Tokyo"]) {
    results.push(new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone }).format(1782562830000));
    results.push(new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(1782562830000));
  }
}
// localeCompare keeps one collator per locale and options pair. Interleaved
// calls must not reuse another pair's collator, and a sort builds only one.
const host = globalThis.__host?.intl;
const createCollator = host?.collator;
let collators = 0;
if (host) host.collator = (...args) => (collators++, createCollator(...args));
const words = ["z", "ä", "A", "a", "a10", "a2", "İ", "i"];
for (let round = 0; round < 2; round++) {
  results.push([...words].sort((x, y) => x.localeCompare(y)));
  results.push([...words].sort((x, y) => x.localeCompare(y, "sv-SE")));
  results.push([...words].sort((x, y) => x.localeCompare(y, "en-US", { numeric: true })));
  results.push([...words].sort((x, y) => x.localeCompare(y, ["tr-TR"], { sensitivity: "base" })));
}
if (host) {
  host.collator = createCollator;
  if (collators !== 4) throw new Error(`localeCompare built ${collators} collators for 4 locale and options pairs`);
}
globalThis.G6_RESULTS = JSON.stringify(results);
globalThis.__nodetool = {};
