import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

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

interface FirstWorkflowReadiness {
  readonly input: boolean;
  readonly output: boolean;
  readonly connection: boolean;
  readonly saved: boolean;
  readonly run: boolean;
}

interface FirstWorkflowGuideProps {
  readonly started: boolean;
  readonly readiness: FirstWorkflowReadiness;
  readonly onStart: () => void;
  readonly onChooseOwn: () => void;
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
  started,
  readiness,
  onStart,
  onChooseOwn,
  onClose
}: FirstWorkflowGuideProps) => (
  <Surface
    aria-label="First workflow guide"
    bordered
    elevation={3}
    padding={SPACING.xl}
    sx={{
      position: "absolute",
      top: SPACING.xxl,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: Z_INDEX.overlay
    }}
  >
    <FlexColumn gap={SPACING.lg}>
      <FlexRow align="start" justify="space-between" gap={SPACING.lg}>
        <FlexColumn gap={SPACING.xs}>
          <Text size="big">Build your first useful workflow</Text>
          <Caption>
            Connect a text input to an output, run it, and see the result. This
            starter needs no model or provider setup.
          </Caption>
        </FlexColumn>
        {started ? <CloseButton onClick={onClose} tooltip="Close guide" /> : null}
      </FlexRow>

      {started ? (
        <FlexColumn component="ol" gap={SPACING.sm} sx={{ m: 0, p: 0 }}>
          <ReadinessItem complete={readiness.input}>Input added</ReadinessItem>
          <ReadinessItem complete={readiness.output}>Output added</ReadinessItem>
          <ReadinessItem complete={readiness.connection}>
            Input connected to output
          </ReadinessItem>
          <ReadinessItem complete={readiness.saved}>Workflow saved</ReadinessItem>
          <ReadinessItem complete={readiness.run}>
            Workflow run completed
          </ReadinessItem>
        </FlexColumn>
      ) : (
        <FlexRow gap={SPACING.md} wrap="wrap">
          <EditorButton variant="contained" onClick={onStart}>
            Add the two-node starter
          </EditorButton>
          <EditorButton variant="outlined" onClick={onChooseOwn}>
            Choose my own nodes
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  </Surface>
);

export default FirstWorkflowGuide;
