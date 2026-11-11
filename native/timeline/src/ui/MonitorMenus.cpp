#include "ui/MonitorViewRegistry.h"

#include "app/MenuRegistry.h"
#include "app/PanelRegistry.h"
#include "edit/ClipGestureController.h"
#include "ui/MonitorViewState.h"
#include "ui/TimelineViewState.h"
#include "wiring/KeyActions.h"

#include <array>
#include <cmath>
#include <functional>

namespace {
using Context = QVariantMap;
using Getter = bool (MonitorViewState::*)() const;
using Setter = void (MonitorViewState::*)(bool);

// Functions, because registerMonitorView can run from another file's static initializer before this file's.
QString zoomMenu() { return QStringLiteral("Monitor Zoom"); }
QString displayMenu() { return QStringLiteral("Monitor Display"); }
QString overlayMenu() { return QStringLiteral("Monitor Overlays"); }

MonitorViewState* monitorFor(const Context& context) {
    return MonitorViewState::forOwner(context.value(QStringLiteral("gestures")).value<QObject*>());
}
// With no editor, forOwner still has a monitor state, and nothing shows what it changes.
bool hasMonitor(const Context& context) {
    return context.value(QStringLiteral("gestures")).value<QObject*>() != nullptr && monitorFor(context) != nullptr;
}

// Runs against the Program monitor. The menu bar exists with no editor open, and then this does nothing.
nt::app::MenuPredicate onMonitor(std::function<void(MonitorViewState&)> action) {
    return [action = std::move(action)](const Context& context) {
        auto* monitor = monitorFor(context);
        if (!monitor) { return false; }
        action(*monitor);
        return true;
    };
}
nt::app::MenuPredicate whenMonitor(std::function<bool(const MonitorViewState&)> test) {
    return [test = std::move(test)](const Context& context) {
        const auto* monitor = monitorFor(context);
        return monitor && test(*monitor);
    };
}
void addEntry(const QString& submenu, const QString& action, const QString& label, int order,
              nt::app::MenuPredicate checked, nt::app::MenuPredicate run, nt::app::MenuPredicate enabled = hasMonitor,
              QString reason = QStringLiteral("Open a timeline first.")) {
    nt::app::registerShellMenuItem({QStringLiteral("View"), action, label, {}, submenu, QStringLiteral("monitor"), order,
                                    std::move(enabled), std::move(checked), std::move(run), std::move(reason)});
}
void addResolution(const QString& submenu, const QString& prefix, int (MonitorViewState::*get)() const,
                   void (MonitorViewState::*set)(int)) {
    int order = 0;
    for (const auto& [label, denominator] : std::array<std::pair<const char*, int>, 4>{{{"Full", 1}, {"1/2", 2}, {"1/4", 4}, {"1/8", 8}}}) {
        addEntry(submenu, prefix + QString::number(denominator), QString::fromLatin1(label), ++order,
                 whenMonitor([get, denominator](const MonitorViewState& m) { return (m.*get)() == denominator; }),
                 onMonitor([set, denominator](MonitorViewState& m) { (m.*set)(denominator); }));
    }
}
void addToggle(const QString& action, const QString& label, int order, Getter get, Setter set) {
    addEntry(overlayMenu(), action, label, order, whenMonitor([get](const MonitorViewState& m) { return (m.*get)(); }),
             onMonitor([get, set](MonitorViewState& m) { (m.*set)(!(m.*get)()); }));
}

const bool registered = [] {
    addEntry(zoomMenu(), QStringLiteral("monitorZoomFit"), QStringLiteral("Fit"), 0,
             whenMonitor([](const MonitorViewState& m) { return m.fit(); }),
             onMonitor([](MonitorViewState& m) { m.setFit(); }));
    for (const int percent : {10, 25, 50, 75, 100, 150, 200, 400, 800, 1600}) {
        addEntry(zoomMenu(), QStringLiteral("monitorZoom%1").arg(percent), QStringLiteral("%1%").arg(percent), percent,
                 whenMonitor([percent](const MonitorViewState& m) { return !m.fit() && std::abs(m.zoom() * 100.0 - percent) < 0.01; }),
                 onMonitor([percent](MonitorViewState& m) { m.setZoomPercent(percent); }));
    }
    addEntry(displayMenu(), QStringLiteral("monitorDisplayComposite"), QStringLiteral("Composite"), -2,
             whenMonitor([](const MonitorViewState& m) { return m.displayMode() == QStringLiteral("composite"); }),
             onMonitor([](MonitorViewState& m) { m.setDisplayMode(QStringLiteral("composite")); }));
    addEntry(displayMenu(), QStringLiteral("monitorDisplayAlpha"), QStringLiteral("Alpha"), -1,
             whenMonitor([](const MonitorViewState& m) { return m.displayMode() == QStringLiteral("alpha"); }),
             onMonitor([](MonitorViewState& m) { m.setDisplayMode(QStringLiteral("alpha")); }));
    addResolution(QStringLiteral("Playback Resolution"), QStringLiteral("monitorPlaybackResolution"), &MonitorViewState::playbackResolution, &MonitorViewState::setPlaybackResolution);
    addResolution(QStringLiteral("Paused Resolution"), QStringLiteral("monitorPausedResolution"), &MonitorViewState::pausedResolution, &MonitorViewState::setPausedResolution);
    addToggle(QStringLiteral("monitorShowControls"), QStringLiteral("Show Controls"), 1, &MonitorViewState::showControls, &MonitorViewState::setShowControls);
    addToggle(QStringLiteral("monitorSafeMargins"), QStringLiteral("Safe Margins"), 2, &MonitorViewState::safeMargins, &MonitorViewState::setSafeMargins);
    addToggle(QStringLiteral("monitorTransparencyGrid"), QStringLiteral("Transparency Grid"), 3, &MonitorViewState::transparencyGrid, &MonitorViewState::setTransparencyGrid);
    addToggle(QStringLiteral("monitorRulers"), QStringLiteral("Rulers"), 4, &MonitorViewState::rulers, &MonitorViewState::setRulers);
    addToggle(QStringLiteral("monitorGuides"), QStringLiteral("Guides"), 5, &MonitorViewState::guidesVisible, &MonitorViewState::setGuidesVisible);
    addToggle(QStringLiteral("monitorLockGuides"), QStringLiteral("Lock Guides"), 6, &MonitorViewState::guidesLocked, &MonitorViewState::setGuidesLocked);
    addEntry(overlayMenu(), QStringLiteral("monitorClearGuides"), QStringLiteral("Clear Guides"), 7, {},
             onMonitor([](MonitorViewState& m) { m.clearGuides(); }),
             whenMonitor([](const MonitorViewState& m) { return !m.guides().isEmpty(); }),
             QStringLiteral("There are no guides to clear."));

    // The timecode ruler belongs to the tracks' view state, with the same toggle on the ruler's own menu.
    nt::wiring::registerKeyAction({QStringLiteral("toggleTimecodeRuler"), QStringLiteral("Timecode ruler"), {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            auto* view = gestures.viewState();
            if (!view) { return false; }
            view->setRulerMode(view->rulerMode() == QStringLiteral("timecode") ? QStringLiteral("time") : QStringLiteral("timecode"));
            return true;
        }, QStringLiteral("View")});
    const auto rulerChecked = [](const Context& context) {
        auto* gestures = qobject_cast<ClipGestureController*>(context.value(QStringLiteral("gestures")).value<QObject*>());
        return gestures && gestures->viewState() && gestures->viewState()->rulerMode() == QStringLiteral("timecode");
    };
    nt::app::registerMenuItem({QStringLiteral("ruler"), QStringLiteral("toggleTimecodeRuler"), QStringLiteral("Timecode ruler"), {},
                               [](const Context&) { return true; }, {}, 0,
                               [](const Context& context) { return context.value(QStringLiteral("rulerMode")) == QStringLiteral("timecode"); }});
    nt::app::registerShellMenuItem({QStringLiteral("View"), QStringLiteral("toggleTimecodeRuler"), QStringLiteral("Timecode Ruler"), {}, {}, QStringLiteral("tracks"), 19,
                                    [](const Context& context) { return context.value(QStringLiteral("gestures")).value<QObject*>() != nullptr; },
                                    rulerChecked, {}, QStringLiteral("Open a timeline first.")});
    return true;
}();
}

bool nt::ui::registerMonitorView(MonitorViewEntry entry) {
    if (entry.id == QStringLiteral("composite") || entry.id == QStringLiteral("alpha")) {
        return false;
    }
    const QString id = entry.id;
    const QString title = entry.title;
    const int order = entry.order;
    if (!nt::app::registerPanel({QStringLiteral("monitorView"), id, std::move(entry.source), order, title})) {
        return false;
    }
    addEntry(displayMenu(), QStringLiteral("monitorDisplay:") + id, title, order,
             whenMonitor([id](const MonitorViewState& m) { return m.displayMode() == id; }),
             onMonitor([id](MonitorViewState& m) { m.setDisplayMode(id); }));
    return true;
}
