#pragma once
#include "edit/ClipGestureController.h"
#include "assets/AssetBrowser.h"
#include <QObject>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class SourceViewerState : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantMap asset READ asset WRITE setAsset NOTIFY changed)
    Q_PROPERTY(AssetBrowser* mediaBrowser READ mediaBrowser WRITE setMediaBrowser NOTIFY changed)
    Q_PROPERTY(QVariantMap sourceRange READ sourceRange NOTIFY changed)
    Q_PROPERTY(QString mediaType READ mediaType NOTIFY changed)
    Q_PROPERTY(double inMs READ inMs NOTIFY changed)
    Q_PROPERTY(double outMs READ outMs NOTIFY changed)
    Q_PROPERTY(double durationMs READ durationMs NOTIFY changed)
public:
    explicit SourceViewerState(QObject* parent = nullptr) : QObject(parent) {}
    QVariantMap asset() const { return m_asset; }
    AssetBrowser* mediaBrowser() const { return m_mediaBrowser.data(); }
    void setMediaBrowser(AssetBrowser* browser);
    void setAsset(const QVariantMap& asset);
    QVariantMap sourceRange() const { return m_marks; }
    QString mediaType() const;
    double inMs() const;
    double outMs() const;
    double durationMs() const;
    Q_INVOKABLE void markIn(double timeMs);
    Q_INVOKABLE void markOut(double timeMs);
    Q_INVOKABLE void setIn(const QString& seconds);
    Q_INVOKABLE void setOut(const QString& seconds);
    Q_INVOKABLE bool perform(const QString& kind, ClipGestureController* gestures);
    Q_INVOKABLE QString shortcut(const QString& kind, const QString& preset) const;
signals:
    void changed();
private:
    void setMarks(double inMs, double outMs);
    QPointer<AssetBrowser> m_mediaBrowser;
    QVariantMap m_asset;
    QVariantMap m_marks;
};
