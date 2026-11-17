#pragma once
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>
#include <QUrl>
#include <QVariant>

namespace nodetool::node_editor {
// Loads one storyboard or script through <kind>.get and saves it through
// <kind>.update. It is the controller that a StoryWorkspace edits through.
class StoryDocumentSource final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QVariant result READ result NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(QString name READ name NOTIFY changed)
public:
  // kind is "storyboards" or "scripts".
  StoryDocumentSource(QString kind, QUrl origin, QString token, QString user, QObject *parent = nullptr);
  QVariant result() const { return result_; }
  bool busy() const { return busy_; }
  QString error() const { return error_; }
  QString kind() const { return kind_; }
  QString name() const;
  Q_INVOKABLE bool load(const QString &id);
  Q_INVOKABLE bool saveStoryboard(const QJsonObject &storyboard);
  Q_INVOKABLE bool saveScript(const QJsonObject &script);
  // The board asks for these, and this window has no project browser or timeline.
  Q_INVOKABLE bool listContextResources(const QString &, bool = false) { return false; }
  Q_INVOKABLE bool assembleStoryboard(const QVariant &) { return false; }
  // Drafts stay per server, and no clip links documents here.
  Q_INVOKABLE QString draftScope() const { return origin_.toString() + QLatin1Char('\n') + user_; }
  Q_INVOKABLE QVariantList linkedResources() const { return {}; }
signals:
  void changed();
private:
  bool call(const QString &procedure, const QJsonObject &input, bool mutation);
  QNetworkAccessManager network_;
  QString kind_;
  QUrl origin_;
  QString token_, user_, error_;
  QVariant result_;
  bool busy_ = false;
};
} // namespace nodetool::node_editor
