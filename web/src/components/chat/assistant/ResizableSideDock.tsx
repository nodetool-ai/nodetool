// Compatibility shim: the dock now lives in ui_primitives as `ResizableDock`.
export {
  ResizableDock as default,
  type ResizableDockProps as ResizableSideDockProps
} from "../../ui_primitives";
