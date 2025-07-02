import React from "react";

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
        ? value.toFixed(decimalPlaces)
        : value
      : "NaN"}
  </div>
);

export default DisplayValue;
