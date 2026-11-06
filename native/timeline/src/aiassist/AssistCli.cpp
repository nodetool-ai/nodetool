#include "aiassist/AssistDocument.h"
#include "aiassist/LinkedWorkflow.h"
#include "app/CliModes.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <cstdio>
namespace {
int runAssist(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) { return 2; }
    QJsonParseError error;
    const auto request = QJsonDocument::fromJson(input.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !request.isObject()) { return 2; }
    const auto object = request.object();
    const auto document = object.value("document").toObject();
    const auto payload = object.value("payload").toObject();
    const auto operation = object.value("operation").toString();
    QJsonObject result;
    if (operation == "correctTranscript") { result = nt::aiassist::correctTranscript(document, payload); }
    else if (operation == "deleteTranscriptRange") { result = nt::aiassist::deleteTranscriptRange(document, payload); }
    else if (operation == "removeFillers") { result = nt::aiassist::removeFillers(document, payload); }
    else if (operation == "reconcileScript") { result = nt::aiassist::reconcileScript(document, payload); }
    else if (operation == "syncStoryboardShot") { result = nt::aiassist::syncStoryboardShot(document, payload); }
    else { return 2; }
    const auto bytes = QJsonDocument(result).toJson(QJsonDocument::Compact);
    return std::fwrite(bytes.constData(), 1, static_cast<size_t>(bytes.size()), stdout) == static_cast<size_t>(bytes.size()) ? 0 : 1;
}
const bool registered = nt::app::registerCliMode({"--assist-op", runAssist, nt::app::CliStage::BeforeServerArgs});
}
