/** @jsxImportSource @emotion/react */
/**
 * The Studio chrome: one thin header (back link, brand, page title, page
 * actions, credit balance) over a full-height body. Deliberately has no tabs,
 * panels, or node graph — the Studio is the beginner shell around the existing
 * storyboard, script, and timeline surfaces.
 */

import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import MovieFilterRoundedIcon from "@mui/icons-material/MovieFilterRounded";
import {
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text,
  Tooltip
} from "../components/ui_primitives";
import { useStudioCredits } from "./useStudioCredits";
import { useStudioAssistantModel } from "./useStudioAssistantModel";
import { StudioProvider } from "./StudioContext";

const CreditsChip = () => {
  const navigate = useNavigate();
  const { status, remaining, loading, unavailable } = useStudioCredits();
  const title = unavailable
    ? "Couldn't load the credit balance. Click to retry from the account page."
    : status
      ? `${status.plan.name} plan — ${status.spentCredits} of ${status.grantedCredits} credits used. 1 credit = 1¢ of generation. Click to manage.`
      : "Plan & credits";
  const label = loading
    ? "credits…"
    : unavailable
      ? "credits unavailable"
      : `${remaining} credits`;
  return (
    <Tooltip title={title}>
      <span>
        <Chip
          compact
          clickable
          onClick={() => navigate("/studio/account")}
          color={
            unavailable ? "default" : remaining > 0 ? "primary" : "error"
          }
          icon={<BoltRoundedIcon />}
          label={label}
        />
      </span>
    </Tooltip>
  );
};

interface StudioShellProps {
  /** Page title shown next to the brand; omit on the home screen. */
  title?: string;
  /** Show the back-to-home button (every page except home). */
  showBack?: boolean;
  /** Page-specific header actions (e.g. "Create video"). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const StudioShell = ({
  title,
  showBack = true,
  actions,
  children
}: StudioShellProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  useStudioAssistantModel();
  return (
    <StudioProvider>
      <FlexColumn fullHeight sx={{ width: "100%", minHeight: 0 }}>
        <FlexRow
          align="center"
          gap={SPACING.md}
          sx={{
            flexShrink: 0,
            px: SPACING.lg,
            py: SPACING.sm,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          {showBack && (
            <EditorButton
              size="small"
              startIcon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => navigate("/studio")}
            >
              Studio
            </EditorButton>
          )}
          {!showBack && (
            <FlexRow align="center" gap={SPACING.sm}>
              <MovieFilterRoundedIcon fontSize="small" />
              <Text size="normal" weight={600}>
                NodeTool Studio
              </Text>
            </FlexRow>
          )}
          {title && (
            <Text size="normal" color="secondary" truncate>
              {title}
            </Text>
          )}
          <FlexRow sx={{ flex: 1 }} />
          {actions}
          <CreditsChip />
        </FlexRow>
        <FlexColumn sx={{ flex: 1, minHeight: 0, width: "100%" }}>
          {children}
        </FlexColumn>
      </FlexColumn>
    </StudioProvider>
  );
};

export default StudioShell;
