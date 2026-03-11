import { inspect } from "node:util";
import { BaseNode, prop } from "@nodetool/node-sdk";

type ToStringMode = "str" | "repr";

export class ToStringNode extends BaseNode {
  static readonly nodeType = "nodetool.text.ToString";
            static readonly title = "To String";
            static readonly description = "Converts any input value to its string representation.\n    text, string, convert, repr, str, cast";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "any", default: [], title: "Value" })
  declare value: any;

  @prop({ type: "enum", default: "str", title: "Mode", description: "Conversion mode: use `str(value)` or `repr(value)`.", values: [
  "str",
  "repr"
] })
  declare mode: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = inputs.value ?? this.value ?? null;
    const mode = String(inputs.mode ?? this.mode ?? "str") as ToStringMode;

    if (mode === "repr") {
      return { output: inspect(value) };
    }
    return { output: String(value) };
  }
}

export class ConcatTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Concat";
            static readonly title = "Concatenate Text";
            static readonly description = "Concatenates two text inputs into a single output.\n    text, combine, add, +, concatenate, merge, join, append";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "str", default: "", title: "A" })
  declare a: any;

  @prop({ type: "str", default: "", title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = String(inputs.a ?? this.a ?? "");
    const b = String(inputs.b ?? this.b ?? "");
    return { output: a + b };
  }
}

export class JoinTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Join";
            static readonly title = "Join";
            static readonly description = "Joins a list of strings into a single string using a specified separator.\n    text, join, combine, +, add, concatenate, merge";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "list[any]", default: [], title: "Strings" })
  declare strings: any;

  @prop({ type: "str", default: "", title: "Separator" })
  declare separator: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const strings = (inputs.strings ?? this.strings ?? []) as unknown[];
    const separator = String(inputs.separator ?? this.separator ?? "");

    if (!Array.isArray(strings) || strings.length === 0) {
      return { output: "" };
    }

    return { output: strings.map((v) => String(v)).join(separator) };
  }
}

export class ReplaceTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Replace";
            static readonly title = "Replace Text";
            static readonly description = "Replaces a substring in a text with another substring.\n    text, replace, substitute\n\n    Use cases:\n    - Correcting or updating specific text patterns\n    - Sanitizing or normalizing text data\n    - Implementing simple text transformations";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "str", default: "", title: "Text" })
  declare text: any;

  @prop({ type: "str", default: "", title: "Old" })
  declare old: any;

  @prop({ type: "str", default: "", title: "New" })
  declare new: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const text = String(inputs.text ?? this.text ?? "");
    const oldValue = String(inputs.old ?? this.old ?? "");
    const newValue = String(inputs.new ?? this.new ?? "");
    return { output: text.replaceAll(oldValue, newValue) };
  }
}

export class CollectTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Collect";
            static readonly title = "Collect";
            static readonly description = "Collects a stream of text inputs into a single concatenated string.\n    text, collect, list, stream, aggregate";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  static readonly syncMode = "on_any" as const;

  private _items: string[] = [];
  @prop({ type: "str", default: "", title: "Input Item" })
  declare input_item: any;

  @prop({ type: "str", default: "", title: "Separator" })
  declare separator: any;




  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const separator = String(inputs.separator ?? this.separator ?? "");
    if ("input_item" in inputs) {
      this._items.push(String(inputs.input_item ?? ""));
    }
    return { output: this._items.join(separator) };
  }
}

export class FormatTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.FormatText";
            static readonly title = "Format Text";
            static readonly description = "Replaces placeholders in a string with dynamic inputs using Jinja2 templating.\n    text, template, formatting\n\n    This node is dynamic and can be used to format text with dynamic properties.\n\n    Examples:\n    - text: \"Hello, {{ name }}!\"\n    - text: \"Title: {{ title|truncate(20) }}\"\n    - text: \"Name: {{ name|upper }}\"";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly isDynamic = true;
  
  @prop({ type: "str", default: "", title: "Template", description: "\n    Example: Hello, {{ name }} or {{ title|truncate(20) }}\n\n    Available filters: truncate, upper, lower, title, trim, replace, default, first, last, length, sort, join\n" })
  declare template: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    let template = String(inputs.template ?? this.template ?? "");
    const values = { ...this.serialize(), ...inputs };

    for (const [key, value] of Object.entries(values)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "g");
      template = template.replace(pattern, String(value ?? ""));
    }

    return { output: template };
  }
}

export class TemplateTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Template";
            static readonly title = "Template";
            static readonly description = "Uses Jinja2 templating to format strings with variables and filters. This node is dynamic and can be used to format text with dynamic inputs.\n    text, template, formatting, format, combine, concatenate, +, add, variable, replace, filter\n\n    Use cases:\n    - Generating personalized messages with dynamic content\n    - Creating parameterized queries or commands\n    - Formatting and filtering text output based on variable inputs\n\n    Examples:\n    - text: \"Hello, {{ name }}!\"\n    - text: \"Title: {{ title|truncate(20) }}\"\n    - text: \"Name: {{ name|upper }}\"\n\n    Available filters:\n    - truncate(length): Truncates text to given length\n    - upper: Converts text to uppercase\n    - lower: Converts text to lowercase\n    - title: Converts text to title case\n    - trim: Removes whitespace from start/end\n    - replace(old, new): Replaces substring\n    - default(value): Sets default if value is undefined\n    - first: Gets first character/item\n    - last: Gets last character/item\n    - length: Gets length of string/list\n    - sort: Sorts list\n    - join(delimiter): Joins list with delimiter";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly isDynamic = true;
  
  @prop({ type: "str", default: "", title: "String", description: "\n    Examples:\n    - text: \"Hello, {{ name }}!\"\n    - text: \"Title: {{ title|truncate(20) }}\"\n    - text: \"Name: {{ name|upper }}\"\n\n    Available filters:\n    - truncate(length): Truncates text to given length\n    - upper: Converts text to uppercase\n    - lower: Converts text to lowercase\n    - title: Converts text to title case\n    - trim: Removes whitespace from start/end\n    - replace(old, new): Replaces substring\n    - default(value): Sets default if value is undefined\n    - first: Gets first character/item\n    - last: Gets last character/item\n    - length: Gets length of string/list\n    - sort: Sorts list\n    - join(delimiter): Joins list with delimiter\n" })
  declare string: any;

  @prop({ type: "any", default: {}, title: "Values", description: "\n        The values to replace in the string.\n        - If a string, it will be used as the format string.\n        - If a list, it will be used as the format arguments.\n        - If a dictionary, it will be used as the template variables.\n        - If an object, it will be converted to a dictionary using the object's __dict__ method.\n        " })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    let template = String(inputs.string ?? this.string ?? "");
    const valuesInput = inputs.values ?? this.values ?? {};
    const values =
      valuesInput && typeof valuesInput === "object"
        ? (valuesInput as Record<string, unknown>)
        : {};

    for (const [key, value] of Object.entries(values)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "g");
      template = template.replace(pattern, String(value ?? ""));
    }

    return { output: template };
  }
}

export const TEXT_NODES = [
  ToStringNode,
  ConcatTextNode,
  JoinTextNode,
  ReplaceTextNode,
  CollectTextNode,
  FormatTextNode,
  TemplateTextNode,
] as const;
