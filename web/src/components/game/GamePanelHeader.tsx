import type { ReactNode } from "react";

import { PanelHeader } from "../ui_primitives";

interface GamePanelHeaderProps {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}

/** Title strip at the top of a docked game editor panel, with optional trailing actions. */
export default function GamePanelHeader({ title, icon, children }: GamePanelHeaderProps) {
  return <PanelHeader title={title} icon={icon} actions={children} />;
}
