import { memo } from "react";
import NumberProperty from "./NumberProperty";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "../../utils/isEqual";

const FloatProperty = (props: PropertyProps<number>) => (
  <NumberProperty {...props} inputType="float" />
);

export default memo(FloatProperty, isEqual);
