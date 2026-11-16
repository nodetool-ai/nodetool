#pragma once
// A storyboard document written as Markdown, and read back: the C++ port of
// packages/protocol/src/storyboard-markdown.ts. The TypeScript is the
// reference. tests/storyboard-markdown.oracle.test.mjs runs both on the same
// boards and texts and fails on any difference, so change them together.
//
// Thread affinity: thread-safe. Every function is pure; the compiled patterns
// are immutable statics.
#include <QHash>
#include <QJsonObject>
#include <QString>
#include <QStringList>
#include <QVector>
#include <functional>
#include <optional>

namespace nt::storyboard {

// The entity fields the Markdown needs: the name for links, the kind for chips.
struct MarkdownEntity {
    QString name;
    QString kind;
    QString descriptor;
};
using MarkdownEntities = QHash<QString, MarkdownEntity>;

// Why a line does not map cleanly. `code` and `params` let the editor word the
// message itself; `message` is the English text.
struct MarkdownWarning {
    int line = 0;
    QString code;
    QJsonObject params;
    QString message;
};

// What one line of the Markdown became. Empty strings mean absent.
struct MarkdownLine {
    int line = 0;
    // blank, title, act, scene, shot, field, cont, text, still, clip or stray.
    QString role;
    int bodyStart = 0;
    std::optional<int> bodyEnd;
    std::optional<int> syntaxWidth;
    QString key;
    QString group;
    QString scope;
    std::optional<int> shotNumber;
    QString shotId;
    QString status;
    QString media;
    std::optional<MarkdownWarning> warning;
};

// A heading that has no id yet, and the id to write into it.
struct MarkdownMissingId {
    struct Replace {
        int start = 0;
        QString text;
    };
    int line = 0;
    QString id;
    std::optional<Replace> replace;
};

struct MarkdownParse {
    QJsonObject document;
    QVector<MarkdownLine> lines;
    QVector<MarkdownWarning> warnings;
    QVector<MarkdownMissingId> missingIds;
    QStringList shotOrder;
};

// One styled run of a line: text, syntax, hidden, label, bold, italic, entity,
// shotref or id. The run texts add up to the line.
struct MarkdownToken {
    QString kind;
    QString text;
    QString entityKind;
};

// The editor's lines: a trailing line break ends the text, it does not start a line.
QStringList markdownLines(const QString& markdown);

// Write a storyboard document as Markdown.
QString storyboardToMarkdown(const QJsonObject& document, const MarkdownEntities& entities = {});

// Read a storyboard document out of its lines. `base` is the stored document,
// or null for a new board: what the text does not show is kept from it by id.
// `generateId` mints ids for headings without one; by default 32 hex characters.
MarkdownParse parseStoryboardMarkdown(const QStringList& lines, const QJsonObject* base, const MarkdownEntities& entities = {},
    const std::function<QString()>& generateId = {});

// Split one line into styled runs.
QVector<MarkdownToken> tokenizeStoryboardLine(const QString& line, const MarkdownEntities& entities = {});

// The result as the TypeScript returns it, for the oracle and for QML.
QJsonObject parseToJson(const MarkdownParse& parse);
QJsonObject lineToJson(const MarkdownLine& line);
QJsonObject tokenToJson(const MarkdownToken& token);

}  // namespace nt::storyboard
