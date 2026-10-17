/**
 * The views the DAW lab page can show (`?view=<name>`). Each DAW feature adds
 * its view here so it can be checked in a browser without a backend.
 */

import React from "react";

import { PreviewArea } from "../../preview/PreviewArea";
import { TracksRegion } from "../../Tracks/TracksRegion";

export interface LabView {
  title: string;
  render: () => React.ReactNode;
}

export const LAB_VIEWS: Record<string, LabView> = {
  tracks: {
    title: "Preview and tracks",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PreviewArea fps={30} sequenceWidth={1920} sequenceHeight={1080} />
        </div>
        <TracksRegion heightPx={360} />
      </div>
    )
  }
};
