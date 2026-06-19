import * as React from "react";
import { ExpandCollapseButton, FlexRow, FlexColumn, Text } from "nodetool";

export const Variants = () => {
  const [rotate, setRotate] = React.useState(true);
  const [chevron, setChevron] = React.useState(false);
  return (
    <FlexRow gap={3} align="center">
      <ExpandCollapseButton
        expanded={rotate}
        iconVariant="rotate"
        onClick={() => setRotate((v) => !v)}
      />
      <ExpandCollapseButton
        expanded={chevron}
        iconVariant="chevron"
        onClick={() => setChevron((v) => !v)}
      />
    </FlexRow>
  );
};

export const States = () => (
  <FlexRow gap={3} align="center">
    <ExpandCollapseButton expanded={false} onClick={() => {}} buttonSize="small" />
    <ExpandCollapseButton expanded onClick={() => {}} buttonSize="small" />
    <ExpandCollapseButton expanded onClick={() => {}} buttonSize="medium" />
  </FlexRow>
);

export const SectionHeader = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <FlexColumn gap={0.5} sx={{ width: 280 }}>
      <FlexRow gap={1} align="center">
        <ExpandCollapseButton
          expanded={open}
          iconVariant="chevron"
          onClick={() => setOpen((v) => !v)}
        />
        <Text weight={500}>Advanced parameters</Text>
      </FlexRow>
      {open && (
        <Text size="small" color="secondary" sx={{ pl: 4 }}>
          guidance_scale · steps · seed
        </Text>
      )}
    </FlexColumn>
  );
};
