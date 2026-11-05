#pragma once
#include "WorkflowSession.h"
#include "../document/WorkflowDocument.h"
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
public:
 static QVariantMap graphDiff(const QJsonObject &oldGraph, const QJsonObject &newGraph);
 QVariantMap selectedGraph() const { return m_selected["graph"].toObject().toVariantMap(); }
 QVariantMap comparison() const;
 Q_INVOKABLE void compareWith(int index) { m_compareIndex = index; emit changed(); }
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
 Q_INVOKABLE void sharingAction(const QString &procedure, const QVariantMap &input);
 Q_INVOKABLE void createLink(const QString &role);
 Q_INVOKABLE void saveMetadata(const QVariantMap &patch);
signals:
 void changed();
private:
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
};
}
