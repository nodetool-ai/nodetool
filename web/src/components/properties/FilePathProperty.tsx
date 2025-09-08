/** @jsxImportSource @emotion/react */

import { memo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";
import BasePathProperty from "./shared/BasePathProperty";

const FilePathProperty = (props: PropertyProps) => (
  <BasePathProperty
    {...props}
    pathType="file_path"
    dialogTitle="Select File"
    onlyDirs={false}
  />
);

export default memo(FilePathProperty, isEqual);
