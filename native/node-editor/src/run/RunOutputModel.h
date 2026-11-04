#pragma once
#include <QObject>
#include <QJsonObject>
#include <QVariantList>

namespace nodetool::node_editor {
class RunOutputModel final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList runs READ runs NOTIFY changed)
  Q_PROPERTY(QString selectedRunId READ selectedRunId WRITE selectRun NOTIFY changed)
  Q_PROPERTY(QVariantList entries READ entries NOTIFY changed)
public:
  explicit RunOutputModel(QObject *parent = nullptr);
  QVariantList runs() const;
  QString selectedRunId() const;
  QVariantList entries() const;
public slots:
  void beginRun(QString jobId);
  void ingest(QString jobId, QJsonObject event);
  void selectRun(QString jobId);
  void clear();
signals:
  void changed();
private:
  struct Run {
    QString id;
    QString status = "submitted";
    bool terminal = false;
    bool truncated = false;
    double sequence = 0;
    QVariantList entries;
  };
  QList<Run> m_runs;
  QString m_selected;
};
}
