#pragma once

// One media file's audio stream, decoded with FFmpeg and converted once by
// libswresample to interleaved float32 stereo at the device rate (DESIGN.md
// D24). A mono source is copied to both channels at unity gain, which is the
// Web Audio up-mix the web preview hears; more than two channels are mixed
// down by libswresample. Not thread safe: the audio decode worker or the
// offline render owns each instance.

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace nt::audio {

class AudioSource {
public:
    // Opens the first audio stream of `path`. Returns null with `error` set
    // when the file cannot be read or has no audio stream.
    static std::unique_ptr<AudioSource> open(const std::string& path, int sampleRate, std::string* error,
        std::function<bool()> cancelled = {});
    ~AudioSource();
    AudioSource(const AudioSource&) = delete;
    AudioSource& operator=(const AudioSource&) = delete;

    int sampleRate() const { return m_sampleRate; }
    int sourceChannels() const { return m_sourceChannels; }
    int sourceSampleRate() const { return m_sourceRate; }
    // Source frames at the device rate, from the container (an estimate).
    std::int64_t durationFrames() const { return m_durationFrames; }

    // The next read starts at output frame `frame`. Frame 0 is the picture
    // stream start, or the container start for audio-only media.
    bool seek(std::int64_t frame);
    // Output frame of the next read.
    std::int64_t position() const { return m_position; }
    // Reads up to `frames` stereo frames. Returns 0 at the end of the stream.
    std::int64_t read(float* stereo, std::int64_t frames);

    // Packets or frames the demuxer or decoder rejected so far.
    std::int64_t decodeErrors() const { return m_decodeErrors; }

    // Decodes the whole stream from frame 0.
    std::vector<float> readAll();

private:
    AudioSource() = default;
    struct Impl;
    // Decodes the next packet's frames into m_pending; false at the end.
    bool decodeMore();

    std::unique_ptr<Impl> m_impl;
    int m_sampleRate = 48000;
    int m_sourceRate = 0;
    int m_sourceChannels = 0;
    std::int64_t m_durationFrames = 0;
    std::int64_t m_position = 0;       // output frame of m_pending[m_pendingRead]
    std::vector<float> m_pending;      // decoded stereo frames not read yet
    std::size_t m_pendingRead = 0;     // in frames
    std::int64_t m_skip = 0;           // frames to drop after a seek
    bool m_eof = false;
    std::int64_t m_decodeErrors = 0;
};

}  // namespace nt::audio
