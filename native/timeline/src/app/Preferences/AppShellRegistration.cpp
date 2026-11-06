#include "app/PanelRegistry.h"
#include "app/startup/DecodeDefault.h"
#include "audio/hooks/OutputDevice.h"
#include "PreferencesSettings.h"

namespace {
const bool registered = [] {
    nt::app::applyCachePreferences();
    nt::app::registerDecodeModeProvider(QStringLiteral("Preferences"), nt::app::preferredDecodeMode);
    nt::audio::registerOutputDeviceProvider([](std::span<const std::string>) {
        return nt::app::preferredAudioDevice().toUtf8().toStdString();
    });
    return nt::app::registerPanel({
        "overlay", "appShell",
        QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Preferences/AppShell.qml"),
        100, "App shell"});
}();
}
