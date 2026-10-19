import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NPArray } from "../../stores/ApiTypes";
import { Text, FlexColumn, Surface, BORDER_RADIUS } from "../ui_primitives";
import isEqual from "../../utils/isEqual";

interface ArrayViewProps {
  array: NPArray;
}

const ArrayView: React.FC<ArrayViewProps> = ({ array }) => {
  const { t } = useTranslation();
  const { value, dtype, shape } = array;

  const formattedValue = useMemo(() => {
    if (!value) {return t("i18n-next66.node.arrayView.noData");}
    if (value.length > 100) {
      return JSON.stringify(value.slice(0, 100)) + "...";
    }
    return JSON.stringify(value, null, 2);
  }, [t, value]);

  return (
    <Surface sx={{ p: 2, my: 1, fontFamily: "var(--fontFamily2)" }}>
      <Text size="normal" weight={600} gutterBottom>
        {t("i18n-next66.node.arrayView.array", { dtype })}
      </Text>
      <Text gutterBottom>
        {t("i18n-next66.node.arrayView.shape")}: {shape?.join(", ")}
      </Text>
      <FlexColumn gap={1}>
        <pre
          style={{
            padding: 8,
            borderRadius: BORDER_RADIUS.sm,
            overflow: "auto",
            maxHeight: "200px"
          }}
        >
          {formattedValue}
        </pre>
      </FlexColumn>
    </Surface>
  );
};

export default memo(ArrayView, isEqual);
