/** @jsxImportSource @emotion/react */
import React, { useState, useEffect } from "react";
import { useColorScheme } from "@mui/material/styles";
import { Tabs, Tab, Box, Switch } from "@mui/material";
import { muiComponentsByCategory } from "./layout_test/componentsList";
import * as Demo from "./layout_test";

const categories = Object.keys(muiComponentsByCategory) as Array<
  keyof typeof muiComponentsByCategory
>;

const LayoutTest: React.FC = () => {
  const [tab, setTab] = useState(0);
  const { mode, setMode } = useColorScheme();

  useEffect(() => {
    console.log("Current color scheme mode:", mode);
    const root = document.documentElement;
    console.log(
      "color-scheme CSS property:",
      getComputedStyle(root).getPropertyValue("color-scheme")
    );
    console.log(
      "--palette-primary-main CSS variable:",
      getComputedStyle(root).getPropertyValue("--palette-primary-main").trim()
    );
  }, [mode]);

  const toggleColorMode = () => {
    setMode(mode === "light" ? "dark" : "light");
  };

  return (
    <Box sx={{ p: 2 }}>
      <Switch checked={mode === "dark"} onChange={toggleColorMode} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        {categories.map((cat, idx) => (
          <Tab key={cat} label={cat} value={idx} />
        ))}
      </Tabs>
      {categories.map((cat, idx) => (
        <Box
          key={cat}
          hidden={tab !== idx}
          sx={{
            display: tab === idx ? "flex" : "none",
            flexWrap: "wrap",
            gap: 2,
            mt: 2
          }}
        >
          {muiComponentsByCategory[cat].map((name) => {
            const Comp = (Demo as any)[name];
            return Comp ? <Comp key={name} /> : null;
          })}
        </Box>
      ))}
    </Box>
  );
};

export default LayoutTest;
