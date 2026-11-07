import { useRef, type UIEvent } from "react";
import { useTheme } from "@mui/material/styles";
import { Box } from "./Box";
import { TextInput, type TextInputProps } from "./TextInput";
import { BORDER_RADIUS, TYPOGRAPHY } from "./tokens";
import { SPACING } from "./spacing";

interface TemplateTextAreaProps extends Omit<
  TextInputProps,
  "value" | "slotProps"
> {
  value: string;
  slotProps?: Pick<NonNullable<TextInputProps["slotProps"]>, "formHelperText">;
}

/** Highlights template placeholders while retaining a native, editable textarea. */
export const TemplateTextArea = ({
  value,
  slotProps,
  sx,
  ...props
}: TemplateTextAreaProps) => {
  const theme = useTheme();
  const highlightsRef = useRef<HTMLDivElement>(null);
  const parts = value.split(/(\{\{[^{}]+\}\})/g);

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (highlightsRef.current) {
      highlightsRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightsRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  return (
    <TextInput
      {...props}
      value={value}
      multiline
      slotProps={{
        ...slotProps,
        input: {
          startAdornment: (
            <Box
              ref={highlightsRef}
              className="template-highlights"
              aria-hidden="true"
            >
              {parts.map((part, index) =>
                index % 2 === 1 ? <mark key={index}>{part}</mark> : part
              )}
              {"\u200b"}
            </Box>
          )
        },
        htmlInput: { onScroll: syncScroll }
      }}
      sx={{
        ...sx,
        "& .MuiInputBase-root.MuiInputBase-multiline": {
          ...TYPOGRAPHY.sans.body,
          padding: theme.spacing(SPACING.md)
        },
        "& .MuiInputBase-root.MuiInputBase-multiline textarea.MuiInputBase-input":
          {
            ...TYPOGRAPHY.sans.body,
            position: "relative",
            padding: 0,
            backgroundColor: "transparent",
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            wordBreak: "normal"
          },
        "& .template-highlights": {
          ...TYPOGRAPHY.sans.body,
          position: "absolute",
          inset: theme.spacing(SPACING.md),
          pointerEvents: "none",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "normal",
          color: "transparent",
          "& mark": {
            color: "transparent",
            backgroundColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.2)`,
            borderRadius: BORDER_RADIUS.xs,
            borderBottom: `1px solid ${theme.vars.palette.primary.main}`
          }
        }
      }}
    />
  );
};
