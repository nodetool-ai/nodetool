#include "SourceEdit.h"
#include "edit/clipboard/RawDocument.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <cstdio>

QJsonObject run(const QJsonObject& request) {
    const nt::targeting::TargetingState state{
        nt::edit::structure::idSet(request.value("untargetedTrackIds").toArray()),
        nt::edit::structure::idSet(request.value("syncLockOffTrackIds").toArray())};
    const auto doc = request.value("doc").toObject();
    const auto result = nt::sourceedit::performSourceEdit(request.value("kind").toString(), doc, state,
        request.value("sourceRange").toObject(), request.value("playheadMs").toDouble(), request.value("asset").toObject());
    return {{"doc", result ? result->doc : doc}, {"id", result ? QJsonValue(result->id) : QJsonValue::Null}};
}
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) { return 1; }
    QJsonParseError error;
    const auto request = QJsonDocument::fromJson(input.readAll(), &error);
    if (error.error != QJsonParseError::NoError || request.isNull()) { return 1; }
    QJsonDocument result;
    if (request.isArray()) {
        QJsonArray results;
        for (const auto& value : request.array()) { results.append(run(value.toObject())); }
        result = QJsonDocument(results);
    } else { result = QJsonDocument(run(request.object())); }
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) { return 1; }
    output.write(result.toJson(QJsonDocument::Compact));
    output.write("\n");
}
