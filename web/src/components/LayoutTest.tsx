/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import { Tabs, Tab, Box, Switch } from "@mui/material";
import ThemeNodetool from "./themes/ThemeNodetool";
import ThemeNodes from "./themes/ThemeNodes";
import { muiComponentsByCategory } from "./layout_test/componentsList";
import * as Demo from "./layout_test";

const categories = Object.keys(muiComponentsByCategory) as Array<
  keyof typeof muiComponentsByCategory
>;

const LayoutTest: React.FC = () => {
  console.log("LayoutTest component rendering started.");

  const [theme, setTheme] = useState(ThemeNodetool);
  const [tab, setTab] = useState(0);

  const toggleTheme = () => {
    setTheme((t) => (t === ThemeNodetool ? ThemeNodes : ThemeNodetool));
  };

  console.log(
    "LayoutTest: Before return. Theme:",
    theme,
    "Tab:",
    tab,
    "Categories:",
    categories
  );
  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ p: 2 }}>
        <Switch checked={theme === ThemeNodes} onChange={toggleTheme} />
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {categories.map((cat, idx) => (
            <Tab key={cat} label={cat} value={idx} />
          ))}
        </Tabs>
        {categories.map((cat, idx) => {
          console.log(`LayoutTest: Mapping category: ${cat}`);
          return (
            tab === idx && (
              <Box
                key={cat}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  mt: 2
                }}
              >
                {muiComponentsByCategory[cat].map((name) => {
                  const Comp = (Demo as any)[name];
                  console.log(
                    `LayoutTest: Attempting to render component: ${name} in category: ${cat}`
                  );
                  if (Comp) {
                    const renderedComp = <Comp key={name} />;
                    console.log(
                      `LayoutTest: Successfully rendered component: ${name}`
                    );
                    return renderedComp;
                  }
                  console.warn(`LayoutTest: Component not found: ${name}`);
                  return null;
                })}
              </Box>
            )
          );
        })}
      </Box>
    </ThemeProvider>
  );
};

export default LayoutTest;
