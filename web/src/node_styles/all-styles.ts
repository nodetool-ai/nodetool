/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import {
  typographyStyles,
  buttonStyles,
  inputStyles,
  formStyles,
  selectStyles,
  navigationStyles,
  feedbackStyles,
  surfacesStyles,
  toggleStyles,
  utilityStyles
} from "./index";

/**
 * All Component Styles Combined
 *
 * This exports all the MUI component styles as a single emotion CSS function
 * that takes a theme and returns the combined styles.
 */

export const allComponentStyles = (theme: any) =>
  css(
    typographyStyles(theme),
    buttonStyles(theme),
    inputStyles(theme),
    formStyles(theme),
    selectStyles(theme),
    navigationStyles(theme),
    feedbackStyles(theme),
    surfacesStyles(theme),
    toggleStyles(theme),
    utilityStyles(theme)
  );

export default allComponentStyles;
