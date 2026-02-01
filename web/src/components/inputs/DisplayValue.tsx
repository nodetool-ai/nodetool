import React from "react";
import { formatFloat } from "./NumberInput.utils";

interface DisplayValueProps {
  value: number;
  isFloat: boolean;
  decimalPlaces: number;
}

const DisplayValue: React.FC<DisplayValueProps> = ({
  value,
  isFloat,
  decimalPlaces
}) => (
  <div className="value">
    {typeof value === "number"
      ? isFloat
        ? formatFloat(value)
        : value
      : "NaN"}
  </div>
);

export default DisplayValue;
