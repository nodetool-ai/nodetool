/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo } from "react";
import LinkIcon from "@mui/icons-material/Link";

const badgeStyles = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  color: "var(--palette-text-secondary)",
  userSelect: "none",
  "& svg": {
    fontSize: "var(--fontSizeNormal)"
  }
});

/** Shown next to a property input that has an incoming edge. */
const ConnectedBadge: React.FC = () => (
  <div className="connected-badge" css={badgeStyles}>
    <LinkIcon />
  </div>
);

export default memo(ConnectedBadge);
