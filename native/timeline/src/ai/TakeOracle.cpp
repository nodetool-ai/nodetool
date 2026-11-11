#include "ai/Take.h"
#include "takes/TakeSwitch.h"
#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 2) return 1;
    const auto requests = QJsonDocument::fromJson(QByteArray(argv[1])).array();
    QJsonArray output;
    for (const auto& item : requests) {
        const auto request = item.toObject();
        if (const auto op = request.value("op").toString(); op == "switch" || op == "cut") {
            nt::edit::EditDoc doc;
            for (const auto& clip : request.value("clips").toArray()) { doc.clips.push_back(clip.toObject()); }
            const auto id = request.value("id").toString();
            const int index = request.value("index").toInt();
            const auto edit = op == "switch" ? nt::takes::switchTake(doc, id, index)
                : nt::takes::cutToTake(doc, id, request.value("timeMs").toDouble(), index, true);
            QJsonArray clips;
            for (const auto& clip : edit.clips) { clips.append(clip); }
            output.append(QJsonObject{{"clips", clips}, {"resultId", edit.resultId}, {"failed", !edit.error.isEmpty()}});
            continue;
        }
        const auto clip = request.value("clip").toObject();
        const auto id = request.value("id").toString();
        const auto op = request.value("op").toString();
        nt::ai::TakeResult result;
        if (op == "apply") result = nt::ai::applyTake(clip, id);
        else if (op == "rename") result = nt::ai::renameTake(clip, id, request.value("label").toString());
        else if (op == "delete") result = nt::ai::deleteTake(clip, id);
        else return 2;
        output.append(QJsonObject{{"clip", result.clip}, {"failed", !result.error.isEmpty()}});
    }
    std::printf("%s\n", QJsonDocument(output).toJson(QJsonDocument::Compact).constData());
}
