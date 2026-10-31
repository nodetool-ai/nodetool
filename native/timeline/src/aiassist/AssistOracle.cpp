#include "aiassist/AgentBridge.h"
#include "aiassist/AssistDocument.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <cstdio>
int main(int argc, char **argv) {
  QCoreApplication app(argc, argv);
  QFile input;
  if (!input.open(stdin, QIODevice::ReadOnly)) {
    return 2;
  }
  QJsonParseError error;
  const auto parsed = QJsonDocument::fromJson(input.readAll(), &error);
  if (error.error != QJsonParseError::NoError || !parsed.isObject()) {
    return 2;
  }
  const auto request = parsed.object();
  const auto operation = request.value("operation").toString();
  const auto document = request.value("document").toObject();
  const auto payload = request.value("payload").toObject();
  QJsonObject result;
  if (operation == "correctTranscript") {
    result = nt::aiassist::correctTranscript(document, payload);
  } else if (operation == "deleteTranscriptRange") {
    result = nt::aiassist::deleteTranscriptRange(document, payload);
  } else if (operation == "removeFillers") {
    result = nt::aiassist::removeFillers(document, payload);
  } else if (operation == "directorRequest") {
    result = nt::aiassist::assistantDirectorRequest(
        document, payload.value("replan").toBool(), "nodetool",
        "nodetool/director");
  } else if (operation == "validateProduction") {
    result =
        nt::aiassist::assistantValidateProduction(request.value("payload"));
  } else if (operation == "compileProduction") {
    result = nt::aiassist::assistantCompileProduction(payload);
  } else if (operation == "prepareBeatCut") {
    result = nt::aiassist::assistantPrepareBeatCut(document, payload);
  } else {
    return 2;
  }
  const auto bytes = QJsonDocument(result).toJson(QJsonDocument::Compact);
  return std::fwrite(bytes.constData(), 1, static_cast<size_t>(bytes.size()),
                     stdout) == static_cast<size_t>(bytes.size())
             ? 0
             : 1;
}
