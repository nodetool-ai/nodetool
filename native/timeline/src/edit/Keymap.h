#pragma once

// The timeline keyboard map (web/src/components/timeline/timelineKeymap.ts):
// the three presets come from KeymapData.h, generated from the TypeScript
// table, and `resolveTimelineAction` copies the web resolver, so a key does
// the same thing in both editors.

#include <QJsonObject>
#include <QString>
#include <QStringList>

#include <vector>

namespace nt::edit {

// The fields of a KeyboardEvent a binding matches. `key` is `e.key` (a
// letter in any case, "ArrowLeft", "Delete", ...); `code` is `e.code`, or
// empty when unknown. Ctrl stands for Ctrl or Cmd.
struct KeyEventLike {
    QString key;
    QString code;
    bool ctrlKey = false;
    bool metaKey = false;
    bool shiftKey = false;
    bool altKey = false;
};

// The action id `e` triggers under `preset` ("nodetool", "premiere", "fcp"),
// or an empty string.
QString resolveTimelineAction(const KeyEventLike& e, const QString& preset);

// bindingKeys: the key chips of each binding of `action` ("Ctrl", "Alt",
// "Shift", then the key label), in table order.
std::vector<QStringList> actionBindingKeys(const QString& preset, const QString& action);
// formatActionShortcut: the first binding as "Alt+←", or empty.
QString formatActionShortcut(const QString& preset, const QString& action);
// The shortcut sheet (TimelineShortcutsDialog.tsx) under `preset`: its
// strings, and `groups: [{title, rows: [{label, combos: [[key, ...], ...]}]}]`.
QJsonObject shortcutSheet(const QString& preset);

}  // namespace nt::edit
