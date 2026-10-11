/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { useMemo, type SyntheticEvent } from "react";

import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  Text,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import { DataType } from "../../../config/data_types";
import { IconForType } from "../../../config/IconForType";

interface DataTypesListProps {
  title: string;
  dataTypes: DataType[];
  expanded: boolean;
  onChange: (event: SyntheticEvent, isExpanded: boolean) => void;
}

const DataTypesList = ({
  title,
  dataTypes,
  expanded,
  onChange
}: DataTypesListProps) => {
  const theme = useTheme();

  const cssStyles = useMemo(() => css({
    "&": {
      padding: `0 ${getSpacingPx(SPACING.md)} 0 0`,
      backgroundColor: "transparent"
    },
    ".datatype-list": {
      padding: getSpacingPx(SPACING.xl),
      height: "500px",
      overflowY: "auto"
    },
    ".help-item": {
      padding: `${getSpacingPx(SPACING.md)} 0`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    }
  }), [theme]);

  return (
    <div className="datatypes" css={cssStyles}>
      <CollapsibleSection
        title={
          <Text size="small" color="secondary">
            {title}
          </Text>
        }
        open={expanded}
        onToggle={(nextExpanded) => {
          onChange({} as SyntheticEvent, nextExpanded);
        }}
        compact
      >
        <FlexColumn className="datatype-list" sx={{ height: "100%", overflowY: "auto" }}>
          {dataTypes.map((type) => (
            <FlexRow
              key={type.value}
              className="help-item datatype"
              gap={1}
              align="flex-start"
              fullWidth
            >
              <IconForType
                iconName={type.value}
                containerStyle={{
                  fill: type.textColor,
                  width: "50px",
                  height: "50px"
                }}
                bgStyle={{
                  backgroundColor: type.color,
                  width: "50px",
                  height: "50px",
                  color: type.textColor,
                  padding: getSpacingPx(SPACING.md)
                }}
              />
              <FlexColumn
                gap={0}
                sx={{
                  minWidth: "180px",
                  wordBreak: "break-word",
                  color: theme.vars.palette.text.primary
                }}
              >
                {type.namespace && (
                  <Caption color="secondary" sx={{ width: "100%" }}>
                    {type.namespace}
                  </Caption>
                )}
                <Text size="small" sx={{ width: "100%" }}>
                  {type.name}
                </Text>
              </FlexColumn>
              <Text
                size="small"
                sx={{
                  color: theme.vars.palette.text.secondary,
                  flex: 1
                }}
              >
                {type.description}
              </Text>
            </FlexRow>
          ))}
        </FlexColumn>
      </CollapsibleSection>
    </div>
  );
};

export default DataTypesList;
