import { MiniApp } from "./types";
import ClockApp from "./ClockApp";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import React from "react";

export const MINI_APPS: MiniApp[] = [
  {
    id: "clock-app",
    title: "Clock",
    component: ClockApp,
    description: "A simple clock to keep track of time.",
    icon: <AccessTimeIcon />,
  },
];

export const getMiniApp = (id: string): MiniApp | undefined => {
  return MINI_APPS.find((app) => app.id === id);
};
