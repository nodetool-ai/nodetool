#include "aiassist/AgentBridge.h"
#include "aiassist/AssistDocument.h"
#include "transcript/TranscriptDocument.h"
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
  } else if (operation == "transcriptWords") {
    QJsonArray words;
    for (const auto &word : nt::transcript::sequenceWords(document)) {
      words.append(QJsonObject{{"clipId", word.clipId},
                               {"wordIndex", word.wordIndex},
                               {"text", word.text},
                               {"startMs", word.startMs},
                               {"endMs", word.endMs}});
    }
    result.insert("words", words);
  } else if (operation == "transcriptSpan") {
    const auto span = nt::transcript::wordSpan(
        nt::transcript::sequenceWords(document), payload.value("first").toInt(),
        payload.value("last").toInt(), document.value("fps").toDouble());
    if (span) {
      result.insert("startMs", span->startMs);
      result.insert("endMs", span->endMs);
    }
  } else if (operation == "captionCues") {
    QJsonArray cues;
    for (const auto &group : nt::transcript::captionCues(
             payload.value("words").toArray(),
             payload.value("durationMs").toDouble())) {
      QJsonArray cue;
      for (const int index : group) {
        cue.append(index);
      }
      cues.append(cue);
    }
    result.insert("cues", cues);
  } else if (operation == "captionEdit") {
    const auto name = payload.value("name").toString();
    const auto edit = payload.value("payload").toObject();
    result = name == "split"    ? nt::transcript::splitCue(document, edit)
             : name == "merge"  ? nt::transcript::mergeCue(document, edit)
             : name == "delete" ? nt::transcript::deleteCue(document, edit)
             : name == "add"    ? nt::transcript::addCue(document, edit)
             : name == "times"  ? nt::transcript::setCueTimes(document, edit)
                                : nt::transcript::setCueText(document, edit);
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
