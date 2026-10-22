import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Caption, FlexRow, SPACING, TextLink } from "../ui_primitives";
import { useNodeProviderFilter } from "../../hooks/useNodeProviderFilter";

interface MissingKeyNodesNoticeProps {
  className?: string;
}

/**
 * One line telling the user how many nodes are hidden because their provider
 * has no API key, with a link that shows them. Once shown, the link hides them
 * again. Renders nothing when every provider in the catalog has its key.
 */
const MissingKeyNodesNotice = memo<MissingKeyNodesNoticeProps>(
  ({ className }) => {
    const { t } = useTranslation();
    const { missingKeyCount, showNodesWithoutKey, setShowNodesWithoutKey } =
      useNodeProviderFilter();

    const handleToggle = useCallback(
      () => setShowNodesWithoutKey(!showNodesWithoutKey),
      [setShowNodesWithoutKey, showNodesWithoutKey]
    );

    if (missingKeyCount === 0) {
      return null;
    }

    return (
      <FlexRow
        className={className}
        gap={SPACING.xs}
        align="baseline"
        wrap
        data-testid="missing-key-nodes-notice"
      >
        <Caption color="secondary">
          {showNodesWithoutKey
            ? t("missingKeyNodes.shown", { count: missingKeyCount })
            : t("missingKeyNodes.hidden", { count: missingKeyCount })}
        </Caption>
        <TextLink asButton onClick={handleToggle} sx={{ fontSize: "inherit" }}>
          <Caption component="span" sx={{ color: "inherit" }}>
            {showNodesWithoutKey
              ? t("missingKeyNodes.hide")
              : t("missingKeyNodes.show")}
          </Caption>
        </TextLink>
      </FlexRow>
    );
  }
);

MissingKeyNodesNotice.displayName = "MissingKeyNodesNotice";

export default MissingKeyNodesNotice;
