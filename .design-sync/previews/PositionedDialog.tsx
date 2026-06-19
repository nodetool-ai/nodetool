import * as React from "react";
import { PositionedDialog, Text, FlexColumn } from "nodetool";
import Button from "@mui/material/Button";

export const CreateFolder = () => (
  <PositionedDialog
    open
    onClose={() => {}}
    anchor={{ x: 360, y: 280 }}
    width={300}
    offsetY={120}
    edgeMargin={24}
  >
    <FlexColumn gap={1.5} sx={{ p: 2 }}>
      <Text size="big" weight={600}>
        New asset folder
      </Text>
      <Text size="small" color="secondary">
        Organize renders from the “Portrait Pipeline” run.
      </Text>
      <Button variant="contained" size="small">
        Create folder
      </Button>
    </FlexColumn>
  </PositionedDialog>
);
