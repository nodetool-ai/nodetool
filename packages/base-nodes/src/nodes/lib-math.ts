import { BaseNode, prop } from "@nodetool/node-sdk";

type MathOperation =
  | "negate"
  | "absolute"
  | "square"
  | "cube"
  | "square_root"
  | "cube_root"
  | "sine"
  | "cosine"
  | "tangent"
  | "arcsin"
  | "arccos"
  | "arctan"
  | "log";

export class AddLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Add";
            static readonly title = "Add";
            static readonly description = "Adds two numbers together.\n    math, add, plus, +, sum\n\n    Use cases:\n    - Perform basic arithmetic operations\n    - Calculate totals and sums\n    - Combine numerical values\n    - Increment counters and scores";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Number(inputs.a ?? this.a ?? 0) + Number(inputs.b ?? this.b ?? 0) };
  }
}

export class SubtractLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Subtract";
            static readonly title = "Subtract";
            static readonly description = "Subtracts B from A.\n    math, subtract, minus, -, difference\n\n    Use cases:\n    - Calculate differences between values\n    - Determine remaining amounts\n    - Compute offsets and deltas\n    - Track decrements and reductions";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Number(inputs.a ?? this.a ?? 0) - Number(inputs.b ?? this.b ?? 0) };
  }
}

export class MultiplyLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Multiply";
            static readonly title = "Multiply";
            static readonly description = "Multiplies two numbers together.\n    math, multiply, product, *, times\n\n    Use cases:\n    - Calculate products and totals\n    - Scale values by factors\n    - Compute areas and volumes\n    - Apply multipliers and rates";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Number(inputs.a ?? this.a ?? 0) * Number(inputs.b ?? this.b ?? 0) };
  }
}

export class DivideLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Divide";
            static readonly title = "Divide";
            static readonly description = "Divides A by B to calculate the quotient.\n    math, divide, division, quotient, /\n\n    Use cases:\n    - Calculate averages and ratios\n    - Distribute quantities evenly\n    - Determine rates and proportions\n    - Compute per-unit values";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float]", default: 1, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Number(inputs.a ?? this.a ?? 0) / Number(inputs.b ?? this.b ?? 1) };
  }
}

export class ModulusLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Modulus";
            static readonly title = "Modulus";
            static readonly description = "Computes A modulo B to find the remainder after division.\n    math, modulus, modulo, remainder, %\n\n    Use cases:\n    - Determine if numbers are even or odd\n    - Implement cyclic patterns and rotations\n    - Calculate remainders in division\n    - Build repeating sequences";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float]", default: 1, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Number(inputs.a ?? this.a ?? 0) % Number(inputs.b ?? this.b ?? 1) };
  }
}

export class MathFunctionLibNode extends BaseNode {
  static readonly nodeType = "lib.math.MathFunction";
            static readonly title = "Math Function";
            static readonly description = "Performs a selected unary math operation on an input.\n    math, negate, absolute, square, cube, square_root, cube_root, sine, cosine, tangent, arcsine, arccosine, arctangent, log,   -, abs, ^2, ^3, sqrt, cbrt, sin, cos, tan, asin, acos, atan, log";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "Input" })
  declare input: any;

  @prop({ type: "enum", default: "negate", title: "Operation", description: "Unary operation to perform", values: [
  "negate",
  "absolute",
  "square",
  "cube",
  "square_root",
  "cube_root",
  "sine",
  "cosine",
  "tangent",
  "arcsin",
  "arccos",
  "arctan",
  "log"
] })
  declare operation: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const input = Number(inputs.input ?? this.input ?? 0);
    const operation = String(
      inputs.operation ?? this.operation ?? "negate"
    ) as MathOperation;

    switch (operation) {
      case "negate":
        return { output: -input };
      case "absolute":
        return { output: Math.abs(input) };
      case "square":
        return { output: input * input };
      case "cube":
        return { output: input * input * input };
      case "square_root":
        return { output: Math.sqrt(input) };
      case "cube_root":
        return { output: Math.sign(input) * Math.pow(Math.abs(input), 1 / 3) };
      case "sine":
        return { output: Math.sin(input) };
      case "cosine":
        return { output: Math.cos(input) };
      case "tangent":
        return { output: Math.tan(input) };
      case "arcsin":
        return { output: Math.asin(input) };
      case "arccos":
        return { output: Math.acos(input) };
      case "arctan":
        return { output: Math.atan(input) };
      case "log":
        return { output: Math.log(input) };
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }
}

export class SineLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Sine";
            static readonly title = "Sine";
            static readonly description = "Computes sine of the given angle in radians.\n    math, sine, trig";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "Angle (rad)" })
  declare angle_rad: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Math.sin(Number(inputs.angle_rad ?? this.angle_rad ?? 0)) };
  }
}

export class CosineLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Cosine";
            static readonly title = "Cosine";
            static readonly description = "Computes cosine of the given angle in radians.\n    math, cosine, trig";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "Angle (rad)" })
  declare angle_rad: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Math.cos(Number(inputs.angle_rad ?? this.angle_rad ?? 0)) };
  }
}

export class PowerLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Power";
            static readonly title = "Power";
            static readonly description = "Raises base to the given exponent.\n    math, power, exponent, ^";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "Base" })
  declare base: any;

  @prop({ type: "union[int, float]", default: 1, title: "Exponent" })
  declare exponent: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      output: Math.pow(
        Number(inputs.base ?? this.base ?? 0),
        Number(inputs.exponent ?? this.exponent ?? 1)
      ),
    };
  }
}

export class SqrtLibNode extends BaseNode {
  static readonly nodeType = "lib.math.Sqrt";
            static readonly title = "Sqrt";
            static readonly description = "Computes square root of x.\n    math, sqrt, square_root";
        static readonly metadataOutputTypes = {
    output: "union[int, float]"
  };
          static readonly layout = "small";
          static readonly exposeAsTool = true;
  
  @prop({ type: "union[int, float]", default: 0, title: "X" })
  declare x: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: Math.sqrt(Number(inputs.x ?? this.x ?? 0)) };
  }
}

export const LIB_MATH_NODES = [
  AddLibNode,
  SubtractLibNode,
  MultiplyLibNode,
  DivideLibNode,
  ModulusLibNode,
  MathFunctionLibNode,
  SineLibNode,
  CosineLibNode,
  PowerLibNode,
  SqrtLibNode,
] as const;
