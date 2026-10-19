import React, { useMemo, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import isEqual from "../../utils/isEqual";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import Select from "../inputs/Select";
import { trpcClient } from "../../trpc/client";
import type { FontEntry } from "@nodetool-ai/protocol/api-schemas/fonts.js";
import { isObjectLike } from "../../utils/typePredicates";

/**
 * The fonts endpoint returns the bundled families first, then the system ones
 * (D8). That order is kept rather than re-sorted: a bundled family renders the
 * same on every host, so it is the one to reach for first.
 */
const fetchFonts = async (): Promise<FontEntry[]> => {
  const { fonts } = await trpcClient.fonts.list.query();
  return fonts;
};

interface FontValue {
  type: "font";
  name: string;
}

const FontProperty: React.FC<PropertyProps<FontValue | null>> = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex
}) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next47" });
  const id = `font-${property.name}-${propertyIndex}`;

  const {
    data: fonts,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["fonts"],
    queryFn: fetchFonts
  });

  const handleChange = useCallback(
    (fontName: string) => {
      onChange({ type: "font", name: fontName });
    },
    [onChange]
  );

  const currentValue =
    value && isObjectLike(value) && value.type === "font"
      ? value.name
      : "";

  const options = useMemo(() => {
    if (!fonts || isLoading || isError)
      {return [{ value: "", label: t("font.select") }];}

    return [
      { value: "", label: t("font.select") },
      ...fonts.map((font) => ({
        value: font.name,
        label: font.portable ? `${font.name} · ${t("font.portable")}` : font.name
      }))
    ];
  }, [fonts, isLoading, isError, t]);

  return (
    <div className="font-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <div className="select-wrapper">
        {isLoading ? (
          <div className="loading-state">{t("font.loading")}</div>
        ) : isError ? (
          <div className="error-state">{t("font.error")}</div>
        ) : (
          <Select
            value={currentValue}
            onChange={handleChange}
            options={options}
            tabIndex={tabIndex}
            placeholder={t("font.select")}
          />
        )}
      </div>
    </div>
  );
};

export default memo(FontProperty, isEqual);
