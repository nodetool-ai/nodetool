import { memo } from "react";
import NumberProperty from "./NumberProperty";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "../../utils/isEqual";

const IntegerProperty = (props: PropertyProps<number>) => (
  <NumberProperty {...props} inputType="int" />
);

export default memo(IntegerProperty, isEqual);
