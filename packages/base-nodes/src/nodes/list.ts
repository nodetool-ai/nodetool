import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function resolvePythonIndex(length: number, index: number): number {
  const resolved = index < 0 ? length + index : index;
  if (resolved < 0 || resolved >= length) {
    throw new Error("list index out of range");
  }
  return resolved;
}

function isNumberList(values: unknown[]): values is number[] {
  return values.every((x) => typeof x === "number" && Number.isFinite(x));
}

export class LengthNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Length";
            static readonly title = "Length";
            static readonly description = "Calculates the length of a list.\n    list, count, size\n\n    Use cases:\n    - Determine the number of elements in a list\n    - Check if a list is empty\n    - Validate list size constraints";
        static readonly metadataOutputTypes = {
    output: "int"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    return { output: Array.isArray(values) ? values.length : 0 };
  }
}

export class ListRangeNode extends BaseNode {
  static readonly nodeType = "nodetool.list.ListRange";
            static readonly title = "List Range";
            static readonly description = "Generates a list of integers within a specified range.\n    list, range, sequence, numbers\n\n    Use cases:\n    - Create numbered lists\n    - Generate index sequences\n    - Produce arithmetic progressions";
        static readonly metadataOutputTypes = {
    output: "list[int]"
  };
  
  @prop({ type: "int", default: 0, title: "Start" })
  declare start: any;

  @prop({ type: "int", default: 0, title: "Stop" })
  declare stop: any;

  @prop({ type: "int", default: 1, title: "Step" })
  declare step: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const start = Number(inputs.start ?? this.start ?? 0);
    const stop = Number(inputs.stop ?? this.stop ?? 0);
    const step = Number(inputs.step ?? this.step ?? 1);

    if (step === 0) {
      throw new Error("step must not be 0");
    }

    const output: number[] = [];
    if (step > 0) {
      for (let i = start; i < stop; i += step) {
        output.push(i);
      }
    } else {
      for (let i = start; i > stop; i += step) {
        output.push(i);
      }
    }

    return { output };
  }
}

export class GenerateSequenceNode extends BaseNode {
  static readonly nodeType = "nodetool.list.GenerateSequence";
            static readonly title = "Generate Sequence";
            static readonly description = "Iterates over a sequence of numbers.\n    list, range, sequence, numbers";
        static readonly metadataOutputTypes = {
    output: "int"
  };
  
            static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 0, title: "Start" })
  declare start: any;

  @prop({ type: "int", default: 0, title: "Stop" })
  declare stop: any;

  @prop({ type: "int", default: 1, title: "Step" })
  declare step: any;




  async process(_inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(
    inputs: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const start = Number(inputs.start ?? this.start ?? 0);
    const stop = Number(inputs.stop ?? this.stop ?? 0);
    const step = Number(inputs.step ?? this.step ?? 1);

    if (step === 0) {
      throw new Error("step must not be 0");
    }

    if (step > 0) {
      for (let i = start; i < stop; i += step) {
        yield { output: i };
      }
    } else {
      for (let i = start; i > stop; i += step) {
        yield { output: i };
      }
    }
  }
}

export class SliceNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Slice";
            static readonly title = "Slice";
            static readonly description = "Extracts a subset from a list using start, stop, and step indices.\n    list, slice, subset, extract\n\n    Notes:\n    - stop=0 means \"slice to end\" (no upper limit)\n    - Negative indices work as in Python (e.g., start=-3 for last 3 items)\n    Use cases:\n    - Extract a portion of a list\n    - Implement pagination\n    - Get every nth element";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values", description: "The input list to slice." })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Start", description: "Starting index (inclusive). Negative values count from end." })
  declare start: any;

  @prop({ type: "int", default: 0, title: "Stop", description: "Ending index (exclusive). 0 means slice to end of list." })
  declare stop: any;

  @prop({ type: "int", default: 1, title: "Step", description: "Step between elements. Negative for reverse order." })
  declare step: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    const start = Number(inputs.start ?? this.start ?? 0);
    const stop = Number(inputs.stop ?? this.stop ?? 0);
    const step = Number(inputs.step ?? this.step ?? 1);

    if (step === 0) {
      throw new Error("slice step cannot be zero");
    }

    const effectiveStop = stop === 0 ? undefined : stop;

    if (step === 1) {
      return { output: values.slice(start, effectiveStop) };
    }

    const result: unknown[] = [];
    const len = values.length;
    const normStart = start < 0 ? len + start : start;
    const normStop =
      effectiveStop === undefined ? (step > 0 ? len : -1) : effectiveStop < 0 ? len + effectiveStop : effectiveStop;

    if (step > 0) {
      for (let i = Math.max(0, normStart); i < Math.min(len, normStop); i += step) {
        result.push(values[i]);
      }
    } else {
      for (let i = Math.min(len - 1, normStart); i > Math.max(-1, normStop); i += step) {
        if (i >= 0 && i < len) {
          result.push(values[i]);
        }
      }
    }

    return { output: result };
  }
}

export class SelectElementsNode extends BaseNode {
  static readonly nodeType = "nodetool.list.SelectElements";
            static readonly title = "Select Elements";
            static readonly description = "Selects specific values from a list using index positions. Stop=0 selects elements until the end of the list.\n    list, select, index, extract\n\n    Use cases:\n    - Pick specific elements by their positions\n    - Rearrange list elements\n    - Create a new list from selected indices";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "list[int]", default: [], title: "Indices" })
  declare indices: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    const indices = toArray(inputs.indices ?? this.indices ?? []).map((x) =>
      Number(x)
    );

    const output = indices.map((index) => {
      const resolved = resolvePythonIndex(values.length, index);
      return values[resolved];
    });

    return { output };
  }
}

export class GetElementNode extends BaseNode {
  static readonly nodeType = "nodetool.list.GetElement";
            static readonly title = "Get Element";
            static readonly description = "Retrieves a single value from a list at a specific index.\n    list, get, extract, value\n\n    Use cases:\n    - Access a specific element by position\n    - Implement array-like indexing\n    - Extract the first or last element";
        static readonly metadataOutputTypes = {
    output: "any"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Index" })
  declare index: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    const index = Number(inputs.index ?? this.index ?? 0);

    if (!Array.isArray(values)) {
      throw new Error("values must be a list");
    }
    const resolved = resolvePythonIndex(values.length, index);
    return { output: values[resolved] };
  }
}

export class AppendNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Append";
            static readonly title = "Append";
            static readonly description = "Adds a value to the end of a list.\n    list, add, insert, extend\n\n    Use cases:\n    - Grow a list dynamically\n    - Add new elements to an existing list\n    - Implement a stack-like structure";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "any", default: [], title: "Value", description: "The value to append to the list." })
  declare value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    const value = inputs.value ?? this.value ?? null;
    const list = Array.isArray(values) ? [...values] : [values];
    list.push(value);
    return { output: list };
  }
}

export class ExtendNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Extend";
            static readonly title = "Extend";
            static readonly description = "Merges one list into another, extending the original list.\n    list, merge, concatenate, combine\n\n    Use cases:\n    - Combine multiple lists\n    - Add all elements from one list to another";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "list[any]", default: [], title: "Other Values" })
  declare other_values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    const other = toArray(inputs.other_values ?? this.other_values ?? []);
    return { output: [...values, ...other] };
  }
}

export class DedupeNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Dedupe";
            static readonly title = "Dedupe";
            static readonly description = "Removes duplicate elements from a list, ensuring uniqueness.\n    list, unique, distinct, deduplicate\n\n    Use cases:\n    - Remove redundant entries\n    - Create a set-like structure\n    - Ensure list elements are unique";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    return { output: [...new Set(values)] };
  }
}

export class ReverseNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Reverse";
            static readonly title = "Reverse";
            static readonly description = "Inverts the order of elements in a list.\n    list, reverse, invert, flip\n\n    Use cases:\n    - Reverse the order of a sequence";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    return { output: [...values].reverse() };
  }
}

export class RandomizeNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Randomize";
            static readonly title = "Randomize";
            static readonly description = "Randomly shuffles the elements of a list.\n    list, shuffle, random, order\n\n    Use cases:\n    - Randomize the order of items in a playlist\n    - Implement random sampling without replacement\n    - Create randomized data sets for testing";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const shuffled = [...toArray(inputs.values ?? this.values ?? [])];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return { output: shuffled };
  }
}

export class SortNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Sort";
            static readonly title = "Sort";
            static readonly description = "Sorts the elements of a list in ascending or descending order.\n    list, sort, order, arrange\n\n    Use cases:\n    - Organize data in a specific order\n    - Prepare data for binary search or other algorithms\n    - Rank items based on their values";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "enum", default: "ascending", title: "Order", values: [
  "ascending",
  "descending"
] })
  declare order: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = [...toArray(inputs.values ?? this.values ?? [])];
    const order = String(inputs.order ?? this.order ?? "ascending");
    values.sort();
    if (order === "descending") {
      values.reverse();
    }
    return { output: values };
  }
}

export class IntersectionNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Intersection";
            static readonly title = "Intersection";
            static readonly description = "Finds common elements between two lists.\n    list, set, intersection, common\n\n    Use cases:\n    - Find elements present in both lists\n    - Identify shared items between collections\n    - Filter for matching elements";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "List1" })
  declare list1: any;

  @prop({ type: "list[any]", default: [], title: "List2" })
  declare list2: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const list1 = new Set(toArray(inputs.list1 ?? this.list1 ?? []));
    const list2 = new Set(toArray(inputs.list2 ?? this.list2 ?? []));
    return { output: [...list1].filter((x) => list2.has(x)) };
  }
}

export class UnionNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Union";
            static readonly title = "Union";
            static readonly description = "Combines unique elements from two lists.\n    list, set, union, combine\n\n    Use cases:\n    - Merge lists while removing duplicates\n    - Combine collections uniquely\n    - Create comprehensive set of items";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "List1" })
  declare list1: any;

  @prop({ type: "list[any]", default: [], title: "List2" })
  declare list2: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const list1 = toArray(inputs.list1 ?? this.list1 ?? []);
    const list2 = toArray(inputs.list2 ?? this.list2 ?? []);
    return { output: [...new Set([...list1, ...list2])] };
  }
}

export class DifferenceNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Difference";
            static readonly title = "Difference";
            static readonly description = "Finds elements that exist in first list but not in second list.\n    list, set, difference, subtract\n\n    Use cases:\n    - Find unique elements in one list\n    - Remove items present in another list\n    - Identify distinct elements";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "List1" })
  declare list1: any;

  @prop({ type: "list[any]", default: [], title: "List2" })
  declare list2: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const list1 = toArray(inputs.list1 ?? this.list1 ?? []);
    const list2 = new Set(toArray(inputs.list2 ?? this.list2 ?? []));
    return { output: list1.filter((x) => !list2.has(x)) };
  }
}

export class ChunkNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Chunk";
            static readonly title = "Chunk";
            static readonly description = "Splits a list into smaller chunks of specified size.\n    list, chunk, split, group\n\n    Use cases:\n    - Batch processing\n    - Pagination\n    - Creating sublists of fixed size";
        static readonly metadataOutputTypes = {
    output: "list[list[any]]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "int", default: 1, title: "Chunk Size" })
  declare chunk_size: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    const chunkSize = Number(inputs.chunk_size ?? this.chunk_size ?? 1);

    if (chunkSize <= 0) {
      throw new Error("chunk_size must be > 0");
    }

    const chunks: unknown[][] = [];
    for (let i = 0; i < values.length; i += chunkSize) {
      chunks.push(values.slice(i, i + chunkSize));
    }
    return { output: chunks };
  }
}

export class SumNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Sum";
            static readonly title = "Sum";
            static readonly description = "Calculates the sum of a list of numbers.\n    list, sum, aggregate, math\n\n    Use cases:\n    - Calculate total of numeric values\n    - Add up all elements in a list";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
  @prop({ type: "list[float]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    if (values.length === 0) {
      throw new Error("Cannot sum empty list");
    }
    if (!isNumberList(values)) {
      throw new Error("All values must be numbers");
    }
    return { output: values.reduce((a, b) => a + b, 0) };
  }
}

export class AverageNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Average";
            static readonly title = "Average";
            static readonly description = "Calculates the arithmetic mean of a list of numbers.\n    list, average, mean, aggregate, math\n\n    Use cases:\n    - Find average value\n    - Calculate mean of numeric data";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
  @prop({ type: "list[float]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    if (values.length === 0) {
      throw new Error("Cannot average empty list");
    }
    if (!isNumberList(values)) {
      throw new Error("All values must be numbers");
    }
    return { output: values.reduce((a, b) => a + b, 0) / values.length };
  }
}

export class MinimumNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Minimum";
            static readonly title = "Minimum";
            static readonly description = "Finds the smallest value in a list of numbers.\n    list, min, minimum, aggregate, math\n\n    Use cases:\n    - Find lowest value\n    - Get smallest number in dataset";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
  @prop({ type: "list[float]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    if (values.length === 0) {
      throw new Error("Cannot find minimum of empty list");
    }
    if (!isNumberList(values)) {
      throw new Error("All values must be numbers");
    }
    return { output: Math.min(...values) };
  }
}

export class MaximumNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Maximum";
            static readonly title = "Maximum";
            static readonly description = "Finds the largest value in a list of numbers.\n    list, max, maximum, aggregate, math\n\n    Use cases:\n    - Find highest value\n    - Get largest number in dataset";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
  @prop({ type: "list[float]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    if (values.length === 0) {
      throw new Error("Cannot find maximum of empty list");
    }
    if (!isNumberList(values)) {
      throw new Error("All values must be numbers");
    }
    return { output: Math.max(...values) };
  }
}

export class ProductNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Product";
            static readonly title = "Product";
            static readonly description = "Calculates the product of all numbers in a list.\n    list, product, multiply, aggregate, math\n\n    Use cases:\n    - Multiply all numbers together\n    - Calculate compound values";
        static readonly metadataOutputTypes = {
    output: "float"
  };
  
  @prop({ type: "list[float]", default: [], title: "Values" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = toArray(inputs.values ?? this.values ?? []);
    if (values.length === 0) {
      throw new Error("Cannot calculate product of empty list");
    }
    if (!isNumberList(values)) {
      throw new Error("All values must be numbers");
    }
    return { output: values.reduce((a, b) => a * b, 1) };
  }
}

function flattenRecursive(
  list: unknown[],
  maxDepth: number,
  currentDepth: number = 0
): unknown[] {
  const result: unknown[] = [];
  for (const item of list) {
    if (
      Array.isArray(item) &&
      (maxDepth === -1 || currentDepth < maxDepth)
    ) {
      result.push(...flattenRecursive(item, maxDepth, currentDepth + 1));
    } else {
      result.push(item);
    }
  }
  return result;
}

export class FlattenNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Flatten";
            static readonly title = "Flatten";
            static readonly description = "Flattens a nested list structure into a single flat list.\n    list, flatten, nested, structure\n\n    Use cases:\n    - Convert nested lists into a single flat list\n    - Simplify complex list structures\n    - Process hierarchical data as a sequence\n\n    Examples:\n    [[1, 2], [3, 4]] -> [1, 2, 3, 4]\n    [[1, [2, 3]], [4, [5, 6]]] -> [1, 2, 3, 4, 5, 6]";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "int", default: -1, title: "Max Depth", min: -1 })
  declare max_depth: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = inputs.values ?? this.values ?? [];
    const maxDepth = Number(inputs.max_depth ?? this.max_depth ?? -1);

    if (!Array.isArray(values)) {
      throw new Error("Input must be a list");
    }
    return { output: flattenRecursive(values, maxDepth) };
  }
}

export class SaveListNode extends BaseNode {
  static readonly nodeType = "nodetool.list.SaveList";
            static readonly title = "Save List";
            static readonly description = "Saves a list to a text file, placing each element on a new line.\n    list, save, file, serialize\n\n    Use cases:\n    - Export list data to a file\n    - Create a simple text-based database\n    - Generate line-separated output";
        static readonly metadataOutputTypes = {
    output: "text"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: any;

  @prop({ type: "str", default: "text.txt", title: "Name", description: "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        " })
  declare name: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = Array.isArray(inputs.values ?? this.values)
      ? ((inputs.values ?? this.values) as unknown[])
      : [];
    const name = String(inputs.name ?? this.name ?? "text.txt");
    const content = values.map((v) => String(v)).join("\n");
    await fs.writeFile(name, content, "utf-8");
    return { output: name };
  }
}

export const LIST_NODES = [
  LengthNode,
  ListRangeNode,
  GenerateSequenceNode,
  SliceNode,
  SelectElementsNode,
  GetElementNode,
  AppendNode,
  ExtendNode,
  DedupeNode,
  ReverseNode,
  RandomizeNode,
  SortNode,
  IntersectionNode,
  UnionNode,
  DifferenceNode,
  ChunkNode,
  SumNode,
  AverageNode,
  MinimumNode,
  MaximumNode,
  ProductNode,
  FlattenNode,
  SaveListNode,
] as const;
