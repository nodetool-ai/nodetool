#include "StoryboardMarkdown.h"

#include <QJsonArray>
#include <QJsonValue>
#include <QLocale>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>
#include <algorithm>
#include <cmath>

namespace nt::storyboard {
namespace {

// JavaScript's \s, written out: PCRE's \s does not match the Unicode spaces
// JavaScript does, and the two grammars must split text at the same places.
const QString kSpace = QStringLiteral("\\t\\n\\x{0B}\\f\\r \\x{A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}");
const QString kWs = QStringLiteral("[") + kSpace + QStringLiteral("]");
const QString kNotWs = QStringLiteral("[^") + kSpace + QStringLiteral("]");
const QString kId = QStringLiteral("[A-Za-z0-9._~-]+");

// Rewrites \s and \S in a JavaScript pattern to JavaScript's whitespace,
// inside a character class as well as outside one.
QString ws(const QString& pattern) {
    QString out;
    bool inClass = false;
    for (qsizetype i = 0; i < pattern.size(); ++i) {
        const QChar c = pattern.at(i);
        if (c == QLatin1Char('\\') && i + 1 < pattern.size()) {
            const QChar next = pattern.at(++i);
            if (next == QLatin1Char('s')) out += inClass ? kSpace : kWs;
            else if (next == QLatin1Char('S') && !inClass) out += kNotWs;
            else out += c + QString(next);
            continue;
        }
        if (c == QLatin1Char('[')) inClass = true;
        else if (c == QLatin1Char(']')) inClass = false;
        out += c;
    }
    return out;
}

bool isJsSpace(QChar c) {
    const char16_t u = c.unicode();
    return u == 0x09 || u == 0x0A || u == 0x0B || u == 0x0C || u == 0x0D || u == 0x20 || u == 0xA0 || u == 0x1680 ||
        (u >= 0x2000 && u <= 0x200A) || u == 0x2028 || u == 0x2029 || u == 0x202F || u == 0x205F || u == 0x3000 || u == 0xFEFF;
}
// String.prototype.trim.
QString trim(const QString& s) {
    qsizetype start = 0;
    qsizetype end = s.size();
    while (start < end && isJsSpace(s.at(start))) ++start;
    while (end > start && isJsSpace(s.at(end - 1))) --end;
    return s.mid(start, end - start);
}

// Number.prototype.toString for the values a storyboard holds.
QString jsNumber(double value) {
    if (value == 0) return QStringLiteral("0");
    const double magnitude = std::fabs(value);
    if (magnitude >= 1e-6 && magnitude < 1e21) {
        return QString::number(value, 'f', QLocale::FloatingPointShortest);
    }
    QString text = QString::number(value, 'e', QLocale::FloatingPointShortest);
    // Qt writes "1e-07"; JavaScript writes "1e-7".
    text.replace(QRegularExpression(QStringLiteral("e([+-])0+(\\d)")), QStringLiteral("e\\1\\2"));
    return text;
}

// parseFloat: the longest leading decimal number, after leading whitespace.
std::optional<double> parseFloatPrefix(const QString& text) {
    static const QRegularExpression number(QStringLiteral("^") + kWs + QStringLiteral("*([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)"));
    const auto m = number.match(text);
    if (!m.hasMatch()) return std::nullopt;
    bool ok = false;
    const double value = m.captured(1).toDouble(&ok);
    if (!ok || !std::isfinite(value)) return std::nullopt;
    return value;
}

// Field labels, the first label of each key being the one written out.
const QVector<std::pair<QString, QString>> kShotFields = {
    {"Action", "action"}, {"Framing", "camera.framing"}, {"Lens", "camera.lens"}, {"Angle", "camera.angle"},
    {"Camera movement", "camera.movement"}, {"Rig", "camera.equipment"}, {"Camera presets", "camera.preset_ids"},
    {"Motion", "motion"}, {"End", "end_state"}, {"Sound", "sound"}, {"Dialogue", "dialogue"}, {"Narration", "narration"},
    {"Duration", "duration_seconds"}, {"Render", "render_mode"}, {"Location", "location_id"}, {"Cast", "entity_ids"},
    {"Look", "look_preset_ids"}, {"Transition", "transition"}, {"Continuity", "continuity"}, {"Notes", "notes"}};
const QVector<std::pair<QString, QString>> kShotAliases = {
    {"initial phase", "action"}, {"initial frame", "action"}, {"camera move", "camera.movement"}, {"equipment", "camera.equipment"},
    {"movement", "motion"}, {"end state", "end_state"}, {"final phase", "end_state"}, {"end frame", "end_state"}, {"voiceover", "narration"},
    {"vo", "narration"}, {"mode", "render_mode"}, {"render mode", "render_mode"}, {"entities", "entity_ids"}, {"characters", "entity_ids"},
    {"references", "entity_ids"}, {"look presets", "look_preset_ids"}, {"note", "notes"}};
const QVector<std::pair<QString, QString>> kBoardFields = {
    {"Logline", "logline"}, {"Brief", "brief"}, {"Style", "style"}, {"Aspect ratio", "aspectRatio"}, {"Genre", "genre"},
    {"Cast", "entityIds"}, {"Look", "look_preset_ids"}, {"Music", "music_prompt"}, {"Narration", "narration"},
    {"Motion design", "motion_direction"}};
const QVector<std::pair<QString, QString>> kBoardAliases = {
    {"style bible", "style"}, {"aspect", "aspectRatio"}, {"music prompt", "music_prompt"}, {"score", "music_prompt"},
    {"entities", "entityIds"}, {"concept", "brief"}};

enum class Holder { Board, Act, Scene, Shot };

QHash<QString, QString> labelTable(const QVector<std::pair<QString, QString>>& list, const QVector<std::pair<QString, QString>>& aliases = {}) {
    QHash<QString, QString> byLabel;
    for (const auto& [label, key] : list) byLabel.insert(label.toLower(), key);
    for (const auto& [label, key] : aliases) byLabel.insert(label, key);
    return byLabel;
}
const QHash<QString, QString>& fieldsOf(Holder holder) {
    static const QHash<QString, QString> board = labelTable(kBoardFields, kBoardAliases);
    static const QHash<QString, QString> act = labelTable({{"Objective", "objective"}});
    static const QHash<QString, QString> scene = labelTable({{"Lighting", "lighting"}});
    static const QHash<QString, QString> shot = labelTable(kShotFields, kShotAliases);
    switch (holder) {
    case Holder::Board: return board;
    case Holder::Act: return act;
    case Holder::Scene: return scene;
    case Holder::Shot: return shot;
    }
    return shot;
}
bool isKnownLabel(const QString& label) {
    for (const auto holder : {Holder::Board, Holder::Act, Holder::Scene, Holder::Shot}) {
        if (fieldsOf(holder).contains(label)) return true;
    }
    return false;
}

const QSet<QString> kShotTextKeys = {"slug", "action", "motion", "end_state", "sound", "dialogue", "narration", "notes", "duration_seconds",
    "render_mode", "location_id", "entity_ids", "look_preset_ids", "keyframe", "clip", "scene_id", "index", "id", "type", "camera"};
const QStringList kCameraTextKeys = {"framing", "lens", "angle", "movement", "equipment", "preset_ids"};

/* ── small helpers ───────────────────────────────────────────────────── */

std::optional<QString> str(const QJsonValue& value) {
    if (!value.isString()) return std::nullopt;
    return value.toString();
}
QString strOr(const QJsonValue& value) { return value.isString() ? value.toString() : QString(); }
QStringList strList(const QJsonValue& value) {
    QStringList out;
    for (const auto& item : value.toArray()) {
        if (item.isString()) out.append(item.toString());
    }
    return out;
}
QVector<QJsonObject> recList(const QJsonValue& value) {
    QVector<QJsonObject> out;
    for (const auto& item : value.toArray()) {
        if (item.isObject()) out.append(item.toObject());
    }
    return out;
}
bool isEmptyValue(const QJsonValue& value) {
    return (value.isString() && value.toString().isEmpty()) || (value.isArray() && value.toArray().isEmpty()) ||
        (value.isObject() && value.toObject().isEmpty());
}
bool sameSet(const QStringList& a, const QStringList& b) {
    if (a.size() != b.size()) return false;
    return std::all_of(a.begin(), a.end(), [&](const QString& x) { return b.contains(x); });
}
QJsonArray toArray(const QStringList& list) { return QJsonArray::fromStringList(list); }
std::optional<QString> assetIdOf(const QString& uri) {
    static const QRegularExpression asset(QStringLiteral("^asset://([^./?#]+)"));
    const auto m = asset.match(uri);
    if (!m.hasMatch()) return std::nullopt;
    return m.captured(1);
}
QString refUri(const QJsonValue& ref) {
    if (!ref.isObject()) return {};
    const auto object = ref.toObject();
    const auto uri = str(object.value("uri"));
    if (uri && !uri->isEmpty()) return *uri;
    const auto assetId = str(object.value("asset_id"));
    return assetId && !assetId->isEmpty() ? QStringLiteral("asset://") + *assetId : QString();
}
bool sameRef(const QJsonValue& ref, const QString& uri) {
    if (!ref.isObject()) return false;
    if (refUri(ref) == uri) return true;
    const auto assetId = str(ref.toObject().value("asset_id"));
    return assetId && !assetId->isEmpty() && assetIdOf(uri) == *assetId;
}
QStringList splitIds(const QString& raw) {
    static const QRegularExpression separators(QStringLiteral("[,") + kSpace + QStringLiteral("]+"));
    QStringList out = raw.split(separators);
    out.removeAll(QString());
    return out;
}
// Keep the stored order when the set of ids did not change.
QStringList keepOrder(const QStringList& ids, const QJsonValue& stored) {
    const auto before = strList(stored);
    return stored.isArray() && sameSet(before, ids) ? before : ids;
}

struct Anchor {
    qsizetype index = 0;
    qsizetype length = 0;
    QString id;
    QString text;
};
// The last `{#id}` in a text, wherever it is: text typed after it must not detach an object from its id.
std::optional<Anchor> findAnchor(const QString& text) {
    static const QRegularExpression anchor(kWs + QStringLiteral("*\\{#(") + kId + QStringLiteral(")\\}"));
    std::optional<Anchor> found;
    auto it = anchor.globalMatch(text);
    while (it.hasNext()) {
        const auto m = it.next();
        found = Anchor{m.capturedStart(0), m.capturedLength(0), m.captured(1), m.captured(0)};
    }
    return found;
}
QString withoutAnchor(const QString& text, const std::optional<Anchor>& anchor) {
    return anchor ? text.left(anchor->index) + text.mid(anchor->index + anchor->length) : text;
}

/* ── line matching ───────────────────────────────────────────────────── */

struct HeadingMatch {
    QString mark;
    int level = 0;
    QString prefix;
    QString body;
    int bodyStart = 0;
    struct HeadingAnchor {
        QString id;
        int start = 0;
        QString text;
    };
    std::optional<HeadingAnchor> anchor;
};
std::optional<HeadingMatch> matchHeading(const QString& text) {
    static const QRegularExpression heading(ws(QStringLiteral("^(\\s*(#{1,6})\\s+)")));
    static const QRegularExpression number(ws(QStringLiteral("^(\\d+\\s*[.)]\\s*)")));
    const auto m = heading.match(text);
    if (!m.hasMatch()) return std::nullopt;
    const QString mark = m.captured(1);
    const QString rest = text.mid(mark.size());
    const auto anchor = findAnchor(rest);
    const QString body = withoutAnchor(rest, anchor);
    HeadingMatch out;
    out.mark = mark;
    out.level = int(m.capturedLength(2));
    // A typed shot number is ignored: numbers are computed.
    if (out.level >= 3) out.prefix = number.match(body).captured(1);
    out.body = body.mid(out.prefix.size());
    out.bodyStart = int(mark.size() + out.prefix.size());
    if (anchor) out.anchor = HeadingMatch::HeadingAnchor{anchor->id, int(mark.size() + anchor->index), anchor->text};
    return out;
}

struct FieldMatch {
    QString pre;
    QString label;
    QString post;
    QString gap;
    QString body;
    int bodyStart = 0;
};
std::optional<FieldMatch> matchField(const QString& text) {
    // Each pattern matches the syntax only; the value is the rest of the line.
    static const QRegularExpression bold(ws(QStringLiteral("^(\\s*(?:[-*•]\\s+)?\\*\\*)([^*:\\n]{1,40}?)(:\\*\\*|\\*\\*\\s*:)(\\s*)")));
    static const QRegularExpression plain(ws(QStringLiteral("^(\\s*(?:[-*•]\\s+)?)([A-Za-z][A-Za-z /]{0,30}?)(:)(\\s*)")));
    auto m = bold.match(text);
    if (!m.hasMatch()) {
        m = plain.match(text);
        // "Note: …" in prose stays prose unless the label is one the grammar knows.
        if (!m.hasMatch() || !isKnownLabel(trim(m.captured(2)).toLower())) return std::nullopt;
    }
    return FieldMatch{m.captured(1), m.captured(2), m.captured(3), m.captured(4), text.mid(m.capturedLength(0)), int(m.capturedLength(0))};
}

struct ImageMatch {
    QString uri;
    bool video = false;
};
std::optional<ImageMatch> matchImage(const QString& text) {
    static const QRegularExpression image(ws(QStringLiteral("^\\s*!\\[([^\\]\\n]*)\\]\\(([^)\\s]+)\\)\\s*$")));
    static const QRegularExpression videoExt(QStringLiteral("\\.(mp4|webm|mov|m4v|mkv)$"), QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression clipAlt(QStringLiteral("^clip\\b"), QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression queryOrFragment(QStringLiteral("[?#]"));
    const auto m = image.match(text);
    if (!m.hasMatch()) return std::nullopt;
    const QString uri = m.captured(2);
    // A media reference names a video file: its path, without query or fragment, ends in a video extension.
    const QString path = uri.section(queryOrFragment, 0, 0);
    return ImageMatch{uri, videoExt.match(path).hasMatch() || clipAlt.match(trim(m.captured(1))).hasMatch()};
}

const QRegularExpression& entityLink() {
    static const QRegularExpression link(QStringLiteral("\\[([^\\]\\n]+)\\]\\(entity://(") + kId + QStringLiteral(")\\)|(?<![\\w(])entity://(") + kId + QStringLiteral(")"));
    return link;
}
const QRegularExpression& shotLink() {
    static const QRegularExpression link(QStringLiteral("\\[([^\\]\\n]*)\\]\\(#(") + kId + QStringLiteral(")\\)"));
    return link;
}

struct Mentions {
    QString text;
    QStringList ids;
};
// Entity mentions in a value, and the value with each mention written as its name.
Mentions readEntityMentions(const QString& value, const MarkdownEntities& entities) {
    Mentions out;
    qsizetype at = 0;
    auto it = entityLink().globalMatch(value);
    while (it.hasNext()) {
        const auto m = it.next();
        out.text += value.mid(at, m.capturedStart(0) - at);
        const bool linked = m.capturedStart(2) >= 0;
        const QString id = linked ? m.captured(2) : m.captured(3);
        if (!out.ids.contains(id)) out.ids.append(id);
        if (linked) out.text += m.captured(1);
        else if (entities.contains(id)) out.text += entities.value(id).name;
        else out.text += QStringLiteral("entity://") + id;
        at = m.capturedEnd(0);
    }
    out.text += value.mid(at);
    return out;
}
struct ShotLink {
    QString id;
    qsizetype index = 0;
    qsizetype length = 0;
};
QVector<ShotLink> readShotLinks(const QString& value) {
    QVector<ShotLink> out;
    auto it = shotLink().globalMatch(value);
    while (it.hasNext()) {
        const auto m = it.next();
        out.append({m.captured(2), m.capturedStart(0), m.capturedLength(0)});
    }
    return out;
}
QString stripShotLinks(const QString& value) {
    static const QRegularExpression runs(kWs + QStringLiteral("{2,}"));
    QString out = value;
    out.replace(shotLink(), QString());
    out.replace(runs, QStringLiteral(" "));
    return trim(out);
}

/* ── Markdown → document ─────────────────────────────────────────────── */

struct ParsedAct {
    QString id;
    QString title;
    QStringList objective;
};
struct ParsedScene {
    QString id;
    QString slugline;
    QString act;
    std::optional<QString> lighting;
};
struct ParsedShot {
    QString id;
    QString slug;
    QStringList action;
    QStringList notes;
    QHash<QString, QString> fields;
    QHash<QString, QStringList> repeated;
    QString keyframe;
    QString clip;
    QString scene;
    int line = 0;
};

QString holderName(Holder holder, int number) {
    switch (holder) {
    case Holder::Board: return QStringLiteral("Board");
    case Holder::Act: return QStringLiteral("Act %1").arg(number);
    case Holder::Scene: return QStringLiteral("Scene %1").arg(number);
    case Holder::Shot: return QStringLiteral("Shot %1").arg(number);
    }
    return {};
}

QString defaultId() { return QUuid::createUuid().toString(QUuid::Id128); }

/* ── document → Markdown ─────────────────────────────────────────────── */

// Write the first mention of each entity in a value as a link.
QString linkNames(const QString& value, const QStringList& ids, const MarkdownEntities& entities, QSet<QString>& linked) {
    QString out = value;
    for (const auto& id : ids) {
        const QString name = entities.contains(id) ? trim(entities.value(id).name) : QString();
        if (linked.contains(id) || name.isEmpty()) continue;
        const QRegularExpression pattern(QStringLiteral("(?<![\\w\\[])") + QRegularExpression::escape(name.toLower()) + QStringLiteral("(?![\\w\\]])"));
        const auto m = pattern.match(out.toLower());
        if (!m.hasMatch()) continue;
        const qsizetype at = m.capturedStart(0);
        const QString before = out.left(at);
        // Never inside an existing link.
        if (before.count(QLatin1Char('[')) > before.count(QLatin1Char(']'))) continue;
        out = before + QStringLiteral("[") + out.mid(at, name.size()) + QStringLiteral("](entity://") + id + QStringLiteral(")") + out.mid(at + name.size());
        linked.insert(id);
    }
    return out;
}

QStringList paragraphs(const QString& value) {
    static const QRegularExpression breaks(QStringLiteral("\\n\\n+"));
    QStringList out;
    const QStringList parts = trim(value).split(breaks);
    for (qsizetype i = 0; i < parts.size(); ++i) {
        if (i > 0) out.append(QString());
        out.append(parts.at(i).split(QLatin1Char('\n')));
    }
    return out;
}

}  // namespace

QStringList markdownLines(const QString& markdown) {
    QString text = markdown;
    if (text.endsWith(QLatin1Char('\n'))) text.chop(1);
    return text.split(QLatin1Char('\n'));
}

QVector<MarkdownToken> tokenizeStoryboardLine(const QString& text, const MarkdownEntities& entities) {
    QVector<MarkdownToken> out;
    const auto push = [&out](const QString& kind, const QString& s, const QString& entityKind = {}) {
        if (s.isEmpty()) return;
        if (!out.isEmpty() && out.last().kind == kind && out.last().entityKind == entityKind && kind != QLatin1String("entity") &&
            kind != QLatin1String("shotref")) {
            out.last().text += s;
        } else {
            out.append({kind, s, entityKind});
        }
    };
    const auto kindOf = [&entities](const QString& id) { return entities.contains(id) ? entities.value(id).kind : QStringLiteral("missing"); };
    const auto inlineRuns = [&](const QString& s) {
        static const QRegularExpression runs(QStringLiteral("(\\*\\*)(?=") + kNotWs + QStringLiteral(")([^*]+?)(\\*\\*)|(\\*)(?=") + kNotWs +
            QStringLiteral(")([^*\\n]+?)(\\*)|\\[([^\\]\\n]+)\\]\\((entity://(") + kId + QStringLiteral("))\\)|(?<![\\w(])(entity://(") + kId +
            QStringLiteral("))|\\[([^\\]\\n]*)\\]\\((#") + kId + QStringLiteral(")\\)"));
        qsizetype at = 0;
        auto it = runs.globalMatch(s);
        while (it.hasNext()) {
            const auto m = it.next();
            push(QStringLiteral("text"), s.mid(at, m.capturedStart(0) - at));
            if (m.capturedStart(1) >= 0) {
                push(QStringLiteral("syntax"), m.captured(1));
                push(QStringLiteral("bold"), m.captured(2));
                push(QStringLiteral("syntax"), m.captured(3));
            } else if (m.capturedStart(4) >= 0) {
                push(QStringLiteral("syntax"), m.captured(4));
                push(QStringLiteral("italic"), m.captured(5));
                push(QStringLiteral("syntax"), m.captured(6));
            } else if (m.capturedStart(7) >= 0) {
                push(QStringLiteral("hidden"), QStringLiteral("["));
                push(QStringLiteral("entity"), m.captured(7), kindOf(m.captured(9)));
                push(QStringLiteral("hidden"), QStringLiteral("](") + m.captured(8) + QStringLiteral(")"));
            } else if (m.capturedStart(10) >= 0) {
                push(QStringLiteral("entity"), m.captured(10), kindOf(m.captured(11)));
            } else {
                push(QStringLiteral("hidden"), QStringLiteral("["));
                push(QStringLiteral("shotref"), m.captured(12));
                push(QStringLiteral("hidden"), QStringLiteral("](") + m.captured(13) + QStringLiteral(")"));
            }
            at = m.capturedEnd(0);
        }
        push(QStringLiteral("text"), s.mid(at));
    };
    if (const auto heading = matchHeading(text)) {
        push(QStringLiteral("syntax"), heading->mark + heading->prefix);
        const QString rest = text.mid(heading->bodyStart);
        if (heading->anchor) {
            const int at = heading->anchor->start - heading->bodyStart;
            inlineRuns(rest.left(at));
            push(QStringLiteral("id"), heading->anchor->text);
            inlineRuns(rest.mid(at + heading->anchor->text.size()));
        } else {
            inlineRuns(rest);
        }
    } else if (matchImage(text)) {
        push(QStringLiteral("syntax"), text);
    } else if (const auto field = matchField(text)) {
        push(QStringLiteral("syntax"), field->pre);
        push(QStringLiteral("label"), field->label);
        push(QStringLiteral("syntax"), field->post);
        push(QStringLiteral("text"), field->gap);
        if (const auto anchor = findAnchor(field->body)) {
            inlineRuns(field->body.left(anchor->index));
            push(QStringLiteral("id"), anchor->text);
            inlineRuns(field->body.mid(anchor->index + anchor->length));
        } else {
            inlineRuns(field->body);
        }
    } else {
        static const QRegularExpression bullet(ws(QStringLiteral("^\\s*[-*•]\\s+")));
        const auto m = bullet.match(text);
        if (m.hasMatch()) {
            push(QStringLiteral("syntax"), m.captured(0));
            inlineRuns(text.mid(m.capturedLength(0)));
        } else {
            inlineRuns(text);
        }
    }
    QString joined;
    for (const auto& token : out) joined += token.text;
    if (joined == text) return out;
    if (text.isEmpty()) return {};
    return {{QStringLiteral("text"), text, {}}};
}

MarkdownParse parseStoryboardMarkdown(const QStringList& lines, const QJsonObject* base, const MarkdownEntities& entities,
    const std::function<QString()>& generateId) {
    const auto newId = generateId ? generateId : std::function<QString()>(defaultId);
    const QJsonValue baseScreenplayValue = base ? base->value("screenplay") : QJsonValue();
    const std::optional<QJsonObject> baseScreenplay = baseScreenplayValue.isObject() ? std::optional(baseScreenplayValue.toObject()) : std::nullopt;
    const QVector<QJsonObject> baseShotList =
        base && !recList(base->value("shots")).isEmpty() ? recList(base->value("shots")) : recList(baseScreenplay ? baseScreenplay->value("shots") : QJsonValue());
    QHash<QString, QJsonObject> baseShots;
    for (const auto& s : baseShotList) baseShots.insert(strOr(s.value("id")), s);
    // Stored order, first occurrence of each id, as a JavaScript Map keeps it.
    const auto byId = [](const QVector<QJsonObject>& list, QHash<QString, QJsonObject>& map, QStringList& order) {
        for (const auto& item : list) {
            const QString id = strOr(item.value("id"));
            if (!map.contains(id)) order.append(id);
            map.insert(id, item);
        }
    };
    QHash<QString, QJsonObject> baseScenes;
    QStringList baseSceneOrder;
    QHash<QString, QJsonObject> baseActs;
    QStringList baseActOrder;
    std::optional<QJsonObject> baseMotion;
    if (baseScreenplay) {
        byId(recList(baseScreenplay->value("scenes")), baseScenes, baseSceneOrder);
        byId(recList(baseScreenplay->value("acts")), baseActs, baseActOrder);
        if (baseScreenplay->value("motion_design").isObject()) baseMotion = baseScreenplay->value("motion_design").toObject();
    }
    const QVector<QJsonObject> baseTransitions = baseMotion ? recList(baseMotion->value("transitions")) : QVector<QJsonObject>();
    QHash<QString, QJsonObject> baseContinuities;
    if (baseMotion) {
        for (const auto& c : recList(baseMotion->value("continuities"))) baseContinuities.insert(strOr(c.value("id")), c);
    }

    std::optional<QString> boardTitle;
    std::optional<QString> boardTitleId;
    QHash<QString, QString> boardFields;
    QStringList boardBrief;
    QVector<ParsedAct> acts;
    QVector<ParsedScene> scenes;
    QVector<ParsedShot> shots;
    MarkdownParse result;
    QSet<QString> seen;
    Holder holder = Holder::Board;
    int holderIndex = -1;  // into acts, scenes or shots
    std::optional<int> act;
    std::optional<int> scene;
    // The open field: where a continuation line goes.
    enum class Open { None, List, Value, Repeated, Lighting, Lost };
    Open open = Open::None;
    QStringList* openList = nullptr;
    QHash<QString, QString>* openInto = nullptr;
    QString openKey;
    int openScene = -1;
    bool afterBlank = false;
    bool fieldsStarted = false;
    int lastField = -1;

    const auto note = [&result](int line, const QString& code, const QString& message, const QJsonObject& params = {}) {
        result.warnings.append({line, code, params, message});
        return result.warnings.last();
    };
    const auto warn = [&](MarkdownLine& m, const QString& code, const QString& message, const QJsonObject& params = {}) {
        m.warning = note(m.line, code, message, params);
    };
    const auto claimId = [&](const MarkdownLine& m, const HeadingMatch& heading) {
        QString id = heading.anchor ? heading.anchor->id : QString();
        if (!heading.anchor || seen.contains(id)) {
            id = newId();
            MarkdownMissingId missing{m.line, id, std::nullopt};
            if (heading.anchor) missing.replace = MarkdownMissingId::Replace{heading.anchor->start, heading.anchor->text};
            result.missingIds.append(missing);
        }
        seen.insert(id);
        return id;
    };
    const auto appendParagraph = [&afterBlank](QStringList& list, const QString& text) {
        if (afterBlank || list.isEmpty()) list.append(text);
        else list.last() += QStringLiteral("\n") + text;
    };
    const auto name = [&]() { return holderName(holder, holderIndex + 1); };

    // Each list is reserved up front: the open field holds a pointer into them.
    acts.reserve(lines.size());
    scenes.reserve(lines.size());
    shots.reserve(lines.size());
    result.lines.reserve(lines.size());
    for (int line = 0; line < lines.size(); ++line) {
        const QString& text = lines.at(line);
        result.lines.append(MarkdownLine{});
        MarkdownLine& m = result.lines.last();
        m.line = line;
        m.role = QStringLiteral("text");
        if (trim(text).isEmpty()) {
            m.role = QStringLiteral("blank");
            open = Open::None;
            afterBlank = true;
            continue;
        }

        if (const auto heading = matchHeading(text)) {
            open = Open::None;
            afterBlank = false;
            fieldsStarted = false;
            lastField = -1;
            m.bodyStart = heading->bodyStart;
            m.bodyEnd = heading->anchor ? heading->anchor->start : int(text.size());
            m.syntaxWidth = int(trim(heading->mark).size() + heading->prefix.size());
            const QString body = trim(heading->body);
            if (heading->level == 1 && !boardTitle && acts.isEmpty() && scenes.isEmpty() && shots.isEmpty()) {
                boardTitle = body;
                boardTitleId = claimId(m, *heading);
                holder = Holder::Board;
                m.role = QStringLiteral("title");
                m.group = QStringLiteral("title");
                m.scope = QStringLiteral("Board · title");
            } else if (heading->level == 1) {
                acts.append({claimId(m, *heading), body, {}});
                act = int(acts.size() - 1);
                scene.reset();
                holder = Holder::Act;
                holderIndex = *act;
                m.role = QStringLiteral("act");
                m.group = QStringLiteral("act:%1:title").arg(acts.last().id);
                m.scope = QStringLiteral("Act %1 · title").arg(acts.size());
            } else if (heading->level == 2) {
                scenes.append({claimId(m, *heading), body, act ? acts.at(*act).id : QString(), std::nullopt});
                scene = int(scenes.size() - 1);
                holder = Holder::Scene;
                holderIndex = *scene;
                m.role = QStringLiteral("scene");
                m.group = QStringLiteral("scene:%1:slugline").arg(scenes.last().id);
                m.scope = QStringLiteral("Scene %1 · slugline").arg(scenes.size());
            } else {
                ParsedShot shot;
                shot.id = claimId(m, *heading);
                shot.slug = body;
                shot.scene = scene ? scenes.at(*scene).id : QString();
                shot.line = line;
                shots.append(shot);
                holder = Holder::Shot;
                holderIndex = int(shots.size() - 1);
                m.role = QStringLiteral("shot");
                m.group = QStringLiteral("shot:%1:slug").arg(shot.id);
                m.scope = QStringLiteral("Shot %1 · title").arg(shots.size());
                m.shotNumber = int(shots.size());
                m.shotId = shot.id;
            }
            continue;
        }

        if (const auto image = matchImage(text)) {
            open = Open::None;
            afterBlank = false;
            m.bodyStart = int(text.size());
            m.media = image->uri;
            if (holder != Holder::Shot) {
                m.role = QStringLiteral("stray");
                warn(m, QStringLiteral("media_outside_shot"), QStringLiteral("An image belongs to a shot: put it under a ### shot heading."));
                continue;
            }
            QString& target = image->video ? shots[holderIndex].clip : shots[holderIndex].keyframe;
            if (!target.isEmpty()) {
                const QString media = image->video ? QStringLiteral("clip") : QStringLiteral("still");
                warn(m, QStringLiteral("second_media"), QStringLiteral("A shot has one selected %1. This one is not used.").arg(media), {{"media", media}});
            } else {
                target = image->uri;
            }
            m.role = image->video ? QStringLiteral("clip") : QStringLiteral("still");
            m.scope = name() + (image->video ? QStringLiteral(" · clip") : QStringLiteral(" · still"));
            continue;
        }

        if (const auto f = matchField(text)) {
            const QString label = trim(f->label);
            const QString key = fieldsOf(holder).value(label.toLower());
            afterBlank = false;
            fieldsStarted = true;
            m.role = QStringLiteral("field");
            m.bodyStart = f->bodyStart;
            m.scope = name() + QStringLiteral(" · ") + label;
            lastField = line;
            const QString body = trim(f->body);
            if (key.isEmpty()) {
                m.key = QStringLiteral("unknown");
                if (holder == Holder::Shot) {
                    shots[holderIndex].notes.append(label + QStringLiteral(": ") + body);
                    open = Open::List;
                    openList = &shots[holderIndex].notes;
                    warn(m, QStringLiteral("unknown_shot_field"), QStringLiteral("\"%1\" is not a storyboard field. It is saved in the shot's notes.").arg(label),
                        {{"label", label}});
                } else {
                    open = Open::Lost;
                    const QString holderType = holder == Holder::Board ? QStringLiteral("board") : holder == Holder::Act ? QStringLiteral("act") : QStringLiteral("scene");
                    const QString what = holder == Holder::Board ? QStringLiteral("the board") : QStringLiteral("a ") + holderType;
                    warn(m, QStringLiteral("unknown_field"), QStringLiteral("\"%1\" is not a field of %2. It is not saved.").arg(label, what),
                        {{"label", label}, {"holder", holderType}});
                }
                continue;
            }
            m.key = key;
            const QString owner = holder == Holder::Board ? QStringLiteral("board")
                : holder == Holder::Act                   ? QStringLiteral("act:") + acts.at(holderIndex).id
                : holder == Holder::Scene                 ? QStringLiteral("scene:") + scenes.at(holderIndex).id
                                                          : QStringLiteral("shot:") + shots.at(holderIndex).id;
            m.group = owner + QStringLiteral(":") + key;
            if (holder == Holder::Shot && (key == QLatin1String("action") || key == QLatin1String("notes"))) {
                QStringList& list = key == QLatin1String("action") ? shots[holderIndex].action : shots[holderIndex].notes;
                list.append(body);
                open = Open::List;
                openList = &list;
                continue;
            }
            if (holder == Holder::Board && key == QLatin1String("brief")) {
                boardBrief.append(body);
                open = Open::List;
                openList = &boardBrief;
                continue;
            }
            if (holder == Holder::Act) {
                acts[holderIndex].objective.append(body);
                open = Open::List;
                openList = &acts[holderIndex].objective;
                continue;
            }
            if (holder == Holder::Scene) {
                auto& lighting = scenes[holderIndex].lighting;
                lighting = (lighting && !lighting->isEmpty() ? *lighting + QStringLiteral("\n") : QString()) + body;
                open = Open::Lighting;
                openScene = holderIndex;
                continue;
            }
            QHash<QString, QString>& into = holder == Holder::Board ? boardFields : shots[holderIndex].fields;
            if (holder == Holder::Shot && (key == QLatin1String("transition") || key == QLatin1String("continuity"))) {
                QStringList& list = shots[holderIndex].repeated[key];
                list.append(body);
                open = Open::Repeated;
                openList = &list;
                continue;
            }
            const QString before = into.value(key);
            into.insert(key, (before.isEmpty() ? QString() : before + QStringLiteral("\n")) + body);
            open = Open::Value;
            openInto = &into;
            openKey = key;
            continue;
        }

        // Plain text continues the field above it, or is the main text of its object.
        if (open != Open::None && !afterBlank) {
            const QString t = trim(text);
            if (open == Open::List || open == Open::Repeated) openList->last() += QStringLiteral("\n") + t;
            else if (open == Open::Value) (*openInto)[openKey] += QStringLiteral("\n") + t;
            else if (open == Open::Lighting) scenes[openScene].lighting = scenes[openScene].lighting.value_or(QString()) + QStringLiteral("\n") + t;
            m.role = QStringLiteral("cont");
            if (lastField >= 0) {
                const MarkdownLine& above = result.lines.at(lastField);
                m.scope = above.scope;
                m.key = above.key;
                m.group = above.group;
            }
            continue;
        }
        open = Open::None;
        const QString t = trim(text);
        if (holder == Holder::Shot) {
            ParsedShot& shot = shots[holderIndex];
            if (!fieldsStarted) {
                appendParagraph(shot.action, t);
                m.key = QStringLiteral("action");
                m.scope = name() + QStringLiteral(" · action");
                m.group = QStringLiteral("shot:%1:action").arg(shot.id);
            } else {
                appendParagraph(shot.notes, t);
                m.key = QStringLiteral("notes");
                m.scope = name() + QStringLiteral(" · notes");
                m.group = QStringLiteral("shot:%1:notes").arg(shot.id);
            }
        } else if (holder == Holder::Board) {
            appendParagraph(boardBrief, t);
            m.key = QStringLiteral("brief");
            m.scope = QStringLiteral("Board · brief");
            m.group = QStringLiteral("board:brief");
        } else if (holder == Holder::Act) {
            appendParagraph(acts[holderIndex].objective, t);
            m.key = QStringLiteral("objective");
            m.scope = name() + QStringLiteral(" · objective");
            m.group = QStringLiteral("act:%1:objective").arg(acts.at(holderIndex).id);
        } else {
            m.role = QStringLiteral("stray");
            warn(m, QStringLiteral("text_in_scene"),
                QStringLiteral("A scene has a slugline and lighting only. Put this text under a shot, or label it \"Lighting:\"."));
        }
        afterBlank = false;
    }

    /* — shots — */
    QHash<QString, int> order;
    for (int i = 0; i < shots.size(); ++i) order.insert(shots.at(i).id, i);
    QJsonArray outShots;
    for (int index = 0; index < shots.size(); ++index) {
        const ParsedShot& p = shots.at(index);
        const std::optional<QJsonObject> stored = baseShots.contains(p.id) ? std::optional(baseShots.value(p.id)) : std::nullopt;
        QJsonObject shot;
        if (stored) {
            for (auto it = stored->begin(); it != stored->end(); ++it) {
                if (!kShotTextKeys.contains(it.key())) shot.insert(it.key(), it.value());
            }
        }
        shot.insert("type", "shot");
        shot.insert("id", p.id);
        shot.insert("index", index);
        // "" and [] round-trip through an absent line.
        const auto keep = [&](const QString& key, const std::optional<QJsonValue>& value) {
            if (value && !(value->isString() && value->toString().isEmpty())) shot.insert(key, *value);
            else if (stored && stored->contains(key) && isEmptyValue(stored->value(key))) shot.insert(key, stored->value(key));
        };
        QStringList mentions;
        const auto prose = [&](const std::optional<QString>& raw) -> std::optional<QString> {
            if (!raw) return std::nullopt;
            const auto read = readEntityMentions(*raw, entities);
            for (const auto& id : read.ids) {
                if (!mentions.contains(id)) mentions.append(id);
            }
            return read.text;
        };
        const auto field = [&p](const QString& key) { return p.fields.contains(key) ? std::optional(p.fields.value(key)) : std::nullopt; };
        const auto slug = prose(p.slug);
        keep("slug", slug && !slug->isEmpty() ? std::optional<QJsonValue>(*slug) : std::nullopt);
        shot.insert("action", prose(p.action.join(QStringLiteral("\n\n"))).value_or(QString()));
        for (const auto* key : {"motion", "end_state", "sound", "dialogue", "narration"}) {
            const auto value = prose(field(QString::fromLatin1(key)));
            keep(QString::fromLatin1(key), value ? std::optional<QJsonValue>(*value) : std::nullopt);
        }
        const auto notes = prose(p.notes.isEmpty() ? std::nullopt : std::optional(p.notes.join(QStringLiteral("\n\n"))));
        keep("notes", notes ? std::optional<QJsonValue>(*notes) : std::nullopt);

        const std::optional<QJsonObject> storedCamera =
            stored && stored->value("camera").isObject() ? std::optional(stored->value("camera").toObject()) : std::nullopt;
        QJsonObject camera;
        if (storedCamera) {
            for (auto it = storedCamera->begin(); it != storedCamera->end(); ++it) {
                if (!kCameraTextKeys.contains(it.key())) camera.insert(it.key(), it.value());
            }
        }
        for (const auto& k : kCameraTextKeys) {
            const auto raw = field(QStringLiteral("camera.") + k);
            if (raw && !trim(*raw).isEmpty()) camera.insert(k, k == QLatin1String("preset_ids") ? QJsonValue(toArray(splitIds(*raw))) : QJsonValue(*raw));
            else if (storedCamera && storedCamera->contains(k) && isEmptyValue(storedCamera->value(k))) camera.insert(k, storedCamera->value(k));
        }
        if (!camera.isEmpty() || (stored && stored->contains("camera"))) shot.insert("camera", camera);

        if (const auto duration = field("duration_seconds")) {
            QString normalized = *duration;
            normalized.replace(normalized.indexOf(QLatin1Char(',')), normalized.contains(QLatin1Char(',')) ? 1 : 0, QStringLiteral("."));
            if (const auto seconds = parseFloatPrefix(normalized)) {
                shot.insert("duration_seconds", *seconds);
                const QJsonValue before = stored ? stored->value("duration_seconds") : QJsonValue();
                if (!(before.isDouble() && before.toDouble() == *seconds)) shot.insert("duration_source", "manual");
            } else {
                note(p.line, QStringLiteral("bad_duration"), QStringLiteral("Shot %1: the duration \"%2\" is not a number of seconds.").arg(index + 1).arg(*duration),
                    {{"shot", index + 1}, {"value", *duration}});
            }
        }
        if (const auto render = field("render_mode")) {
            const QString mode = trim(*render).toLower();
            if (mode == QLatin1String("keyframe") || mode == QLatin1String("direct") || mode == QLatin1String("reference")) shot.insert("render_mode", mode);
            else note(p.line, QStringLiteral("bad_render"), QStringLiteral("Shot %1: render is keyframe, direct or reference.").arg(index + 1), {{"shot", index + 1}});
        }
        const auto look = field("look_preset_ids");
        keep("look_preset_ids", look && !trim(*look).isEmpty() ? std::optional<QJsonValue>(toArray(splitIds(*look))) : std::nullopt);

        if (const auto location = field("location_id")) {
            static const QRegularExpression none(QStringLiteral("^none$"), QRegularExpression::CaseInsensitiveOption);
            const auto ids = readEntityMentions(*location, entities).ids;
            if (!ids.isEmpty() && !ids.first().isEmpty()) shot.insert("location_id", ids.first());
            else if (none.match(trim(*location)).hasMatch()) shot.insert("location_id", QJsonValue::Null);
        } else if (stored && stored->contains("location_id") &&
            (stored->value("location_id").isNull() || (stored->value("location_id").isString() && stored->value("location_id").toString().isEmpty()))) {
            shot.insert("location_id", stored->value("location_id"));
        }

        std::optional<QStringList> cast;
        if (const auto castField = field("entity_ids")) {
            static const QRegularExpression none(QStringLiteral("^none$"), QRegularExpression::CaseInsensitiveOption);
            cast = none.match(trim(*castField)).hasMatch() ? QStringList() : readEntityMentions(*castField, entities).ids;
        }
        if (!mentions.isEmpty() || cast) {
            QStringList ids = cast.value_or(QStringList());
            for (const auto& id : mentions) {
                if (!ids.contains(id)) ids.append(id);
            }
            shot.insert("entity_ids", toArray(keepOrder(ids, stored ? stored->value("entity_ids") : QJsonValue())));
        } else if (stored && stored->value("entity_ids").isArray() && stored->value("entity_ids").toArray().isEmpty()) {
            shot.insert("entity_ids", QJsonArray());
        }

        // The selected still and clip. A file not among the takes becomes a take as well.
        const std::tuple<const char*, const char*, const char*, QString> mediaSlots[] = {
            {"keyframe", "keyframe_versions", "image", p.keyframe}, {"clip", "clip_versions", "video", p.clip}};
        for (const auto& [slotKey, versions, type, uri] : mediaSlots) {
            if (!uri.isEmpty()) {
                std::optional<QJsonObject> found;
                const QJsonValue current = stored ? stored->value(QLatin1String(slotKey)) : QJsonValue();
                if (sameRef(current, uri)) found = current.toObject();
                else if (stored) {
                    for (const auto& version : recList(stored->value(QLatin1String(versions)))) {
                        if (sameRef(version, uri)) {
                            found = version;
                            break;
                        }
                    }
                }
                const auto assetId = assetIdOf(uri);
                const QJsonObject ref = found ? *found
                                              : QJsonObject{{"type", QLatin1String(type)}, {"uri", uri},
                                                    {"asset_id", assetId ? QJsonValue(*assetId) : QJsonValue(QJsonValue::Null)}};
                shot.insert(QLatin1String(slotKey), ref);
                if (!found) {
                    QJsonArray list;
                    for (const auto& item : recList(shot.value(QLatin1String(versions)))) list.append(item);
                    list.append(ref);
                    shot.insert(QLatin1String(versions), list);
                }
            } else if (stored && stored->contains(QLatin1String(slotKey))) {
                shot.insert(QLatin1String(slotKey), QJsonValue::Null);
            }
        }
        if (!p.scene.isEmpty()) shot.insert("scene_id", p.scene);
        // What normalizeStoryboardShot gives a new shot.
        if (!shot.value("status").isString()) shot.insert("status", "planned");
        outShots.append(shot);
    }

    /* — transitions and continuities, written on the shot they start from — */
    QJsonArray transitions;
    QJsonArray continuities;
    for (int i = 0; i < shots.size(); ++i) {
        const ParsedShot& p = shots.at(i);
        for (const auto& raw : p.repeated.value("transition")) {
            const auto links = readShotLinks(raw);
            QString to;
            if (!links.isEmpty() && order.contains(links.first().id)) to = links.first().id;
            else if (i + 1 < shots.size()) to = shots.at(i + 1).id;
            if (to.isEmpty()) {
                note(p.line, QStringLiteral("no_next_shot"), QStringLiteral("Shot %1: a transition leads to the next shot, and there is none.").arg(i + 1), {{"shot", i + 1}});
                continue;
            }
            const QString direction = stripShotLinks(raw);
            std::optional<QJsonObject> stored;
            for (const auto& t : baseTransitions) {
                if (t.value("from_shot_id") == QJsonValue(p.id) && t.value("to_shot_id") == QJsonValue(to)) {
                    stored = t;
                    break;
                }
            }
            QJsonObject transition = stored.value_or(QJsonObject());
            transition.insert("from_shot_id", p.id);
            transition.insert("to_shot_id", to);
            if (!direction.isEmpty()) transition.insert("direction", direction);
            else if (!(stored && isEmptyValue(stored->value("direction")))) transition.remove("direction");
            transitions.append(transition);
        }
        for (const auto& raw : p.repeated.value("continuity")) {
            static const QRegularExpression untilLink(ws(QStringLiteral("^\\s*until\\s*\\[")), QRegularExpression::CaseInsensitiveOption);
            static const QRegularExpression lead(ws(QStringLiteral("^\\s*(until|with)\\s+")), QRegularExpression::CaseInsensitiveOption);
            static const QRegularExpression dash(ws(QStringLiteral("^[—–:-]\\s*")));
            const auto anchor = findAnchor(raw);
            const QString body = withoutAnchor(raw, anchor);
            const auto links = readShotLinks(body);
            QStringList ids{p.id};
            const bool until = !links.isEmpty() && untilLink.match(body).hasMatch() && order.contains(links.first().id);
            if (until) {
                ids.clear();
                for (int j = i; j <= order.value(links.first().id) && j < shots.size(); ++j) ids.append(shots.at(j).id);
            } else {
                for (const auto& l : links) {
                    if (order.contains(l.id) && !ids.contains(l.id)) ids.append(l.id);
                }
            }
            QString leadless = body;
            leadless.replace(lead, QString());
            QString direction = stripShotLinks(leadless);
            direction.replace(dash, QString());
            const QString id = anchor ? anchor->id : QStringLiteral("%1-continuity-%2").arg(p.id).arg(continuities.size() + 1);
            const std::optional<QJsonObject> stored = baseContinuities.contains(id) ? std::optional(baseContinuities.value(id)) : std::nullopt;
            QJsonObject continuity = stored.value_or(QJsonObject());
            continuity.insert("id", id);
            continuity.insert("shot_ids", toArray(keepOrder(ids, stored ? stored->value("shot_ids") : QJsonValue())));
            continuity.insert("direction", direction);
            continuities.append(continuity);
        }
    }

    /* — the document — */
    const auto read = [&](const QString& key) -> std::optional<QString> {
        if (!boardFields.contains(key)) return std::nullopt;
        return readEntityMentions(boardFields.value(key), entities).text;
    };
    QJsonObject doc = base ? *base
                           : QJsonObject{{"setupStage", "done"}, {"directorModel", QJsonValue::Null}, {"imageModel", QJsonValue::Null},
                                 {"videoModel", QJsonValue::Null}};
    doc.insert("brief", boardBrief.join(QStringLiteral("\n\n")));
    doc.insert("style", read("style").value_or(QString()));
    const QString aspect = trim(read("aspectRatio").value_or(QString()));
    const QString baseAspect = base ? strOr(base->value("aspectRatio")) : QString();
    doc.insert("aspectRatio", !aspect.isEmpty() ? aspect : !baseAspect.isEmpty() ? baseAspect : QStringLiteral("16:9"));
    // Keys the schema defaults are left out when the stored board left them out.
    const auto genre = read("genre");
    const QString genreText = genre ? trim(*genre) : QString();
    if (!genreText.isEmpty() || !base || base->contains("genre")) doc.insert("genre", genreText);
    if (boardFields.contains("entityIds")) {
        doc.insert("entityIds", toArray(keepOrder(readEntityMentions(boardFields.value("entityIds"), entities).ids, base ? base->value("entityIds") : QJsonValue())));
    } else if (!base || base->contains("entityIds")) {
        doc.insert("entityIds", QJsonArray());
    }
    const QStringList look = boardFields.contains("look_preset_ids") ? splitIds(boardFields.value("look_preset_ids")) : QStringList();
    if (!look.isEmpty()) doc.insert("look_preset_ids", toArray(look));
    else if (base && base->contains("look_preset_ids") && isEmptyValue(base->value("look_preset_ids"))) doc.insert("look_preset_ids", base->value("look_preset_ids"));
    else doc.remove("look_preset_ids");
    doc.insert("shots", outShots);

    const auto truthy = [&](const char* key) { return !boardFields.value(QLatin1String(key)).isEmpty(); };
    const bool wantsScreenplay = baseScreenplay || boardTitle || !acts.isEmpty() || !scenes.isEmpty() || truthy("logline") || truthy("music_prompt") ||
        truthy("narration") || truthy("motion_direction");
    if (!wantsScreenplay) {
        doc.insert("screenplay", QJsonValue::Null);
    } else {
        QJsonObject sp = baseScreenplay.value_or(QJsonObject());
        sp.insert("type", "screenplay");
        const auto baseId = baseScreenplay ? str(baseScreenplay->value("id")) : std::nullopt;
        sp.insert("id", boardTitleId ? *boardTitleId : baseId ? *baseId : newId());
        sp.insert("title", boardTitle.value_or(QString()));
        const auto optional = [&](const QString& key, const std::optional<QString>& value) {
            if (value && !value->isEmpty()) sp.insert(key, *value);
            else if (baseScreenplay && baseScreenplay->contains(key) && isEmptyValue(baseScreenplay->value(key))) sp.insert(key, baseScreenplay->value(key));
            else sp.remove(key);
        };
        optional("logline", read("logline"));
        optional("music_prompt", read("music_prompt"));
        optional("narration", read("narration"));
        // The screenplay keeps copies of board values. A copy that matched the board keeps matching it.
        const std::pair<const char*, const char*> mirrors[] = {
            {"brief", "brief"}, {"style_bible", "style"}, {"aspect_ratio", "aspectRatio"}, {"genre", "genre"}, {"entity_ids", "entityIds"}};
        for (const auto& [spKey, docKey] : mirrors) {
            if (base && baseScreenplay && baseScreenplay->contains(QLatin1String(spKey)) &&
                baseScreenplay->value(QLatin1String(spKey)) == base->value(QLatin1String(docKey))) {
                sp.insert(QLatin1String(spKey), doc.value(QLatin1String(docKey)));
            }
        }
        if (!acts.isEmpty() || (baseScreenplay && baseScreenplay->contains("acts"))) {
            QStringList ids;
            for (const auto& a : acts) ids.append(a.id);
            const QStringList orderIds = sameSet(baseActOrder, ids) ? baseActOrder : ids;
            QJsonArray list;
            for (const auto& id : orderIds) {
                const auto a = std::find_if(acts.begin(), acts.end(), [&id](const ParsedAct& x) { return x.id == id; });
                const std::optional<QJsonObject> stored = baseActs.contains(id) ? std::optional(baseActs.value(id)) : std::nullopt;
                QJsonObject out = stored.value_or(QJsonObject());
                out.insert("type", "act");
                out.insert("id", a->id);
                out.insert("title", a->title);
                const QString objective = readEntityMentions(a->objective.join(QStringLiteral("\n\n")), entities).text;
                if (!objective.isEmpty()) out.insert("objective", objective);
                else if (!(stored && isEmptyValue(stored->value("objective")))) out.remove("objective");
                list.append(out);
            }
            sp.insert("acts", list);
        }
        if (!scenes.isEmpty() || (baseScreenplay && baseScreenplay->contains("scenes"))) {
            QStringList ids;
            for (const auto& s : scenes) ids.append(s.id);
            const QStringList orderIds = sameSet(baseSceneOrder, ids) ? baseSceneOrder : ids;
            QJsonArray list;
            for (const auto& id : orderIds) {
                const auto s = std::find_if(scenes.begin(), scenes.end(), [&id](const ParsedScene& x) { return x.id == id; });
                const std::optional<QJsonObject> stored = baseScenes.contains(id) ? std::optional(baseScenes.value(id)) : std::nullopt;
                QJsonObject out = stored.value_or(QJsonObject());
                out.insert("type", "scene");
                out.insert("id", s->id);
                out.insert("slugline", s->slugline);
                const QString lighting = s->lighting ? readEntityMentions(*s->lighting, entities).text : QString();
                if (!lighting.isEmpty()) out.insert("lighting", lighting);
                else if (!(stored && isEmptyValue(stored->value("lighting")))) out.remove("lighting");
                if (!s->act.isEmpty()) out.insert("act_id", s->act);
                else out.remove("act_id");
                list.append(out);
            }
            sp.insert("scenes", list);
        }
        QJsonObject motion = baseMotion.value_or(QJsonObject());
        const auto direction = read("motion_direction");
        if (direction && !direction->isEmpty()) motion.insert("direction", *direction);
        else if (!(baseMotion && isEmptyValue(baseMotion->value("direction")))) motion.remove("direction");
        if (!transitions.isEmpty() || (baseMotion && baseMotion->contains("transitions"))) motion.insert("transitions", transitions);
        else motion.remove("transitions");
        if (!continuities.isEmpty() || (baseMotion && baseMotion->contains("continuities"))) motion.insert("continuities", continuities);
        else motion.remove("continuities");
        if (!motion.isEmpty() || (baseScreenplay && baseScreenplay->contains("motion_design"))) sp.insert("motion_design", motion);
        else sp.remove("motion_design");
        sp.insert("shots", outShots);
        doc.insert("screenplay", sp);
    }

    for (auto& m : result.lines) {
        if (m.role != QLatin1String("shot") || !m.shotNumber) continue;
        const QJsonObject shot = outShots.at(*m.shotNumber - 1).toObject();
        m.status = strOr(shot.value("status"));
        if (trim(strOr(shot.value("action"))).isEmpty()) {
            warn(m, QStringLiteral("missing_action"),
                QStringLiteral("Shot %1 has no action yet. Write the visual to render under its heading.").arg(*m.shotNumber), {{"shot", *m.shotNumber}});
        }
    }
    result.document = doc;
    for (const auto& shot : shots) result.shotOrder.append(shot.id);
    return result;
}

QString storyboardToMarkdown(const QJsonObject& doc, const MarkdownEntities& entities) {
    const std::optional<QJsonObject> sp = doc.value("screenplay").isObject() ? std::optional(doc.value("screenplay").toObject()) : std::nullopt;
    const QVector<QJsonObject> shots = !recList(doc.value("shots")).isEmpty() ? recList(doc.value("shots")) : recList(sp ? sp->value("shots") : QJsonValue());
    QStringList L;
    const auto writeField = [&L](const QString& label, const QJsonValue& value) {
        const QString text = value.isString() ? trim(value.toString()) : QString();
        if (text.isEmpty()) return;
        const QStringList lines = text.split(QLatin1Char('\n'));
        for (qsizetype i = 0; i < lines.size(); ++i) L.append(i ? lines.at(i) : QStringLiteral("- **%1:** %2").arg(label, lines.at(i)));
    };
    const auto mention = [&entities](const QString& id) {
        const QString name = entities.contains(id) ? entities.value(id).name : QString();
        return QStringLiteral("[%1](entity://%2)").arg(name.isEmpty() ? id : name, id);
    };
    const auto heading = [](const QString& marks, const QJsonValue& title, const QString& id) {
        const QString text = strOr(title);
        return marks + QStringLiteral(" ") + (text.isEmpty() ? QString() : text + QStringLiteral(" ")) + QStringLiteral("{#") + id + QStringLiteral("}");
    };
    const auto mentions = [&mention](const QStringList& ids) {
        QStringList out;
        for (const auto& id : ids) out.append(mention(id));
        return out.join(QStringLiteral(", "));
    };

    if (sp) L.append(heading(QStringLiteral("#"), sp->value("title"), strOr(sp->value("id"))));
    const QString brief = trim(strOr(doc.value("brief")));
    if (!brief.isEmpty()) {
        if (!L.isEmpty()) L.append(QString());
        L.append(paragraphs(brief));
    }
    QVector<std::pair<QString, QString>> meta;
    const auto metaLine = [&meta](const QString& label, const QJsonValue& value) {
        const QString v = value.isString() ? trim(value.toString()) : QString();
        if (!v.isEmpty()) meta.append({label, v});
    };
    const QJsonValue none;
    metaLine(QStringLiteral("Logline"), sp ? sp->value("logline") : none);
    metaLine(QStringLiteral("Style"), doc.value("style"));
    metaLine(QStringLiteral("Aspect ratio"), doc.value("aspectRatio"));
    metaLine(QStringLiteral("Genre"), doc.value("genre"));
    metaLine(QStringLiteral("Cast"), mentions(strList(doc.value("entityIds"))));
    metaLine(QStringLiteral("Look"), strList(doc.value("look_preset_ids")).join(QStringLiteral(", ")));
    metaLine(QStringLiteral("Music"), sp ? sp->value("music_prompt") : none);
    metaLine(QStringLiteral("Narration"), sp ? sp->value("narration") : none);
    const std::optional<QJsonObject> motion = sp && sp->value("motion_design").isObject() ? std::optional(sp->value("motion_design").toObject()) : std::nullopt;
    metaLine(QStringLiteral("Motion design"), motion ? motion->value("direction") : none);
    if (!meta.isEmpty()) {
        if (!L.isEmpty()) L.append(QString());
        for (const auto& [label, value] : meta) writeField(label, value);
    }

    QHash<QString, QJsonObject> acts;
    QStringList actOrder;
    for (const auto& a : recList(sp ? sp->value("acts") : none)) {
        const QString id = strOr(a.value("id"));
        if (!acts.contains(id)) actOrder.append(id);
        acts.insert(id, a);
    }
    QHash<QString, QJsonObject> scenes;
    QStringList sceneOrder;
    for (const auto& s : recList(sp ? sp->value("scenes") : none)) {
        const QString id = strOr(s.value("id"));
        if (!scenes.contains(id)) sceneOrder.append(id);
        scenes.insert(id, s);
    }
    QHash<QString, int> number;
    for (int i = 0; i < shots.size(); ++i) number.insert(strOr(shots.at(i).value("id")), i + 1);
    const auto link = [&number](const QString& id) { return QStringLiteral("[Shot %1](#%2)").arg(number.value(id)).arg(id); };
    const QVector<QJsonObject> transitions = motion ? recList(motion->value("transitions")) : QVector<QJsonObject>();
    const QVector<QJsonObject> continuities = motion ? recList(motion->value("continuities")) : QVector<QJsonObject>();
    const auto firstShotOf = [&number](const QJsonObject& c) {
        QStringList ids = strList(c.value("shot_ids"));
        std::stable_sort(ids.begin(), ids.end(), [&number](const QString& a, const QString& b) {
            return number.value(a, 1000000000) < number.value(b, 1000000000);
        });
        return ids.isEmpty() ? std::optional<QString>() : std::optional(ids.first());
    };
    QSet<QString> writtenActs;
    QSet<QString> writtenScenes;
    const auto writeAct = [&](const QJsonObject& a) {
        L.append(QString());
        L.append(heading(QStringLiteral("#"), a.value("title"), strOr(a.value("id"))));
        const QString objective = trim(strOr(a.value("objective")));
        if (!objective.isEmpty()) L.append(paragraphs(objective));
        writtenActs.insert(strOr(a.value("id")));
    };
    const auto writeScene = [&](const QJsonObject& s) {
        L.append(QString());
        L.append(heading(QStringLiteral("##"), s.value("slugline"), strOr(s.value("id"))));
        writeField(QStringLiteral("Lighting"), s.value("lighting"));
        writtenScenes.insert(strOr(s.value("id")));
    };

    std::optional<QString> previousScene;
    std::optional<QString> previousAct;
    for (int i = 0; i < shots.size(); ++i) {
        const QJsonObject& s = shots.at(i);
        const QString id = strOr(s.value("id"));
        const auto sceneId = str(s.value("scene_id"));
        if (sceneId && !sceneId->isEmpty() && scenes.contains(*sceneId) && sceneId != previousScene) {
            const QJsonObject sc = scenes.value(*sceneId);
            const auto actId = str(sc.value("act_id"));
            const bool hasAct = actId && !actId->isEmpty() && acts.contains(*actId);
            if (hasAct && actId != previousAct && !writtenActs.contains(*actId)) writeAct(acts.value(*actId));
            if (hasAct) previousAct = actId;
            writeScene(sc);
            previousScene = sceneId;
        }
        L.append(QString());
        L.append(heading(QStringLiteral("###"), s.value("slug"), id));
        const QString still = refUri(s.value("keyframe"));
        const QString clip = refUri(s.value("clip"));
        if (!still.isEmpty()) L.append(QStringLiteral("![Still](%1)").arg(still));
        if (!clip.isEmpty()) L.append(QStringLiteral("![Clip](%1)").arg(clip));
        const QStringList ids = strList(s.value("entity_ids"));
        QSet<QString> linked;
        const auto prose = [&](const QJsonValue& v) -> QJsonValue {
            if (!v.isString() || v.toString().isEmpty()) return {};
            return linkNames(v.toString(), ids, entities, linked);
        };
        const QString actionText = trim(strOr(s.value("action")));
        const QString action = actionText.isEmpty() ? QString() : linkNames(actionText, ids, entities, linked);
        if (!still.isEmpty() || !clip.isEmpty()) L.append(QString());
        if (!action.isEmpty()) L.append(paragraphs(action));
        QVector<std::pair<QString, QString>> fields;
        const auto add = [&fields](const QString& label, const QJsonValue& value) {
            if (value.isString() && !trim(value.toString()).isEmpty()) fields.append({label, value.toString()});
        };
        const QJsonObject camera = s.value("camera").toObject();
        add(QStringLiteral("Framing"), camera.value("framing"));
        add(QStringLiteral("Lens"), camera.value("lens"));
        add(QStringLiteral("Angle"), camera.value("angle"));
        add(QStringLiteral("Camera movement"), camera.value("movement"));
        add(QStringLiteral("Rig"), camera.value("equipment"));
        add(QStringLiteral("Camera presets"), strList(camera.value("preset_ids")).join(QStringLiteral(", ")));
        add(QStringLiteral("Motion"), prose(s.value("motion")));
        add(QStringLiteral("End"), prose(s.value("end_state")));
        add(QStringLiteral("Sound"), prose(s.value("sound")));
        add(QStringLiteral("Dialogue"), prose(s.value("dialogue")));
        add(QStringLiteral("Narration"), prose(s.value("narration")));
        if (s.value("duration_seconds").isDouble()) add(QStringLiteral("Duration"), jsNumber(s.value("duration_seconds").toDouble()) + QStringLiteral("s"));
        add(QStringLiteral("Render"), s.value("render_mode"));
        const QString location = strOr(s.value("location_id"));
        if (!location.isEmpty()) add(QStringLiteral("Location"), mention(location));
        QStringList rest;
        for (const auto& e : ids) {
            if (!linked.contains(e)) rest.append(e);
        }
        add(QStringLiteral("Cast"), mentions(rest));
        add(QStringLiteral("Look"), strList(s.value("look_preset_ids")).join(QStringLiteral(", ")));
        for (const auto& t : transitions) {
            const QString to = strOr(t.value("to_shot_id"));
            if (t.value("from_shot_id") != QJsonValue(id) || !number.contains(to)) continue;
            const bool next = i + 1 < shots.size() && strOr(shots.at(i + 1).value("id")) == to && shots.at(i + 1).value("id").isString();
            fields.append({QStringLiteral("Transition"), trim((next ? QString() : link(to) + QStringLiteral(" ")) + strOr(t.value("direction")))});
        }
        for (const auto& c : continuities) {
            if (firstShotOf(c) != id) continue;
            QStringList others;
            for (const auto& x : strList(c.value("shot_ids"))) {
                if (x != id && number.contains(x)) others.append(x);
            }
            std::stable_sort(others.begin(), others.end(), [&number](const QString& a, const QString& b) { return number.value(a) < number.value(b); });
            bool contiguous = !others.isEmpty();
            for (int j = 0; j < others.size() && contiguous; ++j) contiguous = number.value(others.at(j)) == i + 2 + j;
            QString span;
            if (others.isEmpty()) span = QString();
            else if (contiguous) span = QStringLiteral("until ") + link(others.last()) + QStringLiteral(" — ");
            else {
                QStringList linksText;
                for (const auto& x : others) linksText.append(link(x));
                span = QStringLiteral("with ") + linksText.join(QStringLiteral(" ")) + QStringLiteral(" — ");
            }
            fields.append({QStringLiteral("Continuity"), span + strOr(c.value("direction")) + QStringLiteral(" {#") + strOr(c.value("id")) + QStringLiteral("}")});
        }
        add(QStringLiteral("Notes"), prose(s.value("notes")));
        if (!fields.isEmpty()) {
            L.append(QString());
            for (const auto& [label, value] : fields) {
                if (trim(value).isEmpty()) L.append(QStringLiteral("- **%1:**").arg(label));
                else writeField(label, value);
            }
        }
    }
    // Acts and scenes no shot is in yet are kept at the end, so they survive a round trip.
    for (const auto& sceneId : sceneOrder) {
        if (writtenScenes.contains(sceneId)) continue;
        const QJsonObject sc = scenes.value(sceneId);
        const QString actId = strOr(sc.value("act_id"));
        if (!actId.isEmpty() && acts.contains(actId) && !writtenActs.contains(actId)) writeAct(acts.value(actId));
        writeScene(sc);
    }
    for (const auto& actId : actOrder) {
        if (!writtenActs.contains(actId)) writeAct(acts.value(actId));
    }
    return L.join(QLatin1Char('\n')) + QStringLiteral("\n");
}

QJsonObject lineToJson(const MarkdownLine& line) {
    QJsonObject out{{"line", line.line}, {"role", line.role}, {"bodyStart", line.bodyStart}};
    if (line.bodyEnd) out.insert("bodyEnd", *line.bodyEnd);
    if (line.syntaxWidth) out.insert("syntaxWidth", *line.syntaxWidth);
    if (!line.key.isEmpty()) out.insert("key", line.key);
    if (!line.group.isEmpty()) out.insert("group", line.group);
    if (!line.scope.isEmpty()) out.insert("scope", line.scope);
    if (line.shotNumber) out.insert("shotNumber", *line.shotNumber);
    if (!line.shotId.isEmpty()) out.insert("shotId", line.shotId);
    if (!line.status.isEmpty()) out.insert("status", line.status);
    if (!line.media.isEmpty()) out.insert("media", line.media);
    if (line.warning) {
        out.insert("warning", QJsonObject{{"line", line.warning->line}, {"code", line.warning->code}, {"params", line.warning->params}, {"message", line.warning->message}});
    }
    return out;
}

QJsonObject tokenToJson(const MarkdownToken& token) {
    QJsonObject out{{"kind", token.kind}, {"text", token.text}};
    if (!token.entityKind.isEmpty()) out.insert("entityKind", token.entityKind);
    return out;
}

QJsonObject parseToJson(const MarkdownParse& parse) {
    QJsonArray lines;
    for (const auto& line : parse.lines) lines.append(lineToJson(line));
    QJsonArray warnings;
    for (const auto& w : parse.warnings) warnings.append(QJsonObject{{"line", w.line}, {"code", w.code}, {"params", w.params}, {"message", w.message}});
    QJsonArray missing;
    for (const auto& m : parse.missingIds) {
        missing.append(QJsonObject{{"line", m.line}, {"id", m.id},
            {"replace", m.replace ? QJsonValue(QJsonObject{{"start", m.replace->start}, {"text", m.replace->text}}) : QJsonValue(QJsonValue::Null)}});
    }
    return {{"document", parse.document}, {"lines", lines}, {"warnings", warnings}, {"missingIds", missing}, {"shotOrder", QJsonArray::fromStringList(parse.shotOrder)}};
}

}  // namespace nt::storyboard
