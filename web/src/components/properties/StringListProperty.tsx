import { memo, useCallback } from "react";
import { Autocomplete, TextField, Chip, Box, useTheme } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";

const StringListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `string-list-${props.property.name}-${props.propertyIndex}`;
  const strings = props.value || [];

  const onChange = useCallback(
    (newValues: string[]) => {
      props.onChange(newValues);
    },
    [props]
  );

  return (
    <Box sx={{ mb: 1, width: "100%" }}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Autocomplete
        id={id}
        multiple
        freeSolo
        size="small"
        options={[]}
        value={strings}
        sx={{
          "& .MuiInputBase-root": {
            padding: "2px 6px",
            minHeight: "32px",
            backgroundColor: "action.disabledBackground",
            borderRadius: "6px",
            border: "1px solid var(--palette-grey-700)",
            color: "var(--palette-grey-100)",
            fontSize: "var(--fontSizeSmall)",
            transition: "all 0.2s",
            "&:hover": {
              borderColor: "var(--palette-grey-600)",
              backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.3)`
            },
            "&.Mui-focused": {
              borderColor: "var(--palette-grey-500)",
              backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.4)`,
              "& .MuiOutlinedInput-notchedOutline": {
                borderWidth: 0
              }
            }
          },
          "& .MuiOutlinedInput-notchedOutline": {
            border: "none"
          },
          "& .MuiAutocomplete-tag": {
            margin: "2px"
          }
        }}
        onChange={(_, newValue) => onChange(newValue as string[])}
        renderTags={(value: readonly string[], getTagProps) =>
          value.map((option: string, index: number) => (
            <Chip
              variant="filled"
              size="small"
              label={option}
              {...getTagProps({ index })}
              key={option}
              sx={{
                height: "22px",
                backgroundColor: "var(--palette-grey-700)",
                color: "var(--palette-grey-100)",
                border: "1px solid var(--palette-grey-600)",
                "& .MuiChip-label": {
                  fontSize: "0.75rem",
                  padding: "0 8px"
                },
                "& .MuiChip-deleteIcon": {
                  color: "var(--palette-grey-400)",
                  fontSize: "14px",
                  "&:hover": {
                    color: "var(--palette-grey-200)"
                  }
                }
              }}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            size="small"
            placeholder={strings.length === 0 ? "Enter values..." : ""}
            fullWidth
            sx={{
              "& .MuiInputBase-input": {
                padding: "2px 4px !important",
                fontSize: "var(--fontSizeSmall)",
                color: "var(--palette-grey-100)",
                "&::placeholder": {
                  color: "var(--palette-grey-500)",
                  opacity: 1
                }
              }
            }}
          />
        )}
        className="nodrag"
      />
    </Box>
  );
};

export default memo(StringListProperty, isEqual);
