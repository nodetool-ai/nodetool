#pragma once

// Lock-free shared-memory audio/MIDI exchange layout shared between
// NodeToolVstHost (native/vst-host) and native/timeline.
//
// Each live plug-in instance maps one ShmBuffer (file-backed MAP_SHARED) and
// pairs it with one AF_UNIX SOCK_STREAM socket for low-latency 1-byte wakeups
// and instant peer-crash detection (POLLHUP / EOF).
//
// Protocol per audio block:
//   1. Client writes inLeft/inRight, midi[0..numMidiEvents-1], sampleRate,
//      numFrames, flags, then stores requestSeq (memory_order_release) and
//      writes 1 byte to the socket.
//   2. Host worker wakes from read(), loads requestSeq (memory_order_acquire),
//      runs AudioProcessor::processBlock on pre-allocated buffers, writes
//      outLeft/outRight and latencySamples/status, stores responseSeq
//      (memory_order_release), and writes 1 byte back to the socket.
//   3. Client wakes from poll()/read(), checks responseSeq == seq, and copies
//      outLeft/outRight into the mixer bus.

#include <atomic>
#include <cstdint>

namespace vsthost {

inline constexpr std::uint32_t kShmMagic = 0x4E545653u;  // "NTVS"
inline constexpr std::uint32_t kShmVersion = 2;
inline constexpr std::uint32_t kShmMaxFrames = 512;
inline constexpr std::uint32_t kShmMaxMidiEvents = 256;

inline constexpr std::uint32_t kShmFlagReset = 1u << 0;
inline constexpr std::uint32_t kShmFlagClose = 1u << 1;

// status values: 0x8n note-off, 0x9n note-on, 0xAn poly pressure, 0xBn control
// change, 0xDn channel pressure, 0xEn pitch bend (n = channel 0..15), or
// kShmStatusNoteExpression below. For a pitch bend data1 is the 14-bit value's
// low 7 bits and data2 its high 7 bits. A note-off carries its release
// velocity in data2.
inline constexpr std::uint8_t kShmStatusNoteExpression = 0xF4u;  // not a MIDI channel status

// data1 of a kShmStatusNoteExpression event: the VST3 note expression type.
inline constexpr std::uint8_t kShmExprTuning = 0;      // value = 0.5 + semitones / 240
inline constexpr std::uint8_t kShmExprVolume = 1;      // value = gain / 4
inline constexpr std::uint8_t kShmExprPan = 2;         // value = (pan + 1) / 2
inline constexpr std::uint8_t kShmExprBrightness = 3;  // value = brightness

inline constexpr std::int32_t kShmNoNoteId = -1;

struct ShmMidiEvent {
    std::int32_t sampleOffset;  // 0 .. numFrames - 1
    std::uint8_t status;        // see above
    std::uint8_t data1;         // pitch / controller number / expression type
    std::uint8_t data2;         // velocity / value
    std::uint8_t reserved;
    std::int32_t noteId;        // note-on, note-off and expression: the note's id; else kShmNoNoteId
    float value;                // expression: the normalized 0..1 value; else 0
};

struct alignas(64) ShmHeader {
    std::uint32_t magic;
    std::uint32_t version;
    std::uint32_t maxFrames;
    std::uint32_t reserved0;

    // Client -> Host
    std::atomic<std::uint64_t> requestSeq;
    double sampleRate;
    std::uint32_t numFrames;
    std::uint32_t numMidiEvents;
    std::uint32_t flags;
    std::uint32_t isInstrument;

    // Host -> Client
    std::atomic<std::uint64_t> responseSeq;
    std::int32_t latencySamples;
    std::uint32_t status;  // 0 = ok, 1 = error, 2 = closed
};

struct alignas(64) ShmBuffer {
    ShmHeader header;
    ShmMidiEvent midi[kShmMaxMidiEvents];
    float inLeft[kShmMaxFrames];
    float inRight[kShmMaxFrames];
    float outLeft[kShmMaxFrames];
    float outRight[kShmMaxFrames];
};

static_assert(std::atomic<std::uint64_t>::is_always_lock_free,
              "64-bit atomics must be lock-free for cross-process shared memory");

}  // namespace vsthost
