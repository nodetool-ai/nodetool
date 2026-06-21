/**
 * Remotion configuration. The webpack override is what lets the bundler pull in
 * the real NodeTool web components (see src/webpackOverride.ts).
 */
import { Config } from "@remotion/cli/config";
import { webpackOverride } from "./src/webpackOverride";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Concurrency 1 keeps the replay deterministic per render worker; the demo
// player drives global Zustand stores, so one composition instance per browser.
Config.setConcurrency(1);
Config.overrideWebpackConfig(webpackOverride);
