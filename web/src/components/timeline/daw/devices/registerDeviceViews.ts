/**
 * Registers every device view. Imported once by the DAW dock and the
 * inspector's instrument tab.
 */

import "./registerFablesynthDevices";

import { FABLE_EFFECT_KINDS } from "@nodetool-ai/timeline";

import { registerFxView, registerInstrumentView } from "./deviceViews";

// FableSynth FX inserts (`fable` track effects), one view per kind.
for (const kind of FABLE_EFFECT_KINDS) {
  registerFxView(`fable:${kind}`, async () => ({
    default: (await import("../fx/FableFxDeviceView")).FABLE_FX_VIEWS[kind]
  }));
}

registerInstrumentView("drum", () => import("./Dr1DeviceView"));
registerInstrumentView("bass", () => import("./Bl1DeviceView"));
registerInstrumentView("wavetable", () => import("./Wt1DeviceView"));
registerInstrumentView("vst", () => import("./VstDeviceView"));
