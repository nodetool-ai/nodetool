import React from "react";
import { LoadingSpinner } from "./LoadingSpinner";

/** Spinner diameter in px for each button size: the size of the icon it
 * stands in for (the theme sizes button icons 16, 18 and 20px). */
export const BUTTON_SPINNER_SIZE = {
  small: 16,
  medium: 18,
  large: 20
} as const;

export type ButtonSpinnerSize = keyof typeof BUTTON_SPINNER_SIZE;

export interface ButtonSpinnerProps {
  /** The size of the button it sits in. */
  size?: ButtonSpinnerSize;
}

/**
 * The one mark a button shows while its action waits on a response. It takes
 * the place of the button's icon, in the label colour. Button primitives draw
 * it through their `loading` prop, so call sites never place it themselves.
 */
export const ButtonSpinner: React.FC<ButtonSpinnerProps> = ({
  size = "small"
}) => <LoadingSpinner inline size={BUTTON_SPINNER_SIZE[size]} color="inherit" />;

export default ButtonSpinner;
