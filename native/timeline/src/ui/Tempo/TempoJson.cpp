#include "TempoJson.h"
#include <limits>

namespace nt::tempo::json {
namespace {
double number(const QJsonValue& value) { return value.toDouble(std::numeric_limits<double>::quiet_NaN()); }
QJsonObject tempoObject(const Tempo& value) {
    return {{"bpm", value.bpm},
            {"offsetMs", value.offsetMs},
            {"timeSignature", QJsonObject{{"beatsPerBar", value.beatsPerBar}, {"beatUnit", value.beatUnit}}}};
}
} // namespace
std::vector<double> numbers(const QJsonValue& value) {
    std::vector<double> result;
    for (const auto& item : value.toArray()) {
        result.push_back(number(item));
    }
    return result;
}
QJsonArray array(std::span<const double> values) {
    QJsonArray result;
    for (double value : values) {
        result.append(value);
    }
    return result;
}
QJsonObject resolveTempo(const QJsonObject& document) {
    const auto raw = document["tempo"];
    return raw.isNull() || raw.isUndefined() ? tempoObject(nt::tempo::resolveTempo(std::nullopt)) : raw.toObject();
}
Tempo tempo(const QJsonObject& raw) {
    const auto value =
        (raw.contains("bpm") || raw.contains("offsetMs") || raw.contains("timeSignature")) ? raw : resolveTempo(raw);
    const auto signature = value["timeSignature"].toObject();
    return {number(value["bpm"]), number(value["offsetMs"]), number(signature["beatsPerBar"]),
            number(signature["beatUnit"])};
}
GridSpec grid(const QJsonObject& value) {
    return {tempo(value["tempo"].toObject()), value["division"].toString().toStdString(), number(value["fromMs"]),
            number(value["toMs"])};
}
SnapGridSpec snapGrid(const QJsonObject& value) {
    SnapGridSpec result;
    static_cast<GridSpec&>(result) = grid(value);
    result.snapEnabled = value["snapEnabled"].toBool();
    result.hasMidiTrack = value["hasMidiTrack"].toBool();
    result.rulerMode = value["rulerMode"].toString().toStdString();
    return result;
}
QJsonObject object(const SnapGridSpec& value) {
    return {{"tempo", tempoObject(value.tempo)},
            {"division", QString::fromStdString(value.division)},
            {"fromMs", value.fromMs},
            {"toMs", value.toMs},
            {"snapEnabled", value.snapEnabled},
            {"hasMidiTrack", value.hasMidiTrack},
            {"rulerMode", QString::fromStdString(value.rulerMode)}};
}
QJsonArray ticks(std::span<const BarRulerTick> values) {
    QJsonArray result;
    for (const auto& tick : values) {
        QJsonObject item{{"timeMs", tick.timeMs}, {"kind", QString::fromStdString(tick.kind)}};
        if (tick.label) {
            item["label"] = QString::fromStdString(*tick.label);
        }
        result.append(item);
    }
    return result;
}
QJsonArray options() {
    QJsonArray result;
    for (const auto& option : gridDivisionOptions()) {
        result.append(QJsonObject{{"value", QString::fromStdString(option.value)},
                                  {"label", QString::fromStdString(option.label)}});
    }
    return result;
}
QJsonObject snapGridSpecFrom(const QJsonObject& document, const QJsonObject& ui) {
    bool hasMidi = false;
    for (const auto& track : document["tracks"].toArray()) {
        hasMidi |= track.toObject()["type"] == "midi";
    }
    SnapView view{ui["snapEnabled"].toBool(),
                  ui["rulerMode"].toString().toStdString(),
                  ui["gridDivision"].toString().toStdString(),
                  number(ui["msPerPx"]),
                  number(ui["scrollLeftPx"]),
                  number(ui["lanesViewportWidthPx"])};
    auto result = object(nt::tempo::snapGridSpecFrom(tempo(resolveTempo(document)), hasMidi, view));
    result["tempo"] = resolveTempo(document);
    return result;
}
} // namespace nt::tempo::json
