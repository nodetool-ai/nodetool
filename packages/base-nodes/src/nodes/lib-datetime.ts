/**
 * Date/time workflow nodes — pure native-Date implementations.
 *
 * These nodes exist so users can do common date work (format, shift, diff,
 * compare, round to a period) without needing a library inside the JS
 * sandbox. The old dayjs snippets were converted into these nodes.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

/** Units supported by DateAdd/DateDiff/DateStartEnd. */
export type DateUnit =
  | "millisecond"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

const DATE_UNITS: DateUnit[] = [
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year"
];

const MS = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000
} as const;

/** Parse an input into a Date. Throws with a friendly error on failure. */
export function parseDate(input: unknown): Date {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string" && input.trim()) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
    throw new Error(`Could not parse date: ${JSON.stringify(input)}`);
  }
  if (input === null || input === undefined || input === "") {
    return new Date();
  }
  throw new Error(`Could not parse date: ${JSON.stringify(input)}`);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Format a Date using a subset of dayjs-compatible tokens:
 *   YYYY / YY     — 4- or 2-digit year
 *   MM / M        — month
 *   DD / D        — day of month
 *   HH / H        — 24h hour
 *   mm / m        — minute
 *   ss / s        — second
 *   SSS           — milliseconds
 *   Z             — ISO offset (e.g. +01:00 or Z)
 *   [literal]     — escaped literal
 */
export function formatDate(date: Date, pattern: string): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const mi = date.getMinutes();
  const s = date.getSeconds();
  const ms = date.getMilliseconds();

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMinutes);
  const offsetStr =
    offsetMinutes === 0
      ? "Z"
      : `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`;

  // Handle escape sequences first — everything inside [] passes through raw.
  const out: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        out.push(pattern.slice(i + 1));
        break;
      }
      out.push(pattern.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    // Match longest token first so "YYYY" isn't partially matched as "YY".
    const rest = pattern.slice(i);
    const match = /^(YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS|Z)/.exec(rest);
    if (match) {
      switch (match[0]) {
        case "YYYY":
          out.push(pad(y, 4));
          break;
        case "YY":
          out.push(pad(y % 100));
          break;
        case "MM":
          out.push(pad(m));
          break;
        case "M":
          out.push(String(m));
          break;
        case "DD":
          out.push(pad(d));
          break;
        case "D":
          out.push(String(d));
          break;
        case "HH":
          out.push(pad(h));
          break;
        case "H":
          out.push(String(h));
          break;
        case "mm":
          out.push(pad(mi));
          break;
        case "m":
          out.push(String(mi));
          break;
        case "ss":
          out.push(pad(s));
          break;
        case "s":
          out.push(String(s));
          break;
        case "SSS":
          out.push(pad(ms, 3));
          break;
        case "Z":
          out.push(offsetStr);
          break;
      }
      i += match[0].length;
      continue;
    }
    out.push(pattern[i]);
    i += 1;
  }
  return out.join("");
}

/**
 * Add (or subtract, when amount is negative) a number of units to a date.
 * Calendar-aware for month and year.
 */
export function addUnits(date: Date, amount: number, unit: DateUnit): Date {
  const out = new Date(date.getTime());
  if (unit === "month") {
    out.setMonth(out.getMonth() + amount);
    return out;
  }
  if (unit === "year") {
    out.setFullYear(out.getFullYear() + amount);
    return out;
  }
  const ms = MS[unit];
  return new Date(date.getTime() + amount * ms);
}

/**
 * Difference between two dates expressed in `unit`, truncated toward zero.
 * For months and years, uses calendar-aware math (matches dayjs default).
 */
export function diffUnits(a: Date, b: Date, unit: DateUnit): number {
  if (unit === "year") {
    let years = a.getFullYear() - b.getFullYear();
    // subtract 1 if `a` hasn't yet reached the anniversary of `b`
    const before =
      a.getMonth() < b.getMonth() ||
      (a.getMonth() === b.getMonth() && a.getDate() < b.getDate());
    if (years > 0 && before) years -= 1;
    if (years < 0 && !before) years += 1;
    return years;
  }
  if (unit === "month") {
    let months =
      (a.getFullYear() - b.getFullYear()) * 12 +
      (a.getMonth() - b.getMonth());
    if (months > 0 && a.getDate() < b.getDate()) months -= 1;
    if (months < 0 && a.getDate() > b.getDate()) months += 1;
    return months;
  }
  const diff = a.getTime() - b.getTime();
  return Math.trunc(diff / MS[unit]);
}

/** Return a new date at the start of `unit` (local time). */
export function startOf(date: Date, unit: DateUnit): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case "year":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    case "week": {
      // Week starts on Sunday (0). dayjs default also Sunday.
      const dayIdx = d.getDay();
      d.setDate(d.getDate() - dayIdx);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "day":
      d.setHours(0, 0, 0, 0);
      return d;
    case "hour":
      d.setMinutes(0, 0, 0);
      return d;
    case "minute":
      d.setSeconds(0, 0);
      return d;
    case "second":
      d.setMilliseconds(0);
      return d;
    case "millisecond":
      return d;
  }
}

/** Return a new date at the end of `unit` (local time, millisecond precision). */
export function endOf(date: Date, unit: DateUnit): Date {
  const next = startOf(
    addUnits(
      startOf(date, unit),
      1,
      unit === "millisecond" ? "millisecond" : unit
    ),
    unit === "millisecond" ? "millisecond" : unit
  );
  return new Date(next.getTime() - 1);
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export class DateNowNode extends BaseNode {
  static readonly nodeType = "lib.datetime.Now";
  static readonly title = "Now";
  static readonly description =
    "Return the current date as ISO string, epoch ms, and a Date value.\n    date, time, now, current";
  static readonly metadataOutputTypes = {
    iso: "str",
    epoch_ms: "int",
    date: "datetime"
  };

  async process(): Promise<Record<string, unknown>> {
    const d = new Date();
    return {
      iso: d.toISOString(),
      epoch_ms: d.getTime(),
      date: d
    };
  }
}

export class FormatDateNode extends BaseNode {
  static readonly nodeType = "lib.datetime.Format";
  static readonly title = "Format Date";
  static readonly description =
    "Parse a date string/number/Date and format it. Supports tokens YYYY, MM, DD, HH, mm, ss, SSS, Z. Use [brackets] for literals.\n    date, format, parse, strftime";
  static readonly metadataOutputTypes = {
    formatted: "str",
    iso: "str",
    epoch_ms: "int"
  };

  @prop({
    type: "any",
    default: "",
    title: "Date",
    description: "Date string, number (epoch ms), or Date."
  })
  declare date: any;

  @prop({
    type: "str",
    default: "YYYY-MM-DD HH:mm:ss",
    title: "Pattern",
    description: "Format pattern (YYYY, MM, DD, HH, mm, ss, SSS, Z)."
  })
  declare pattern: any;

  async process(): Promise<Record<string, unknown>> {
    const d = parseDate(this.date);
    const pattern = String(this.pattern ?? "YYYY-MM-DD HH:mm:ss");
    return {
      formatted: formatDate(d, pattern),
      iso: d.toISOString(),
      epoch_ms: d.getTime()
    };
  }
}

export class DateAddNode extends BaseNode {
  static readonly nodeType = "lib.datetime.Add";
  static readonly title = "Add / Subtract Time";
  static readonly description =
    "Add (or subtract, when amount is negative) a number of time units to a date.\n    date, add, subtract, shift, offset";
  static readonly metadataOutputTypes = {
    iso: "str",
    epoch_ms: "int",
    date: "datetime"
  };

  @prop({
    type: "any",
    default: "",
    title: "Date",
    description: "Input date."
  })
  declare date: any;

  @prop({
    type: "int",
    default: 0,
    title: "Amount",
    description: "Amount to add (use negative to subtract)."
  })
  declare amount: any;

  @prop({
    type: "enum",
    default: "day",
    title: "Unit",
    description: "Unit of time.",
    values: DATE_UNITS
  })
  declare unit: any;

  async process(): Promise<Record<string, unknown>> {
    const d = parseDate(this.date);
    const amount = Number(this.amount ?? 0);
    const unit = String(this.unit ?? "day") as DateUnit;
    if (!DATE_UNITS.includes(unit)) {
      throw new Error(`Unsupported date unit: ${unit}`);
    }
    const out = addUnits(d, amount, unit);
    return {
      iso: out.toISOString(),
      epoch_ms: out.getTime(),
      date: out
    };
  }
}

export class DateDiffNode extends BaseNode {
  static readonly nodeType = "lib.datetime.Diff";
  static readonly title = "Date Difference";
  static readonly description =
    "Difference between two dates (date_a − date_b) expressed in the given unit.\n    date, diff, difference, between, duration";
  static readonly metadataOutputTypes = {
    diff: "int",
    is_before: "bool",
    is_after: "bool",
    is_same: "bool"
  };

  @prop({ type: "any", default: "", title: "Date A" })
  declare date_a: any;

  @prop({ type: "any", default: "", title: "Date B" })
  declare date_b: any;

  @prop({
    type: "enum",
    default: "day",
    title: "Unit",
    description: "Unit for the returned diff.",
    values: DATE_UNITS
  })
  declare unit: any;

  async process(): Promise<Record<string, unknown>> {
    const a = parseDate(this.date_a);
    const b = parseDate(this.date_b);
    const unit = String(this.unit ?? "day") as DateUnit;
    if (!DATE_UNITS.includes(unit)) {
      throw new Error(`Unsupported date unit: ${unit}`);
    }
    return {
      diff: diffUnits(a, b, unit),
      is_before: a.getTime() < b.getTime(),
      is_after: a.getTime() > b.getTime(),
      is_same: a.getTime() === b.getTime()
    };
  }
}

export class DateStartEndNode extends BaseNode {
  static readonly nodeType = "lib.datetime.StartEnd";
  static readonly title = "Start / End of Period";
  static readonly description =
    "Return the start and end of the given period (day, week, month, year).\n    date, start, end, period, boundary";
  static readonly metadataOutputTypes = {
    start_iso: "str",
    end_iso: "str",
    start: "datetime",
    end: "datetime"
  };

  @prop({ type: "any", default: "", title: "Date" })
  declare date: any;

  @prop({
    type: "enum",
    default: "day",
    title: "Unit",
    values: DATE_UNITS
  })
  declare unit: any;

  async process(): Promise<Record<string, unknown>> {
    const d = parseDate(this.date);
    const unit = String(this.unit ?? "day") as DateUnit;
    if (!DATE_UNITS.includes(unit)) {
      throw new Error(`Unsupported date unit: ${unit}`);
    }
    const start = startOf(d, unit);
    const end = endOf(d, unit);
    return {
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
      start,
      end
    };
  }
}

export const LIB_DATETIME_NODES = [
  DateNowNode,
  FormatDateNode,
  DateAddNode,
  DateDiffNode,
  DateStartEndNode
] as const;
