#pragma once

#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

// GUI-thread value snapshot. QML receives scalars, never a document entity.
struct GestureFeedback {
    Q_GADGET
    QML_VALUE_TYPE(gestureFeedback)
    Q_PROPERTY(QString clipId MEMBER clipId)
    Q_PROPERTY(QString trackId MEMBER trackId)
    Q_PROPERTY(QString edge MEMBER edge)
    Q_PROPERTY(QString label MEMBER label)
    Q_PROPERTY(QString limitReason MEMBER limitReason)
    Q_PROPERTY(double startMs MEMBER startMs)
    Q_PROPERTY(double endMs MEMBER endMs)
    Q_PROPERTY(double timeMs MEMBER timeMs)
    Q_PROPERTY(double x MEMBER x)
    Q_PROPERTY(double y MEMBER y)
    Q_PROPERTY(bool hasTime MEMBER hasTime)
    Q_PROPERTY(bool hasSource MEMBER hasSource)
    Q_PROPERTY(bool bounded MEMBER bounded)
    Q_PROPERTY(bool available MEMBER available)
public:
    QString clipId, trackId, edge, label, limitReason;
    double startMs = 0, endMs = 0, timeMs = 0, x = 0, y = 0;
    bool hasTime = false, hasSource = false, bounded = false, available = true;
    static GestureFeedback fromMap(const QVariantMap& map) {
        return {map.value("clipId").toString(), map.value("trackId").toString(), map.value("edge").toString(),
            map.value("label").toString(), map.value("limitReason").toString(),
            map.value("startMs").toDouble(), map.value("endMs").toDouble(), map.value("timeMs").toDouble(),
            map.value("x").toDouble(), map.value("y").toDouble(), map.contains("timeMs"),
            map.value("hasSource").toBool(), map.value("bounded").toBool(), map.value("available", true).toBool()};
    }
};
