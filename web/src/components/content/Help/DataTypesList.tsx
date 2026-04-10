/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { SyntheticEvent } from "react";

import {
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  Text
} from "../../ui_primitives";
import { DataType, IconForType } from "../../../config/data_types";

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
  const types = dataTypes;

  const styles = (theme: Theme) =>
    css({
      "&": {
        padding: "0 .5em 0 0",
        backgroundColor: "transparent"
      },
      ".datatype-list": {
        padding: "1em",
        height: "500px",
        overflowY: "auto"
      },
      ".help-item": {
        padding: ".5em 0",
        borderBottom: "1px solid var(--palette-grey-600)"
      },
      h5: {
        color: "var(--palette-grey-200)",
        fontSize: "1em",
        paddingLeft: "1em",
        "&:hover": {
          color: "var(--palette-grey-100)"
        }
      }
  });

  return (
    <div className="datatypes" css={styles(theme)}>
      <CollapsibleSection
        title={
          <Text size="normal" weight={600} color="secondary">
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
          {types.map((type) => (
            <FlexRow
              key={type.value}
              className="help-item datatype"
              gap={1}
              align="flex-start"
              fullWidth
              sx={{ padding: ".5em 0", borderBottom: "1px solid var(--palette-grey-600)" }}
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
                  padding: "8px"
                }}
              />
              <FlexColumn
                gap={0}
                sx={{
                  minWidth: "180px",
                  wordBreak: "break-word",
                  color: theme.vars.palette.grey[0]
                }}
              >
                {type.namespace && (
                  <Text size="small" weight={300} sx={{ width: "100%" }}>
                    {type.namespace}
                  </Text>
                )}
                <Text size="big" weight={400} sx={{ width: "100%" }}>
                  {type.name}
                </Text>
              </FlexColumn>
              <Text
                size="small"
                sx={{
                  borderRight: "0",
                  color: theme.vars.palette.grey[50],
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
