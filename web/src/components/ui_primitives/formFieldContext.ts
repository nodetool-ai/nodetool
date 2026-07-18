/**
 * FormField composition contract.
 *
 * FormField provides this context to its children; label-bearing controls
 * (TextInput, SelectField) consume it to suppress their own label and adopt
 * the field id FormField owns. Double labels become impossible by
 * construction — no call-site convention required.
 */

import { createContext, useContext } from "react";

export interface FormFieldContextValue {
  /** The id FormField's label points at; the control must render with it. */
  controlId: string;
}

export const FormFieldContext = createContext<FormFieldContextValue | null>(
  null
);

/** Null outside a FormField — controls then manage their own label. */
export function useFormFieldContext(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}
