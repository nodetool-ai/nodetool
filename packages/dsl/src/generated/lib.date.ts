// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Today — lib.date.Today
export interface TodayInputs {
}

export function today(inputs?: TodayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.Today", (inputs ?? {}) as Record<string, unknown>);
}

// Now — lib.date.Now
export interface NowInputs {
}

export function now(inputs?: NowInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.Now", (inputs ?? {}) as Record<string, unknown>);
}

// Parse Date — lib.date.ParseDate
export interface ParseDateInputs {
  date_string?: Connectable<string>;
  input_format?: Connectable<unknown>;
}

export function parseDate(inputs: ParseDateInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.ParseDate", inputs as Record<string, unknown>);
}

// Parse Date Time — lib.date.ParseDateTime
export interface ParseDateTimeInputs {
  datetime_string?: Connectable<string>;
  input_format?: Connectable<unknown>;
}

export function parseDateTime(inputs: ParseDateTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.ParseDateTime", inputs as Record<string, unknown>);
}

// Add Time Delta — lib.date.AddTimeDelta
export interface AddTimeDeltaInputs {
  input_datetime?: Connectable<unknown>;
  days?: Connectable<number>;
  hours?: Connectable<number>;
  minutes?: Connectable<number>;
}

export function addTimeDelta(inputs: AddTimeDeltaInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.AddTimeDelta", inputs as Record<string, unknown>);
}

// Date Difference — lib.date.DateDifference
export interface DateDifferenceInputs {
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
}

export interface DateDifferenceOutputs {
  total_seconds: OutputHandle<number>;
  days: OutputHandle<number>;
  hours: OutputHandle<number>;
  minutes: OutputHandle<number>;
  seconds: OutputHandle<number>;
}

export function dateDifference(inputs: DateDifferenceInputs): DslNode<DateDifferenceOutputs> {
  return createNode("lib.date.DateDifference", inputs as Record<string, unknown>, { multiOutput: true });
}

// Format Date Time — lib.date.FormatDateTime
export interface FormatDateTimeInputs {
  input_datetime?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
}

export function formatDateTime(inputs: FormatDateTimeInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.date.FormatDateTime", inputs as Record<string, unknown>);
}

// Get Weekday — lib.date.GetWeekday
export interface GetWeekdayInputs {
  input_datetime?: Connectable<unknown>;
  as_name?: Connectable<boolean>;
}

export function getWeekday(inputs: GetWeekdayInputs): DslNode<SingleOutput<string | number>> {
  return createNode("lib.date.GetWeekday", inputs as Record<string, unknown>);
}

// Date Range — lib.date.DateRange
export interface DateRangeInputs {
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
  step_days?: Connectable<number>;
}

export function dateRange(inputs: DateRangeInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("lib.date.DateRange", inputs as Record<string, unknown>);
}

// Is Date In Range — lib.date.IsDateInRange
export interface IsDateInRangeInputs {
  check_date?: Connectable<unknown>;
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
  inclusive?: Connectable<boolean>;
}

export function isDateInRange(inputs: IsDateInRangeInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.date.IsDateInRange", inputs as Record<string, unknown>);
}

// Get Quarter — lib.date.GetQuarter
export interface GetQuarterInputs {
  input_datetime?: Connectable<unknown>;
}

export interface GetQuarterOutputs {
  quarter: OutputHandle<number>;
  quarter_start: OutputHandle<unknown>;
  quarter_end: OutputHandle<unknown>;
}

export function getQuarter(inputs: GetQuarterInputs): DslNode<GetQuarterOutputs> {
  return createNode("lib.date.GetQuarter", inputs as Record<string, unknown>, { multiOutput: true });
}

// Date To Datetime — lib.date.DateToDatetime
export interface DateToDatetimeInputs {
  input_date?: Connectable<unknown>;
}

export function dateToDatetime(inputs: DateToDatetimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.DateToDatetime", inputs as Record<string, unknown>);
}

// Datetime To Date — lib.date.DatetimeToDate
export interface DatetimeToDateInputs {
  input_datetime?: Connectable<unknown>;
}

export function datetimeToDate(inputs: DatetimeToDateInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.DatetimeToDate", inputs as Record<string, unknown>);
}

// Relative Time — lib.date.RelativeTime
export interface RelativeTimeInputs {
  amount?: Connectable<number>;
  unit?: Connectable<unknown>;
  direction?: Connectable<unknown>;
}

export function relativeTime(inputs: RelativeTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.RelativeTime", inputs as Record<string, unknown>);
}

// Boundary Time — lib.date.BoundaryTime
export interface BoundaryTimeInputs {
  input_datetime?: Connectable<unknown>;
  period?: Connectable<unknown>;
  boundary?: Connectable<unknown>;
  start_monday?: Connectable<boolean>;
}

export function boundaryTime(inputs: BoundaryTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.date.BoundaryTime", inputs as Record<string, unknown>);
}
