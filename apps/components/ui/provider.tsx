"use client";

import * as React from "react";
import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider as NextThemeProvider } from "next-themes";
import apps_theme from "../../styles/theme/apps_theme";
import { ColorModeSync } from "./color-mode-sync";
import theme from "../../styles/theme/apps_theme";

interface ProviderProps {
  children: React.ReactNode;
}

export function Provider({ children }: ProviderProps) {
  return (
    <ChakraProvider value={apps_theme}>
      <NextThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <ColorModeSync />
        {children}
      </NextThemeProvider>
    </ChakraProvider>
  );
}
