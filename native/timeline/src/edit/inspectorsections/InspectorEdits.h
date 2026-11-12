#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

class InspectorEdits : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* model READ model WRITE setModel NOTIFY modelChanged)
    // The whole document as a map. Each read converts every clip: a section binds a narrow property below instead.
    Q_PROPERTY(QVariantMap document READ document NOTIFY documentChanged)
    // While false, the narrow properties below hold their last value and no model change reaches them.
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
    // The group clips as {id, parentId, name}. Notifies only when that list changes.
    Q_PROPERTY(QVariantList groupClips READ groupClips NOTIFY groupClipsChanged)
    // The clip whose children `childCount` counts.
    Q_PROPERTY(QString parentId READ parentId WRITE setParentId NOTIFY parentIdChanged)
    Q_PROPERTY(int childCount READ childCount NOTIFY childCountChanged)
public:
    explicit InspectorEdits(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* model() const { return m_model; }
    void setModel(TimelineModel* model);
    QVariantMap document() const;
    bool active() const { return m_active; }
    void setActive(bool active);
    QVariantList groupClips() const { return m_groupClips.toVariantList(); }
    QString parentId() const { return m_parentId; }
    void setParentId(const QString& id);
    int childCount() const { return m_childCount; }
    Q_INVOKABLE bool apply(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void beginGesture(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void preview(const QJsonObject& payload);
    Q_INVOKABLE void commit(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void cancelGesture();
signals:
    void modelChanged();
    void documentChanged();
    void activeChanged();
    void groupClipsChanged();
    void parentIdChanged();
    void childCountChanged();
private:
    void refresh();
    bool gestureIntact() const;
    void showClips(const QJsonArray& clips);
    QPointer<TimelineModel> m_model;
    QJsonObject m_before;
    QJsonArray m_preview;
    QJsonObject m_payload;
    QString m_action;
    QString m_collection = QStringLiteral("clips");
    QString m_parentId;
    QJsonArray m_groupClips;
    quint64 m_generation = 0;
    quint64 m_previewRevision = 0;
    int m_childCount = 0;
    bool m_gesture = false;
    bool m_cancelled = false;
    bool m_active = true;
};
