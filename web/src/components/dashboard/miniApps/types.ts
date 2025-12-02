import React from "react";

export interface MiniApp {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  defaultWidth?: number;
  defaultHeight?: number;
  description?: string;
  icon?: React.ReactNode;
}
