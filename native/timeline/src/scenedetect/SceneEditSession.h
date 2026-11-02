#pragma once

// The request to open the Scene Edit Detection dialog. The key action and the
// Clip menu are C++ and the dialog lives in an overlay panel, so they meet
// here. It changes no model.

#include <QObject>
#include <QStringList>
#include <QtQmlIntegration/qqmlintegration.h>

class SceneEditSession : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit SceneEditSession(QObject* parent = nullptr) : QObject(parent) {}
    // Asks the open editor to analyse these clips.
    Q_INVOKABLE void requestOpen(const QStringList& clipIds) { emit openRequested(clipIds); }
signals:
    void openRequested(const QStringList& clipIds);
};
