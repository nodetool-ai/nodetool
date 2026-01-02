import React, { useMemo, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import isEqual from "lodash/isEqual";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import Select from "../inputs/Select";
import { client } from "../../stores/ApiClient";

const fetchFonts = async (): Promise<string[]> => {
  const response = await client.GET("/api/fonts/", {});
  if (!response.data) {
    throw new Error("Failed to load fonts");
  }
  return response.data.fonts || [];
};

const FontProperty: React.FC<PropertyProps> = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex
}) => {
  const id = `font-${property.name}-${propertyIndex}`;

  const {
    data: fonts,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["fonts"],
    queryFn: fetchFonts
  });

  // Handle value change
  const handleChange = useCallback(
    (fontName: string) => {
      onChange({ type: "font", name: fontName });
    },
    [onChange]
  );

  // Current value handling
  const currentValue =
    value && typeof value === "object" && value.type === "font"
      ? value.name
      : "";

  // Prepare options for Select component
  const options = useMemo(() => {
    if (!fonts || isLoading || isError)
      {return [{ value: "", label: "Select a font" }];}

    return [
      { value: "", label: "Select a font" },
      ...fonts
        .map((fontName) => ({
          value: fontName || "",
          label: fontName || "Unnamed Font"
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    ];
  }, [fonts, isLoading, isError]);

  return (
    <div className="font-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <div className="select-wrapper">
        {isLoading ? (
          <div className="loading-state">Loading fonts...</div>
        ) : isError ? (
          <div className="error-state">Error loading fonts</div>
        ) : (
          <Select
            value={currentValue}
            onChange={handleChange}
            options={options}
            tabIndex={tabIndex}
            placeholder="Select a font"
          />
        )}
      </div>
    </div>
  );
};

export default memo(FontProperty, isEqual);
