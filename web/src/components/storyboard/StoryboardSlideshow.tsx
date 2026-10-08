/**
 * StoryboardSlideshow
 *
 * The board presented one shot at a time, full screen: the shot's current
 * picture, its number and its description, a filmstrip of every shot, and an
 * autoplay that holds each shot for its running time. It is how a creator (or
 * the person they are showing it to) reads the story before anything is cut.
 *
 * It differs from the two viewers the board already has. The card's
 * {@link ShotMediaViewer} pages through every take of every shot, which is a
 * review of renders rather than of the story. The timeline preview plays a
 * cut, which needs clips. This shows one picture per shot, the current one,
 * in board order, and a shot with nothing rendered still gets its slide.
 *
 * Mount it only while open: its index starts at `startShotId` and is not
 * reset by later prop changes.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import { resolveEffectiveProductionRequirement } from "@nodetool-ai/protocol";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import {
  Box,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  ResponsiveImage,
  ScrollArea,
  Text,
  ToolbarIconButton,
  VideoPlayer,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../ui_primitives";
import { useBoard } from "../../stores/storyboard/StoryboardStore";
import { sceneOrder } from "../../lib/storyboard/sceneOrder";
import ShotDesignFrame from "./ShotDesignFrame";

/** How long a still holds when its shot states no running time. */
export const DEFAULT_HOLD_SECONDS = 3;

interface StoryboardSlideshowProps {
  boardId: string;
  /** The shot to open on; the first shot when absent or gone. */
  startShotId?: string | null;
  onClose: () => void;
  /** Opens the shot editor on a shot. Absent on a read-only board. */
  onEditShot?: (shotId: string) => void;
}

interface Slide {
  shot: Shot;
  /** "Scene 2, Shot 3", numbered the way the cards are. */
  caption: string;
}

/** The clip a slide plays, when the shot is produced as footage. */
const slideClip = (shot: Shot) =>
  shot.clip &&
  resolveEffectiveProductionRequirement(undefined, shot.production)
    ?.media_strategy !== "still_motion_graphics"
    ? shot.clip
    : null;

const hasGraphics = (shot: Shot): boolean =>
  !!shot.graphics && shot.graphics.mode !== "none";

/** Seconds a slide stays up under autoplay, before the clip reports its own. */
export const slideHoldSeconds = (shot: Shot): number => {
  const clip = slideClip(shot);
  const seconds = clip?.duration ?? shot.duration_seconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_HOLD_SECONDS;
};

const stageSx = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  borderRadius: BORDER_RADIUS.lg,
  bgcolor: "c_overlay_subtle",
  overflow: "hidden",
  display: "grid",
  placeItems: "center"
} as const;

const mediaSx = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center"
} as const;

// The description takes the same height on every slide, so the stage above
// it, and the picture in it, keep their size when the text length changes.
const descriptionSx = {
  textAlign: "center",
  maxWidth: "80ch",
  alignSelf: "center",
  flexShrink: 0,
  height: "3lh",
  overflowY: "auto"
} as const;

const thumbSx = {
  flex: "0 0 auto",
  width: "7rem",
  p: 0,
  border: "2px solid",
  borderColor: "transparent",
  borderRadius: BORDER_RADIUS.md,
  overflow: "hidden",
  cursor: "pointer",
  bgcolor: "c_overlay_subtle",
  transition: MOTION.border,
  "&[aria-current='true']": { borderColor: "primary.main" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" }
} as const;

const StoryboardSlideshowInner: React.FC<StoryboardSlideshowProps> = ({
  boardId,
  startShotId,
  onClose,
  onEditShot
}) => {
  const { shots, screenplay, aspectRatio } = useBoard(boardId);
  const thumbAspect = (aspectRatio || "16:9").replace(":", " / ");
  const slides = useMemo<Slide[]>(
    () =>
      sceneOrder(shots, screenplay?.scenes).flatMap((group, sceneIndex) =>
        group.shots.map((shot, shotIndex) => ({
          shot,
          caption: `Scene ${sceneIndex + 1}, Shot ${shotIndex + 1}`
        }))
      ),
    [shots, screenplay?.scenes]
  );

  const [shotId, setShotId] = useState<string | null>(
    () => startShotId ?? null
  );
  const found = slides.findIndex((slide) => slide.shot.id === shotId);
  const index = found >= 0 ? found : 0;
  const slide = slides[index] as Slide | undefined;
  const [autoplay, setAutoplay] = useState(true);
  // What the playing clip reported as its length, for the slide it belongs to.
  const [clipSeconds, setClipSeconds] = useState<{
    shotId: string;
    seconds: number;
  } | null>(null);

  const step = useCallback(
    (delta: number) => {
      const next = slides[index + delta];
      if (next) {
        setShotId(next.shot.id);
      }
    },
    [slides, index]
  );

  const clip = slide ? slideClip(slide.shot) : null;
  const holdSeconds = slide
    ? clipSeconds?.shotId === slide.shot.id
      ? clipSeconds.seconds
      : slideHoldSeconds(slide.shot)
    : DEFAULT_HOLD_SECONDS;
  const atEnd = index >= slides.length - 1;

  // Autoplay advances after the slide's running time and stops on the last
  // slide rather than looping, so the end of the story reads as the end.
  useEffect(() => {
    if (!autoplay || atEnd || !slide) {
      return;
    }
    const timer = window.setTimeout(() => step(1), holdSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [autoplay, atEnd, slide, holdSeconds, step]);

  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // `scrollIntoView` is absent under jsdom.
    activeThumbRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "center",
      behavior: "smooth"
    });
  }, [index]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) {
        return;
      }
      const target = event.target as HTMLElement;
      // A focused video or slider uses the arrows to seek.
      if (target.closest("video, input, [role=slider]")) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    },
    [step]
  );

  const handleDuration = useCallback(
    (seconds: number) => {
      if (slide && Number.isFinite(seconds) && seconds > 0) {
        setClipSeconds({ shotId: slide.shot.id, seconds });
      }
    },
    [slide]
  );

  const handleEdit = useCallback(() => {
    if (slide && onEditShot) {
      onEditShot(slide.shot.id);
      onClose();
    }
  }, [slide, onEditShot, onClose]);

  const title = slide ? slide.caption : "Slideshow";

  return (
    <Dialog
      open
      fullScreen
      onClose={onClose}
      title={title}
      onKeyDown={handleKeyDown}
      className="storyboard-slideshow"
      titleActions={
        <FlexRow align="center" gap={SPACING.md}>
          <LabeledSwitch
            id="storyboard-slideshow-autoplay"
            label="Autoplay"
            size="small"
            checked={autoplay}
            onChange={setAutoplay}
          />
          {onEditShot && slide && (
            <EditorButton size="small" onClick={handleEdit}>
              Edit shot
            </EditorButton>
          )}
        </FlexRow>
      }
    >
      <FlexColumn gap={SPACING.md} fullHeight sx={{ minHeight: 0 }}>
        <FlexRow align="stretch" gap={SPACING.sm} sx={{ flex: 1, minHeight: 0 }}>
          <FlexRow align="center">
            <ToolbarIconButton
              icon={<ChevronLeftIcon />}
              tooltip="Previous shot"
              ariaLabel="Previous shot"
              onClick={() => step(-1)}
              disabled={index <= 0}
            />
          </FlexRow>
          <Box sx={stageSx} data-testid="slideshow-stage">
            {!slide ? (
              <Caption color="muted">This board has no shots.</Caption>
            ) : hasGraphics(slide.shot) ? (
              <Box sx={mediaSx}>
                <ShotDesignFrame boardId={boardId} shot={slide.shot} />
              </Box>
            ) : clip ? (
              <Box sx={mediaSx}>
                <VideoPlayer
                  key={slide.shot.id}
                  locator={clip}
                  label={slide.caption}
                  autoplay={autoplay}
                  onDurationChange={handleDuration}
                />
              </Box>
            ) : slide.shot.keyframe ? (
              <Box sx={mediaSx}>
                <ResponsiveImage
                  locator={slide.shot.keyframe}
                  alt={`${slide.caption} still`}
                  fit="contain"
                  sx={{ height: "100%" }}
                />
              </Box>
            ) : (
              <Caption color="muted">Not rendered yet</Caption>
            )}
          </Box>
          <FlexRow align="center">
            <ToolbarIconButton
              icon={<ChevronRightIcon />}
              tooltip="Next shot"
              ariaLabel="Next shot"
              onClick={() => step(1)}
              disabled={atEnd}
            />
          </FlexRow>
        </FlexRow>

        {slide && (
          <Text size="small" sx={descriptionSx} aria-live="polite">
            {slide.shot.action || "No description"}
          </Text>
        )}

        <ScrollArea thin sx={{ flexShrink: 0 }}>
          <FlexRow
            gap={SPACING.sm}
            role="group"
            aria-label="Shots"
            sx={{ pb: SPACING.xs, justifyContent: "safe center" }}
          >
            {slides.map((entry, entryIndex) => {
              const active = entryIndex === index;
              return (
                <Box
                  key={entry.shot.id}
                  component="button"
                  type="button"
                  ref={active ? activeThumbRef : undefined}
                  aria-current={active ? "true" : undefined}
                  aria-label={entry.caption}
                  title={entry.caption}
                  onClick={() => setShotId(entry.shot.id)}
                  sx={{ ...thumbSx, aspectRatio: thumbAspect }}
                >
                  {entry.shot.keyframe ? (
                    <ResponsiveImage
                      locator={entry.shot.keyframe}
                      alt=""
                      fit="cover"
                      preferThumbnail
                    />
                  ) : (
                    <Caption color="muted">{entryIndex + 1}</Caption>
                  )}
                </Box>
              );
            })}
          </FlexRow>
        </ScrollArea>
      </FlexColumn>
    </Dialog>
  );
};

export const StoryboardSlideshow = memo(StoryboardSlideshowInner);
StoryboardSlideshow.displayName = "StoryboardSlideshow";

export default StoryboardSlideshow;
