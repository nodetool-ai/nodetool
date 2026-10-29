#include "aiassist/StoryboardAssembly.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) { return 2; }
    const auto request = QJsonDocument::fromJson(input.readAll()).object();
    const auto result = nt::aiassist::assembleStoryboard(request.value("existing").toObject(), request.value("board").toObject(), request.value("script").toObject());
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) { return 2; }
    const auto bytes = QJsonDocument(QJsonObject{{"document", result.document}, {"error", result.error}, {"skippedShotIds", result.skippedShotIds},
        {"skippedLineIds", result.skippedLineIds}, {"trimmedShots", result.trimmedShots}, {"retimedShots", result.retimedShots}}).toJson(QJsonDocument::Compact);
    if (output.write(bytes) != bytes.size()) { return 2; }
    return result.error.isEmpty() ? 0 : 2;
}
