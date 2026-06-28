import { WidgetType } from "../appSchema";
import { WidgetDefinition } from "./types";
import { WIDGET_DEFINITIONS } from "./definitions";

const REGISTRY = new Map<WidgetType, WidgetDefinition>(
  WIDGET_DEFINITIONS.map((def) => [def.type, def])
);

export const getWidgetDefinition = (
  type: WidgetType
): WidgetDefinition | undefined => REGISTRY.get(type);

export const listWidgetDefinitions = (): WidgetDefinition[] =>
  WIDGET_DEFINITIONS;

export const widgetCategories = (): {
  category: WidgetDefinition["category"];
  widgets: WidgetDefinition[];
}[] => {
  const order: WidgetDefinition["category"][] = [
    "input",
    "action",
    "display",
    "layout"
  ];
  return order.map((category) => ({
    category,
    widgets: WIDGET_DEFINITIONS.filter((d) => d.category === category)
  }));
};
