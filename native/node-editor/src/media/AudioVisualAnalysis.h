#pragma once
#include <QAudioFormat>
#include <QByteArrayView>
#include <array>
#include <complex>
namespace nodetool::node_editor {
struct AudioVisualFrame {
 std::array<float, 512> waveform{};
 std::array<float, 512> spectrum{};
 quint64 generation = 0;
 quint64 sequence = 0;
 int sampleRate = 0;
};
// Fixed storage. Input is the device-format prefix actually accepted by the sink.
class AudioVisualAnalysis {
public:
 void accept(QByteArrayView bytes, const QAudioFormat &format);
 void clear();
 void silence();
 AudioVisualFrame analyze();
 quint64 sequence() const { return sequence_; }
private:
 std::array<float, 1024> samples_{};
 std::array<std::complex<float>, 1024> fft_{};
 std::array<float, 512> smoothing_{};
 std::array<char, 32> partial_{};
 qsizetype partialSize_ = 0;
 std::size_t cursor_ = 0;
 quint64 sequence_ = 0;
 quint64 generation_ = 0;
 int sampleRate_ = 0;
};
}
