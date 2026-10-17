/**
 * A `fable` effect's device view inside a track's FX rack, loaded on demand
 * through the device view registry.
 */

import type * as React from "react";
import { Suspense } from "react";

import type { FableEffectKind } from "@nodetool-ai/timeline";

import { LoadingSpinner } from "../../../ui_primitives";
import { fxView } from "../devices/deviceViews";
import "../devices/registerDeviceViews";

export function FableFxInline({
  trackId,
  effectId,
  kind
}: {
  trackId: string | null;
  effectId: string;
  kind: FableEffectKind;
}): React.ReactElement | null {
  const View = fxView(`fable:${kind}`);
  if (!View) return null;
  return (
    <Suspense fallback={<LoadingSpinner size="small" />}>
      <View trackId={trackId} effectId={effectId} />
    </Suspense>
  );
}
