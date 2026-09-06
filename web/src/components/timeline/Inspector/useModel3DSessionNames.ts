/**
 * The glTF names a `model3d` clip's pickers offer: the animations and cameras
 * the render session reads out of the model itself (design §D5).
 *
 * The names come from the same `Model3DLayerSource` the preview draws with, in
 * a pool of one held only while the inspector's 3D section is mounted — a
 * folded section costs no WebGL context (R2), and an open one shows a loading
 * state until the model resolves (R4).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipModel3DStyle, TimelineClip } from "@nodetool-ai/timeline";
import type { ActiveLayer } from "@nodetool-ai/timeline/render";

import { Model3DLayerSource } from "../preview/Model3DLayerSource";
import { useAssetUrl } from "../Tracks/useAssetUrl";

/** What the inspector knows about a 3D clip's model right now. */
export interface Model3DSessionNames {
  status: "loading" | "ready" | "unavailable";
  animations: readonly string[];
  cameras: readonly string[];
  /** Why there are no names — shown in place of the pickers. */
  message?: string;
}

const LOADING: Model3DSessionNames = {
  status: "loading",
  animations: [],
  cameras: []
};

function unavailable(message: string): Model3DSessionNames {
  return { status: "unavailable", animations: [], cameras: [], message };
}

/**
 * The animation and camera names of `clip`'s glTF. `style` fixes the session
 * the names are read from; it is held on a ref rather than in the effect's
 * dependencies, because the names come from the model and re-reading them on
 * every lighting or camera edit would rebuild a session for nothing.
 */
export function useModel3DSessionNames(
  clip: TimelineClip,
  style: ClipModel3DStyle
): Model3DSessionNames {
  const assetId = clip.currentAssetId;
  const url = useAssetUrl(assetId);
  const urlRef = useRef(url);
  urlRef.current = url;
  const styleRef = useRef(style);
  styleRef.current = style;
  const clipRef = useRef(clip);
  clipRef.current = clip;

  const source = useMemo(
    () =>
      new Model3DLayerSource({
        resolveUrl: () => urlRef.current,
        maxSessions: 1
      }),
    []
  );
  useEffect(() => () => source.dispose(), [source]);

  const [names, setNames] = useState<Model3DSessionNames>(LOADING);

  useEffect(() => {
    if (!assetId) {
      setNames(unavailable("This clip has no model asset yet."));
      return;
    }
    // The asset url resolves asynchronously; the source would forget an entry
    // it cannot fetch, so wait for the url rather than loading into nothing.
    if (!url) {
      setNames(LOADING);
      return;
    }
    let cancelled = false;
    setNames(LOADING);
    const layer: ActiveLayer = {
      kind: "model3d",
      clip: clipRef.current,
      clipId: clip.id,
      trackIndex: 0,
      blendMode: "normal",
      opacity: 1,
      assetId,
      model3dStyle: styleRef.current
    };
    const settle = (): void => {
      if (cancelled) return;
      const state = source.state(clip.id);
      if (state?.status === "ready") {
        setNames({
          status: "ready",
          animations: state.session.animations,
          cameras: state.session.cameras
        });
      } else if (state?.status === "unavailable") {
        setNames(unavailable(state.message));
      } else {
        setNames(unavailable("This clip's model could not be loaded."));
      }
    };
    // Both arms: the pool reports a failure as a state, but a rejected load
    // still has to leave the section with something to say.
    source.load(layer).then(settle, settle);
    return () => {
      cancelled = true;
    };
  }, [source, clip.id, assetId, url]);

  return names;
}
