import { Box, FlexColumn, SPACING } from "../../components/ui_primitives";
import { StoryboardBoard } from "../../components/storyboard/StoryboardBoard";
import { ShotEditTable } from "../../components/storyboard/ShotEditTable";
import { draftFromShot } from "../../components/storyboard/shotDraft";
import type { StoryboardCastDoc } from "./docCastTypes";

/** Keeps the board and its first shot's real direction fields visible together. */
export function StoryboardEditorSurface({
  boardId,
  doc
}: {
  boardId: string;
  doc: StoryboardCastDoc;
}): React.JSX.Element {
  const shot = doc.shots[0];
  return (
    <FlexColumn fullHeight gap={SPACING.md} sx={{ minWidth: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <StoryboardBoard boardId={boardId} readOnly />
      </Box>
      <Box sx={{ height: 320, flexShrink: 0, p: SPACING.md }}>
        {shot && (
          <Box data-focus-id="storyboard-shot-direction">
            <ShotEditTable
              draft={draftFromShot(shot, null)}
              onChange={() => undefined}
              numbering={{ scene: 0, shot: shot.index + 1 }}
              aspectRatio={doc.aspectRatio}
              linksLines={false}
              takesDuration={null}
              readOnly
            />
          </Box>
        )}
      </Box>
    </FlexColumn>
  );
}
