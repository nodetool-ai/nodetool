/**
 * The assignment menu shared by Add Row and the row header's Row Assignment
 * picker (SQ29, SQ4x): one item per group, each opening its choices.
 */

import React, { useState } from "react";

import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";
import type { AssignmentChoice, AssignmentGroup } from "./stepRowAssignments";

export interface RowAssignmentMenuExtra {
  id: string;
  label: string;
  dividerBefore?: boolean;
  run: () => void;
}

interface RowAssignmentMenuProps {
  anchorEl: HTMLElement | null;
  groups: readonly AssignmentGroup[];
  onPick: (choice: AssignmentChoice) => void;
  onClose: () => void;
  /** The checked choice, for the picker of an existing row. */
  currentId?: string;
  extra?: readonly RowAssignmentMenuExtra[];
}

export const RowAssignmentMenu: React.FC<RowAssignmentMenuProps> = ({ anchorEl, groups, onPick, onClose, currentId, extra }) => {
  const [sub, setSub] = useState<{ anchor: HTMLElement; group: AssignmentGroup } | null>(null);
  const close = () => {
    setSub(null);
    onClose();
  };
  return (
    <>
      <ContextMenu open={anchorEl !== null} anchorEl={anchorEl} onClose={close}>
        {groups.map((g) => (
          <MenuItemPrimitive
            key={g.id}
            label={g.label}
            hasSubmenu
            selected={currentId !== undefined && g.choices.some((c) => c.id === currentId)}
            onClick={(e) => setSub({ anchor: e.currentTarget, group: g })}
          />
        ))}
        {(extra ?? []).map((x) => (
          <MenuItemPrimitive
            key={x.id}
            label={x.label}
            dividerBefore={x.dividerBefore}
            onClick={() => {
              close();
              x.run();
            }}
          />
        ))}
      </ContextMenu>
      <ContextMenu open={sub !== null} anchorEl={sub?.anchor ?? null} onClose={close}>
        {(sub?.group.choices ?? []).map((c) => (
          <MenuItemPrimitive
            key={c.id}
            label={c.label}
            selected={c.id === currentId}
            onClick={() => {
              close();
              onPick(c);
            }}
          />
        ))}
      </ContextMenu>
    </>
  );
};
