import { Property, TypeMetadata } from "../stores/ApiTypes";

const reduceTypeRules: Record<string, string> = {
  str_text: "str",
  int_float: "float",
  int_float_tensor: "float"
};

/**
 * Reduce union type to a single type, which can be used to render the property input.
 * For example, if the union type is [int, float], then the type is float.
 */
const reduceUnionType = (type: TypeMetadata): string => {
  if (type.type !== "union") {
    return type.type;
  }
  if (type.type_args === undefined) {
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
