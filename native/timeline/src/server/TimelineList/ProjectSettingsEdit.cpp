#include "app/EditRegistry.h"
#include "app/PanelRegistry.h"
#include <cmath>

namespace {
const bool panel = nt::app::registerPanel({QStringLiteral("documentBar"), QStringLiteral("projectSettings"),
    QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/ProjectSettingsDialog.qml")),
    20, QStringLiteral("Project settings")});
bool inRange(const QJsonValue& value, int min, int max, bool integer = true) {
    if (!value.isDouble()) {
        return false;
    }
    const auto number = value.toDouble();
    return std::isfinite(number) && number >= min && number <= max && (!integer || std::floor(number) == number);
}
const bool settings = nt::app::registerEdit("setProjectSettings", [](QJsonObject raw, const QJsonObject& payload) {
    if (!inRange(payload.value("width"), 16, 7680) || !inRange(payload.value("height"), 16, 7680) ||
        !inRange(payload.value("fps"), 1, 240)) {
        return raw;
    }
    if (payload.contains("tempo")) {
        const auto tempo = payload.value("tempo").toObject();
        const auto signature = tempo.value("timeSignature").toObject();
        const auto unit = signature.value("beatUnit").toInt();
        const auto offset = tempo.value("offsetMs");
        if (!inRange(tempo.value("bpm"), 20, 300, false) ||
            !inRange(signature.value("beatsPerBar"), 1, 16) ||
            (unit != 2 && unit != 4 && unit != 8 && unit != 16) || !offset.isDouble() ||
            !std::isfinite(offset.toDouble()) || offset.toDouble() < 0) {
            return raw;
        }
        raw.insert("tempo", tempo);
    }
    // These are sequence columns, as in the web's timeline.update patch.
    for (const auto* key : {"width", "height", "fps"}) {
        raw.insert(QLatin1String(key), payload.value(QLatin1String(key)));
    }
    return raw;
});
}
