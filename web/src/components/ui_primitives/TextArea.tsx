/**
 * TextArea Component
 *
 * A multiline text field with a writing assistant. The assistant icon sits in
 * the top-right corner of the field and shows on hover or focus. It opens a
 * small panel that drafts, rewrites, shortens or corrects the text with the
 * chat model. The field changes only when the user accepts a suggestion.
 *
 * The assistant module loads lazily on first render of an assisted field, so
 * the primitives barrel does not pull in the chat store or the model menu.
 */

import React, { lazy, memo, Suspense, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { TextInput, type TextInputProps } from "./TextInput";
import { Box } from "./Box";
import { CONTROL, MOTION, reducedMotion } from "./tokens";
import { SPACING } from "./spacing";
import { isRecord, isString } from "../../utils/typePredicates";

/** One key of a MUI slot prop, which may be an object or a function. */
const slotValue = (slot: unknown, key: string): unknown =>
  isRecord(slot) ? slot[key] : undefined;

const TextAssistButton = lazy(
  () => import("../text_assist/TextAssistButton")
);

export interface TextAreaProps
  extends Omit<TextInputProps, "multiline" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  /** Minimum visible rows. Default: 1 */
  minRows?: number;
  /** Maximum rows before the field scrolls. Default: no limit */
  maxRows?: number;
  /** Show the writing assistant. Default: true */
  assist?: boolean;
  /**
   * What the assistant should know beyond the label, hint and placeholder,
   * e.g. "The entity is a character named Hermann."
   */
  assistContext?: string;
  /**
   * Receives an accepted suggestion. Default: `onChange`. Set it on a field
   * that saves on blur, because an accepted suggestion causes no blur.
   */
  onAssistApply?: (value: string) => void;
}

/**
 * TextArea - A multiline text field with a writing assistant
 *
 * @example
 * <TextArea
 *   label="Descriptor"
 *   value={descriptor}
 *   onChange={setDescriptor}
 *   minRows={4}
 *   placeholder="A young astronaut with cropped black hair"
 *   helperText="Describe only stable visual traits."
 *   assistContext="The entity is a character named Hermann."
 * />
 *
 * @example
 * // Without the assistant
 * <TextArea label="Notes" value={notes} onChange={setNotes} assist={false} />
 */
export const TextArea = memo(
  ({
    value,
    onChange,
    minRows,
    maxRows,
    assist = true,
    assistContext,
    onAssistApply,
    label,
    helperText,
    placeholder,
    disabled,
    slotProps,
    sx,
    ...props
  }: TextAreaProps) => {
    const theme = useTheme();
    const [assistOpen, setAssistOpen] = useState(false);
    const inputSlot = slotProps?.input;
    const htmlInputSlot = slotProps?.htmlInput;
    // Callers mark a field read-only through any of MUI's input prop paths.
    const readOnly = Boolean(
      props.InputProps?.readOnly ||
        props.inputProps?.readOnly ||
        slotValue(inputSlot, "readOnly") ||
        slotValue(htmlInputSlot, "readOnly")
    );
    const showAssist = assist && !disabled && !readOnly;

    const corner = showAssist ? (
      <Box
        className="text-assist-corner"
        sx={{
          position: "absolute",
          top: theme.spacing(SPACING.xs),
          right: theme.spacing(SPACING.xs),
          opacity: assistOpen ? 1 : 0,
          transition: MOTION.opacity,
          ...reducedMotion({ transition: MOTION.none }),
          "@media (hover: none)": { opacity: 1 }
        }}
      >
        <Suspense fallback={null}>
          <TextAssistButton
            value={value}
            onApply={onAssistApply ?? onChange}
            onOpenChange={setAssistOpen}
            field={{
              label: isString(label) ? label : undefined,
              description: isString(helperText) ? helperText : undefined,
              placeholder,
              context: assistContext
            }}
          />
        </Suspense>
      </Box>
    ) : null;

    return (
      <TextInput
        {...props}
        multiline
        minRows={minRows}
        maxRows={maxRows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        label={label}
        helperText={helperText}
        placeholder={placeholder}
        disabled={disabled}
        slotProps={{
          ...slotProps,
          input: {
            ...(typeof inputSlot === "object" ? inputSlot : undefined),
            endAdornment: (
              <>
                {slotValue(inputSlot, "endAdornment") as React.ReactNode}
                {corner}
              </>
            )
          }
        }}
        sx={{
          ...(showAssist && {
            "& .MuiInputBase-multiline:hover .text-assist-corner, & .MuiInputBase-multiline:focus-within .text-assist-corner":
              { opacity: 1 },
            // Keep the text clear of the corner icon.
            "& .MuiInputBase-inputMultiline": {
              paddingRight: `${CONTROL.height.sm}px`
            }
          }),
          ...sx
        }}
      />
    );
  }
);

TextArea.displayName = "TextArea";
