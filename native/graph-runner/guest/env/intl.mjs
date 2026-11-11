// The previous exact en-US formatter remains the implementation for its
// formatToParts/resolvedOptions methods. env/index installs the ICU-backed
// formatting and collation module after this compatibility implementation.

export class IntlUnsupportedError extends Error {
  constructor(message) {
    super(`${message} is not supported in the native runner`);
    this.name = "IntlUnsupportedError";
  }
}

const DEFAULT_LOCALE = "en-US";

// ------------------------------------------------------------------ locales

/** The supported locale `tag` names, canonicalized, or undefined. */
function supportedLocale(tag) {
  if (/^en$/i.test(tag)) return "en";
  if (/^en-us$/i.test(tag)) return "en-US";
  return undefined;
}

function localeList(locales) {
  if (locales === undefined) return [];
  if (typeof locales === "string") return [locales];
  if (locales === null) throw new TypeError("Cannot convert undefined or null to object");
  const list = [];
  for (const item of Array.from(Object(locales))) {
    if (typeof item !== "string" && (typeof item !== "object" || item === null)) {
      throw new TypeError("Language ID should be string or object.");
    }
    list.push(String(item));
  }
  return list;
}

/** The locale to format with: the first requested one, which must be supported. */
function resolveLocale(locales, what) {
  const list = localeList(locales);
  if (list.length === 0) return DEFAULT_LOCALE;
  const tag = list[0];
  const supported = supportedLocale(tag);
  if (supported) return supported;
  if (!/^[a-z]{2,8}(-[a-z0-9]{1,8})*$/i.test(tag)) {
    throw new RangeError("Incorrect locale information provided");
  }
  throw new IntlUnsupportedError(`${what} for locale "${tag}"`);
}

// ------------------------------------------------------------------ options

function optionsObject(options) {
  if (options === undefined) return Object.create(null);
  if (options === null) throw new TypeError("Cannot convert undefined or null to object");
  return Object(options);
}

function stringOption(options, name, allowed, fallback) {
  const value = options[name];
  if (value === undefined) return fallback;
  const text = String(value);
  if (!allowed.includes(text)) {
    throw new RangeError(`Value ${text} out of range for Intl.NumberFormat options property ${name}`);
  }
  return text;
}

function numberOption(value, name, min, max, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (Number.isNaN(n) || n < min || n > max) throw new RangeError(`${name} value is out of range.`);
  return Math.floor(n);
}

function groupingOption(options) {
  const value = options.useGrouping;
  if (value === undefined) return "auto";
  if (value === true) return "always";
  if (!value) return false;
  const text = String(value);
  if (text === "true" || text === "false") return "auto";
  if (!["min2", "auto", "always"].includes(text)) {
    throw new RangeError(`Value ${text} out of range for Intl.NumberFormat options property useGrouping`);
  }
  return text;
}

function requireDefault(options, name, allowed, supported) {
  const value = stringOption(options, name, allowed, supported);
  if (value !== supported) throw new IntlUnsupportedError(`Intl.NumberFormat option ${name}: "${value}"`);
}

// ------------------------------------------------------------------ decimals

// A non-negative decimal: `digits` with no leading zeros ("" for zero), and
// `point`, the number of digits before the decimal point (may be negative or
// beyond the digits).

function decimalFromString(text) {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return undefined;
  const whole = m[1];
  const fraction = m[2] ?? "";
  let digits = whole + fraction;
  let point = whole.length + Number(m[3] ?? 0);
  const lead = digits.search(/[1-9]/);
  if (lead === -1) return { digits: "", point: 0 };
  digits = digits.slice(lead);
  point -= lead;
  return { digits: digits.replace(/0+$/, ""), point };
}

/**
 * The mathematical value Intl formats: a sign and a decimal, or NaN or
 * infinity. Numbers use their shortest round-trip form, as ICU does;
 * strings and BigInts are exact.
 */
function mathematicalValue(value) {
  let v = value;
  if (typeof v === "object" && v !== null) v = toPrimitiveNumber(v);
  if (typeof v === "bigint") {
    const negative = v < 0n;
    return { negative, ...decimalFromString((negative ? -v : v).toString()) };
  }
  if (typeof v === "string") {
    const text = v.trim();
    if (text === "") return { negative: false, digits: "", point: 0 };
    if (/^0[xob]/i.test(text)) {
      try {
        return { negative: false, ...decimalFromString(BigInt(text).toString()) };
      } catch {
        return { nan: true };
      }
    }
    const m = /^([+-]?)(.*)$/.exec(text);
    if (m[2] === "Infinity") return { negative: m[1] === "-", infinite: true };
    const decimal = decimalFromString(m[2]);
    if (!decimal) return { nan: true };
    return { negative: m[1] === "-", ...decimal };
  }
  if (typeof v === "symbol") throw new TypeError("Cannot convert a Symbol value to a number");
  const n = Number(v);
  if (Number.isNaN(n)) return { nan: true };
  const negative = n < 0 || Object.is(n, -0);
  if (!Number.isFinite(n)) return { negative, infinite: true };
  return { negative, ...decimalFromString(String(Math.abs(n))) };
}

function toPrimitiveNumber(object) {
  const exotic = object[Symbol.toPrimitive];
  if (exotic !== undefined && exotic !== null) {
    const result = exotic.call(object, "number");
    if (typeof result === "object" && result !== null) throw new TypeError("Cannot convert object to primitive value");
    return result;
  }
  for (const name of ["valueOf", "toString"]) {
    const method = object[name];
    if (typeof method === "function") {
      const result = method.call(object);
      if (typeof result !== "object" || result === null) return result;
    }
  }
  throw new TypeError("Cannot convert object to primitive value");
}

/** Rounds to `fraction` digits after the point, halfway cases away from zero. */
function roundFraction({ digits, point }, fraction) {
  const keep = point + fraction;
  if (keep >= digits.length) return { digits, point };
  if (keep < 0) return { digits: "", point: 0 };
  let kept = digits.slice(0, keep);
  let newPoint = point;
  if (digits.charCodeAt(keep) >= 53 /* "5" */) {
    const up = increment(kept);
    if (up.length > kept.length) newPoint += 1;
    kept = up;
  }
  kept = kept.replace(/0+$/, "");
  return kept === "" ? { digits: "", point: 0 } : { digits: kept, point: newPoint };
}

function increment(digits) {
  let i = digits.length - 1;
  while (i >= 0 && digits[i] === "9") i--;
  if (i < 0) return "1" + "0".repeat(digits.length);
  return digits.slice(0, i) + String(Number(digits[i]) + 1) + "0".repeat(digits.length - i - 1);
}

// ------------------------------------------------------------------ NumberFormat

const internals = new WeakMap();

function slots(object, method) {
  const s = typeof object === "object" && object !== null ? internals.get(object) : undefined;
  if (!s) throw new TypeError(`Method ${method} called on incompatible receiver ${String(object)}`);
  return s;
}

function NumberFormat(locales, options) {
  if (!new.target) return new NumberFormat(locales, options);
  const opts = optionsObject(options);
  stringOption(opts, "localeMatcher", ["lookup", "best fit"], "best fit");
  const numberingSystem = opts.numberingSystem;
  if (numberingSystem !== undefined && String(numberingSystem) !== "latn") {
    if (!/^[a-z0-9]{3,8}(-[a-z0-9]{3,8})*$/i.test(String(numberingSystem))) {
      throw new RangeError(`Invalid numberingSystem : ${String(numberingSystem)}`);
    }
    throw new IntlUnsupportedError(`Intl.NumberFormat numbering system "${String(numberingSystem)}"`);
  }
  const locale = resolveLocale(locales, "Intl.NumberFormat");

  const style = stringOption(opts, "style", ["decimal", "percent", "currency", "unit"], "decimal");
  const currency = opts.currency;
  if (currency !== undefined && !/^[a-z]{3}$/i.test(String(currency))) {
    throw new RangeError(`Invalid currency code : ${String(currency)}`);
  }
  stringOption(opts, "currencyDisplay", ["code", "symbol", "narrowSymbol", "name"], "symbol");
  stringOption(opts, "currencySign", ["standard", "accounting"], "standard");
  stringOption(opts, "unitDisplay", ["short", "narrow", "long"], "short");
  if (style === "currency" || style === "unit") {
    throw new IntlUnsupportedError(`Intl.NumberFormat style "${style}"`);
  }
  const notation = stringOption(opts, "notation", ["standard", "scientific", "engineering", "compact"], "standard");
  if (notation !== "standard") throw new IntlUnsupportedError(`Intl.NumberFormat notation "${notation}"`);

  const minimumIntegerDigits = numberOption(opts.minimumIntegerDigits, "minimumIntegerDigits", 1, 21, 1);
  let minimumFractionDigits = opts.minimumFractionDigits;
  let maximumFractionDigits = opts.maximumFractionDigits;
  const significant = opts.minimumSignificantDigits !== undefined || opts.maximumSignificantDigits !== undefined;
  numberOption(opts.minimumSignificantDigits, "minimumSignificantDigits", 1, 21, 1);
  numberOption(opts.maximumSignificantDigits, "maximumSignificantDigits", 1, 21, 21);
  if (opts.roundingIncrement !== undefined && numberOption(opts.roundingIncrement, "roundingIncrement", 1, 5000, 1) !== 1) {
    throw new IntlUnsupportedError("Intl.NumberFormat option roundingIncrement");
  }
  requireDefault(opts, "roundingMode", ["ceil", "floor", "expand", "trunc", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven"], "halfExpand");
  requireDefault(opts, "roundingPriority", ["auto", "morePrecision", "lessPrecision"], "auto");
  requireDefault(opts, "trailingZeroDisplay", ["auto", "stripIfInteger"], "auto");
  if (significant) throw new IntlUnsupportedError("Intl.NumberFormat significant digits");

  const fractionDefaultMin = 0;
  const fractionDefaultMax = style === "percent" ? 0 : 3;
  minimumFractionDigits = numberOption(minimumFractionDigits, "minimumFractionDigits", 0, 100, undefined);
  maximumFractionDigits = numberOption(maximumFractionDigits, "maximumFractionDigits", 0, 100, undefined);
  if (minimumFractionDigits === undefined) {
    minimumFractionDigits = Math.min(fractionDefaultMin, maximumFractionDigits ?? fractionDefaultMin);
    maximumFractionDigits ??= Math.max(fractionDefaultMax, minimumFractionDigits);
  } else if (maximumFractionDigits === undefined) {
    maximumFractionDigits = Math.max(fractionDefaultMax, minimumFractionDigits);
  } else if (minimumFractionDigits > maximumFractionDigits) {
    throw new RangeError("maximumFractionDigits value is out of range.");
  }

  const useGrouping = groupingOption(opts);
  stringOption(opts, "compactDisplay", ["short", "long"], "short");
  requireDefault(opts, "signDisplay", ["auto", "never", "always", "exceptZero", "negative"], "auto");

  internals.set(this, {
    locale,
    style,
    minimumIntegerDigits,
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
    boundFormat: undefined
  });
}

/** The parts of `value`, in the shape formatToParts returns. */
function partsOf(s, value) {
  const m = mathematicalValue(value);
  const parts = [];
  if (m.nan) return [{ type: "nan", value: "NaN" }];
  if (m.negative) parts.push({ type: "minusSign", value: "-" });
  if (m.infinite) {
    parts.push({ type: "infinity", value: "∞" });
  } else {
    let decimal = { digits: m.digits, point: m.point };
    if (s.style === "percent" && decimal.digits !== "") decimal.point += 2;
    decimal = roundFraction(decimal, s.maximumFractionDigits);
    const { digits, point } = decimal;
    let integer = point <= 0 ? "" : digits.slice(0, point) + "0".repeat(Math.max(0, point - digits.length));
    let fraction = point < 0 ? "0".repeat(-point) + digits : digits.slice(Math.max(point, 0));
    integer = integer.padStart(s.minimumIntegerDigits, "0");
    fraction = fraction.replace(/0+$/, "").padEnd(s.minimumFractionDigits, "0");
    const groupFrom = s.useGrouping === false ? Infinity : s.useGrouping === "min2" ? 5 : 4;
    if (integer.length >= groupFrom) {
      const head = integer.length % 3 || 3;
      parts.push({ type: "integer", value: integer.slice(0, head) });
      for (let i = head; i < integer.length; i += 3) {
        parts.push({ type: "group", value: "," }, { type: "integer", value: integer.slice(i, i + 3) });
      }
    } else {
      parts.push({ type: "integer", value: integer });
    }
    if (fraction !== "") parts.push({ type: "decimal", value: "." }, { type: "fraction", value: fraction });
  }
  if (s.style === "percent") parts.push({ type: "percentSign", value: "%" });
  return parts;
}

Object.defineProperty(NumberFormat, "length", { value: 0 });
Object.defineProperty(NumberFormat, "prototype", { writable: false, enumerable: false, configurable: false });
Object.defineProperties(NumberFormat.prototype, {
  format: {
    configurable: true,
    enumerable: false,
    get() {
      const s = slots(this, "get Intl.NumberFormat.prototype.format");
      s.boundFormat ??= Object.defineProperty(
        (value) => partsOf(s, value).map((p) => p.value).join(""),
        "name",
        { value: "" }
      );
      return s.boundFormat;
    }
  },
  formatToParts: {
    configurable: true,
    writable: true,
    enumerable: false,
    value: function formatToParts(value) {
      return partsOf(slots(this, "Intl.NumberFormat.prototype.formatToParts"), value);
    }
  },
  formatRange: {
    configurable: true,
    writable: true,
    enumerable: false,
    value: function formatRange() {
      slots(this, "Intl.NumberFormat.prototype.formatRange");
      throw new IntlUnsupportedError("Intl.NumberFormat.prototype.formatRange");
    }
  },
  formatRangeToParts: {
    configurable: true,
    writable: true,
    enumerable: false,
    value: function formatRangeToParts() {
      slots(this, "Intl.NumberFormat.prototype.formatRangeToParts");
      throw new IntlUnsupportedError("Intl.NumberFormat.prototype.formatRangeToParts");
    }
  },
  resolvedOptions: {
    configurable: true,
    writable: true,
    enumerable: false,
    value: function resolvedOptions() {
      const s = slots(this, "Intl.NumberFormat.prototype.resolvedOptions");
      return {
        locale: s.locale,
        numberingSystem: "latn",
        style: s.style,
        minimumIntegerDigits: s.minimumIntegerDigits,
        minimumFractionDigits: s.minimumFractionDigits,
        maximumFractionDigits: s.maximumFractionDigits,
        useGrouping: s.useGrouping,
        notation: "standard",
        signDisplay: "auto",
        roundingIncrement: 1,
        roundingMode: "halfExpand",
        roundingPriority: "auto",
        trailingZeroDisplay: "auto"
      };
    }
  },
  [Symbol.toStringTag]: { value: "Intl.NumberFormat", configurable: true }
});
Object.defineProperty(NumberFormat, "supportedLocalesOf", {
  configurable: true,
  writable: true,
  value: function supportedLocalesOf(locales, options) {
    optionsObject(options);
    return localeList(locales).map(supportedLocale).filter((l) => l !== undefined);
  }
});

// ------------------------------------------------------------------ dates

function checkDateArguments(locales, options, method) {
  resolveLocale(locales, `Date.prototype.${method}`);
  if (options !== undefined) throw new IntlUnsupportedError(`Date.prototype.${method} options`);
}

function datePart(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function timePart(date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes}:${seconds} ${hours < 12 ? "AM" : "PM"}`;
}

function formatDate(date, method, locales, options, render) {
  if (!(date instanceof Date)) throw new TypeError(`this is not a Date object.`);
  checkDateArguments(locales, options, method);
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  // ICU writes years before 1 AD with an era; not covered here.
  if (date.getFullYear() < 1) throw new IntlUnsupportedError(`Date.prototype.${method} for years before 1 AD`);
  return render(date);
}

// ------------------------------------------------------------------ install

function define(target, name, value) {
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

export function installIntl(global) {
  if (global.Intl !== undefined) return;
  const Intl = {};
  define(Intl, "NumberFormat", NumberFormat);
  Object.defineProperty(Intl, Symbol.toStringTag, { value: "Intl", configurable: true });
  define(global, "Intl", Intl);

  define(Number.prototype, "toLocaleString", function toLocaleString(locales, options) {
    if (typeof this !== "number" && !(this instanceof Number)) {
      throw new TypeError("Number.prototype.toLocaleString requires that 'this' be a Number");
    }
    return new NumberFormat(locales, options).format(Number(this));
  });
  define(BigInt.prototype, "toLocaleString", function toLocaleString(locales, options) {
    if (typeof this !== "bigint" && Object.prototype.toString.call(this) !== "[object BigInt]") {
      throw new TypeError("BigInt.prototype.toLocaleString requires that 'this' be a BigInt");
    }
    return new NumberFormat(locales, options).format(BigInt.prototype.valueOf.call(this));
  });
  define(Date.prototype, "toLocaleString", function toLocaleString(locales, options) {
    return formatDate(this, "toLocaleString", locales, options, (d) => `${datePart(d)}, ${timePart(d)}`);
  });
  define(Date.prototype, "toLocaleDateString", function toLocaleDateString(locales, options) {
    return formatDate(this, "toLocaleDateString", locales, options, datePart);
  });
  define(Date.prototype, "toLocaleTimeString", function toLocaleTimeString(locales, options) {
    return formatDate(this, "toLocaleTimeString", locales, options, timePart);
  });
}
