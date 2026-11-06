#include "markers/MarkerOps.h"
#include "ui/TimelineFormat.h"
#include <QUuid>
#include <algorithm>
#include <cmath>

namespace nt::markers {
namespace {
double wholeMs(double ms) { return std::isfinite(ms) ? std::max(0.0, std::round(ms)) : 0.0; }
// Spreadsheets run text that starts with one of these as a formula.
bool looksLikeFormula(const QString& text) {
    const auto start = text.trimmed();
    return !start.isEmpty() && QStringLiteral("=+-@").contains(start.front());
}
QString field(const QString& text, bool guard) {
    QString out = QStringLiteral("\"");
    if (guard && looksLikeFormula(text)) { out += QLatin1Char('\''); }
    out += QString(text).replace(QLatin1Char('"'), QStringLiteral("\"\""));
    return out + QLatin1Char('"');
}
bool sameText(const QString& a, const QString& b) { return a.compare(b, Qt::CaseInsensitive) == 0; }
}  // namespace

const std::vector<ColorChoice>& colors() {
    static const std::vector<ColorChoice> list{
        {"green", "Green", "#34A853"},   {"red", "Red", "#E5484D"},       {"purple", "Purple", "#8E4EC6"},
        {"orange", "Orange", "#F76B15"}, {"yellow", "Yellow", "#FFC53D"}, {"white", "White", "#EDEDED"},
        {"blue", "Blue", "#3E63DD"},     {"cyan", "Cyan", "#00A2C7"}};
    return list;
}

const ColorChoice* colorFor(const QString& css) {
    for (const auto& c : colors()) {
        if (sameText(c.css, css)) { return &c; }
    }
    return nullptr;
}

QString colorName(const QString& css) {
    const auto* choice = colorFor(css);
    return choice ? choice->name : css;
}

QString newId() { return QUuid::createUuid().toString(QUuid::Id128); }

QJsonObject makeMarker(const QJsonObject& fields) {
    QJsonObject m;
    const auto given = fields.value("id").toString();
    m.insert("id", given.isEmpty() ? newId() : given);
    m.insert("timeMs", wholeMs(fields.value("timeMs").toDouble()));
    m.insert("label", fields.value("label").toString());
    for (const char* key : {"note", "color", "author"}) {
        const auto text = fields.value(key).toString();
        if (!text.isEmpty()) { m.insert(key, text); }
    }
    if (const double duration = wholeMs(fields.value("durationMs").toDouble()); duration > 0) { m.insert("durationMs", duration); }
    return m;
}

QJsonArray add(QJsonArray markers, const QJsonObject& fields) {
    markers.append(makeMarker(fields));
    return markers;
}

QJsonArray update(QJsonArray markers, const QStringList& ids, const QJsonObject& patch) {
    if (ids.isEmpty()) { return markers; }
    const bool moves = patch.contains("timeMs") || patch.contains("durationMs");
    if (moves && ids.size() > 1) { return markers; }
    QStringList missing = ids;
    for (const auto& m : markers) { missing.removeAll(m.toObject().value("id").toString()); }
    if (!missing.isEmpty()) { return markers; }
    QJsonArray after;
    for (const auto& value : std::as_const(markers)) {
        auto m = value.toObject();
        if (ids.contains(m.value("id").toString())) {
            if (patch.contains("label")) { m.insert("label", patch.value("label").toString()); }
            for (const char* key : {"note", "color", "author"}) {
                if (!patch.contains(key)) { continue; }
                const auto text = patch.value(key).toString();
                if (text.isEmpty()) { m.remove(key); }
                else { m.insert(key, text); }
            }
            if (patch.contains("timeMs")) { m.insert("timeMs", wholeMs(patch.value("timeMs").toDouble())); }
            if (patch.contains("durationMs")) {
                if (const double duration = wholeMs(patch.value("durationMs").toDouble()); duration > 0) { m.insert("durationMs", duration); }
                else { m.remove("durationMs"); }
            }
        }
        after.append(m);
    }
    return after;
}

QJsonArray remove(QJsonArray markers, const QStringList& ids) {
    QJsonArray after;
    for (const auto& m : std::as_const(markers)) {
        if (!ids.contains(m.toObject().value("id").toString())) { after.append(m); }
    }
    return after.size() == markers.size() ? markers : after;
}

std::vector<QJsonObject> sorted(const QJsonArray& markers) {
    std::vector<QJsonObject> list;
    list.reserve(size_t(markers.size()));
    for (const auto& m : markers) { list.push_back(m.toObject()); }
    std::stable_sort(list.begin(), list.end(), [](const QJsonObject& a, const QJsonObject& b) {
        const double ta = a.value("timeMs").toDouble();
        const double tb = b.value("timeMs").toDouble();
        return ta != tb ? ta < tb : a.value("id").toString() < b.value("id").toString();
    });
    return list;
}

bool matches(const QJsonObject& marker, const QString& query, const QString& color) {
    if (!color.isEmpty()) {
        const auto css = marker.value("color").toString();
        const auto* choice = colorFor(css);
        const bool ok = color == QStringLiteral("none") ? css.isEmpty() : choice && choice->id == color;
        if (!ok) { return false; }
    }
    if (query.isEmpty()) { return true; }
    for (const char* key : {"label", "note", "author"}) {
        if (marker.value(key).toString().contains(query, Qt::CaseInsensitive)) { return true; }
    }
    return false;
}

QString timecode(double ms, double fps) { return nt::ui::formatPlayheadTimecode(ms, fps); }

QString toCsv(const QJsonArray& markers, double fps) {
    QString csv = QStringLiteral("\"Time\",\"Duration\",\"Name\",\"Notes\",\"Author\",\"Colour\"\r\n");
    for (const auto& m : sorted(markers)) {
        const QStringList cells{field(timecode(m.value("timeMs").toDouble(), fps), false),
                                field(timecode(m.value("durationMs").toDouble(), fps), false),
                                field(m.value("label").toString(), true), field(m.value("note").toString(), true),
                                field(m.value("author").toString(), true),
                                field(colorName(m.value("color").toString()), true)};
        csv += cells.join(QLatin1Char(',')) + QStringLiteral("\r\n");
    }
    return csv;
}

}  // namespace nt::markers
