#pragma once
#include <QAudioSink>
#include <QByteArrayView>
#include <QJsonObject>
#include <QTimer>
#include <memory>
namespace nodetool::node_editor {
// Bounded replay storage and consumption cursor, independent of audio hardware.
class PcmBuffer {
public:
 static constexpr qsizetype MaxBytes = 4 * 1024 * 1024;
 void reset(QString scope);
 bool append(const QString &scope, const QJsonObject &chunk);
 QByteArrayView pending() const;
 void consume(qsizetype size);
 qint64 drain(QIODevice &device, qsizetype available);
 void rewind() { m_cursor = 0; }
 int sampleRate = 22000;
 int channels = 1;
 QString notice;
private:
 QString m_scope;
 QByteArray m_bytes;
 qsizetype m_cursor = 0;
};
class PcmStream final : public QObject {
 Q_OBJECT
 Q_PROPERTY(bool playing READ playing NOTIFY changed)
 Q_PROPERTY(QString state READ state NOTIFY changed)
public:
 explicit PcmStream(QObject *parent = nullptr);
 bool playing() const { return m_playing; }
 QString state() const { return m_buffer.notice.isEmpty() ? m_state : m_buffer.notice; }
 void reset(QString scope = {});
 void append(const QString &scope, const QJsonObject &chunk);
 void startOnDevice(const QAudioDevice &device);
 Q_INVOKABLE void start();
 Q_INVOKABLE void stop();
 Q_INVOKABLE void restart();
signals:
 void changed();
private:
 void pump();
 PcmBuffer m_buffer;
 QTimer m_timer;
 std::unique_ptr<QAudioSink> m_sink;
 QIODevice *m_device = nullptr;
 bool m_playing = false;
 QString m_state = "Ready";
};
}
