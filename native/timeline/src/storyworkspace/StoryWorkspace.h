#pragma once
#include "aiassist/AssistController.h"
#include <QHash>
#include <QtQmlIntegration/qqmlintegration.h>

// Keeps unsubmitted edits only. F10 owns loaded resources, transport and persistence.
class StoryWorkspace : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(AssistController* controller READ controller WRITE setController NOTIFY changed)
    Q_PROPERTY(QVariantMap resource READ resource NOTIFY resourceChanged)
    Q_PROPERTY(bool dirty READ dirty NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QVariantList linkedResources READ linkedResources NOTIFY changed)
    Q_PROPERTY(QStringList entityIds READ entityIds NOTIFY changed)
public:
    explicit StoryWorkspace(QObject* parent = nullptr) : QObject(parent) {}
    AssistController* controller() const { return m_controller; }
    void setController(AssistController* controller);
    QVariantMap resource() const;
    bool dirty() const;
    QString error() const { return m_error; }
    QStringList entityIds() const;
    QVariantList linkedResources() const;
    Q_INVOKABLE bool patchShot(const QString& id, const QString& field, const QJsonValue& value);
    Q_INVOKABLE bool patchSpeaker(const QString& id, const QString& field, const QJsonValue& value);
    Q_INVOKABLE bool patchEntity(const QString& field, const QJsonValue& value);
    Q_INVOKABLE bool patchDocument(const QString& field, const QJsonValue& value);
    Q_INVOKABLE bool applyShotDraft(const QString& shotId, const QJsonObject& patch);
    Q_INVOKABLE bool nudgeShot(const QString& shotId, int direction);
    Q_INVOKABLE bool removeShotVersion(const QString& shotId, const QString& kind, int index);
    // Board edits. insertShot and duplicateShot return the new shot's id, or an empty string.
    Q_INVOKABLE QString insertShot(const QString& afterShotId);
    Q_INVOKABLE QString duplicateShot(const QString& shotId);
    Q_INVOKABLE bool removeShot(const QString& shotId);
    Q_INVOKABLE bool moveShot(const QString& shotId, const QString& sceneId, int position);
    Q_INVOKABLE bool patchBoard(const QString& field, const QJsonValue& value);
    Q_INVOKABLE bool save();
    Q_INVOKABLE void discard();
    Q_INVOKABLE QString json(const QJsonValue& value) const;
    Q_INVOKABLE QString jsonDraft(const QString& shotId, const QString& field, const QJsonValue& fallback) const;
    Q_INVOKABLE void setJsonDraft(const QString& shotId, const QString& field, const QString& text);
    Q_INVOKABLE bool patchJson(const QString& shotId, const QString& field, const QString& text);
signals:
    void changed();
    void resourceChanged();
private:
    struct Draft { QJsonObject base; QJsonObject edited; };
    QString key() const;
    QJsonObject current() const;
    bool retain(const QJsonObject& edited, const QString& error);
    void observe();
    QPointer<AssistController> m_controller;
    QHash<QString, Draft> m_drafts;
    struct JsonDraft { QString text; QString error; };
    QHash<QString, QHash<QString, JsonDraft>> m_jsonDrafts;
    QString m_submitting;
    QJsonObject m_submitted;
    QString m_error;
    QString m_observedKey;
};
