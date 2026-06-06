import { createContext } from "react";
import { TypeMetadata } from "../stores/ApiTypes";

/** Property type for handle-style tooltips on labels inside PropertyInput. */
export const PropertyHandleTooltipContext = createContext<TypeMetadata | null>(
  null
);
