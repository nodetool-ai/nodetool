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
import type {
  SetupFlowConfig,
  SetupOperationContext,
  SetupStep
} from "./types";

const GenerationSummary = lazy(() => import("./GenerationSummary"));

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
  /**
   * Take the creator back to the entry surface to pick a different flow. Shown
   * on the first step, where `Back` has nowhere to go and the wrong card would
   * otherwise mean leaving the guided surface altogether.
   *
   * The shell asks before it calls this, and its question promises two things
   * the host owes: the description already typed, and any references with it,
   * carry over to the flow picked next, and the draft document created for
   * this flow is discarded rather than left behind as an empty project row.
   */
  onChangeFlow?: () => void | Promise<void>;
}

export function SetupFlow<Stage extends string>({
  config,
  onChangeFlow
}: SetupFlowProps<Stage>): React.ReactElement | null {
  const { labels, steps, stage, onStageChange } = config;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceledStage, setCanceledStage] = useState<Stage | null>(null);
  const [cancelingStage, setCancelingStage] = useState<Stage | null>(null);
  const [confirmingChange, setConfirmingChange] = useState(false);
  const blockedReasonId = useId();

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
    setError(null);
    const previous = steps[currentIndex - 1];
    if (previous) {
      onStageChange(previous.stage);
    }
  }, [currentIndex, onStageChange, steps]);

  const handleRewind = useCallback(
    (index: number) => {
      setError(null);
      onStageChange(steps[index].stage);
    },
    [onStageChange, steps]
  );

  const handleChangeFlow = useCallback(async () => {
    setConfirmingChange(false);
    setError(null);
    try {
      await onChangeFlow?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [onChangeFlow]);

  const canceled = canceledStage === stage || step?.canceled === true;
  const canceling = cancelingStage === stage;
  const pending =
    canceling || (!canceled && (busy || step?.pending === true));

  const handlePrimary = useCallback(async () => {
    if (!step) {
      return;
    }
    const origin = { stage: step.stage, revision: revisionRef.current };
    const operation = (operationRef.current += 1);
    const controller = new AbortController();
    activeControllerRef.current = controller;
    continueAfterUnmountRef.current = step.continueAfterUnmount === true;
    setError(null);
    setCanceledStage(null);
    setCancelingStage(null);
    setBusy(true);
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
  }, [currentIndex, isCurrent, onStageChange, step, steps]);

  const handleCancel = useCallback(() => {
    if (!step || !pending) {
      return;
    }
    operationRef.current += 1;
    continueAfterUnmountRef.current = false;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setError(null);
    setCanceledStage(step.stage);
    setCancelingStage(step.stage);
    const operation = activeOperationRef.current;
    void Promise.allSettled([
      operation ?? Promise.resolve(),
      Promise.resolve(step.onCancel?.())
    ]).then(() => {
      if (stageRef.current === step.stage) {
        setCancelingStage(null);
        setBusy(false);
      }
    });
  }, [pending, step]);

  const handleSkip = useCallback(async () => {
    if (!step?.onSkip) {
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
  }, [currentIndex, isCurrent, onStageChange, step, steps]);

  const blocked = step?.canAdvance === false;
  const shortcutActionRef = useRef({ blocked, pending, handlePrimary });
  shortcutActionRef.current = { blocked, pending, handlePrimary };

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
    []
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

  return (
    <FlexColumn
      data-setup-flow
      onKeyDown={handleShortcut}
      fullWidth
      fullHeight
      gap={GAP.spacious}
      padding={PADDING.section}
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
                      disabled={pending}
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

      {/* The step body scrolls under the action row, so it ends on padding
          rather than flush against it — a card cut in half at the bar reads as
          a layout bug, not as "there is more below". */}
      <ScrollArea
        ref={bodyRef}
        fullHeight
        sx={{ flex: 1, minHeight: 0, paddingBottom: SPACING.xxl }}
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
                ? "Stopping the canceled request before retry is available."
                : "Retry when you are ready. A new request will be started deliberately and the canceled request cannot replace this draft."}
            </Text>
          </FlexColumn>
        ) : error ? (
          <FlexColumn gap={GAP.spacious} fullWidth>
            <Text size="big" component="h1">
              We couldn&apos;t complete this step
            </Text>
            <AlertBanner severity="error" title="What failed">
              {error}
            </AlertBanner>
            <Text size="normal" color="secondary">
              Your setup is still here. Try again below, go back to change it,
              or report the failure with its diagnostics.
            </Text>
            <FlexRow gap={GAP.normal} align="center" wrap>
              <ReportBugButton
                label="Report this failure"
                variant="outlined"
                size="medium"
                context={{
                  source: "manual",
                  summary: `${labels.title} setup failed at ${step.label}`,
                  errorText: error
                }}
              />
            </FlexRow>
          </FlexColumn>
        ) : (
          step.render()
        )}
      </ScrollArea>

      {step.generation ? (
        <Suspense
          fallback={<Text size="small">Loading generation estimate…</Text>}
        >
          <GenerationSummary {...step.generation} />
        </Suspense>
      ) : null}

      <FlexRow
        gap={GAP.normal}
        align="center"
        justify="space-between"
        sx={{
          paddingTop: SPACING.lg,
          borderTop: "1px solid",
          borderColor: "divider"
        }}
      >
        <FlexRow gap={GAP.normal} align="center">
          {/* Back sits at the primary's height and text size. It is the quieter
              of the two, which the text variant already says; making it smaller
              as well put it under the weight of ordinary body copy. */}
          <EditorButton
            variant="text"
            size="large"
            onClick={handleBack}
            disabled={currentIndex === 0 || pending}
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
              disabled={pending}
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
              disabled={pending}
              sx={{ fontSize: FONT_SIZE_SANS.body }}
            >
              {step.skipLabel ?? "Skip"}
            </EditorButton>
          ) : null}
        </FlexRow>
        <FlexRow gap={GAP.normal} align="center">
          {/* Why the button is off comes first, and replaces the detail: a
              cost estimate beside a dead button answers a question nobody
              asked. */}
          {pending ? (
            <ThinkingIndicator
              label={step.pendingLabel ?? "Working"}
              announce
            />
          ) : canceled ? (
            <Caption color="secondary">Canceled</Caption>
          ) : blocked && step.blockedReason ? (
            <Caption color="secondary" id={blockedReasonId}>
              {step.blockedReason}
            </Caption>
          ) : step.primaryDetail ? (
            <Text size="normal">{step.primaryDetail}</Text>
          ) : null}
          <FlexRow gap={GAP.normal} align="center">
            {pending && !canceled ? (
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
              onClick={handlePrimary}
              disabled={blocked || pending}
              // The reason a dead button is dead is beside it, where a mouse can
              // read it; the description says it to a screen reader too.
              aria-describedby={
                blocked && step.blockedReason ? blockedReasonId : undefined
              }
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title={`${canceled ? "Retry" : error ? "Try again" : step.primaryLabel} (\u2318\u21A9 or Ctrl+\u21A9)`}
              sx={{
                fontSize: FONT_SIZE_SANS.body,
                paddingX: SPACING.xxl
              }}
            >
              {canceled ? "Retry" : error ? "Try again" : step.primaryLabel}
            </EditorButton>
          </FlexRow>
        </FlexRow>
      </FlexRow>

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
          {`What you have typed comes with you to the flow you pick next. This ${labels.title.toLowerCase()} draft is discarded — nothing has been generated for it yet.`}
        </Text>
      </Dialog>
    </FlexColumn>
  );
}

export default SetupFlow;
