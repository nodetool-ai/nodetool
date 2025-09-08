/** @jsxImportSource @emotion/react */

import { memo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";
import BasePathProperty from "./shared/BasePathProperty";

const FolderPathProperty = (props: PropertyProps) => (
  <BasePathProperty
    {...props}
    pathType="folder_path"
    dialogTitle="Select Folder"
    onlyDirs={true}
  />
);

export default memo(FolderPathProperty, isEqual);
