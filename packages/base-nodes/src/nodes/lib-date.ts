import { BaseNode, prop } from "@nodetool/node-sdk";

type DateValue = { year: number; month: number; day: number };
type DateTimeValue = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  tzinfo?: string;
  utc_offset?: string;
};

type DateFormat =
  | "%Y-%m-%d"
  | "%m/%d/%Y"
  | "%d/%m/%Y"
  | "%B %d, %Y"
  | "%Y%m%d"
  | "%Y%m%d_%H%M%S"
  | "%Y-%m-%dT%H:%M:%S"
  | "%Y-%m-%dT%H:%M:%S%z";

type TimeDirection = "past" | "future";
type TimeUnit = "hours" | "days" | "months";
type BoundaryType = "start" | "end";
type PeriodType = "day" | "week" | "month" | "year";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function isDateTimeValue(value: unknown): value is DateTimeValue {
  return !!value && typeof value === "object" && "year" in (value as object) && "hour" in (value as object);
}

function isDateValue(value: unknown): value is DateValue {
  return !!value && typeof value === "object" && "year" in (value as object) && !("hour" in (value as object));
}

function toDate(input: unknown): Date {
  if (isDateTimeValue(input)) {
    const tzOffset = String(input.utc_offset ?? "");
    if (tzOffset && /^[+-]\d{2}:?\d{2}$/.test(tzOffset)) {
      const normalized = tzOffset.includes(":") ? tzOffset : `${tzOffset.slice(0, 3)}:${tzOffset.slice(3)}`;
      const iso = `${String(input.year).padStart(4, "0")}-${String(input.month).padStart(2, "0")}-${String(
        input.day
      ).padStart(2, "0")}T${String(input.hour).padStart(2, "0")}:${String(input.minute).padStart(2, "0")}:${String(
        input.second
      ).padStart(2, "0")}.${String(input.millisecond ?? 0).padStart(3, "0")}${normalized}`;
      return new Date(iso);
    }
    return new Date(
      Number(input.year),
      Number(input.month) - 1,
      Number(input.day),
      Number(input.hour),
      Number(input.minute),
      Number(input.second),
      Number(input.millisecond ?? 0)
    );
  }
  if (isDateValue(input)) {
    return new Date(Number(input.year), Number(input.month) - 1, Number(input.day), 0, 0, 0, 0);
  }
  if (typeof input === "string") {
    return new Date(input);
  }
  return new Date();
}

function toDateValue(date: Date): DateValue {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function utcOffsetString(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}${mm}`;
}

function toDateTimeValue(date: Date): DateTimeValue {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
    tzinfo: date.toString().match(/\(([^)]+)\)$/)?.[1] ?? "",
    utc_offset: utcOffsetString(date),
  };
}

function formatDate(date: Date, format: DateFormat): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  switch (format) {
    case "%Y-%m-%d":
      return `${year}-${month}-${day}`;
    case "%m/%d/%Y":
      return `${month}/${day}/${year}`;
    case "%d/%m/%Y":
      return `${day}/${month}/${year}`;
    case "%B %d, %Y":
      return `${MONTHS[date.getMonth()]} ${day}, ${year}`;
    case "%Y%m%d":
      return `${year}${month}${day}`;
    case "%Y%m%d_%H%M%S":
      return `${year}${month}${day}_${hour}${minute}${second}`;
    case "%Y-%m-%dT%H:%M:%S":
      return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    case "%Y-%m-%dT%H:%M:%S%z":
      return `${year}-${month}-${day}T${hour}:${minute}:${second}${utcOffsetString(date)}`;
    default:
      return date.toISOString();
  }
}

function parseDateByFormat(value: string, format: DateFormat): Date {
  const s = value.trim();
  let m: RegExpMatchArray | null;

  if (format === "%Y-%m-%d" && (m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  if (format === "%m/%d/%Y" && (m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
    return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  }
  if (format === "%d/%m/%Y" && (m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  if (format === "%B %d, %Y" && (m = s.match(/^([A-Za-z]+)\s+(\d{2}),\s*(\d{4})$/))) {
    const monthToken = m[1];
    const monthIndex = MONTHS.findIndex((n) => n.toLowerCase() === monthToken.toLowerCase());
    if (monthIndex < 0) throw new Error(`Invalid date string: ${value}`);
    return new Date(Number(m[3]), monthIndex, Number(m[2]));
  }
  if (format === "%Y%m%d" && (m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  if (format === "%Y%m%d_%H%M%S" && (m = s.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/))) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  if (format === "%Y-%m-%dT%H:%M:%S" && (m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/))) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  if (
    format === "%Y-%m-%dT%H:%M:%S%z" &&
    (m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:?\d{2})$/))
  ) {
    const tz = m[7].includes(":") ? m[7] : `${m[7].slice(0, 3)}:${m[7].slice(3)}`;
    return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
  }

  throw new Error(`Invalid date string for format ${format}: ${value}`);
}

export class TodayLibNode extends BaseNode {
  static readonly nodeType = "lib.date.Today";
            static readonly title = "Today";
            static readonly description = "Get the current date in Date format.\n    date, today, now, current\n\n    Use cases:\n    - Get today's date for logging and timestamping\n    - Set default dates in forms and workflows\n    - Calculate date-based conditions\n    - Track daily operations and schedules";
        static readonly metadataOutputTypes = {
    output: "date"
  };
          static readonly exposeAsTool = true;
  

  async process(): Promise<Record<string, unknown>> {
    return { output: toDateValue(new Date()) };
  }
}

export class NowLibNode extends BaseNode {
  static readonly nodeType = "lib.date.Now";
            static readonly title = "Now";
            static readonly description = "Get the current date and time in UTC timezone.\n    datetime, current, now, timestamp\n\n    Use cases:\n    - Generate timestamps for events and logs\n    - Set default datetime values in workflows\n    - Calculate time-based conditions\n    - Track real-time operations";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;
  

  async process(): Promise<Record<string, unknown>> {
    return { output: toDateTimeValue(new Date()) };
  }
}

export class ParseDateLibNode extends BaseNode {
  static readonly nodeType = "lib.date.ParseDate";
            static readonly title = "Parse Date";
            static readonly description = "Parse a date string into a structured Date object.\n    date, parse, format, convert\n\n    Use cases:\n    - Convert date strings from various sources into standard format\n    - Extract date components from text input\n    - Validate and normalize date formats\n    - Process dates from CSV, JSON, or API responses";
        static readonly metadataOutputTypes = {
    output: "date"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Date String", description: "The date string to parse" })
  declare date_string: any;

  @prop({ type: "enum", default: "%Y-%m-%d", title: "Input Format", description: "Format of the input date string", values: [
  "%Y-%m-%d",
  "%m/%d/%Y",
  "%d/%m/%Y",
  "%B %d, %Y",
  "%Y%m%d",
  "%Y%m%d_%H%M%S",
  "%Y-%m-%dT%H:%M:%S",
  "%Y-%m-%dT%H:%M:%S%z",
  "%Y-%m-%dT%H:%M:%S%z"
] })
  declare input_format: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = String(inputs.date_string ?? this.date_string ?? "");
    const format = String(inputs.input_format ?? this.input_format ?? "%Y-%m-%d") as DateFormat;
    return { output: toDateValue(parseDateByFormat(value, format)) };
  }
}

export class ParseDateTimeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.ParseDateTime";
            static readonly title = "Parse Date Time";
            static readonly description = "Parse a date/time string into a structured Datetime object.\n    datetime, parse, format, convert\n\n    Use cases:\n    - Extract datetime components from strings\n    - Convert between datetime formats\n    - Process timestamps from logs and databases\n    - Standardize datetime data from multiple sources";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Datetime String", description: "The datetime string to parse" })
  declare datetime_string: any;

  @prop({ type: "enum", default: "%Y-%m-%d", title: "Input Format", description: "Format of the input datetime string", values: [
  "%Y-%m-%d",
  "%m/%d/%Y",
  "%d/%m/%Y",
  "%B %d, %Y",
  "%Y%m%d",
  "%Y%m%d_%H%M%S",
  "%Y-%m-%dT%H:%M:%S",
  "%Y-%m-%dT%H:%M:%S%z",
  "%Y-%m-%dT%H:%M:%S%z"
] })
  declare input_format: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = String(inputs.datetime_string ?? this.datetime_string ?? "");
    const format = String(inputs.input_format ?? this.input_format ?? "%Y-%m-%d") as DateFormat;
    return { output: toDateTimeValue(parseDateByFormat(value, format)) };
  }
}

export class AddTimeDeltaLibNode extends BaseNode {
  static readonly nodeType = "lib.date.AddTimeDelta";
            static readonly title = "Add Time Delta";
            static readonly description = "Add or subtract time from a datetime using specified intervals.\n    datetime, add, subtract, delta, offset\n\n    Use cases:\n    - Calculate future/past dates\n    - Generate date ranges\n    - Schedule events at specific intervals\n    - Calculate expiration dates and deadlines";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Input Datetime", description: "Starting datetime" })
  declare input_datetime: any;

  @prop({ type: "int", default: 0, title: "Days", description: "Number of days to add (negative to subtract)", min: -3650, max: 3650 })
  declare days: any;

  @prop({ type: "int", default: 0, title: "Hours", description: "Number of hours to add (negative to subtract)", min: -24, max: 24 })
  declare hours: any;

  @prop({ type: "int", default: 0, title: "Minutes", description: "Number of minutes to add (negative to subtract)", min: -60, max: 60 })
  declare minutes: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = toDate(inputs.input_datetime ?? this.input_datetime ?? toDateTimeValue(new Date()));
    const days = Number(inputs.days ?? this.days ?? 0);
    const hours = Number(inputs.hours ?? this.hours ?? 0);
    const minutes = Number(inputs.minutes ?? this.minutes ?? 0);
    const out = new Date(base.getTime() + ((days * 24 + hours) * 60 + minutes) * 60 * 1000);
    return { output: toDateTimeValue(out) };
  }
}

export class DateDifferenceLibNode extends BaseNode {
  static readonly nodeType = "lib.date.DateDifference";
            static readonly title = "Date Difference";
            static readonly description = "Calculate the time difference between two datetimes.\n    datetime, difference, duration, elapsed\n\n    Use cases:\n    - Calculate time periods between events\n    - Measure durations and elapsed time\n    - Track age or time since events\n    - Compute service level agreement (SLA) metrics";
        static readonly metadataOutputTypes = {
    total_seconds: "int",
    days: "int",
    hours: "int",
    minutes: "int",
    seconds: "int"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Start Date", description: "Start datetime" })
  declare start_date: any;

  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "End Date", description: "End datetime" })
  declare end_date: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const start = toDate(inputs.start_date ?? this.start_date ?? toDateTimeValue(new Date()));
    const end = toDate(inputs.end_date ?? this.end_date ?? toDateTimeValue(new Date()));
    const totalSeconds = Math.trunc((end.getTime() - start.getTime()) / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const rem = totalSeconds - days * 86400;
    const hours = Math.floor(rem / 3600);
    const minutes = Math.floor((rem % 3600) / 60);
    const seconds = rem % 60;
    return { total_seconds: totalSeconds, days, hours, minutes, seconds };
  }
}

export class FormatDateTimeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.FormatDateTime";
            static readonly title = "Format Date Time";
            static readonly description = "Convert a datetime object to a custom formatted string.\n    datetime, format, convert, string\n\n    Use cases:\n    - Standardize date formats across systems\n    - Prepare dates for different locales and regions\n    - Generate human-readable date strings\n    - Format dates for filenames and reports";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Input Datetime", description: "Datetime object to format" })
  declare input_datetime: any;

  @prop({ type: "enum", default: "%B %d, %Y", title: "Output Format", description: "Desired output format", values: [
  "%Y-%m-%d",
  "%m/%d/%Y",
  "%d/%m/%Y",
  "%B %d, %Y",
  "%Y%m%d",
  "%Y%m%d_%H%M%S",
  "%Y-%m-%dT%H:%M:%S",
  "%Y-%m-%dT%H:%M:%S%z",
  "%Y-%m-%dT%H:%M:%S%z"
] })
  declare output_format: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = toDate(inputs.input_datetime ?? this.input_datetime ?? toDateTimeValue(new Date()));
    const format = String(inputs.output_format ?? this.output_format ?? "%B %d, %Y") as DateFormat;
    return { output: formatDate(value, format) };
  }
}

export class GetWeekdayLibNode extends BaseNode {
  static readonly nodeType = "lib.date.GetWeekday";
            static readonly title = "Get Weekday";
            static readonly description = "Get the weekday name or number from a datetime.\n    datetime, weekday, name, day\n\n    Use cases:\n    - Get day names for scheduling and calendar displays\n    - Filter events by weekday\n    - Build day-of-week based logic\n    - Generate weekly reports";
        static readonly metadataOutputTypes = {
    output: "union[str, int]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Input Datetime", description: "Input datetime" })
  declare input_datetime: any;

  @prop({ type: "bool", default: true, title: "As Name", description: "Return weekday name instead of number (0-6)" })
  declare as_name: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = toDate(inputs.input_datetime ?? this.input_datetime ?? toDateTimeValue(new Date()));
    const asName = Boolean(inputs.as_name ?? this.as_name ?? true);
    return { output: asName ? value.toLocaleDateString("en-US", { weekday: "long" }) : (value.getDay() + 6) % 7 };
  }
}

export class DateRangeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.DateRange";
            static readonly title = "Date Range";
            static readonly description = "Generate a list of dates between start and end dates with custom intervals.\n    datetime, range, list, sequence\n\n    Use cases:\n    - Generate date sequences for reporting\n    - Create date-based iterations in workflows\n    - Build calendar views\n    - Schedule recurring events";
        static readonly metadataOutputTypes = {
    output: "list[datetime]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Start Date", description: "Start date of the range" })
  declare start_date: any;

  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "End Date", description: "End date of the range" })
  declare end_date: any;

  @prop({ type: "int", default: 1, title: "Step Days", description: "Number of days between each date" })
  declare step_days: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const start = toDate(inputs.start_date ?? this.start_date ?? toDateTimeValue(new Date()));
    const end = toDate(inputs.end_date ?? this.end_date ?? toDateTimeValue(new Date()));
    const stepDays = Number(inputs.step_days ?? this.step_days ?? 1);
    const output: DateTimeValue[] = [];

    for (let current = new Date(start); current <= end; current = new Date(current.getTime() + stepDays * 86400000)) {
      output.push(toDateTimeValue(current));
      if (stepDays <= 0) {
        break;
      }
    }
    return { output };
  }
}

export class IsDateInRangeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.IsDateInRange";
            static readonly title = "Is Date In Range";
            static readonly description = "Check if a date falls within a specified range with optional inclusivity.\n    datetime, range, check, validate\n\n    Use cases:\n    - Validate date ranges in forms and inputs\n    - Filter date-based data\n    - Check if events fall within specific periods\n    - Implement date-based access control";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Check Date", description: "Date to check" })
  declare check_date: any;

  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Start Date", description: "Start of date range" })
  declare start_date: any;

  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "End Date", description: "End of date range" })
  declare end_date: any;

  @prop({ type: "bool", default: true, title: "Inclusive", description: "Include start and end dates in range" })
  declare inclusive: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const check = toDate(inputs.check_date ?? this.check_date ?? toDateTimeValue(new Date())).getTime();
    const start = toDate(inputs.start_date ?? this.start_date ?? toDateTimeValue(new Date())).getTime();
    const end = toDate(inputs.end_date ?? this.end_date ?? toDateTimeValue(new Date())).getTime();
    const inclusive = Boolean(inputs.inclusive ?? this.inclusive ?? true);
    return { output: inclusive ? start <= check && check <= end : start < check && check < end };
  }
}

export class GetQuarterLibNode extends BaseNode {
  static readonly nodeType = "lib.date.GetQuarter";
            static readonly title = "Get Quarter";
            static readonly description = "Get the quarter number and start/end dates for a given datetime.\n    datetime, quarter, period, fiscal\n\n    Use cases:\n    - Financial reporting periods\n    - Quarterly analytics and metrics\n    - Business cycle calculations\n    - Group data by fiscal quarters";
        static readonly metadataOutputTypes = {
    quarter: "int",
    quarter_start: "datetime",
    quarter_end: "datetime"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Input Datetime", description: "Input datetime" })
  declare input_datetime: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = toDate(inputs.input_datetime ?? this.input_datetime ?? toDateTimeValue(new Date()));
    const quarter = Math.floor(value.getMonth() / 3) + 1;
    const quarterStart = new Date(value.getFullYear(), (quarter - 1) * 3, 1, 0, 0, 0, 0);
    const quarterEnd =
      quarter === 4
        ? new Date(value.getFullYear(), 11, 31, 23, 59, 59, 999)
        : new Date(value.getFullYear(), quarter * 3, 0, 23, 59, 59, 999);

    return {
      quarter,
      quarter_start: toDateTimeValue(quarterStart),
      quarter_end: toDateTimeValue(quarterEnd),
    };
  }
}

export class DateToDatetimeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.DateToDatetime";
            static readonly title = "Date To Datetime";
            static readonly description = "Convert a Date object to a Datetime object at midnight.\n    date, datetime, convert, transformation\n\n    Use cases:\n    - Convert dates to datetime for time calculations\n    - Standardize date types in workflows\n    - Prepare dates for timestamp comparisons\n    - Convert legacy date formats";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "date", default: {
  "type": "date",
  "year": 0,
  "month": 0,
  "day": 0
}, title: "Input Date", description: "Date to convert" })
  declare input_date: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = toDate(inputs.input_date ?? this.input_date ?? toDateValue(new Date()));
    base.setHours(0, 0, 0, 0);
    return { output: toDateTimeValue(base) };
  }
}

export class DatetimeToDateLibNode extends BaseNode {
  static readonly nodeType = "lib.date.DatetimeToDate";
            static readonly title = "Datetime To Date";
            static readonly description = "Convert a Datetime object to a Date object, removing time component.\n    date, datetime, convert, transformation\n\n    Use cases:\n    - Extract date portion from timestamps\n    - Remove time information for date-only comparisons\n    - Normalize datetime data to dates\n    - Simplify date-based grouping";
        static readonly metadataOutputTypes = {
    output: "date"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Input Datetime", description: "Datetime to convert" })
  declare input_datetime: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      output: toDateValue(toDate(inputs.input_datetime ?? this.input_datetime ?? toDateTimeValue(new Date()))),
    };
  }
}

export class RelativeTimeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.RelativeTime";
            static readonly title = "Relative Time";
            static readonly description = "Get datetime relative to current time (past or future) with configurable units.\n    datetime, past, future, relative, hours, days, months\n\n    Use cases:\n    - Calculate past or future dates dynamically\n    - Generate relative timestamps for scheduling\n    - Set expiration times\n    - Create time-based filters";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "int", default: 1, title: "Amount", description: "Amount of time units", min: 0 })
  declare amount: any;

  @prop({ type: "enum", default: "days", title: "Unit", description: "Time unit type", values: [
  "hours",
  "days",
  "months"
] })
  declare unit: any;

  @prop({ type: "enum", default: "future", title: "Direction", description: "Past or future", values: [
  "past",
  "future"
] })
  declare direction: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const amount = Number(inputs.amount ?? this.amount ?? 1);
    const unit = String(inputs.unit ?? this.unit ?? "days") as TimeUnit;
    const direction = String(inputs.direction ?? this.direction ?? "future") as TimeDirection;
    const sign = direction === "past" ? -1 : 1;
    const current = new Date();

    if (unit === "hours") {
      return { output: toDateTimeValue(new Date(current.getTime() + sign * amount * 3600000)) };
    }
    if (unit === "days") {
      return { output: toDateTimeValue(new Date(current.getTime() + sign * amount * 86400000)) };
    }

    let year = current.getUTCFullYear();
    let month = current.getUTCMonth() + 1 + sign * amount;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    while (month > 12) {
      month -= 12;
      year += 1;
    }

    const day = current.getUTCDate();
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > maxDay) {
      throw new Error("day is out of range for month");
    }

    const out = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        current.getUTCHours(),
        current.getUTCMinutes(),
        current.getUTCSeconds(),
        current.getUTCMilliseconds()
      )
    );
    return { output: toDateTimeValue(out) };
  }
}

export class BoundaryTimeLibNode extends BaseNode {
  static readonly nodeType = "lib.date.BoundaryTime";
            static readonly title = "Boundary Time";
            static readonly description = "Get the start or end boundary of a time period (day, week, month, year).\n    datetime, start, end, boundary, day, week, month, year\n\n    Use cases:\n    - Get period boundaries for reporting and analytics\n    - Normalize dates to period starts/ends\n    - Calculate billing cycles\n    - Group data by time periods";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "datetime", default: {
  "type": "datetime",
  "year": 0,
  "month": 0,
  "day": 0,
  "hour": 0,
  "minute": 0,
  "second": 0,
  "microsecond": 0,
  "tzinfo": "UTC",
  "utc_offset": 0
}, title: "Input Datetime", description: "Input datetime" })
  declare input_datetime: any;

  @prop({ type: "enum", default: "day", title: "Period", description: "Time period type", values: [
  "day",
  "week",
  "month",
  "year"
] })
  declare period: any;

  @prop({ type: "enum", default: "start", title: "Boundary", description: "Start or end of period", values: [
  "start",
  "end"
] })
  declare boundary: any;

  @prop({ type: "bool", default: true, title: "Start Monday", description: "For week period: Consider Monday as start of week (False for Sunday)" })
  declare start_monday: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dt = toDate(inputs.input_datetime ?? this.input_datetime ?? toDateTimeValue(new Date()));
    const period = String(inputs.period ?? this.period ?? "day") as PeriodType;
    const boundary = String(inputs.boundary ?? this.boundary ?? "start") as BoundaryType;
    const startMonday = Boolean(inputs.start_monday ?? this.start_monday ?? true);

    const out = new Date(dt);
    if (period === "day") {
      if (boundary === "start") out.setHours(0, 0, 0, 0);
      else out.setHours(23, 59, 59, 999);
      return { output: toDateTimeValue(out) };
    }

    if (period === "week") {
      const weekday = startMonday ? (out.getDay() + 6) % 7 : out.getDay();
      if (boundary === "start") {
        out.setDate(out.getDate() - weekday);
        out.setHours(0, 0, 0, 0);
      } else {
        out.setDate(out.getDate() + (6 - weekday));
        out.setHours(23, 59, 59, 999);
      }
      return { output: toDateTimeValue(out) };
    }

    if (period === "month") {
      if (boundary === "start") {
        out.setDate(1);
        out.setHours(0, 0, 0, 0);
      } else {
        out.setMonth(out.getMonth() + 1, 0);
        out.setHours(23, 59, 59, 999);
      }
      return { output: toDateTimeValue(out) };
    }

    if (boundary === "start") {
      out.setMonth(0, 1);
      out.setHours(0, 0, 0, 0);
    } else {
      out.setMonth(11, 31);
      out.setHours(23, 59, 59, 999);
    }
    return { output: toDateTimeValue(out) };
  }
}

export const LIB_DATE_NODES = [
  TodayLibNode,
  NowLibNode,
  ParseDateLibNode,
  ParseDateTimeLibNode,
  AddTimeDeltaLibNode,
  DateDifferenceLibNode,
  FormatDateTimeLibNode,
  GetWeekdayLibNode,
  DateRangeLibNode,
  IsDateInRangeLibNode,
  GetQuarterLibNode,
  DateToDatetimeLibNode,
  DatetimeToDateLibNode,
  RelativeTimeLibNode,
  BoundaryTimeLibNode,
] as const;
