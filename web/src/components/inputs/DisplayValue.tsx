import React, { memo } from "react";
import { formatFloat } from "./NumberInput.utils";

interface DisplayValueProps {
  value: number;
  isFloat: boolean;
  decimalPlaces: number;
}

const DisplayValue: React.FC<DisplayValueProps> = memo(({
  value,
  isFloat,
  decimalPlaces: _decimalPlaces
}) => (
  <div className="value">
    {typeof value === "number"
      ? isFloat
        ? formatFloat(value)
        : value
      : "NaN"}
  </div>
));

DisplayValue.displayName = "DisplayValue";

export default DisplayValue;
