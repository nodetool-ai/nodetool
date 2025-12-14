// import { FrontendToolRegistry } from "../frontendTools";
// import { useSettingsStore } from "../../../stores/SettingsStore";

// FrontendToolRegistry.register({
//   name: "ui_set_selection_mode",
//   description:
//     "Set the editor selection mode: 'partial' selects nodes partially inside the marquee; 'full' selects only fully contained nodes.",
//   parameters: {
//     type: "object",
//     properties: {
//       mode: { type: "string", enum: ["partial", "full"] }
//     },
//     required: ["mode"]
//   },
//   async execute({ mode }) {
//     const { setSelectionMode } = useSettingsStore.getState();
//     setSelectionMode(mode);
//     return { ok: true, mode };
//   }
// });

