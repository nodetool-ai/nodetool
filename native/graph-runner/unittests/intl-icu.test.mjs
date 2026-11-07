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
globalThis.G6_RESULTS = JSON.stringify(results);
globalThis.__nodetool = {};
