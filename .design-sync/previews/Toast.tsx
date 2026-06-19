import * as React from "react";
import { Toast } from "nodetool";

export const WorkflowSaved = () => (
  <Toast
    open
    message="Workflow saved — 14 nodes synced"
    severity="success"
    duration={null}
    vertical="bottom"
    horizontal="center"
    onClose={() => {}}
  />
);
