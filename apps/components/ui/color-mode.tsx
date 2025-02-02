"use client";

import type { IconButtonProps } from "@chakra-ui/react";
import { IconButton } from "@chakra-ui/react";
import * as React from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { useTheme } from "next-themes";

export function ColorModeIcon() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return resolvedTheme === "dark" ? <LuMoon /> : <LuSun />;
}

interface ColorModeButtonProps extends Omit<IconButtonProps, "aria-label"> {
  className?: string;
}

export const ColorModeButton = React.forwardRef<
  HTMLButtonElement,
  ColorModeButtonProps
>(function ColorModeButton(props, ref) {
  const { className, ...rest } = props;
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const currentTheme = theme === "system" ? resolvedTheme : theme;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(currentTheme === "light" ? "dark" : "light");
  };

  if (!mounted) return null;

  return (
    <IconButton
      ref={ref}
      onClick={toggleTheme}
      variant="ghost"
      aria-label={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
      children={<ColorModeIcon />}
      className={
        className ? `color-mode-button ${className}` : "color-mode-button"
      }
      {...rest}
    />
  );
});
