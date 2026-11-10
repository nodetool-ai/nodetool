#pragma once
#include <QObject>
#include <QPointer>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointF>
#include <QHash>
#include <QVariantList>
#include <QVector>
#include <QtNodes/Definitions>
#include "CatalogSearch.h"
#include <functional>
class QGraphicsView;
class QQmlEngine;
class QQuickWidget;
namespace nodetool {
class WorkflowGraphModel;
class EditorScene;
// A loose-wire choice produces one canonical add-node/add-edge document batch.
class CompatibleNodePicker final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
  // The web wire-drop menus' fixed rows (OutputContextMenu.tsx, InputContextMenu.tsx).
  // They show only while the query is empty, above the ranked rows.
  Q_PROPERTY(QVariantList fixedRows READ fixedRows NOTIFY changed)
  Q_PROPERTY(QString query READ query NOTIFY changed)
  Q_PROPERTY(QString title READ title NOTIFY changed)
  Q_PROPERTY(bool active READ active NOTIFY changed)
  Q_PROPERTY(int generation READ generation NOTIFY changed)
  // A dynamic output's menu also deletes it (web OutputContextMenu.tsx:93-124, :622-630).
  Q_PROPERTY(bool canDeleteOutput READ canDeleteOutput NOTIFY changed)
public:
  CompatibleNodePicker(WorkflowGraphModel &model, EditorScene &scene,
                       QGraphicsView &view, QQmlEngine *engine,
                       QObject *parent = nullptr);
  ~CompatibleNodePicker() override;
  void setCatalog(const QJsonArray &catalog);
  QVariantList rows() const;
  QVariantList fixedRows() const;
  QString query() const { return query_; }
  QString title() const;
  int generation() const { return generation_; }
  void choose(const QString &key) { choose(key, generation_); }
  bool active() const { return active_; }
  bool canDeleteOutput() const;
  QQuickWidget *widget() const;
  // Create `type` beside `source`'s output and wire the output into `targetPort` as one document step.
  bool addConnected(QtNodes::NodeId source, const QString &outputName, const QString &type, const QString &targetPort);
  std::function<bool(const QJsonObject &)> applyCommand;
  // The recent node types, most recent first. The loose-wire list ranks them first.
  std::function<QStringList()> recentTypes;
public slots:
  void open(QtNodes::NodeId node, QtNodes::PortType port,
            QtNodes::PortIndex index, const QPointF &position);
  void openBody(QtNodes::NodeId node, QtNodes::PortType port,
                QtNodes::PortIndex index, QtNodes::NodeId target,
                const QPointF &position);
  void setQuery(const QString &query);
  void choose(const QString &key, int generation);
  void search(const QString &query, int generation);
  void dismiss(int generation);
  void deleteOutput(int generation);
  void cancel();
signals:
  void changed();
  void nodeCreated(const QString &id);
protected:
  bool eventFilter(QObject *object, QEvent *event) override;
private:
  WorkflowGraphModel &model_;
  EditorScene &scene_;
  QGraphicsView &view_;
  QPointer<QQmlEngine> engine_;
  QPointer<QQuickWidget> widget_;
  QJsonArray catalog_;
  // One row with its search text folded once.
  // One row with its search text folded once, and the node fields the ranking reads.
  struct Candidate { QVariantMap row; QString text, label; CatalogSearchNode node; };
  QVector<Candidate> candidates_;
  // The catalog rows for each direction and port type. setCatalog clears it.
  QHash<QString, QVector<Candidate>> compatibleCache_;
  // rows() for the current query. Cleared when the query or the candidates change.
  mutable QVariantList rowsCache_;
  mutable bool rowsValid_ = false;
  // The loose-wire list ranks as the web ConnectableNodes.tsx does (rankSearchNodes).
  mutable CatalogRanker ranker_;
  QString query_, resource_, handle_;
  QtNodes::NodeId node_ = QtNodes::InvalidNodeId;
  QtNodes::PortType port_ = QtNodes::PortType::None;
  QtNodes::PortIndex index_ = 0;
  QJsonObject type_;
  QPointF position_;
  bool active_ = false;
  int generation_ = 0;
  QtNodes::NodeId body_ = QtNodes::InvalidNodeId;
  QString bodyResource_;
  // One fixed row: the node it creates, the port that takes the wire, and its presets.
  struct FixedAction {
    QString key, label, type, port, receivingName;
    QJsonObject overrides;
    bool replaceTarget = false, destructive = false;
  };
  QVector<FixedAction> fixed_;
  QJsonObject metadataFor(const QString &type) const;
  void buildFixed();
  bool initialize(QtNodes::NodeId node, QtNodes::PortType port,
                  QtNodes::PortIndex index, const QPointF &position);
  void showWidget();
  static void addCandidate(QVector<Candidate> &into, QVariantMap row);
  QVector<Candidate> catalogCandidates() const;
  void applyBody(const QString &port, const QJsonArray &prefix = {},
                 const QJsonObject &sourceTypeOverride = {}, bool newDynamicInput = false);
  bool current() const;
  // `receivingName` names a new node that declares `name`. `replaceTarget` first removes
  // the edges into `resource`'s input `handle`, as the web input menu does.
  QJsonObject connectCommand(const QJsonObject &metadata, bool forward, const QString &resource, const QString &handle,
                             const QString &port, const QPointF &position, QString &id,
                             const QJsonObject &overrides = {}, const QString &receivingName = {},
                             bool replaceTarget = false) const;
  bool owns(QObject *object) const;
  void positionWidget();
};
}
