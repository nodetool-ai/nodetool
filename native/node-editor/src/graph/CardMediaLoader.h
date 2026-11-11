#pragma once
#include <QHash>
#include <QObject>
#include <QSet>
#include <QtNodes/Definitions>

namespace nodetool {
class WorkflowGraphModel;
namespace node_editor { class MediaResolver; }

// Loads the images that card drop zones show. It resolves each image value
// through MediaResolver, decodes a bounded thumbnail and hands it to the model,
// which lays the card out at the image's size. Video and audio values play in
// CanvasMediaPresenter's overlays, which resolve their own sources.
class CardMediaLoader final : public QObject {
  Q_OBJECT
public:
  CardMediaLoader(WorkflowGraphModel &model, node_editor::MediaResolver &resolver, QObject *parent = nullptr);
  // Copies a card's image at full size to the clipboard, as the web's Copy action.
  void copy(const QString &node, const QString &property);

private:
  struct Request { QString node; QString property; int index = 0; QString identity; };
  WorkflowGraphModel &model_;
  node_editor::MediaResolver &resolver_;
  QHash<QString, Request> requests_;
  QSet<QtNodes::NodeId> dirty_;
  bool all_ = true;
  bool scheduled_ = false;
  void schedule();
  void scan();
  void finish(const QString &key, const QString &path);
};
} // namespace nodetool
