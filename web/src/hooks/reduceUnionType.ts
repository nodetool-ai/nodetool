import { TypeMetadata } from "../stores/ApiTypes";

/**
 * Rules to reduce union type to a single type.
 * For example, if the union type is [int, float], then the type is float.
 * If the union type is [int, float, tensor], then the type is float.
 *
 * The key is the joined typeArgs with underscore in alphabetical order, and the value is the reduced type.
 */
const reduceTypeRules: Record<string, string> = {
  str_text: "str",
  int_float: "float",
  int_float_tensor: "float",
  none_str: "str",
  none_str_text: "str",
  none_text: "str",
  int_none: "int",
  float_int_none: "float",
  float_none: "float"
};

/**
 * Reduce union type to a single type, which can be used to render the property input.
 * For example, if the union type is [int, float], then the type is float.
 */
const reduceUnionType = (type: TypeMetadata): string => {
  if (type.type !== "union") {
    return type.type;
  }
  if (type.type_args === undefined || type.type_args.length === 0) {
    return "str";
  }
  // join typeArgs with underscore
  const typeArgs = type.type_args.map((arg) => arg.type);
  // sort typeArgs
  typeArgs.sort();
  const typeArgsStr = typeArgs.join("_");
  if (typeArgsStr in reduceTypeRules) {
    return reduceTypeRules[typeArgsStr];
  }
  return typeArgs[0];
};

export default reduceUnionType;
