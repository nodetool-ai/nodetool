/**
 * Segmented picker that gives the right rails somewhere to live on narrow screens.
 *
 * The todo and task rails have fixed widths, so on a phone they used to drop
 * out of the layout entirely and their content was unreachable. Here they take
 * the conversation's place one at a time.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { ToggleGroup, ToggleOption } from "../../ui_primitives";

export type MobileRail = "chat" | "todos" | "task";

const RAIL_LABEL_KEYS: Record<MobileRail, string> = {
  chat: "i18n-next23.chat.mobileRails.chat",
  todos: "i18n-next23.chat.mobileRails.tasks",
  task: "i18n-next23.chat.mobileRails.task"
};

interface MobileRailTabsProps {
  value: MobileRail;
  /** Rails with something to show, in display order. Always starts with "chat". */
  available: readonly MobileRail[];
  onChange: (rail: MobileRail) => void;
}

const MobileRailTabs = ({ value, available, onChange }: MobileRailTabsProps) => {
  const { t } = useTranslation();
  return <ToggleGroup
    className="mobile-rail-tabs"
    value={value}
    exclusive
    segmented
    size="small"
    aria-label={t("i18n-next23.chat.mobileRails.ariaLabel")}
    onChange={(_event, next: MobileRail | null) => {
      if (next !== null) {
        onChange(next);
      }
    }}
  >
    {available.map((rail) => (
      <ToggleOption key={rail} value={rail}>
        {t(RAIL_LABEL_KEYS[rail])}
      </ToggleOption>
    ))}
  </ToggleGroup>
  </ToggleGroup>;
};

export default memo(MobileRailTabs);
