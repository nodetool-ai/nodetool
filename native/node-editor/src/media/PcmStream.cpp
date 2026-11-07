#include "PcmStream.h"
#include <QAudioDevice>
#include <QMediaDevices>
#include <QtEndian>
#include <cmath>
#include <cstring>
namespace nodetool::node_editor {
void PcmBuffer::reset(QString scope) { m_scope = std::move(scope); m_bytes.clear(); m_cursor = 0; sampleRate = 22000; channels = 1; notice.clear(); }
bool PcmBuffer::append(const QString &scope, const QJsonObject &chunk) {
 if (scope.isEmpty() || scope != m_scope) { return false; }
 auto reject = [this](QString message) { notice = std::move(message); return false; };
 const auto meta = chunk["content_metadata"].toObject();
 const auto rate = meta["sample_rate"].toDouble(sampleRate), count = meta["channels"].toDouble(channels);
 if (rate < 8000 || rate > 192000 || std::floor(rate) != rate || count < 1 || count > 8 || std::floor(count) != count) { return reject("Invalid PCM sample rate or channels"); }
 if (!m_bytes.isEmpty() && (rate != sampleRate || count != channels)) { return reject("PCM format changed. Clear output before changing format"); }
 const auto encoding = meta["encoding"].toString();
 if (!encoding.isEmpty() && encoding != "pcm16" && encoding != "f32le") { return reject("Unsupported PCM encoding"); }
 const auto content = chunk["content"].toString();
 if (content.size() > MaxBytes * 2) { return reject("PCM buffer full. Additional audio refused"); }
 const auto decoded = QByteArray::fromBase64Encoding(content.toLatin1(), QByteArray::AbortOnBase64DecodingErrors);
 const int width = encoding == "f32le" ? 4 : 2;
 if (!decoded || decoded.decoded.isEmpty() || decoded.decoded.size() % (width * static_cast<int>(count))) { return reject("Malformed PCM chunk or incomplete audio frame"); }
 const auto &bytes = decoded.decoded;
 const auto size = bytes.size() / width * 4;
 if (m_bytes.size() + size > MaxBytes) { return reject("PCM buffer full. Additional audio refused"); }
 QByteArray output(size, Qt::Uninitialized);
 for (qsizetype i = 0; i < bytes.size() / width; ++i) {
  float value;
  if (width == 2) { value = qFromLittleEndian<qint16>(bytes.constData() + i * width) / 32768.0f; }
  else { const auto bits = qFromLittleEndian<quint32>(bytes.constData() + i * width); memcpy(&value, &bits, 4); }
  if (!std::isfinite(value)) { return reject("Invalid non-finite PCM sample"); }
  value = std::clamp(value, -1.0f, 1.0f);
  memcpy(output.data() + i * 4, &value, 4);
 }
 sampleRate = static_cast<int>(rate); channels = static_cast<int>(count); m_bytes.append(output); return true;
}
QByteArrayView PcmBuffer::pending() const { return QByteArrayView(m_bytes).sliced(m_cursor); }
void PcmBuffer::consume(qsizetype size) { m_cursor += std::clamp<qsizetype>(size, 0, m_bytes.size() - m_cursor); }
qint64 PcmBuffer::drain(QIODevice &device, qsizetype available) {
 const auto data = pending(); const auto size = std::min(data.size(), std::max<qsizetype>(0, available));
 if (size == 0) { return 0; }
 const auto written = device.write(data.data(), size);
 if (written > 0) { consume(written); }
 return written;
}
PcmStream::PcmStream(QObject *parent) : QObject(parent) {
 m_timer.setInterval(10); connect(&m_timer, &QTimer::timeout, this, &PcmStream::pump);
}
void PcmStream::reset(QString scope) { stop(); m_buffer.reset(std::move(scope)); m_state = "Ready"; emit changed(); }
void PcmStream::append(const QString &scope, const QJsonObject &chunk) { m_buffer.append(scope, chunk); emit changed(); }
void PcmStream::stop() { m_timer.stop(); if (m_sink) { m_sink->stop(); } m_sink.reset(); m_device = nullptr; m_playing = false; m_state = "Stopped"; emit changed(); }
void PcmStream::restart() { stop(); m_buffer.rewind(); start(); }
void PcmStream::start() { startOnDevice(QMediaDevices::defaultAudioOutput()); }
void PcmStream::startOnDevice(const QAudioDevice &device) {
 if (m_playing) { return; }
 QAudioFormat format; format.setSampleRate(m_buffer.sampleRate); format.setChannelCount(m_buffer.channels); format.setSampleFormat(QAudioFormat::Float);
 if (device.isNull()) { m_state = "No audio output device available"; emit changed(); return; }
 if (!device.isFormatSupported(format)) { m_state = "Audio device does not support this PCM format"; emit changed(); return; }
 m_sink = std::make_unique<QAudioSink>(device, format); m_sink->setBufferSize(format.bytesForDuration(100000));
 m_device = m_sink->start();
 if (!m_device) { m_state = "Audio output could not start"; emit changed(); return; }
 m_playing = true; m_timer.start(); pump();
}
void PcmStream::pump() {
 if (!m_sink || !m_device) { return; }
 if (m_sink->error() != QAudio::NoError) { stop(); m_state = "Audio output failed"; emit changed(); return; }
 if (m_buffer.drain(*m_device, m_sink->bytesFree()) < 0) { stop(); m_state = "Audio output write failed"; emit changed(); return; }
 m_state = m_buffer.pending().isEmpty() ? "Waiting for audio" : "Playing"; emit changed();
}
}
