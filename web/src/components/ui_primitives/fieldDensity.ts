import { createContext, useContext } from "react";

/**
 * Field density for a whole surface. A dense panel (an inspector, the
 * timeline editor) provides "compact" once at its root, and every TextInput
 * and SelectField below it takes the compact field look: control-size text
 * (13px sans label), the small control height, and the inspector field
 * surface. Mixed field styles in one panel came from each field picking its
 * own size.
 */
export type FieldDensity = "normal" | "compact";

export const FieldDensityContext = createContext<FieldDensity>("normal");

export function useFieldDensity(): FieldDensity {
  return useContext(FieldDensityContext);
}
