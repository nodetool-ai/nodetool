#pragma once

#include <QObject>
#include <QPointer>

class QQmlEngine;
class TimelinePlayerController;

// Lets one TimelinePlayerController play at a time, which bounds the open
// decoders and audio devices. There is one per QML engine, a child of that
// engine (its QObject parent owns it), so no process-wide state exists. A
// host with one engine, such as the node editor, gets one player playing in
// the process.
// Thread affinity: UI thread only.
class PlaybackArbiter final : public QObject {
    Q_OBJECT

public:
    // The engine's arbiter, created on first use.
    static PlaybackArbiter& of(QQmlEngine& engine);

    // `player` starts playing: pauses the player that played before it.
    void claim(TimelinePlayerController& player);

private:
    explicit PlaybackArbiter(QQmlEngine& engine);

    QPointer<TimelinePlayerController> m_playing;
};
