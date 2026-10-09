/**
 * SetupFlow — the one shell every guided creation flow renders in (PRD § 6.2).
 *
 * Stepper, `Back`, the primary button, and a slot for the current step's body.
 * The flow is a function of the document's stage plus its fields (D1, D3): the
 * shell keeps no wizard store, only the transient busy/error state of the
 * action it is awaiting. It assumes no route, no store and no host layout, so
 * the same component renders inside a workspace tab and inside Studio, sized
 * to whatever container it is given.
 */

import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
  AlertBanner,
  Box,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  FONT_SIZE_SANS,
  GAP,
  PADDING,
  ScrollArea,
  SPACING,
  SPACING_PX,
  Text,
  ThinkingIndicator
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { MediaGalleryProvider } from "./MediaGallery";
import type {
  SetupFlowConfig,
  SetupOperationContext,
  SetupStep
} from "./types";

const GenerationEstimateLine = lazy(() =>
  import("./GenerationSummary").then((module) => ({
    default: module.GenerationEstimateLine
  }))
);

export type { SetupFlowConfig, SetupFlowLabels, SetupStep } from "./types";

/** One stepper entry: a label and the span of steps it stands for. */
interface StepperEntry {
  label: string;
  firstIndex: number;
  /**
   * The last step in the span, and where the entry navigates back to. A merged
   * entry's plan review is the stage the creator left, so returning to the
   * picker instead would throw away the plan they came back to read.
   */
  lastIndex: number;
}

/**
 * Consecutive steps sharing a label are one stepper entry. A flow's step 2
 * spans two stages — the picker and the plan review it produces — and the
 * creator should see one dot for both (PRD § 6.2).
 */
const stepperEntries = <Stage extends string>(
  steps: readonly SetupStep<Stage>[]
): StepperEntry[] =>
  steps.reduce<StepperEntry[]>((entries, step, index) => {
    const last = entries[entries.length - 1];
    if (last?.label === step.label) {
      last.lastIndex = index;
      return entries;
    }
    return [
      ...entries,
      { label: step.label, firstIndex: index, lastIndex: index }
    ];
  }, []);

/**
 * What the second half of a merged entry is called. Every flow's step 2 is a
 * selection followed by the plan it produces (PRD § 6.2), so the entry names
 * the half the creator is on without gaining a dot of its own: the flow's own
 * label stays, and the review it is now showing is said out loud.
 */
const SUBSTEP_LABEL = "Review";

export interface SetupFlowProps<Stage extends string> {
  config: SetupFlowConfig<Stage>;
  /** Show the current setup state without offering document mutations. */
  readOnly?: boolean;
  /**
   * Take the creator back to the entry surface to pick a different flow. Shown
   * on the first step, where `Back` has nowhere to go and the wrong card would
   * otherwise mean leaving the guided surface altogether.
   *
   * The shell asks before it calls this, and its question promises two things
   * the host owes: the description already typed, and the references and
   * entities that came with it, carry over to the flow picked next, and the
   * draft document created for this flow is discarded rather than left behind
   * as an empty project row.
   */
  onChangeFlow?: () => void | Promise<void>;
}

export function SetupFlow<Stage extends string>({
  config,
  onChangeFlow,
  readOnly = false
}: SetupFlowProps<Stage>): React.ReactElement | null {
  const { labels, steps, stage, onStageChange } = config;
  const [busy, setBusy] = useState(false);
  // True only while the shell awaits the step's own `onAdvance`, the one run
  // it holds an abort signal for.
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceledStage, setCanceledStage] = useState<Stage | null>(null);
  const [cancelingStage, setCancelingStage] = useState<Stage | null>(null);
  const [confirmingChange, setConfirmingChange] = useState(false);
  const [changingFlow, setChangingFlow] = useState(false);
  // Kept apart from the step's own error, whose "Try again" runs the step: a
  // failed discard is retried from "Change flow", not by advancing.
  const [changeFlowError, setChangeFlowError] = useState<string | null>(null);
  const blockedReasonId = useId();
  // A phone cannot fit the controls, the estimate and the buttons on one
  // row, so the footer stacks there.
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("sm"));

  const currentIndex = steps.findIndex((step) => step.stage === stage);
  const entries = useMemo(() => stepperEntries(steps), [steps]);
  const step = currentIndex >= 0 ? steps[currentIndex] : undefined;
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // A model call outlives the stage that asked for it. The stage plus a
  // counter that moves on every stage change is the token an in-flight action
  // is measured against: a result that comes back to a different token belongs
  // to a screen the creator has left, so it neither advances them nor reports
  // its failure over what they are reading now.
  const stageRef = useRef(stage);
  const revisionRef = useRef(0);
  const operationRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const activeOperationRef = useRef<Promise<unknown> | null>(null);
  const continueAfterUnmountRef = useRef(false);
  const shortcutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What had focus when a run started. The locked body and button drop it to
  // the page, so a run that ends on the same step hands it back.
  const returnFocusRef = useRef<{ element: HTMLElement; stage: Stage } | null>(
    null
  );
  if (stageRef.current !== stage) {
    stageRef.current = stage;
    revisionRef.current += 1;
  }
  const isCurrent = useCallback(
    (origin: { stage: Stage; revision: number }) =>
      stageRef.current === origin.stage &&
      revisionRef.current === origin.revision,
    []
  );

  // Entering a step puts the creator at the top of new content, so the body
  // starts at its own beginning and the keyboard lands on the step's heading
  // rather than staying on the footer button that left the last one. The first
  // stage is skipped: its own field takes focus.
  const focusedStageRef = useRef(stage);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || focusedStageRef.current === stage) {
      return;
    }
    focusedStageRef.current = stage;
    body.scrollTop = 0;
    const target =
      body.querySelector<HTMLElement>("h1, h2") ??
      body.querySelector<HTMLElement>("h3") ??
      body;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [stage]);

  useEffect(
    () => () => {
      operationRef.current += 1;
      if (!continueAfterUnmountRef.current) {
        activeControllerRef.current?.abort();
      }
      activeControllerRef.current = null;
      activeOperationRef.current = null;
      if (shortcutTimerRef.current !== null) {
        clearTimeout(shortcutTimerRef.current);
      }
    },
    []
  );

  const handleBack = useCallback(() => {
    if (readOnly) {
      return;
    }
    setError(null);
    // Leaving a canceled step clears it, so coming back shows the step body
    // again instead of a canceled notice whose only way out is a paid Retry.
    setCanceledStage(null);
    const previous = steps[currentIndex - 1];
    if (previous) {
      onStageChange(previous.stage);
    }
  }, [currentIndex, onStageChange, readOnly, steps]);

  const handleRewind = useCallback(
    (index: number) => {
      if (readOnly) {
        return;
      }
      setError(null);
      setCanceledStage(null);
      onStageChange(steps[index].stage);
    },
    [onStageChange, readOnly, steps]
  );

  const handleChangeFlow = useCallback(async () => {
    setConfirmingChange(false);
    setChangeFlowError(null);
    setChangingFlow(true);
    try {
      await onChangeFlow?.();
    } catch (cause) {
      setChangeFlowError(
        cause instanceof Error ? cause.message : String(cause)
      );
    } finally {
      setChangingFlow(false);
    }
  }, [onChangeFlow]);

  const canceled = canceledStage === stage || step?.canceled === true;
  const canceling = cancelingStage === stage;
  const pending = canceling || (!canceled && (busy || step?.pending === true));
  // Cancel is offered only where pressing it stops something: the shell's own
  // run, which it can abort, or a step that says how to stop its run.
  const cancelable =
    (advancing && step?.cancelable !== false) || step?.onCancel !== undefined;
  // A step that reports its own `canceled` state owns what retrying means, as
  // the workflow review does by planning again. Every other cancel returns to
  // the step it says is unchanged, so picking something else does not need a
  // paid Retry of the old choice first.
  const backToStep = canceled && step?.canceled !== true;
  const locked = pending || changingFlow;

  useEffect(() => {
    const saved = returnFocusRef.current;
    if (locked || !saved) {
      return;
    }
    returnFocusRef.current = null;
    const active = document.activeElement;
    if (
      saved.stage !== stage ||
      !saved.element.isConnected ||
      (active !== null && active !== document.body)
    ) {
      return;
    }
    saved.element.focus({ preventScroll: true });
  }, [locked, stage]);

  const handlePrimary = useCallback(async () => {
    if (!step || readOnly) {
      return;
    }
    const origin = { stage: step.stage, revision: revisionRef.current };
    const operation = (operationRef.current += 1);
    const controller = new AbortController();
    activeControllerRef.current = controller;
    continueAfterUnmountRef.current = step.continueAfterUnmount === true;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? { element: document.activeElement, stage: step.stage }
        : null;
    setError(null);
    setCanceledStage(null);
    setCancelingStage(null);
    setBusy(true);
    setAdvancing(true);
    const run = (async () => {
      try {
        const context: SetupOperationContext = { signal: controller.signal };
        const shouldAdvance = await step.onAdvance?.(context);
        if (
          shouldAdvance === false ||
          !isCurrent(origin) ||
          operation !== operationRef.current ||
          controller.signal.aborted
        ) {
          return;
        }
        // The last step's action writes the terminal stage itself, so there is
        // nothing left for the shell to advance.
        const next = steps[currentIndex + 1];
        if (next) {
          onStageChange(next.stage);
        }
      } catch (cause) {
        if (
          !isCurrent(origin) ||
          operation !== operationRef.current ||
          controller.signal.aborted
        ) {
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
          continueAfterUnmountRef.current = false;
          setBusy(false);
          setAdvancing(false);
        }
      }
    })();
    activeOperationRef.current = run;
    try {
      await run;
    } finally {
      if (activeOperationRef.current === run) {
        activeOperationRef.current = null;
      }
    }
  }, [currentIndex, isCurrent, onStageChange, readOnly, step, steps]);

  const handleCancel = useCallback(() => {
    if (!step || !pending) {
      return;
    }
    const cancellation = (operationRef.current += 1);
    continueAfterUnmountRef.current = false;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setError(null);
    setAdvancing(false);
    setCanceledStage(step.stage);
    setCancelingStage(step.stage);
    const operation = activeOperationRef.current;
    void Promise.allSettled([
      operation ?? Promise.resolve(),
      Promise.resolve(step.onCancel?.())
    ]).then(() => {
      if (operationRef.current === cancellation) {
        setCancelingStage(null);
        setBusy(false);
      }
    });
  }, [pending, step]);

  // Leaves the canceled state and shows the step again, unchanged.
  const handleBackToStep = useCallback(() => {
    setCanceledStage(null);
  }, []);

  const handleSkip = useCallback(async () => {
    if (!step?.onSkip || readOnly) {
      return;
    }
    const origin = { stage: step.stage, revision: revisionRef.current };
    setError(null);
    setBusy(true);
    try {
      await step.onSkip();
      if (!isCurrent(origin)) {
        return;
      }
      const next = steps[currentIndex + 1];
      if (next) {
        onStageChange(next.stage);
      }
    } catch (cause) {
      if (isCurrent(origin)) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setBusy(false);
    }
  }, [currentIndex, isCurrent, onStageChange, readOnly, step, steps]);

  const blocked = step?.canAdvance === false;
  const handlePrimaryAction = backToStep ? handleBackToStep : handlePrimary;
  const shortcutActionRef = useRef({
    blocked,
    pending: locked,
    handlePrimary: handlePrimaryAction
  });
  shortcutActionRef.current = {
    // The button is live on a blocked step when it only returns to it.
    blocked: blocked && !backToStep,
    pending: locked,
    handlePrimary: handlePrimaryAction
  };

  // The primary action from the keyboard. Every step's body is a text field or
  // a picker, and a plain Enter belongs to whatever has focus — a line break in
  // a brief, a choice in a grid — so the modifier carries the step instead.
  // The delayed read is intentional: a single-line review field commits on
  // this same keydown, and that committed value must re-render validation
  // before the shell decides whether the step may advance.
  const handleShortcut = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      // React bubbles keys out of portals, so a dialog opened from a step
      // (add a style, the gallery, "Change flow?") would otherwise start the
      // step's action behind it.
      if (!event.currentTarget.contains(event.target as Node)) {
        return;
      }
      if (locked || readOnly) {
        return;
      }
      event.preventDefault();
      if (shortcutTimerRef.current !== null) {
        clearTimeout(shortcutTimerRef.current);
      }
      shortcutTimerRef.current = setTimeout(() => {
        shortcutTimerRef.current = null;
        const action = shortcutActionRef.current;
        if (!action.blocked && !action.pending) {
          void action.handlePrimary();
        }
      }, 0);
    },
    [locked, readOnly]
  );

  // A stage outside the flow (a finished document) belongs to the editor, not
  // to this shell.
  if (!step) {
    return null;
  }

  const currentEntry = entries.reduce(
    (best, entry, index) => (entry.firstIndex <= currentIndex ? index : best),
    0
  );
  const primaryText = backToStep
    ? currentIndex > entries[currentEntry].firstIndex
      ? `Back to ${SUBSTEP_LABEL.toLowerCase()}`
      : "Back to this step"
    : canceled
      ? "Retry"
      : error
        ? "Try again"
        : step.primaryLabel;
  const bodyLocked = readOnly || locked;

  // Why the button is off comes first, and replaces the detail: a cost
  // estimate beside a dead button answers a question nobody asked.
  // Every status reads at the estimate's size, so the line holds one size
  // whichever state it is in.
  const status = pending ? (
    <FlexRow gap={GAP.normal} align="center" wrap>
      <Text size="small" component="div">
        <ThinkingIndicator label={step.pendingLabel ?? "Working"} announce />
      </Text>
      {/* The body locks while the run reads it, so the step says why. */}
      <Caption size="small" color="secondary">
        Changes are paused
      </Caption>
    </FlexRow>
  ) : changingFlow ? (
    <Caption size="small" color="secondary">
      Discarding this draft
    </Caption>
  ) : canceled ? (
    <Caption size="small" color="secondary">
      Canceled
    </Caption>
  ) : blocked && step.blockedReason ? (
    <Caption size="small" color="secondary" id={blockedReasonId}>
      {step.blockedReason}
    </Caption>
  ) : step.primaryDetail ? (
    <Text size="small">{step.primaryDetail}</Text>
  ) : step.generation ? (
    <Suspense fallback={null}>
      <GenerationEstimateLine
        {...step.generation}
        hideModel={step.footerControls !== undefined}
      />
    </Suspense>
  ) : null;

  // The inputs the price depends on, beside the price. They lock while a run
  // is pending, since the run already read them.
  const footerControls = step.footerControls ? (
    <FlexRow
      role="group"
      aria-label="Generation settings"
      gap={GAP.normal}
      align="center"
      wrap
    >
      {step.footerControls({ readOnly: readOnly || locked })}
    </FlexRow>
  ) : null;

  return (
    <FlexColumn
      data-setup-flow
      onKeyDown={handleShortcut}
      fullWidth
      fullHeight
      gap={narrow ? GAP.comfortable : GAP.spacious}
      padding={narrow ? PADDING.spacious : PADDING.section}
      sx={{ minHeight: 0 }}
    >
      {/* The flow's name is an eyebrow on the stepper's row, not a heading:
          every host already names the document above this panel, and the
          largest text on the page belongs to the step the creator is on. */}
      <FlexRow gap={GAP.normal} align="baseline" wrap>
        <Text size="small" color="secondary" component="h2">
          {labels.title}
        </Text>
        <Box component="nav" aria-label="Setup steps">
          <FlexRow
            component="ol"
            gap={GAP.normal}
            align="center"
            wrap
            sx={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              "& li": { listStyle: "none" }
            }}
          >
            {entries.map((entry, index) => {
              // The marker moves inside a merged entry: once the plan arrives,
              // the creator is on the review, and the stepper says so.
              const onSubstep =
                index === currentEntry && currentIndex > entry.firstIndex;
              const text = onSubstep
                ? `${index + 1}. ${entry.label} · ${SUBSTEP_LABEL}`
                : `${index + 1}. ${entry.label}`;
              return (
                <FlexRow
                  component="li"
                  key={entry.label}
                  gap={GAP.normal}
                  align="center"
                >
                  {index > 0 ? (
                    <Box
                      aria-hidden
                      sx={{
                        width: SPACING_PX.xl,
                        height: "1px",
                        backgroundColor: "divider"
                      }}
                    />
                  ) : null}
                  {index < currentEntry ? (
                    <EditorButton
                      variant="text"
                      onClick={() => handleRewind(entry.lastIndex)}
                      disabled={locked || readOnly || step.holdNavigation}
                      sx={{ fontSize: FONT_SIZE_SANS.body }}
                    >
                      {text}
                    </EditorButton>
                  ) : (
                    <Text
                      size="normal"
                      component="span"
                      color={index === currentEntry ? "primary" : "secondary"}
                      aria-current={index === currentEntry ? "step" : undefined}
                      sx={{
                        fontWeight: index === currentEntry ? 500 : 400,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {text}
                    </Text>
                  )}
                </FlexRow>
              );
            })}
          </FlexRow>
        </Box>
      </FlexRow>

      {labels.subline ? (
        <Text size="normal" color="secondary">
          {labels.subline}
        </Text>
      ) : null}

      {readOnly ? (
        <AlertBanner severity="info" title="View only">
          This setup can be reviewed here, but it cannot be changed in view
          mode.
        </AlertBanner>
      ) : null}

      {/* The step body scrolls under the action row, so it ends on padding
          rather than flush against it — a card cut in half at the bar reads as
          a layout bug, not as "there is more below". */}
      <ScrollArea
        ref={bodyRef}
        fullHeight
        sx={{ flex: 1, minHeight: 0, paddingBottom: SPACING.xxl }}
      >
        {/* A failure is reported above the step, not in place of it: the
            creator can pick something else right here, or try again. */}
        {changeFlowError && currentIndex === 0 ? (
          <AlertBanner
            severity="error"
            title="We couldn't discard this draft"
            sx={{ marginBottom: SPACING.xl }}
            action={
              <ReportBugButton
                label="Report this failure"
                variant="outlined"
                size="small"
                context={{
                  source: "manual",
                  summary: `${labels.title} setup failed to change flow`,
                  errorText: changeFlowError
                }}
              />
            }
          >
            {`${changeFlowError} Press Change flow to try again.`}
          </AlertBanner>
        ) : null}
        {error && !canceled ? (
          <AlertBanner
            severity="error"
            title="We couldn't complete this step"
            sx={{ marginBottom: SPACING.xl }}
            action={
              <ReportBugButton
                label="Report this failure"
                variant="outlined"
                size="small"
                context={{
                  source: "manual",
                  summary: `${labels.title} setup failed at ${step.label}`,
                  errorText: error
                }}
              />
            }
          >
            {error}
          </AlertBanner>
        ) : null}
        <Box
          component="fieldset"
          // A pending run already read the step, so the body locks with it
          // and a pick made now cannot be lost or answered for the old one.
          // View mode does not disable it: each step honors `readOnly`, and
          // expanding a gallery or playing a sample changes nothing.
          disabled={locked}
          aria-readonly={bodyLocked || undefined}
          aria-busy={locked || undefined}
          sx={{ border: 0, margin: 0, padding: 0, minWidth: 0, width: "100%" }}
        >
          {canceled ? (
            <FlexColumn gap={GAP.spacious} fullWidth>
              <Text size="big" component="h1">
                This step was canceled
              </Text>
              <AlertBanner severity="info" title="Canceled">
                The pending operation was canceled. Your draft is unchanged.
              </AlertBanner>
              <Text size="normal" color="secondary">
                {canceling
                  ? "Stopping the canceled request."
                  : backToStep
                    ? "Go back to the step when you are ready. The canceled request cannot replace this draft."
                    : "Retry when you are ready. A new request will be started deliberately and the canceled request cannot replace this draft."}
              </Text>
            </FlexColumn>
          ) : (
            // Each step is one view: its gallery pages through its own media.
            <MediaGalleryProvider>
              {step.render({ readOnly: bodyLocked })}
            </MediaGalleryProvider>
          )}
        </Box>
      </ScrollArea>

      {readOnly && footerControls ? (
        <FlexRow
          fullWidth
          sx={{
            paddingTop: SPACING.md,
            borderTop: "1px solid",
            borderColor: "divider"
          }}
        >
          {footerControls}
        </FlexRow>
      ) : null}

      {!readOnly ? (
        <FlexColumn
          gap={GAP.tight}
          fullWidth
          sx={{
            paddingTop: SPACING.md,
            borderTop: "1px solid",
            borderColor: "divider"
          }}
        >
          {/* A phone cannot fit the controls and the status beside the
              buttons, so they take their own lines above them rather than
              crushing them. */}
          {narrow && footerControls ? footerControls : null}
          {narrow && status ? (
            <FlexRow justify="flex-end" sx={{ textAlign: "right" }}>
              {status}
            </FlexRow>
          ) : null}
          <FlexRow gap={GAP.normal} align="center" justify="space-between">
            <FlexRow gap={narrow ? GAP.none : GAP.normal} align="center">
              {/* Back sits at the primary's height and text size. It is the quieter
                of the two, which the text variant already says; making it smaller
                as well put it under the weight of ordinary body copy. */}
              <EditorButton
                variant="text"
                size="large"
                onClick={handleBack}
                disabled={currentIndex === 0 || locked || step.holdNavigation}
                sx={{ fontSize: FONT_SIZE_SANS.body }}
              >
                Back
              </EditorButton>
              {/* The way out of the wrong card. It stands where `Back` is dead, on
                the first step, and only when a host can actually perform the
                switch — an enabled control that does nothing is worse than none. */}
              {onChangeFlow && currentIndex === 0 ? (
                <EditorButton
                  variant="text"
                  size="large"
                  onClick={() => setConfirmingChange(true)}
                  disabled={locked || step.holdNavigation}
                  sx={{ fontSize: FONT_SIZE_SANS.body }}
                >
                  Change flow
                </EditorButton>
              ) : null}
              {step.onSkip ? (
                <EditorButton
                  variant="text"
                  size="large"
                  onClick={() => void handleSkip()}
                  disabled={locked}
                  sx={{ fontSize: FONT_SIZE_SANS.body }}
                >
                  {step.skipLabel ?? "Skip"}
                </EditorButton>
              ) : null}
            </FlexRow>
            <FlexRow
              gap={GAP.comfortable}
              align="center"
              justify="flex-end"
              wrap
              sx={{ flex: 1, minWidth: 0 }}
            >
              {narrow ? null : footerControls}
              {narrow ? null : status}
              <FlexRow gap={GAP.normal} align="center">
                {pending && !canceled && cancelable ? (
                  <EditorButton
                    variant="text"
                    size="large"
                    onClick={handleCancel}
                    sx={{ fontSize: FONT_SIZE_SANS.body }}
                  >
                    Cancel
                  </EditorButton>
                ) : null}
                <EditorButton
                  variant="contained"
                  size="large"
                  onClick={() => void handlePrimaryAction()}
                  disabled={(blocked && !backToStep) || locked}
                  // The reason a dead button is dead is beside it, where a mouse can
                  // read it; the description says it to a screen reader too.
                  aria-describedby={
                    blocked && step.blockedReason ? blockedReasonId : undefined
                  }
                  aria-keyshortcuts="Meta+Enter Control+Enter"
                  title={`${primaryText} (\u2318\u21A9 or Ctrl+\u21A9)`}
                  sx={{
                    fontSize: FONT_SIZE_SANS.body,
                    paddingX: narrow ? SPACING.xl : SPACING.xxl,
                    whiteSpace: "nowrap"
                  }}
                >
                  {primaryText}
                </EditorButton>
              </FlexRow>
            </FlexRow>
          </FlexRow>
        </FlexColumn>
      ) : null}

      <Dialog
        open={confirmingChange}
        onClose={() => setConfirmingChange(false)}
        title="Change flow?"
        showActions
        destructive
        confirmText="Discard and choose"
        cancelText="Keep this draft"
        onConfirm={() => void handleChangeFlow()}
        onCancel={() => setConfirmingChange(false)}
        maxWidth="xs"
      >
        <Text size="normal">
          {`Your brief, and the references and entities you started with, come with you to the flow you pick next. This ${labels.title.toLowerCase()} draft is discarded with anything else added on this step, such as creative context, imported files and placed media. Nothing has been generated for it yet.`}
        </Text>
      </Dialog>
    </FlexColumn>
  );
}

export default SetupFlow;
