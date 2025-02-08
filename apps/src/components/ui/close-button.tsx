import { IconButton, IconButtonProps } from "@chakra-ui/react";
import * as React from "react";
import { LuX } from "react-icons/lu";
import { useTheme } from "next-themes";

export interface CloseButtonProps
  extends Omit<IconButtonProps, "aria-label" | "icon"> {
  size?: "xs" | "sm" | "md" | "lg";
  icon?: React.ReactElement;
  className?: string;
}

export const CloseButton = React.forwardRef<
  HTMLButtonElement,
  CloseButtonProps
>(function CloseButton(props, ref) {
  const { size = "md", icon, className, ...rest } = props;
  const { resolvedTheme } = useTheme();
  const currentTheme = resolvedTheme || "light";

  return (
    <IconButton
      className={
        className ? `close-button-root ${className}` : "close-button-root"
      }
      ref={ref}
      aria-label="Close"
      size={size}
      variant="ghost"
      color="text"
      _hover={{
        bg: "buttonHover",
      }}
      {...rest}
    >
      {icon || <LuX />}
    </IconButton>
  );
});
