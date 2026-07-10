import React, { useEffect } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import { ThemeProvider, useColorScheme } from "@mui/material/styles";
import InitColorSchemeScript from "@mui/system/InitColorSchemeScript";
import { CssBaseline, GlobalStyles } from "@mui/material";
import ThemeNodetool from "../src/components/themes/ThemeNodetool";

/**
 * Keeps the active MUI color scheme in sync with the Storybook `theme` global.
 * The app is dark-first, so `dark` is the default and the visual-test baseline.
 */
const ModeSync = ({ mode }: { mode: "light" | "dark" }) => {
  const { setMode } = useColorScheme();
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);
  return null;
};

/**
 * Determinism styles for visual regression. Snapshots must not capture
 * mid-transition or mid-animation frames, and text must render with the
 * self-hosted fonts only. Enabled by default; toggle off with the `motion`
 * toolbar to preview real animations.
 */
const freezeMotionStyles = {
  "*, *::before, *::after": {
    transitionDuration: "0ms !important",
    transitionDelay: "0ms !important",
    animationDuration: "0ms !important",
    animationDelay: "0ms !important",
    animationIterationCount: "1 !important",
    scrollBehavior: "auto !important",
    caretColor: "transparent !important"
  }
} as const;

const withTheme: Decorator = (Story, context) => {
  const mode = (context.globals.theme as "light" | "dark") ?? "dark";
  const freezeMotion = context.globals.motion !== "on";
  return (
    <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
      <InitColorSchemeScript attribute="class" defaultMode="dark" />
      <CssBaseline />
      {freezeMotion && <GlobalStyles styles={freezeMotionStyles} />}
      <ModeSync mode={mode} />
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },
    a11y: {
      // Report findings in the a11y panel without failing the run.
      test: "todo"
    },
    options: {
      storySort: {
        order: [
          "Design Tokens",
          ["Colors", "Typography", "Spacing", "Border Radius", "Motion", "Z-Index"],
          "Primitives",
          "Surfaces",
          "Layout",
          "Feedback"
        ]
      }
    }
  },
  globalTypes: {
    theme: {
      description: "App color scheme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" }
        ],
        dynamicTitle: true
      }
    },
    motion: {
      description: "Enable animations/transitions (off = deterministic snapshots)",
      defaultValue: "off",
      toolbar: {
        title: "Motion",
        icon: "lightning",
        items: [
          { value: "off", title: "Frozen (visual-test)" },
          { value: "on", title: "Animated" }
        ],
        dynamicTitle: true
      }
    }
  },
  initialGlobals: {
    theme: "dark",
    motion: "off"
  }
};

export default preview;
