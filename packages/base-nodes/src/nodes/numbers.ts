import { BaseNode, prop } from "@nodetool/node-sdk";

type FilterNumberType =
  | "greater_than"
  | "less_than"
  | "equal_to"
  | "even"
  | "odd"
  | "positive"
  | "negative";

export class FilterNumberNode extends BaseNode {
  static readonly nodeType = "nodetool.numbers.FilterNumber";
            static readonly title = "Filter Number";
            static readonly description = "Filters a stream of numbers based on various numerical conditions.\n    filter, numbers, numeric, stream\n    \n    Use cases:\n    - Filter numbers by comparison (greater than, less than, equal to)\n    - Filter even/odd numbers\n    - Filter positive/negative numbers";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _filterType: FilterNumberType = "greater_than";
  private _compareValue = 0;
  @prop({ type: "float", default: 0, title: "Value", description: "Input number stream" })
  declare value: any;

  @prop({ type: "enum", default: "greater_than", title: "Filter Type", description: "The type of filter to apply", values: [
  "greater_than",
  "less_than",
  "equal_to",
  "even",
  "odd",
  "positive",
  "negative"
] })
  declare filter_type: any;

  @prop({ type: "float", default: 0, title: "Compare Value", description: "The comparison value (for greater_than, less_than, equal_to)" })
  declare compare_value: any;




  async initialize(): Promise<void> {
    this._filterType = String(
      this.filter_type ?? "greater_than"
    ) as FilterNumberType;
    this._compareValue = Number(this.compare_value ?? 0);
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("filter_type" in inputs) {
      this._filterType = String(inputs.filter_type) as FilterNumberType;
      return {};
    }
    if ("compare_value" in inputs) {
      this._compareValue = Number(inputs.compare_value);
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }

    const num = inputs.value;
    if (typeof num !== "number" || !Number.isFinite(num)) {
      return {};
    }

    let matched: boolean;
    switch (this._filterType) {
      case "greater_than":
        matched = num > this._compareValue;
        break;
      case "less_than":
        matched = num < this._compareValue;
        break;
      case "equal_to":
        matched = num === this._compareValue;
        break;
      case "even":
        matched = num % 2 === 0;
        break;
      case "odd":
        matched = num % 2 !== 0;
        break;
      case "positive":
        matched = num > 0;
        break;
      case "negative":
        matched = num < 0;
        break;
      default:
        matched = false;
    }

    if (!matched) {
      return {};
    }
    return { output: num };
  }
}

export class FilterNumberRangeNode extends BaseNode {
  static readonly nodeType = "nodetool.numbers.FilterNumberRange";
            static readonly title = "Filter Number Range";
            static readonly description = "Filters a stream of numbers to find values within a specified range.\n    filter, numbers, range, between, stream\n\n    Use cases:\n    - Find numbers within a specific range\n    - Filter data points within bounds\n    - Implement range-based filtering";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
          static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;

  private _minValue = 0;
  private _maxValue = 0;
  private _inclusive = true;
  @prop({ type: "float", default: 0, title: "Value", description: "Input number stream" })
  declare value: any;

  @prop({ type: "float", default: 0, title: "Min Value", description: "Minimum value" })
  declare min_value: any;

  @prop({ type: "float", default: 0, title: "Max Value", description: "Maximum value" })
  declare max_value: any;

  @prop({ type: "bool", default: true, title: "Inclusive", description: "Inclusive bounds" })
  declare inclusive: any;




  async initialize(): Promise<void> {
    this._minValue = Number(this.min_value ?? 0);
    this._maxValue = Number(this.max_value ?? 0);
    this._inclusive = Boolean(this.inclusive ?? true);
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("min_value" in inputs) {
      this._minValue = Number(inputs.min_value);
      return {};
    }
    if ("max_value" in inputs) {
      this._maxValue = Number(inputs.max_value);
      return {};
    }
    if ("inclusive" in inputs) {
      this._inclusive = Boolean(inputs.inclusive);
      return {};
    }
    if (!("value" in inputs)) {
      return {};
    }

    const num = inputs.value;
    if (typeof num !== "number" || !Number.isFinite(num)) {
      return {};
    }

    const matched = this._inclusive
      ? this._minValue <= num && num <= this._maxValue
      : this._minValue < num && num < this._maxValue;

    if (!matched) {
      return {};
    }
    return { output: num };
  }
}

export const NUMBERS_NODES = [FilterNumberNode, FilterNumberRangeNode] as const;
