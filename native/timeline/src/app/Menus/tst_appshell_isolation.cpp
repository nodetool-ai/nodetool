#include "app/PanelRegistry.h"
#include "app/startup/DecodeDefault.h"
#include "audio/hooks/OutputDevice.h"
#include <QCoreApplication>
#include <QDebug>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (!PanelRegistry().forSlot("overlay").isEmpty()) {
        qCritical("FAIL: a QML executable without the app registrar received an overlay panel");
        return 1;
    }
    if (nt::app::resolveDecodeMode() != "sw" || nt::app::decodeModeHelp() != "Default sw" ||
        nt::audio::hasOutputDeviceProvider()) {
        qCritical("FAIL: an executable without the app registrar received preference providers");
        return 1;
    }
    qInfo("PASS: no app shell in a QML executable without the app registrar");
    return 0;
}
