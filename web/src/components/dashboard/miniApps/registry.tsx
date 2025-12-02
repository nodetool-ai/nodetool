import { MiniApp } from "./types";

export const MINI_APPS: MiniApp[] = [];

export const getMiniApp = (id: string): MiniApp | undefined => {
  return MINI_APPS.find((app) => app.id === id);
};
