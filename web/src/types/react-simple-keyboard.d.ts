declare module "react-simple-keyboard" {
  import { ComponentType, MouseEvent as ReactMouseEvent } from "react";

  interface KeyboardButtonTheme {
    class: string;
    buttons: string;
  }

  interface KeyboardProps {
    layout?: Record<string, string[]>;
    layoutName?: string;
    display?: Record<string, string>;
    buttonTheme?: KeyboardButtonTheme[];
    onKeyPress?: (button: string) => void;
    onKeyReleased?: (button: string) => void;
    onButtonMouseEnter?: (button: string, event: ReactMouseEvent) => void;
    onButtonMouseLeave?: (button: string, event: ReactMouseEvent) => void;
    theme?: string;
    mergeDisplay?: boolean;
    physicalKeyboardHighlight?: boolean;
    physicalKeyboardHighlightPress?: boolean;
  }

  const Keyboard: ComponentType<KeyboardProps>;
  export default Keyboard;
}
