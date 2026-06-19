import * as React from "react";
import { ColorSwatch, FlexRow } from "nodetool";

const palette = ["#6C5CE7", "#00B894", "#FDCB6E", "#E17055", "#0984E3", "#D63031"];

export const Palette = () => (
  <FlexRow gap={1}>
    {palette.map((c) => (
      <ColorSwatch key={c} color={c} showTooltip />
    ))}
  </FlexRow>
);

export const Shapes = () => (
  <FlexRow gap={2} align="center">
    <ColorSwatch color="#6C5CE7" shape="circle" size={32} />
    <ColorSwatch color="#00B894" shape="square" size={32} />
    <ColorSwatch color="#FDCB6E" shape="square" size={32} borderRadius={8} />
  </FlexRow>
);

export const Selectable = () => {
  const [selected, setSelected] = React.useState("#0984E3");
  return (
    <FlexRow gap={1}>
      {palette.map((c) => (
        <ColorSwatch
          key={c}
          color={c}
          size={28}
          selected={selected === c}
          onClick={setSelected}
        />
      ))}
    </FlexRow>
  );
};
