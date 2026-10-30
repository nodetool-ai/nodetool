import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useTranslation } from "react-i18next";

import { EditorButton } from "../editor_ui";
import {
  Caption,
  CloseButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Surface,
  Text,
  Z_INDEX
} from "../ui_primitives";
import { useCanvasSideInsets } from "../../hooks/useCanvasSideInsets";

interface FirstWorkflowReadiness {
  readonly input: boolean;
  readonly output: boolean;
  readonly connection: boolean;
  readonly saved: boolean;
  readonly run: boolean;
}

interface FirstWorkflowGuideProps {
  readonly hasSavedWorkflows: boolean | undefined;
  readonly started: boolean;
  readonly readiness: FirstWorkflowReadiness;
  readonly onStart: () => void;
  readonly onChooseOwn: () => void;
  readonly onBrowseTemplates?: () => void;
  readonly onClose: () => void;
}

const ReadinessItem = ({
  complete,
  children
}: {
  readonly complete: boolean;
  readonly children: React.ReactNode;
}) => (
  <FlexRow component="li" align="center" gap={SPACING.sm}>
    {complete ? (
      <CheckCircleOutlineIcon color="success" fontSize="small" />
    ) : (
      <RadioButtonUncheckedIcon color="disabled" fontSize="small" />
    )}
    <Text size="small">{children}</Text>
  </FlexRow>
);

const FirstWorkflowGuide = ({
  hasSavedWorkflows,
  started,
  readiness,
  onStart,
  onChooseOwn,
  onBrowseTemplates,
  onClose
}: FirstWorkflowGuideProps) => {
  const { t } = useTranslation();
  const insets = useCanvasSideInsets();
  if (hasSavedWorkflows !== false) {
    return null;
  }

  return (
    <Surface
      aria-label={t("screen_nodes.firstWorkflowGuide")}
      bordered
      elevation={3}
      padding={SPACING.xl}
      sx={{
        position: "absolute",
        top: SPACING.xxl,
        // Center in the canvas area the side panels leave visible.
        left: `calc(${insets.left}px + (100% - ${insets.left + insets.right}px) / 2)`,
        transform: "translateX(-50%)",
        zIndex: Z_INDEX.overlay
      }}
    >
      <FlexColumn gap={SPACING.lg}>
        <FlexRow align="flex-start" justify="space-between" gap={SPACING.lg}>
          <FlexColumn gap={SPACING.xs}>
            <Text size="big">{t("screen_nodes.firstWorkflowTitle")}</Text>
            <Caption>
              {t("screen_nodes.firstWorkflowDescription")}
            </Caption>
          </FlexColumn>
          {started ? (
            <CloseButton onClick={onClose} tooltip={t("screen_nodes.closeGuide")} />
          ) : null}
        </FlexRow>

        {started ? (
          <FlexColumn component="ol" gap={SPACING.sm} sx={{ m: 0, p: 0 }}>
            <ReadinessItem complete={readiness.input}>
              {t("screen_nodes.inputAdded")}
            </ReadinessItem>
            <ReadinessItem complete={readiness.output}>
              {t("screen_nodes.outputAdded")}
            </ReadinessItem>
            <ReadinessItem complete={readiness.connection}>
              {t("screen_nodes.inputConnectedToOutput")}
            </ReadinessItem>
            <ReadinessItem complete={readiness.saved}>
              {t("screen_nodes.workflowSaved")}
            </ReadinessItem>
            <ReadinessItem complete={readiness.run}>
              {t("screen_nodes.workflowRunCompleted")}
            </ReadinessItem>
          </FlexColumn>
        ) : (
          <FlexRow gap={SPACING.md} wrap>
            <EditorButton variant="contained" onClick={onStart}>
              {t("i18n-next104-node.firstWorkflowGuide.addStarter")}
            </EditorButton>
            <EditorButton variant="outlined" onClick={onChooseOwn}>
              {t("i18n-next104-node.firstWorkflowGuide.chooseOwn")}
            </EditorButton>
            {onBrowseTemplates ? (
              <EditorButton variant="outlined" onClick={onBrowseTemplates}>
                {t("pass3_17.templates.sectionTitle")}
              </EditorButton>
            ) : null}
          </FlexRow>
        )}
      </FlexColumn>
    </Surface>
  );
};

export default FirstWorkflowGuide;
