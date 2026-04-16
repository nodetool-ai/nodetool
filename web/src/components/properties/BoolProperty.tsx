import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useCallback } from "react";
import isEqual from "fast-deep-equal";
import { NodeSwitch } from "../editor_ui";

const BoolProperty = (props: PropertyProps) => {
  const { property, value, changed, onChange } = props;
  const id = `switch-${property.name}-${props.propertyIndex}`;

  // Memoize handler to prevent unnecessary re-renders of memoized NodeSwitch child
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  }, [onChange]);

  return (
    <div
      className="bool-property"
      style={{
        position: "relative",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        borderRadius: ".2em",
      }}
    >
      <PropertyLabel
        name={property.name}
        description={property.description}
        density="normal"
        id={id}
      />
      <NodeSwitch
        id={id}
        inputProps={{ "aria-labelledby": id }}
        checked={value}
        onChange={handleChange}
        name={property.name}
        changed={changed}
      />
    </div>
  );
};

export default memo(BoolProperty, isEqual);
