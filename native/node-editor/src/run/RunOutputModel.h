#pragma once
#include <QObject>
#include <QJsonObject>
#include <QVariantList>
#include <QSet>
#include <QHash>
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
  Q_PROPERTY(QAbstractItemModel *richEntries READ richEntries CONSTANT)
public:
  explicit RunOutputModel(QObject *parent = nullptr, PcmQueue *queue = nullptr);
  ~RunOutputModel() override;
  void setLiveNodes(const QSet<QString> &nodeIds) { m_liveNodes = nodeIds; }
  void setPcmSinkFactory(PcmStream::SinkFactory factory);
  Q_INVOKABLE QObject *pcmFor(QString nodeId, QString outputName) const;
  QObject *pcm() { return &m_pcm; }
  QVariantList runs() const;
  QString selectedRunId() const;
  QVariantList entries() const;
  QAbstractItemModel *collections() { return &m_collections; }
  QAbstractItemModel *richEntries() { return &m_richEntries; }
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
    quint64 nextEntry = 0;
    QVariantList entries;
  };
  void publish();
  void resetAudio();
  PcmStream *streamFor(const QString &nodeId, const QString &outputName);
  QPointer<PcmQueue> m_audioQueue;
  QHash<QString, QPointer<PcmStream>> m_streams;
  QSet<QString> m_liveNodes;
  PcmStream::SinkFactory m_sinkFactory;
  quint64 m_audioGeneration = 0;
  PcmStream m_pcm;
  OutputCollectionModel m_collections;
  OutputCollectionModel m_richEntries;
  QList<Run> m_runs;
  QString m_selected;
};
}
