#include "CardMediaLoader.h"
#include "WorkflowGraphModel.h"
#include "media/MediaResolver.h"
#include <QClipboard>
#include <QGuiApplication>
#include <QImageReader>
#include <QTimer>
#include <QUrl>

namespace nodetool {
namespace {
const QString Prefix = QStringLiteral("card-media:");
const QString CopyPrefix = QStringLiteral("card-media-copy:");
// A thumbnail stays within this box. A constant Image grows with its card, so
// it keeps more pixels than a list tile needs.
constexpr int ThumbnailLimit = 1024;
} // namespace

CardMediaLoader::CardMediaLoader(WorkflowGraphModel &model, node_editor::MediaResolver &resolver, QObject *parent)
    : QObject(parent), model_(model), resolver_(resolver) {
  connect(&model_, &WorkflowGraphModel::modelReset, this, [this] { all_ = true; schedule(); });
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] { all_ = true; schedule(); });
  connect(&model_, &WorkflowGraphModel::nodeUpdated, this, [this](QtNodes::NodeId id) { dirty_.insert(id); schedule(); });
  connect(&resolver_, &node_editor::MediaResolver::resolved, this, [this](const QString &key, const QUrl &url) {
    if (key.startsWith(Prefix)) { finish(key, url.toLocalFile()); }
    if (key.startsWith(CopyPrefix)) {
      const QImage image(url.toLocalFile());
      if (!image.isNull()) { QGuiApplication::clipboard()->setImage(image); }
      resolver_.release(key);
    }
  });
  connect(&resolver_, &node_editor::MediaResolver::failed, this, [this](const QString &key, const QString &) {
    if (key.startsWith(Prefix)) { finish(key, {}); }
  });
  // New credentials clear the cache, so every image loads again from the new server.
  connect(&resolver_, &node_editor::MediaResolver::cleared, this, [this] {
    requests_.clear();
    model_.clearCardMedia();
  });
  schedule();
}

void CardMediaLoader::copy(const QString &node, const QString &property) {
  for (const auto id : model_.allNodeIds()) {
    if (model_.resourceId(id) != node) { continue; }
    for (const auto &row : model_.layout(id).rows) {
      if (row.kind == NodeRowKind::DropZone && row.propertyName == property && row.mediaKind == QLatin1String("image") && !row.media.isEmpty()) {
        resolver_.resolve(CopyPrefix + CardMediaStore::key(node, property, 0), row.media.first().locator);
        return;
      }
    }
  }
}

void CardMediaLoader::schedule() {
  if (scheduled_) { return; }
  scheduled_ = true;
  QTimer::singleShot(0, this, [this] { scheduled_ = false; scan(); });
}

void CardMediaLoader::scan() {
  QSet<QtNodes::NodeId> nodes;
  if (all_) {
    for (const auto id : model_.allNodeIds()) { nodes.insert(id); }
  } else {
    nodes = dirty_;
  }
  all_ = false;
  dirty_.clear();
  for (const auto id : std::as_const(nodes)) {
    if (!model_.nodeExists(id) || model_.collapsed(id)) { continue; }
    const auto node = model_.resourceId(id);
    // A copy: marking an item loading rebuilds the layout these rows belong to.
    const auto rows = model_.layout(id).rows;
    for (const auto &row : rows) {
      if (row.kind != NodeRowKind::DropZone || row.mediaKind != QLatin1String("image")) { continue; }
      for (int index = 0; index < row.media.size(); ++index) {
        auto item = row.media[index];
        if (item.state != CardMediaState::Unrequested) { continue; }
        const auto key = Prefix + CardMediaStore::key(node, row.propertyName, index);
        requests_.insert(key, {node, row.propertyName, index, item.identity});
        item.state = CardMediaState::Loading;
        item.image = {};
        model_.setCardMedia(node, row.propertyName, index, item);
        resolver_.resolve(key, item.locator);
      }
    }
  }
}

void CardMediaLoader::finish(const QString &key, const QString &path) {
  const auto request = requests_.take(key);
  if (request.node.isEmpty()) { return; }
  CardMediaItem item;
  item.identity = request.identity;
  item.state = CardMediaState::Failed;
  if (!path.isEmpty()) {
    QImageReader reader(path);
    reader.setAutoTransform(true);
    auto natural = reader.size();
    if (natural.width() > ThumbnailLimit || natural.height() > ThumbnailLimit) {
      reader.setScaledSize(natural.scaled(ThumbnailLimit, ThumbnailLimit, Qt::KeepAspectRatio));
    }
    item.image = reader.read();
    if (!item.image.isNull()) {
      // An EXIF rotation turns the stored size into the displayed one.
      if (reader.transformation() & QImageIOHandler::TransformationRotate90) { natural.transpose(); }
      item.state = CardMediaState::Ready;
      item.natural = natural.isValid() ? natural : item.image.size();
    }
  }
  resolver_.release(key);
  model_.setCardMedia(request.node, request.property, request.index, item);
}
} // namespace nodetool
