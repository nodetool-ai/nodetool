#include "app/PanelRegistry.h"
#include "app/startup/DecodeDefault.h"
#include "audio/hooks/OutputDevice.h"
#include <QCoreApplication>
#include <QDebug>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    // QML-discovered panels reach every QML executable. Only the app registrar adds this one.
    for (const auto& panel : PanelRegistry().forSlot("overlay")) {
        if (panel.toMap().value("id") == "appShell") {
            qCritical("FAIL: a QML executable without the app registrar received the app shell panel");
            return 1;
        }
    }
    if (nt::app::resolveDecodeMode() != "sw" || nt::app::decodeModeHelp() != "Default sw" ||
        nt::audio::hasOutputDeviceProvider()) {
        qCritical("FAIL: an executable without the app registrar received preference providers");
        return 1;
    }
    qInfo("PASS: no app shell in a QML executable without the app registrar");
    return 0;
}
