#pragma once

// The editor's marker state that is not in the document: which markers are
// selected, and the requests that open the Edit Marker dialog and the CSV export,
// which live in an overlay panel. The ruler, the Markers panel, the menus and the
// key actions all reach it through the QML singleton. It changes no model.

#include <QObject>
#include <QStringList>
#include <QUrl>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class MarkerSession : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QStringList selectedIds READ selectedIds NOTIFY selectionChanged)
public:
    explicit MarkerSession(QObject* parent = nullptr) : QObject(parent) {}
    QStringList selectedIds() const { return m_selected; }

    Q_INVOKABLE bool isSelected(const QString& id) const { return m_selected.contains(id); }
    // Selects `id` alone, or with `additive` toggles it in the current selection.
    Q_INVOKABLE void select(const QString& id, bool additive = false);
    Q_INVOKABLE void selectMany(const QStringList& ids);
    Q_INVOKABLE void clearSelection();
    // The selected ids that are in `markers`, so a deleted marker never lingers.
    Q_INVOKABLE QStringList selectedIn(const QVariantList& markers) const;

    Q_INVOKABLE void requestEdit(const QString& id) { emit editRequested(id); }
    Q_INVOKABLE void requestExport() { emit exportRequested(); }

    // The palette: {id, name, css}.
    Q_INVOKABLE QVariantList colors() const;
    // The markers that pass the search text and colour filter, in time order.
    Q_INVOKABLE QVariantList rows(const QVariantList& markers, const QString& query, const QString& color) const;
    Q_INVOKABLE QString timecode(double ms, double fps) const;
    Q_INVOKABLE QString csv(const QVariantList& markers, double fps) const;
    // Writes the CSV atomically. Returns an empty string, or what went wrong.
    Q_INVOKABLE QString saveCsv(const QVariantList& markers, double fps, const QUrl& file) const;

signals:
    void selectionChanged();
    void editRequested(const QString& id);
    void exportRequested();

private:
    QStringList m_selected;
};
