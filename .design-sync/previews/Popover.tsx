import * as React from "react";
import { Popover, Text, FlexColumn } from "nodetool";

export const ModelMenu = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => setEl(ref.current), []);
  return (
    <div>
      <div
        ref={ref}
        style={{
          display: "inline-block",
          padding: "6px 12px",
          borderRadius: 6,
          background: "var(--palette-action-hover)",
          fontSize: 13
        }}
      >
        gpt-5.4-mini ▾
      </div>
      <Popover open={Boolean(el)} anchorEl={el} placement="bottom-left" maxWidth={260}>
        <FlexColumn gap={1} sx={{ p: 1.5 }}>
          <Text size="small" weight={600}>
            Switch model
          </Text>
          <Text size="small">claude-sonnet-4-6</Text>
          <Text size="small">gpt-5.4-mini</Text>
          <Text size="small">gemini-2.5-pro</Text>
        </FlexColumn>
      </Popover>
    </div>
  );
};
