import { memo, useCallback } from "react";
import { Autocomplete, TextField, Chip } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";

const StringListProperty = (props: PropertyProps) => {
  const id = `string-list-${props.property.name}-${props.propertyIndex}`;
  const strings = props.value || [];

  const onChange = useCallback(
    (newValues: string[]) => {
      props.onChange(newValues);
    },
    [props]
  );

  return (
    <>
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
            padding: "2px 2px",
            minHeight: "18px"
          }
        }}
        onChange={(_, newValue) => onChange(newValue as string[])}
        renderTags={(value: readonly string[], getTagProps) =>
          value.map((option: string, index: number) => (
            <Chip
              variant="outlined"
              size="small"
              label={option}
              {...getTagProps({ index })}
              key={option}
              sx={{
                height: "20px",
                "& .MuiChip-label": {
                  fontSize: "0.75rem",
                  padding: "0 6px"
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
              "& .MuiOutlinedInput-root": {
                padding: "2px 4px",
                minHeight: "32px"
              }
            }}
          />
        )}
        className="nodrag"
      />
    </>
  );
};

export default memo(StringListProperty, isEqual);
