import { Property } from "../stores/ApiTypes";
import { NodeData } from "../stores/NodeData";

/**
 * A property can declare that it only applies while another property holds a
 * given value:
 *
 *   json_schema_extra: { hidden_when: { property: "save_to_workspace", equals: true } }
 *
 * The editor then leaves the field out instead of showing a control that has
 * no effect — the folder picker on a save node writing to the workspace, say.
 */
export interface HiddenWhen {
  property: string;
  equals: unknown;
}

const readHiddenWhen = (property: Property): HiddenWhen | null => {
  const raw = property.json_schema_extra?.hidden_when;
  if (raw == null || typeof raw !== "object") return null;
  const { property: name, equals } = raw as Partial<HiddenWhen>;
  return typeof name === "string" ? { property: name, equals } : null;
};

/**
 * Whether `property` is currently hidden by its `hidden_when` condition.
 *
 * A property with an incoming edge always renders: hiding it would drop the
 * handle the edge points at.
 */
export const isPropertyHidden = (
  property: Property,
  data: NodeData | undefined,
  isConnected = false
): boolean => {
  if (isConnected) return false;
  const condition = readHiddenWhen(property);
  if (!condition) return false;
  const properties = data?.properties as Record<string, unknown> | undefined;
  return properties?.[condition.property] === condition.equals;
};
