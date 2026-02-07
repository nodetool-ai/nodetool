import React, { memo } from "react";
import { NPArray } from "../../../stores/ApiTypes";
import ArrayView from "../ArrayView";

export const ArrayRenderer: React.FC<{ array: NPArray }> = ({ array }) => {
  return <ArrayView array={array} />;
};

export default memo(ArrayRenderer);
