/**
 * Opening a bound resource in the screen its kind already has.
 *
 * The route comes from the document registry (`documents/kinds.ts`), never from
 * here: a kind that later grows a dedicated screen — or loses one and falls
 * back to `DocumentViewer` — starts opening there with no change in the app
 * runtime. `asset` is the one `ResourceKind` that is not a document; it has its
 * own viewer.
 */
import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ResourceRef } from "@nodetool-ai/app-runtime";

import { documentKindInfo } from "../../documents/kinds";
import type { RootStackParamList } from "../../navigation/types";

/** Pushes the screen for a resource. `name` seeds the header before the load. */
export type OpenResource = (ref: ResourceRef, name?: string) => void;

export const useOpenResource = (): OpenResource => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return useCallback(
    (ref, name) => {
      if (ref.kind === "asset") {
        navigation.navigate("AssetViewer", { assetId: ref.id });
        return;
      }
      // The registry says which route opens a kind; the param shapes differ, so
      // the switch is over the routes rather than over every kind.
      const info = documentKindInfo(ref.kind);
      switch (info.route) {
        case "StoryboardEditor":
          navigation.navigate("StoryboardEditor", { id: ref.id, name });
          break;
        case "ScriptEditor":
          navigation.navigate("ScriptEditor", { id: ref.id, name });
          break;
        case "TimelineViewer":
          navigation.navigate("TimelineViewer", { id: ref.id, name });
          break;
        case "SketchViewer":
          navigation.navigate("SketchViewer", { id: ref.id, name });
          break;
        case "DocumentViewer":
          navigation.navigate("DocumentViewer", {
            kind: ref.kind,
            id: ref.id,
            name,
          });
          break;
      }
    },
    [navigation]
  );
};
