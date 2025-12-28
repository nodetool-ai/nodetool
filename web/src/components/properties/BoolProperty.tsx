/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { NodeSwitch } from "../editor_ui";

const BoolProperty = (props: PropertyProps) => {
  const id = `switch-${props.property.name}-${props.propertyIndex}`;

  return (
    <div
      className="bool-property"
      css={css({
        position: "relative",
        padding: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: "5px"
      })}
    >
      <NodeSwitch
        id={id}
        inputProps={{ "aria-labelledby": id }}
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
        name={props.property.name}
      />
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
    </div>
  );
};

export default memo(BoolProperty, isEqual);
