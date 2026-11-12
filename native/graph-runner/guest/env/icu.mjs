// ICU owns collation data, locale tailoring and comparison on the host.
import { IntlUnsupportedError } from "./intl.mjs";
const installed = new WeakSet();
export function installIcu(target = globalThis) {
  if (installed.has(target)) return;
  const LegacyNumberFormat = target.Intl?.NumberFormat;
  const host = target.__host?.intl;
  if (!host) throw new Error("Intl requires the native ICU capability");
  const localeOf = (locales) => (typeof locales === "string" ? locales : Array.from(locales ?? ["en-US"])[0]) ?? "en-US";
  function NumberFormat(locales, options = {}) {
    if (!new.target) return new NumberFormat(locales, options);
    const locale = localeOf(locales);
    const allowed = new Set(["localeMatcher", "style", "currency", "minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits", "useGrouping"]);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw new IntlUnsupportedError(`Intl.NumberFormat option ${key}`);
    }
    if (options.style === "unit") throw new IntlUnsupportedError("Intl.NumberFormat unit style");
    const opts = { ...options };
    for (const key of ["minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits"]) {
      if (opts[key] !== undefined) opts[key] = Math.floor(Number(opts[key]));
    }
    if (opts.currency !== undefined && !/^[a-z]{3}$/i.test(String(opts.currency))) throw new RangeError("Invalid currency code");
    const render = (value) => {
      let decimal;
      if (typeof value === "string") {
        decimal = value.trim();
        if (!decimal || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(decimal)) decimal = String(Number(value));
      } else decimal = Object.is(value,-0) ? "-0" : String(typeof value === "bigint" ? value : Number(value));
      try { return host.number(locale, JSON.stringify(opts), decimal); }
      catch (error) { throw new RangeError(error.message); }
    };
    render(0);
    this.format = render;
    this.formatToParts = (value) => {
      if (!LegacyNumberFormat) throw new Error("Intl.NumberFormat.formatToParts is unavailable");
      return new LegacyNumberFormat(locales,options).formatToParts(value);
    };
    this.formatRange = () => { throw new IntlUnsupportedError("Intl.NumberFormat.formatRange"); };
    this.resolvedOptions = () => {
      if (!LegacyNumberFormat) throw new Error("Intl.NumberFormat.resolvedOptions is unavailable");
      return new LegacyNumberFormat(locales,options).resolvedOptions();
    };
  }
  Object.defineProperty(NumberFormat.prototype, Symbol.toStringTag, { value: "Intl.NumberFormat" });
  NumberFormat.supportedLocalesOf = (locales, options) => {
    if (LegacyNumberFormat) return LegacyNumberFormat.supportedLocalesOf(locales,options);
    throw new Error("Intl.NumberFormat.supportedLocalesOf is unavailable");
  };
  class DateTimeFormat {
    constructor(locales, options = {}) {
      const locale = localeOf(locales);
      this.format = (value = Date.now()) => host.date(locale, JSON.stringify(options), Number(value));
    }
  }
  class RelativeTimeFormat {
    constructor(locales, options = {}) {
      const locale = localeOf(locales);
      this.format = (value, unit) => host.relative(locale, JSON.stringify(options), Number(value), String(unit));
    }
  }
  class ListFormat {
    constructor(locales, options = {}) {
      const locale = localeOf(locales);
      this.format = (value = []) => {
        const values = Array.from(value);
        if (values.some((item) => typeof item !== "string")) throw new TypeError("Iterable yielded a non-string");
        return host.list(locale, JSON.stringify(options), JSON.stringify(values));
      };
    }
  }
  for (const [name, value] of Object.entries({ NumberFormat, DateTimeFormat, RelativeTimeFormat, ListFormat })) {
    Object.defineProperty(target.Intl, name, { value, configurable: true, writable: true });
  }
  for (const prototype of [Number.prototype, BigInt.prototype]) {
    Object.defineProperty(prototype, "toLocaleString", { configurable: true, writable: true,
      value(locales, options) { return new NumberFormat(locales, options).format(this.valueOf()); }
    });
  }
  for (const [name, defaults] of Object.entries({
    toLocaleString: { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" },
    toLocaleDateString: { year: "numeric", month: "numeric", day: "numeric" },
    toLocaleTimeString: { hour: "numeric", minute: "numeric", second: "numeric" }
  })) {
    Object.defineProperty(Date.prototype, name, { configurable: true, writable: true,
      value(locales, options) {
        const value = this.getTime();
        if (Number.isNaN(value)) return "Invalid Date";
        const opts = { ...options };
        if (!Object.keys(defaults).some((key) => opts[key] !== undefined) && opts.dateStyle === undefined && opts.timeStyle === undefined) Object.assign(opts, defaults);
        return new DateTimeFormat(locales, opts).format(value);
      }
    });
  }
  class Collator {
    constructor(locales = "en-US", options = {}) {
      const requested = typeof locales === "string" ? [locales] : Array.from(locales);
      const locale = requested[0] ?? "en-US";
      this.compare = host.collator(locale, JSON.stringify(options));
    }
  }
  Object.defineProperty(target.Intl, "Collator", { value: Collator, configurable: true, writable: true });
  // A sort calls localeCompare once per pair, and building an ICU collator
  // costs far more than one comparison, so each locale and options pair keeps
  // its collator.
  const compares = new Map();
  const compareFor = (locales, options) => {
    const key = JSON.stringify([locales ?? null, options ?? null]);
    let compare = compares.get(key);
    if (!compare) {
      if (compares.size >= 64) compares.clear();
      compare = new Collator(locales, options).compare;
      compares.set(key, compare);
    }
    return compare;
  };
  Object.defineProperty(String.prototype, "localeCompare", {
    configurable: true, writable: true,
    value(other, locales, options) {
      if (this == null) throw new TypeError("String.prototype.localeCompare called on null or undefined");
      return compareFor(locales, options)(String(this), String(other));
    }
  });
  installed.add(target);
}
