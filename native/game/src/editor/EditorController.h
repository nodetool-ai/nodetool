#pragma once
#include "core/Session.h"
#include "player/JsonSaveHost.h"
#include "render/GameViewport.h"
#include <QLocalServer>
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QVariantList>
#include <QVariantMap>
#include <atomic>
#include <future>
#include <optional>
#include <thread>
namespace nodetool::game {
class EditorController final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariantList entities READ entities NOTIFY changed)
  Q_PROPERTY(QVariantList assets READ assets NOTIFY changed)
  Q_PROPERTY(QVariantList scripts READ scripts NOTIFY changed)
  Q_PROPERTY(QVariantMap selection READ selection NOTIFY changed)
  Q_PROPERTY(QString selectedId READ selectedId WRITE select NOTIFY changed)
  Q_PROPERTY(QString diagnostic READ diagnostic NOTIFY changed)
  Q_PROPERTY(QString saveState READ saveState NOTIFY changed)
  Q_PROPERTY(QString path READ path NOTIFY changed)
  Q_PROPERTY(qulonglong revision READ revision NOTIFY changed)
  Q_PROPERTY(bool playing READ playing NOTIFY changed)
  Q_PROPERTY(bool is2D READ is2D NOTIFY changed)
  Q_PROPERTY(bool dirty READ dirty NOTIFY changed)
  Q_PROPERTY(QString editEffect READ editEffect NOTIFY changed)
public:
  explicit EditorController(QObject *parent = nullptr);
  ~EditorController() override;
  void openDocument(Json document, QString path = {});
  Json document() const;
  QVariantList entities() const;
  QVariantList assets() const;
  QVariantList scripts() const;
  QVariantMap selection() const;
  QString selectedId() const { return selected_; }
  QString diagnostic() const { return diagnostic_; }
  QString saveState() const;
  QString path() const { return path_; }
  qulonglong revision() const;
  bool playing() const { return bool(session_); }
  bool is2D() const {
    return document_ && document_->inspect().value("dimension", "3d") == "2d";
  }
  bool dirty() const { return dirty_; }
  QString editEffect() const { return editEffect_; }
  std::shared_ptr<FrameMailbox> mailbox() const { return mailbox_; }
  Q_INVOKABLE void attachViewport(GameViewport *viewport);
  Json dispatch(const Json &request);
  bool listen(const QString &name);
  Q_INVOKABLE bool open(const QString &path, bool recover = true);
  Q_INVOKABLE bool save(const QString &path = {});
  Q_INVOKABLE void select(const QString &id);
  Q_INVOKABLE bool editEntity(const QString &json);
  Q_INVOKABLE bool editScript(const QString &id, const QString &source);
  Q_INVOKABLE bool transact(const QString &operations,
                            qulonglong expectedRevision);
  Q_INVOKABLE bool undo();
  Q_INVOKABLE bool redo();
  Q_INVOKABLE bool beginDrag(const QString &mode);
  Q_INVOKABLE void previewDrag(double x, double y, double z, double snap);
  Q_INVOKABLE bool endDrag();
  Q_INVOKABLE void cancelDrag();
  Q_INVOKABLE bool start();
  Q_INVOKABLE void stop();
  Q_INVOKABLE bool step();
  Q_INVOKABLE bool applySimulation();
  Q_INVOKABLE void navigateCamera(double x, double y, double z);
  Q_INVOKABLE QString selectedJson() const;
  Q_INVOKABLE QString source(const QString &id) const;
  Q_INVOKABLE QString classify(const QString &operations) const;
  Q_INVOKABLE void setAction(const QString &action, bool active);
  Q_INVOKABLE bool discardDraft();
signals:
  void changed();

private:
  struct Drag {
    std::uint64_t revision;
    QString mode;
    Json entity;
    Json preview;
  };
  std::unique_ptr<Document> document_;
  std::unique_ptr<Session> session_;
  std::optional<Drag> drag_;
  QString selected_, diagnostic_, path_, editEffect_;
  bool dirty_ = false;
  QTimer timer_;
  QLocalServer server_;
  int connections_ = 0;
  Json actions_ = Json::object();
  std::shared_ptr<FrameMailbox> mailbox_ = std::make_shared<FrameMailbox>();
  QPointer<GameViewport> viewport_;
  std::jthread playback_;
  std::mutex inputMutex_;
  std::atomic<bool> advancing_ = false;
  std::string playbackError_;
  Json savedBase_;
  bool externalEdit_ = false;
  std::optional<std::uint64_t> localRevision_;
  std::map<std::string, std::pair<Json, Json>> requests_;
  std::deque<std::string> requestOrder_;
  std::size_t requestBytes_ = 0;
  void halt();
  void resume();
  Json camera_ = Json::object();
  std::string assetKey_;
  std::shared_ptr<const RenderModels> models_;
  std::shared_ptr<const RenderImages> images_;
  std::shared_ptr<const RenderFonts> fonts_;
  void prepareAssets();
  JsonSaveHost jsonSaves_;
  void launchAssets();
  struct AssetResult {
    std::string key;
    std::shared_ptr<const RenderModels> models;
    std::shared_ptr<const RenderImages> images;
    QString error;
  };
  std::future<AssetResult> assetLoad_;
  std::shared_ptr<std::atomic<bool>> assetCancel_;
  QTimer assetTimer_;
  void commit(const Json &operations, std::uint64_t expected);
  void publish();
  void draft();
  bool fail(const std::exception &error);
  static Json read(const QString &path);
  static void write(const QString &path, const Json &value);
};
} // namespace nodetool::game
