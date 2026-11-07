#pragma once

#include <QString>
#include <QUrl>

namespace nt::ui {
// A view the Program monitor can show instead of its picture. See src/wiring/README.md.
struct MonitorViewEntry {
    QString id;
    QUrl source;
    int order = 0;
    QString title;
};
// Registers the view in the monitor's wrench menu and in View > Monitor display.
// Call it before the QML engine starts. A duplicate or invalid id is refused.
bool registerMonitorView(MonitorViewEntry entry);
}
