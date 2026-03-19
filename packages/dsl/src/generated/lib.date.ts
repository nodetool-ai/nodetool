// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Today — lib.date.Today
export interface TodayInputs {
}

export interface TodayOutputs {
  output: unknown;
}

export function today(inputs?: TodayInputs): DslNode<TodayOutputs, "output"> {
  return createNode("lib.date.Today", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Now — lib.date.Now
export interface NowInputs {
}

export interface NowOutputs {
  output: unknown;
}

export function now(inputs?: NowInputs): DslNode<NowOutputs, "output"> {
  return createNode("lib.date.Now", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Parse Date — lib.date.ParseDate
export interface ParseDateInputs {
  date_string?: Connectable<string>;
  input_format?: Connectable<unknown>;
}

export interface ParseDateOutputs {
  output: unknown;
}

export function parseDate(inputs: ParseDateInputs): DslNode<ParseDateOutputs, "output"> {
  return createNode("lib.date.ParseDate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Parse Date Time — lib.date.ParseDateTime
export interface ParseDateTimeInputs {
  datetime_string?: Connectable<string>;
  input_format?: Connectable<unknown>;
}

export interface ParseDateTimeOutputs {
  output: unknown;
}

export function parseDateTime(inputs: ParseDateTimeInputs): DslNode<ParseDateTimeOutputs, "output"> {
  return createNode("lib.date.ParseDateTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Add Time Delta — lib.date.AddTimeDelta
export interface AddTimeDeltaInputs {
  input_datetime?: Connectable<unknown>;
  days?: Connectable<number>;
  hours?: Connectable<number>;
  minutes?: Connectable<number>;
}

export interface AddTimeDeltaOutputs {
  output: unknown;
}

export function addTimeDelta(inputs: AddTimeDeltaInputs): DslNode<AddTimeDeltaOutputs, "output"> {
  return createNode("lib.date.AddTimeDelta", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Date Difference — lib.date.DateDifference
export interface DateDifferenceInputs {
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
}

export interface DateDifferenceOutputs {
  total_seconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function dateDifference(inputs: DateDifferenceInputs): DslNode<DateDifferenceOutputs> {
  return createNode("lib.date.DateDifference", inputs as Record<string, unknown>, { outputNames: ["total_seconds", "days", "hours", "minutes", "seconds"] });
}

// Format Date Time — lib.date.FormatDateTime
export interface FormatDateTimeInputs {
  input_datetime?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
}

export interface FormatDateTimeOutputs {
  output: string;
}

export function formatDateTime(inputs: FormatDateTimeInputs): DslNode<FormatDateTimeOutputs, "output"> {
  return createNode("lib.date.FormatDateTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Weekday — lib.date.GetWeekday
export interface GetWeekdayInputs {
  input_datetime?: Connectable<unknown>;
  as_name?: Connectable<boolean>;
}

export interface GetWeekdayOutputs {
  output: string | number;
}

export function getWeekday(inputs: GetWeekdayInputs): DslNode<GetWeekdayOutputs, "output"> {
  return createNode("lib.date.GetWeekday", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Date Range — lib.date.DateRange
export interface DateRangeInputs {
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
  step_days?: Connectable<number>;
}

export interface DateRangeOutputs {
  output: unknown[];
}

export function dateRange(inputs: DateRangeInputs): DslNode<DateRangeOutputs, "output"> {
  return createNode("lib.date.DateRange", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Is Date In Range — lib.date.IsDateInRange
export interface IsDateInRangeInputs {
  check_date?: Connectable<unknown>;
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
  inclusive?: Connectable<boolean>;
}

export interface IsDateInRangeOutputs {
  output: boolean;
}

export function isDateInRange(inputs: IsDateInRangeInputs): DslNode<IsDateInRangeOutputs, "output"> {
  return createNode("lib.date.IsDateInRange", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Quarter — lib.date.GetQuarter
export interface GetQuarterInputs {
  input_datetime?: Connectable<unknown>;
}

export interface GetQuarterOutputs {
  quarter: number;
  quarter_start: unknown;
  quarter_end: unknown;
}

export function getQuarter(inputs: GetQuarterInputs): DslNode<GetQuarterOutputs> {
  return createNode("lib.date.GetQuarter", inputs as Record<string, unknown>, { outputNames: ["quarter", "quarter_start", "quarter_end"] });
}

// Date To Datetime — lib.date.DateToDatetime
export interface DateToDatetimeInputs {
  input_date?: Connectable<unknown>;
}

export interface DateToDatetimeOutputs {
  output: unknown;
}

export function dateToDatetime(inputs: DateToDatetimeInputs): DslNode<DateToDatetimeOutputs, "output"> {
  return createNode("lib.date.DateToDatetime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Datetime To Date — lib.date.DatetimeToDate
export interface DatetimeToDateInputs {
  input_datetime?: Connectable<unknown>;
}

export interface DatetimeToDateOutputs {
  output: unknown;
}

export function datetimeToDate(inputs: DatetimeToDateInputs): DslNode<DatetimeToDateOutputs, "output"> {
  return createNode("lib.date.DatetimeToDate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Relative Time — lib.date.RelativeTime
export interface RelativeTimeInputs {
  amount?: Connectable<number>;
  unit?: Connectable<unknown>;
  direction?: Connectable<unknown>;
}

export interface RelativeTimeOutputs {
  output: unknown;
}

export function relativeTime(inputs: RelativeTimeInputs): DslNode<RelativeTimeOutputs, "output"> {
  return createNode("lib.date.RelativeTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Boundary Time — lib.date.BoundaryTime
export interface BoundaryTimeInputs {
  input_datetime?: Connectable<unknown>;
  period?: Connectable<unknown>;
  boundary?: Connectable<unknown>;
  start_monday?: Connectable<boolean>;
}

export interface BoundaryTimeOutputs {
  output: unknown;
}

export function boundaryTime(inputs: BoundaryTimeInputs): DslNode<BoundaryTimeOutputs, "output"> {
  return createNode("lib.date.BoundaryTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
