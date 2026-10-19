import type { EntityKind } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";

import {
  BORDER_RADIUS,
  Caption,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  ResponsiveImage,
  Text
} from "../../ui_primitives";
import { ENTITY_KIND_COLOR } from "../../entities/entityKind";
import { GalleryFrame } from "../MediaGallery";
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
}: ReviewStepProps) => {
  const { t } = useTranslation();
  return (
    <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_CONTENT_WIDTH }}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h1">
          {t("pass3_5.entity.review.title")}
        </Text>
        <Text color="secondary">{t("pass3_5.entity.review.description")}</Text>
      </FlexColumn>

      <GalleryFrame
        locator={`asset://${assetId}`}
        kind="image"
        caption={t("pass3_5.entity.review.imageCaption", { name })}
      >
        <ResponsiveImage
          locator={`asset://${assetId}`}
          alt={t("pass3_5.entity.review.imageAlt", { name })}
          aspectRatio="1/1"
          fit="contain"
          borderRadius={BORDER_RADIUS.md}
          showErrorFallback
          sx={{ width: SETUP_MEDIA_WIDTH, maxWidth: "100%", maxHeight: "44vh" }}
        />
      </GalleryFrame>
      <FlexRow gap={GAP.normal} align="center" wrap>
        <Text size="big">{name}</Text>
        <Chip
          label={t(`pass3_5.entity.kinds.${kind}`)}
          compact
          variant="outlined"
          color={ENTITY_KIND_COLOR[kind]}
        />
      </FlexRow>
      <Text>{descriptor}</Text>
      {tags.length > 0 ? (
        <Caption color="secondary">
          {t("pass3_5.entity.review.tags", { tags: tags.join(", ") })}
        </Caption>
      ) : null}
    </FlexColumn>
  );
};

export default ReviewStep;

interface ReviewFallbackProps {
  readonly loading: boolean;
}

/**
 * What the review shows when there is nothing to review yet: the library is
 * still loading, or the reference is missing or already used by another
 * entity. The footer names what to do about it.
 */
export const ReviewFallback = ({ loading }: ReviewFallbackProps) => {
  const { t } = useTranslation();
  return loading ? (
    <FlexRow gap={GAP.normal} align="center">
      <LoadingSpinner inline size="small" />
      <Text color="secondary">{t("pass3_5.entity.review.loadingLibrary")}</Text>
    </FlexRow>
  ) : (
    <EmptyState
      variant="empty"
      title={t("pass3_5.entity.review.empty.title")}
      description={t("pass3_5.entity.review.empty.description")}
    />
  );
};
