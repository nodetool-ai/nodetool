import React from "react";
import { Composition, registerRoot } from "remotion";
import { MarketingFilm } from "./MarketingFilm";
import { editFrames, MARKETING_EDITS, MARKETING_FPS } from "./catalog";

export function MarketingRoot(): React.JSX.Element {
  return (
    <>
      {MARKETING_EDITS.map((edit) => (
        <Composition
          key={edit.slug}
          id={`Marketing-${edit.slug}`}
          component={MarketingFilm}
          defaultProps={{ edit }}
          width={1920}
          height={1080}
          fps={MARKETING_FPS}
          durationInFrames={editFrames(edit)}
        />
      ))}
    </>
  );
}

registerRoot(MarketingRoot);
