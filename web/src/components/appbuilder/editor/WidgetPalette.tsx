/** @jsxImportSource @emotion/react */
import React from "react";

import { useAppBuilderStore } from "../../../stores/AppBuilderStore";
import { widgetCategories } from "../widgets/registry";
import { WidgetCategory } from "../widgets/types";
import {
  Box,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  BORDER_RADIUS
} from "../../ui_primitives";

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  input: "Inputs",
  action: "Actions",
  display: "Display",
  layout: "Layout"
};

const WidgetPalette: React.FC = () => {
  const addWidget = useAppBuilderStore((s) => s.addWidget);

  return (
    <FlexColumn gap={2} sx={{ p: 1.5, height: "100%", overflow: "auto" }}>
      <Text size="small" weight={600}>
        Widgets
      </Text>
      {widgetCategories().map(({ category, widgets }) =>
        widgets.length === 0 ? null : (
          <FlexColumn key={category} gap={0.75}>
            <Caption
              color="secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              {CATEGORY_LABELS[category]}
            </Caption>
            {widgets.map((def) => (
              <FlexRow
                key={def.type}
                align="center"
                gap={1}
                role="button"
                tabIndex={0}
                onClick={() => addWidget(def.type)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") addWidget(def.type);
                }}
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: BORDER_RADIUS.sm,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: "divider",
                  color: "text.secondary",
                  "&:hover": {
                    borderColor: "primary.main",
                    color: "text.primary",
                    backgroundColor: "action.hover"
                  }
                }}
              >
                <Box
                  sx={{ display: "flex", alignItems: "center" }}
                  aria-hidden
                >
                  {def.icon}
                </Box>
                <Text size="small">{def.label}</Text>
              </FlexRow>
            ))}
          </FlexColumn>
        )
      )}
    </FlexColumn>
  );
};

export default WidgetPalette;
