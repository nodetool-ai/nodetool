/**
 * Opening a bound resource in the screen its kind already has.
 *
 * The route comes from the document registry (`documents/kinds.ts`), never from
 * here. `asset` is the one kind that is not a document; it has its own viewer.
 * A kind mobile does not open (server data can name any kind) pushes nothing:
 * the hook answers `false`, and the caller shows that the document opens in the
 * desktop or web app. There is deliberately no generic fallback screen.
 */
import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { findDocumentKindInfo } from "../../documents/kinds";
import type { RootStackParamList } from "../../navigation/types";

/** What the open path needs from a ref. `kind` is unchecked server data. */
export interface OpenableRef {
  kind: string;
  id: string;
}

/**
 * Pushes the screen for a resource. `name` seeds the header before the load.
 * Returns whether a screen was pushed.
 */
export type OpenResource = (ref: OpenableRef, name?: string) => boolean;

/** The inline note a caller shows when `OpenResource` answers `false`. */
export const OPENS_ON_DESKTOP_MESSAGE =
  "This document opens in the NodeTool desktop or web app.";

export const useOpenResource = (): OpenResource => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(
    (ref, name) => {
      if (ref.kind === "asset") {
        navigation.navigate("AssetViewer", { assetId: ref.id });
        return true;
      }
      // The registry says which route opens a kind; the param shapes differ, so
      // the switch is over the routes rather than over every kind.
      const info = findDocumentKindInfo(ref.kind);
      switch (info?.route) {
        case "StoryboardEditor":
          navigation.navigate("StoryboardEditor", { id: ref.id, name });
          return true;
        case "TimelineViewer":
          navigation.navigate("TimelineViewer", { id: ref.id, name });
          return true;
        case "SketchViewer":
          navigation.navigate("SketchViewer", { id: ref.id, name });
          return true;
        default:
          return false;
      }
    },
    [navigation]
  );
};
