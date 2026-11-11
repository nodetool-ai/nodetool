#include "markers/MarkerSession.h"
#include "markers/MarkerOps.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QSaveFile>

namespace {
QJsonArray toArray(const QVariantList& markers) {
    QJsonArray array;
    for (const auto& value : markers) { array.append(QJsonObject::fromVariantMap(value.toMap())); }
    return array;
}
}  // namespace

void MarkerSession::select(const QString& id, bool additive) {
    QStringList next;
    if (additive) {
        next = m_selected;
        if (!next.removeOne(id)) { next.append(id); }
    } else if (!id.isEmpty()) {
        next = {id};
    }
    selectMany(next);
}

void MarkerSession::selectMany(const QStringList& ids) {
    QStringList next;
    for (const auto& id : ids) {
        if (!id.isEmpty() && !next.contains(id)) { next.append(id); }
    }
    if (next == m_selected) { return; }
    m_selected = next;
    emit selectionChanged();
}

void MarkerSession::clearSelection() { selectMany({}); }

QStringList MarkerSession::selectedIn(const QVariantList& markers) const {
    QStringList present;
    for (const auto& value : markers) {
        const auto id = value.toMap().value("id").toString();
        if (m_selected.contains(id)) { present.append(id); }
    }
    return present;
}

QVariantList MarkerSession::colors() const {
    QVariantList list;
    for (const auto& c : nt::markers::colors()) { list.append(QVariantMap{{"id", c.id}, {"name", c.name}, {"css", c.css}}); }
    return list;
}

QVariantList MarkerSession::rows(const QVariantList& markers, const QString& query, const QString& color) const {
    QVariantList list;
    for (const auto& m : nt::markers::sorted(toArray(markers))) {
        if (nt::markers::matches(m, query.trimmed(), color)) { list.append(m.toVariantMap()); }
    }
    return list;
}

QString MarkerSession::timecode(double ms, double fps) const { return nt::markers::timecode(ms, fps); }

QString MarkerSession::csv(const QVariantList& markers, double fps) const { return nt::markers::toCsv(toArray(markers), fps); }

QString MarkerSession::saveCsv(const QVariantList& markers, double fps, const QUrl& file) const {
    const auto path = file.toLocalFile();
    if (path.isEmpty()) { return QStringLiteral("Choose a file on this computer."); }
    QSaveFile out(path);
    if (!out.open(QIODevice::WriteOnly)) { return out.errorString(); }
    out.write(csv(markers, fps).toUtf8());
    return out.commit() ? QString() : out.errorString();
}
