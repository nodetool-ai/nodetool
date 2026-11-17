// Runs the C++ storyboard Markdown grammar on a batch of requests read from
// stdin and writes the results to stdout, for storyboard-markdown.oracle.test.mjs.
// Request: {"requests": [{"op": "write"|"parse"|"tokenize", ...}]}.
#include "StoryboardMarkdown.h"

#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>

namespace {
using namespace nt::storyboard;

MarkdownEntities readEntities(const QJsonValue& value) {
    MarkdownEntities out;
    for (const auto& item : value.toArray()) {
        const auto e = item.toObject();
        out.insert(e.value("id").toString(), {e.value("name").toString(), e.value("kind").toString(), e.value("descriptor").toString()});
    }
    return out;
}

QJsonValue run(const QJsonObject& request) {
    const QString op = request.value("op").toString();
    const auto entities = readEntities(request.value("entities"));
    if (op == QLatin1String("write")) return storyboardToMarkdown(request.value("document").toObject(), entities);
    if (op == QLatin1String("tokenize")) {
        QJsonArray tokens;
        for (const auto& token : tokenizeStoryboardLine(request.value("line").toString(), entities)) tokens.append(tokenToJson(token));
        return tokens;
    }
    if (op == QLatin1String("parse")) {
        int next = 0;
        const auto generateId = [&next] { return QStringLiteral("new%1").arg(++next); };
        const QJsonValue base = request.value("base");
        const QJsonObject baseObject = base.toObject();
        return parseToJson(parseStoryboardMarkdown(markdownLines(request.value("markdown").toString()), base.isObject() ? &baseObject : nullptr, entities, generateId));
    }
    return QJsonValue::Null;
}
}  // namespace

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) return 2;
    QJsonParseError error{};
    const auto request = QJsonDocument::fromJson(input.readAll(), &error).object();
    if (error.error != QJsonParseError::NoError) return 2;
    QJsonArray results;
    for (const auto& item : request.value("requests").toArray()) results.append(run(item.toObject()));
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) return 2;
    const auto bytes = QJsonDocument(QJsonObject{{"results", results}}).toJson(QJsonDocument::Compact);
    return output.write(bytes) == bytes.size() ? 0 : 2;
}
