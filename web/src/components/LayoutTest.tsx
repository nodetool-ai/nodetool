/** @jsxImportSource @emotion/react */
import React, { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Tabs, Tab, Box, Switch } from '@mui/material';
import ThemeNodetool from './themes/ThemeNodetool';
import ThemeNodes from './themes/ThemeNodes';
import { muiComponentsByCategory } from './layout_test/componentsList';
import * as Demo from './layout_test';

const categories = Object.keys(muiComponentsByCategory) as Array<keyof typeof muiComponentsByCategory>;

const LayoutTest: React.FC = () => {
  const [theme, setTheme] = useState(ThemeNodetool);
  const [tab, setTab] = useState(0);

  const toggleTheme = () => {
    setTheme((t) => (t === ThemeNodetool ? ThemeNodes : ThemeNodetool));
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ p: 2 }}>
        <Switch checked={theme === ThemeNodes} onChange={toggleTheme} />
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {categories.map((cat, idx) => (
            <Tab key={cat} label={cat} value={idx} />
          ))}
        </Tabs>
        {categories.map((cat, idx) => (
          <Box
            key={cat}
            hidden={tab !== idx}
            sx={{ display: tab === idx ? 'flex' : 'none', flexWrap: 'wrap', gap: 2, mt: 2 }}
          >
            {muiComponentsByCategory[cat].map((name) => {
              const Comp = (Demo as any)[`${name}Demo`];
              return Comp ? <Comp key={name} /> : null;
            })}
          </Box>
        ))}
      </Box>
    </ThemeProvider>
  );
};

export default LayoutTest;
