import { chromium } from "playwright";
import type { GameCaptureChromium } from "./capture-driver-types.js";

// This module is checked independently so browser consumers never load Electron's DOM declarations.
export const gameCaptureChromium: GameCaptureChromium = chromium;
