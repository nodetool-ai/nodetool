#pragma once
#include <QObject>
#include <QJsonObject>
#include <QVariantList>
#include "OutputCollectionModel.h"
#include "media/PcmStream.h"

namespace nodetool::node_editor {
class RunOutputModel final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QObject *pcm READ pcm CONSTANT)
  Q_PROPERTY(QVariantList runs READ runs NOTIFY changed)
  Q_PROPERTY(QString selectedRunId READ selectedRunId WRITE selectRun NOTIFY changed)
  Q_PROPERTY(QVariantList entries READ entries NOTIFY changed)
  Q_PROPERTY(QAbstractItemModel *collections READ collections CONSTANT)
public:
  explicit RunOutputModel(QObject *parent = nullptr);
  QObject *pcm() { return &m_pcm; }
  QVariantList runs() const;
  QString selectedRunId() const;
  QVariantList entries() const;
  QAbstractItemModel *collections() { return &m_collections; }
public slots:
  void beginRun(QString jobId);
  void ingest(QString jobId, QJsonObject event);
  void selectRun(QString jobId);
  void clear();
  void reset();
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
  void publish();
  PcmStream m_pcm;
  OutputCollectionModel m_collections;
  QList<Run> m_runs;
  QString m_selected;
};
}
