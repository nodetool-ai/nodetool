/** Props and helpers every widget renderer shares. */
import type { ReactNode } from "react";
import type { AppEvent } from "@nodetool-ai/app-runtime";

/** A placed widget in the UI document. Slots are arrays nested in props. */
export interface ComponentNode {
  type: string;
  props: Record<string, unknown>;
}

export interface WidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  /** The rendered `format` template; display widgets show it in place of the value. */
  formattedValue?: string;
  disabled?: boolean;
  props: Record<string, unknown>;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const str = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

export const numOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A bound output holds one value or an accumulated list of streamed items. */
export const asItems = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null || value === "" ? [] : [value];

/** Text for a value shown in a cell or a list item. */
export const cellText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export function Placeholder({ text }: { text: string }): ReactNode {
  return text ? <div className="nt-placeholder">{text}</div> : null;
}

export function FieldLabel({ text, htmlFor }: { text: string; htmlFor?: string }): ReactNode {
  return text ? (
    <label className="nt-label" htmlFor={htmlFor}>
      {text}
    </label>
  ) : null;
}
