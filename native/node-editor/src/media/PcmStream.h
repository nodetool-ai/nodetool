#pragma once
#include "AudioVisualAnalysis.h"
#include <QAudioDevice>
#include <QElapsedTimer>
#include <QAudioFormat>
#include <QByteArrayView>
#include <QJsonObject>
#include <QIODevice>
#include <QPointer>
#include <QTimer>
#include <algorithm>
#include <functional>
#include <memory>
#include <vector>

namespace nodetool::node_editor {
class PcmBuffer {
public:
 static constexpr qsizetype MaxBytes = 4 * 1024 * 1024;
 void reset(QString scope, bool live = false);
 bool append(const QString &scope, const QJsonObject &chunk);
 QByteArrayView pending() const;
 void consume(qsizetype size);
 qint64 drain(QIODevice &device, qsizetype available);
 void rewind() { m_cursor = 0; }
 bool configured() const { return m_configured; }
 bool ended() const { return m_ended; }
 bool live() const { return m_live; }
 void finish() { m_ended = true; }
 void discardPending();
 void trimPendingFrames(qsizetype frames);
 qsizetype leadFrames() const { return static_cast<qsizetype>(sampleRate) * m_leadMs / 1000; }
 void setLeadMilliseconds(int value);
 int leadMilliseconds() const { return m_leadMs; }
 qsizetype queuedFrames() const { return pending().size() / (channels * 4); }
 qsizetype primeFrames() const { return sampleRate * (m_live ? std::min(40, m_leadMs / 2) : 20) / 1000; }
 qint64 droppedFrames() const { return m_droppedFrames; }
 int sampleRate = 22000;
 int channels = 1;
 QString notice;
private:
 QString m_scope;
 QByteArray m_bytes;
 qsizetype m_cursor = 0;
 bool m_configured = false;
 bool m_ended = false;
 bool m_live = false;
 int m_leadMs = 100;
 qint64 m_droppedFrames = 0;
};

// Injected devices make sample delivery and queue transitions testable without hardware.
class PcmSink {
public:
 virtual ~PcmSink() = default;
 virtual QAudioFormat preferredFormat() const = 0;
 virtual bool supports(const QAudioFormat &format) const = 0;
 virtual bool start(const QAudioFormat &format) = 0;
 virtual qsizetype capacityBytes() const = 0;
 virtual qsizetype bufferedBytes() const { return 0; }
 virtual qint64 write(QByteArrayView bytes) = 0;
 virtual bool drained() const = 0;
 virtual bool failed() const = 0;
 virtual void stop() = 0;
};
class PcmStream;
class PcmQueue final : public QObject {
 Q_OBJECT
public:
 explicit PcmQueue(QObject *parent = nullptr) : QObject(parent) {}
 static PcmQueue *applicationQueue();
 void enqueue(PcmStream *stream);
 void remove(PcmStream *stream);
 void stopAll();
 void stopStreams(const QList<PcmStream *> &streams);
 bool active(const PcmStream *stream) const;
 int position(const PcmStream *stream) const;
signals:
 void changed();
private:
 void promote();
 QPointer<PcmStream> m_active;
 QList<QPointer<PcmStream>> m_waiting;
 bool m_suspended = false;
 bool m_promoting = false;
};
class PcmStream final : public QObject {
 Q_OBJECT
 Q_PROPERTY(bool playing READ playing NOTIFY changed)
 Q_PROPERTY(bool queued READ queued NOTIFY changed)
 Q_PROPERTY(int queuePosition READ queuePosition NOTIFY changed)
 Q_PROPERTY(QString state READ state NOTIFY changed)
 Q_PROPERTY(qint64 queuedFrames READ queuedFrames NOTIFY changed)
 Q_PROPERTY(qint64 droppedFrames READ droppedFrames NOTIFY changed)
 Q_PROPERTY(bool ended READ ended NOTIFY changed)
 Q_PROPERTY(double level READ level NOTIFY changed)
public:
 using SinkFactory = std::function<std::unique_ptr<PcmSink>()>;
 explicit PcmStream(QObject *parent = nullptr, PcmQueue *queue = nullptr);
 ~PcmStream() override;
 bool playing() const { return m_wantsPlay && m_queue && (m_queue->active(this) || queued()); }
 bool queued() const { return queuePosition() > 0; }
 int queuePosition() const { return m_queue ? m_queue->position(this) : 0; }
 QString state() const;
 qint64 queuedFrames() const;
 qint64 droppedFrames() const { return m_buffer.droppedFrames(); }
 bool ended() const { return m_buffer.ended(); }
 double level() const { return m_level; }
 void reset(QString scope = {}, bool live = false);
 void replace(QString scope, bool live);
 bool append(const QString &scope, const QJsonObject &chunk);
 void finish();
 void setLeadMilliseconds(int value) { m_buffer.setLeadMilliseconds(value); }
 void setSinkFactory(SinkFactory factory);
 void startOnDevice(const QAudioDevice &device);
 void autoplay();
 void pump();
 const AudioVisualFrame &visualFrame() const { return m_visualFrame; }
 void addVisualObserver(bool animated);
 void removeVisualObserver(bool animated);
 void refreshVisualFrame();
 Q_INVOKABLE void start();
 Q_INVOKABLE void stop();
 Q_INVOKABLE void restart();
signals:
 void changed();
 void visualFrameChanged();
private:
 friend class PcmQueue;
 void clearVisual();
 void updateVisualTimer();
 void activate();
 void halt(bool preserveConversion = false);
 void fail(QString message);
 bool configure();
 void convert();
 qsizetype outstandingFrames() const;
 void trimLiveLead();
 AudioVisualAnalysis m_visualAnalysis;
 AudioVisualFrame m_visualFrame;
 QTimer m_visualTimer;
 QTimer m_visualExpiryTimer;
 QElapsedTimer m_lastVisualWrite;
 int m_visualObservers = 0;
 int m_animatedVisualObservers = 0;
 bool m_staticVisualPending = false;
 int m_lastVisualBlockMs = 0;
 PcmBuffer m_buffer;
 QPointer<PcmQueue> m_queue;
 QTimer m_timer;
 QTimer m_restartTimer;
 SinkFactory m_factory;
 std::unique_ptr<PcmSink> m_sink;
 QAudioFormat m_outputFormat;
 QByteArray m_converted;
 qsizetype m_written = 0;
 std::vector<float> m_input;
 double m_phase = 0;
 bool m_wantsPlay = false;
 bool m_explicitStop = false;
 bool m_autoplayRequested = false;
 bool m_open = false;
 bool m_primed = false;
 double m_level = 0;
 QString m_state = "Ready";
};
}
