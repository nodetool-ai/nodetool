import * as React from "react";
import { NodeSlider, Label, FlexColumn } from "nodetool";

export const Default = () => {
  const [value, setValue] = React.useState(40);
  return (
    <div style={{ width: 280 }}>
      <Label size="small">Guidance scale</Label>
      <NodeSlider
        value={value}
        onChange={(_e, v) => setValue(v as number)}
        min={0}
        max={100}
      />
    </div>
  );
};

export const Changed = () => {
  const [value, setValue] = React.useState(75);
  return (
    <div style={{ width: 280 }}>
      <Label size="small">Steps (modified)</Label>
      <NodeSlider
        value={value}
        onChange={(_e, v) => setValue(v as number)}
        min={1}
        max={100}
        changed
      />
    </div>
  );
};

export const Densities = () => {
  const [a, setA] = React.useState(30);
  const [b, setB] = React.useState(60);
  return (
    <FlexColumn gap={2} style={{ width: 280 }}>
      <div>
        <Label size="small">Compact density</Label>
        <NodeSlider
          value={a}
          onChange={(_e, v) => setA(v as number)}
          density="compact"
        />
      </div>
      <div>
        <Label size="small">Normal density</Label>
        <NodeSlider
          value={b}
          onChange={(_e, v) => setB(v as number)}
          density="normal"
        />
      </div>
    </FlexColumn>
  );
};
