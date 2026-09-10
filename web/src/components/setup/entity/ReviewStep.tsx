import type { EntityKind } from "@nodetool-ai/protocol";

import {
  BORDER_RADIUS,
  Caption,
  Chip,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  Text
} from "../../ui_primitives";
import { getEntityKindChipSx } from "../../entities/entityKind";
import { SETUP_CONTENT_WIDTH, SETUP_MEDIA_WIDTH } from "../layout";

interface ReviewStepProps {
  readonly assetId: string;
  readonly kind: EntityKind;
  readonly name: string;
  readonly descriptor: string;
  readonly tags: readonly string[];
}

export const ReviewStep = ({
  assetId,
  kind,
  name,
  descriptor,
  tags
}: ReviewStepProps) => (
  <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_CONTENT_WIDTH }}>
    <FlexColumn gap={GAP.tight}>
      <Text size="big" component="h1">
        Review your entity
      </Text>
      <Text color="secondary">
        This reference and descriptor will be available anywhere entities can
        be added.
      </Text>
    </FlexColumn>

    <ResponsiveImage
      locator={`asset://${assetId}`}
      alt={`${name} reference`}
      aspectRatio="1/1"
      fit="contain"
      borderRadius={BORDER_RADIUS.md}
      showErrorFallback
      sx={{ width: SETUP_MEDIA_WIDTH, maxWidth: "100%", maxHeight: "44vh" }}
    />
    <FlexRow gap={GAP.normal} align="center" wrap>
      <Text size="big">{name}</Text>
      <Chip
        label={kind}
        compact
        variant="outlined"
        sx={getEntityKindChipSx(kind)}
      />
    </FlexRow>
    <Text>{descriptor}</Text>
    {tags.length > 0 ? (
      <Caption color="secondary">Tags: {tags.join(", ")}</Caption>
    ) : null}
  </FlexColumn>
);

export default ReviewStep;
