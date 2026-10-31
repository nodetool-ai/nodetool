declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";
  interface TerminalRendererOptions {
    emoji?: boolean;
    width?: number;
    showSectionPrefix?: boolean;
    reflowText?: boolean;
    tab?: number;
    [key: string]: unknown;
  }
  function markedTerminal(options?: TerminalRendererOptions): MarkedExtension;
  export { markedTerminal };
  export default markedTerminal;
}
