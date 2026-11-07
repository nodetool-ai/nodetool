#pragma once

// Marker edits as pure functions on the document's `markers` array, and the CSV
// report. A marker is {id, timeMs, label, color?, note?, durationMs?, author?}.
// The atomic single and bulk edit, the red-line validation and the spreadsheet
// safe CSV follow FilmCraft's marker_edit.rs and marker_export.rs
// (see licenses/FilmCraft-MIT.txt). Every function returns the array it was
// given when it changes nothing, so a caller can tell a refused edit.

#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <QStringList>
#include <vector>

namespace nt::markers {

struct ColorChoice {
    QString id;    // "green"
    QString name;  // "Green", for menus and the CSV
    QString css;   // "#34A853", what the document stores
};
// The eight marker colours. A marker with no colour uses the ruler accent.
const std::vector<ColorChoice>& colors();
// The palette entry whose css matches, case-insensitively, or nullptr.
const ColorChoice* colorFor(const QString& css);
// "Green" for a palette colour, the stored text for any other, "" for none.
QString colorName(const QString& css);

QString newId();

// A new marker object from `fields` ({id?, timeMs, label?, color?, note?,
// durationMs?, author?}). Time and duration are rounded to whole ms and never
// negative. Empty optional fields and a zero duration are left out.
QJsonObject makeMarker(const QJsonObject& fields);
QJsonArray add(QJsonArray markers, const QJsonObject& fields);

// Sets the keys of `patch` on every marker in `ids`: label, note, color, author,
// timeMs and durationMs. An empty note, colour or author, or a zero duration,
// removes the field. A new time or duration needs a single marker. Every id
// must exist, or nothing changes.
QJsonArray update(QJsonArray markers, const QStringList& ids, const QJsonObject& patch);
// Removes the markers in `ids`. Unknown ids are ignored.
QJsonArray remove(QJsonArray markers, const QStringList& ids);

// Markers in time order (then id), the order the panel and the CSV list them.
std::vector<QJsonObject> sorted(const QJsonArray& markers);
// True when `query` is in the label, note or author (case-insensitive) and
// `color` is empty or the marker's colour. `color` is a palette id or "none".
bool matches(const QJsonObject& marker, const QString& query, const QString& color);

// HH:MM:SS:FF at the timeline's frame rate.
QString timecode(double ms, double fps);
// The review notes as a CSV: Time, Duration, Name, Notes, Author, Colour. Every
// field is quoted with doubled quotes and rows end in CRLF, so commas, quotes and
// newlines in a note survive. Text that starts like a formula gets a leading
// apostrophe so a spreadsheet shows it as text.
QString toCsv(const QJsonArray& markers, double fps);

}  // namespace nt::markers
