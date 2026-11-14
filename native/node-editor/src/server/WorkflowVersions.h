#pragma once
#include "WorkflowSession.h"
#include "../document/WorkflowDocument.h"
#include <QDateTime>
#include <QTimer>
#include <functional>
namespace nodetool::node_editor {
class WorkflowVersions final : public QObject {
 Q_OBJECT
 Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
 Q_PROPERTY(QString preview READ preview NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
 Q_PROPERTY(bool busy READ busy NOTIFY changed)
 Q_PROPERTY(bool available READ available NOTIFY changed)
 Q_PROPERTY(QVariantMap metadata READ metadata NOTIFY changed)
 Q_PROPERTY(QVariantMap selectedGraph READ selectedGraph NOTIFY changed)
 Q_PROPERTY(QVariantMap comparison READ comparison NOTIFY changed)
 Q_PROPERTY(int selectedIndex MEMBER m_selectedIndex NOTIFY changed)
 Q_PROPERTY(int compareIndex MEMBER m_compareIndex NOTIFY changed)
 // Milliseconds since the epoch at the last clock tick. Bindings that format
 // relative times read it so they refresh as rows age.
 Q_PROPERTY(qint64 clock READ clock NOTIFY clockChanged)
 // The text most recently copied to the clipboard, until the confirmation expires.
 Q_PROPERTY(QString copied READ copied NOTIFY copiedChanged)
 // The narrowest width at which the history panel keeps every label on one line. The panel
 // reports it, and the dock that hosts the panel follows it when the UI scale changes.
 Q_PROPERTY(qreal panelMinimumWidth READ panelMinimumWidth WRITE setPanelMinimumWidth NOTIFY panelMinimumWidthChanged)
public:
    // Matches relativeTime in web/src/utils/formatDateAndTime.ts.
    static QString relativeTime(const QDateTime &past, const QDateTime &now);
    // Matches formatDateTime in web/src/utils/formatUtils.ts.
    static QString absoluteTime(const QDateTime &time);
    // Matches getSaveType in web/src/components/version/VersionHistoryPanel.tsx.
    static QString saveType(const QVariantMap &row);
    qreal panelMinimumWidth() const { return m_panelMinimumWidth; }
    void setPanelMinimumWidth(qreal width)
    {
        if (!qFuzzyCompare(m_panelMinimumWidth + 1, width + 1)) {
            m_panelMinimumWidth = width;
            emit panelMinimumWidthChanged(width);
        }
    }
    qint64 clock() const { return m_clock; }
    QString copied() const { return m_copied; }
    Q_INVOKABLE QString relativeLabel(const QString &iso, qint64 clock) const;
    Q_INVOKABLE QString absoluteLabel(const QString &iso) const;
    Q_INVOKABLE void copyText(const QString &text);
    // Saves local edits, then asks the server to snapshot its row as a named version.
    Q_INVOKABLE void createVersion(const QString &name);
    // Tests supply the current time and a fixed tick interval. Zero restores adaptive ticks.
    void setClockSource(std::function<QDateTime()> source);
    void setClockInterval(int milliseconds);
 // Sections and their items follow the order of computeGraphDiff in web/src/utils/graphDiff.ts:
 // items in graph order, and the keys of a changed item sorted by name, because QJsonObject
 // does not keep member order.
 static QVariantMap graphDiff(const QJsonObject &oldGraph, const QJsonObject &newGraph);
 QVariantMap selectedGraph() const { return m_selected["graph"].toObject().toVariantMap(); }
 QVariantMap comparison() const;
 Q_INVOKABLE void compareWith(int index) { m_compareIndex = index; emit changed(); }
 // Clears the inspected version and its comparison target, as the web's Clear button does.
 Q_INVOKABLE void deselect();
 Q_INVOKABLE void deleteSelected();
 WorkflowVersions(WorkflowSession *session, WorkflowDocument *document, QObject *parent = nullptr);
 QVariantList rows() const { return m_rows; }
 QString preview() const { return m_preview; }
 QString error() const { return m_error; }
 bool busy() const { return m_busy; }
 bool available() const { return m_session->serverBound(); }
 QVariantMap metadata() const { return m_document->snapshot().toVariantMap(); }
 Q_INVOKABLE void load(const QString &kind);
 Q_INVOKABLE void inspect(int index);
 Q_INVOKABLE void restore(bool confirmDirty);
 Q_INVOKABLE void saveMetadata(const QVariantMap &patch);
signals:
 void changed();
 void clockChanged();
 void copiedChanged();
 void panelMinimumWidthChanged(qreal width);
private:
    void tickClock();
    void scheduleClock();
    // Loads a panel's data again after a mutation, unless another panel was opened since.
    void reloadIfShowing(const QString &kind);
    void selectVersionId(const QString &id);
 void request(const QString &procedure, QJsonObject input, bool mutation, std::function<void(QJsonObject)> done);
 void reset();
 WorkflowSession *m_session;
 WorkflowDocument *m_document;
 QNetworkAccessManager m_network;
 QUrl m_origin;
 QString m_token, m_user, m_id, m_error, m_preview;
 mutable bool m_diffValid = false;
 mutable QVariantMap m_diff;
 int m_selectedIndex = -1, m_compareIndex = -1;
 QVariantList m_rows;
 QJsonObject m_selected;
 quint64 m_epoch = 0;
 bool m_busy = false;
 QString m_pendingLoad;
    std::function<QDateTime()> m_now = [] { return QDateTime::currentDateTimeUtc(); };
    QTimer m_clockTimer;
    int m_clockInterval = 0;
    qint64 m_clock = 0;
    QString m_copied;
    QTimer m_copiedTimer;
    QString m_selectAfterLoad;
    // The panel the most recent load() served. A queued or late reload for another panel is dropped.
    QString m_panel;
    qreal m_panelMinimumWidth = 0;
};
}
