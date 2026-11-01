#include "ai/ClipRequests.h"
#include "ai/Extension.h"
#include "ai/Take.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) return 2;
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(input.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !document.isArray()) return 2;
    QJsonArray output;
    for (const auto& value : document.array()) {
        const auto request = value.toObject();
        const auto op = request.value("op").toString();
        const auto clip = request.value("clip").toObject(), options = request.value("options").toObject();
        const auto sequence = request.value("sequenceId").toString();
        if (op == u"mediaEdit" || op == u"extensionRequest" || op == u"imageVideo" || op == u"lineDelivery") {
            nt::ai::ClipRequestResult result;
            if (op == u"mediaEdit") result = nt::ai::mediaEditRequest(sequence, clip, options);
            else if (op == u"extensionRequest") result = nt::ai::extensionRequest(sequence, request.value("requestId").toString(), clip, request.value("model").toObject(), options);
            else if (op == u"imageVideo") result = nt::ai::imageToVideoRequest(sequence, clip, request.value("model").toObject(), options);
            else result = nt::ai::lineDeliveryRequest(request.value("input").toObject());
            output.append(result.ok() ? QJsonObject{{"ok", true}, {"snapshot", result.snapshot}, {"data", result.data}}
                                      : QJsonObject{{"ok", false}});
        } else if (op == u"extension") {
            QSet<QString> locked;
            for (const auto& track : request.value("lockedTrackIds").toArray()) locked.insert(track.toString());
            const auto result = nt::ai::applyExtension(request.value("clips").toArray(), request.value("source").toObject(),
                request.value("takeId").toString(), request.value("direction").toString(),
                request.value("addedSourceDurationMs").toDouble(), request.value("timing").toString(), locked);
            output.append(result.ok() ? QJsonObject{{"ok", true}, {"clips", result.clips}}
                                      : QJsonObject{{"ok", false}, {"code", result.code}});
        } else if (op == u"take") {
            const auto result = nt::ai::applyTake(clip, request.value("takeId").toString());
            output.append(result.error.isEmpty() ? QJsonObject{{"ok", true}, {"clip", result.clip}}
                                                : QJsonObject{{"ok", false}});
        } else return 2;
    }
    const auto bytes = QJsonDocument(output).toJson(QJsonDocument::Compact);
    return std::fwrite(bytes.constData(), 1, static_cast<size_t>(bytes.size()), stdout) == static_cast<size_t>(bytes.size()) ? 0 : 1;
}
