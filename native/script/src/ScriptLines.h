#pragma once
#include <QObject>
#include <QVariant>
#include <QtQmlIntegration/qqmlintegration.h>

// Script edits for QML. Each call returns a new script resource, and the
// caller keeps it in a StoryWorkspace draft.
class ScriptLines : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    using QObject::QObject;
    Q_INVOKABLE QVariantList rows(const QVariantMap& script) const;
    Q_INVOKABLE QVariantMap setLineText(const QVariantMap& script, const QString& lineId, const QString& text) const;
    Q_INVOKABLE QVariantMap addLine(const QVariantMap& script) const;
};
