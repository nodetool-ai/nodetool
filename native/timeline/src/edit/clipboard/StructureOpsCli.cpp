#include "app/EditRegistry.h"
#include "edit/clipboard/ClipboardOps.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/groups/GroupOps.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <cstdio>
#include <stdexcept>

QJsonValue answer(const QJsonObject &call) {
    const auto fn = call.value("fn").toString();
    const auto args = call.value("args").toArray();
    if (fn == "edit") {
        const auto name = args.at(1).toString();
        const auto edit = nt::app::findEdit(name);
        if (!edit) {
            throw std::runtime_error(("unknown edit " + name).toStdString());
        }
        return edit(args.at(0).toObject(), args.at(2).toObject());
    }
    using namespace nt::edit;
    using namespace nt::edit::structure;
    const auto clips = clipsFromJson(args.at(0).toArray());
    if (fn == "cloneClips") {
        return clipsToJson(clipboard::cloneClips(clips));
    }
    if (fn == "cloneClipsToTrack") {
        return clipsToJson(clipboard::cloneClipsToTrack(clips, args.at(1).toString()));
    }
    if (fn == "clipboardRoundTrip") {
        clipboard::copyClipsToClipboard(clips);
        auto mutated = clips;
        if (!mutated.empty()) {
            mutated.front().insert("name", "Mutation must not reach the clipboard");
        }
        const auto targeted = args.at(3).isArray() ? std::optional<IdSet>(idSet(args.at(3).toArray())) : std::nullopt;
        QJsonObject result{
            {"count", static_cast<int>(clips.size())},
            {"has", clipboard::hasClipboardClips()},
            {"first", clipboard::firstClipboardClip().value_or(QJsonObject{})},
            {"clips", clipsToJson(clipboard::buildPastedClips(args.at(1).toArray(), args.at(2).toDouble(), targeted))}};
        clipboard::clearClipClipboard();
        result.insert("emptyAfterClear", !clipboard::hasClipboardClips() && !clipboard::firstClipboardClip());
        return result;
    }
    if (fn == "attributeGroupApplies") {
        return clipboard::attributeGroupApplies(args.at(0).toString(), args.at(1).toObject());
    }
    if (fn == "attributePatch") {
        QJsonObject result;
        const auto patch =
            clipboard::attributePatch(args.at(0).toObject(), args.at(1).toObject(), idSet(args.at(2).toArray()));
        for (auto it = patch.begin(); it != patch.end(); ++it) {
            result.insert(it.key(), it.value());
        }
        return result;
    }
    if (fn == "emptySelectionCopy") {
        const auto doc = args.at(0).toObject();
        nt::app::findEdit("copy")(doc, {{"selectedIds", QJsonArray{"v1"}}});
        nt::app::findEdit(args.at(1).toString())(doc, {{"selectedIds", QJsonArray{}}});
        return clipboard::firstClipboardClip() ? QJsonValue(*clipboard::firstClipboardClip())
                                               : QJsonValue(QJsonValue::Null);
    }
    if (fn == "seededEdit" || fn == "copyAction") {
        const auto p = args.at(2).toObject();
        if (p.contains("clipboard")) {
            clipboard::copyClipsToClipboard(clipsFromJson(p.value("clipboard").toArray()));
        }
        const auto name = args.at(1).toString();
        const auto operation = nt::app::findEdit(name);
        if (!operation) {
            throw std::runtime_error(("unknown edit " + name).toStdString());
        }
        const auto result = operation(args.at(0).toObject(), p);
        if (fn == "seededEdit") {
            return result.value("clips");
        }
        return QJsonObject{{"doc", result},
                           {"count", clipboard::clipboardClipCount()},
                           {"first", clipboard::firstClipboardClip() ? QJsonValue(*clipboard::firstClipboardClip())
                                                                     : QJsonValue(QJsonValue::Null)}};
    }
    if (fn == "findGap" || fn == "childSpanMs") {
        const auto gap = fn == "findGap" ? findGap(clips, args.at(1).toString(), args.at(2).toDouble())
                                         : groups::childSpanMs(clips, args.at(1).toString());
        return gap ? QJsonValue(QJsonObject{{"startMs", gap->startMs}, {"endMs", gap->endMs}})
                   : QJsonValue(QJsonValue::Null);
    }
    if (fn == "marquee") {
        std::vector<clipboard::TrackBounds> rows;
        for (const auto &value : args.at(1).toArray()) {
            const auto row = value.toObject();
            rows.push_back(
                {row.value("trackId").toString(), row.value("top").toDouble(), row.value("bottom").toDouble()});
        }
        const auto band = args.at(2).toObject();
        QStringList base;
        for (const auto &value : args.at(3).toArray()) {
            base.append(value.toString());
        }
        return QJsonArray::fromStringList(
            clipboard::marqueeSelection(clips, rows, band.value("startMs").toDouble(), band.value("endMs").toDouble(),
                                        band.value("top").toDouble(), band.value("bottom").toDouble(), base));
    }
    throw std::runtime_error(("unknown function " + fn).toStdString());
}
int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) {
        return 2;
    }
    QJsonObject response;
    try {
        const auto request = QJsonDocument::fromJson(input.readAll()).object();
        if (request.contains("calls")) {
            QJsonArray results;
            for (const auto &call : request.value("calls").toArray()) {
                results.append(answer(call.toObject()));
            }
            response.insert("result", results);
        } else {
            response.insert("result", answer(request));
        }
    } catch (const std::exception &error) {
        response.insert("error", QString::fromUtf8(error.what()));
    }
    const auto output = QJsonDocument(response).toJson(QJsonDocument::Compact);
    std::fwrite(output.constData(), 1, static_cast<size_t>(output.size()), stdout);
    return 0;
}
