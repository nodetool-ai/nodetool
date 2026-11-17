#include "core.h"
#include "audio/PcmRing.h"
#include "platform/SanitizerBuild.h"
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif
#include "playback/AudioClockFeed.h"
#include "miniaudio.h"
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <locale>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#include <avrt.h>
#endif

namespace {
using Clock = std::chrono::steady_clock;
using namespace std::chrono_literals;
using namespace nt::spike;

// Main thread only.
struct Options {
    double seconds = 2;
    unsigned rate = 44100;
    std::string profile = "idle";
    bool nullDevice = true;
    std::string wave;
};
template <typename T>
T number(const std::string& value) {
    T parsed{};
    std::istringstream input(value);
    input.imbue(std::locale::classic());
    input >> std::noskipws >> parsed;
    if (!input || input.peek() != std::char_traits<char>::eof()) {
        throw std::runtime_error("Invalid numeric option");
    }
    return parsed;
}
Options options(int argc, char** argv) {
    Options result;
    for (int index = 1; index < argc; index += 2) {
        if (index + 1 == argc) { throw std::runtime_error("Each option requires a value"); }
        const std::string key = argv[index], value = argv[index + 1];
        if (key == "--seconds") { result.seconds = number<double>(value); }
        else if (key == "--rate") { result.rate = number<unsigned>(value); }
        else if (key == "--profile") { result.profile = value; }
        else if (key == "--wav") { result.wave = value; }
        else if (key == "--device" && (value == "null" || value == "default")) {
            result.nullDevice = value == "null";
        } else { throw std::runtime_error("Unknown option or device"); }
    }
    if (!std::isfinite(result.seconds) || result.seconds < 0.25 || result.seconds > 600 ||
        (result.rate != 44100 && result.rate != 48000) ||
        (result.profile != "idle" && result.profile != "stall" && result.profile != "swap")) {
        throw std::runtime_error("Use 0.25..600 seconds, 44100/48000 Hz and idle/stall/swap profile");
    }
    return result;
}

// Value snapshot handed from device callback to host through a seqlock.
struct ClockPair { std::uint64_t frame = 0; std::int64_t hostNs = 0; };

// Shared by the main owner and joined workers. The PCM ring and mailbox are
// SPSC. Params/applied/clock use bounded seqlock snapshots. Remaining fields
// have one named writer and are read by main only after the device/threads stop.
struct Session {
    explicit Session(const Options& options)
        : ring(65536, 0), kernel(options.rate),
          durations(static_cast<std::size_t>((options.seconds + 3) * options.rate / quantum) + 1),
          recording(static_cast<std::size_t>((options.seconds + 3) * options.rate) * 2) {}
    nt::audio::PcmRing ring;
    AudioKernel kernel; // Audio render thread.
    PlanMailbox plans;
    nt::playback::SeqLock<Param> params; // Prepare writes, audio reads.
    nt::playback::SeqLock<Applied> applied; // Audio writes, host reads.
    nt::playback::SeqLock<ClockPair> clock; // Device callback writes, host reads.
    std::vector<double> durations; // Preallocated. Audio writes.
    std::vector<float> recording; // Preallocated. Device callback writes.
    std::size_t durationCount = 0, recordedFrames = 0;
    std::uint64_t callbackFrames = 0, underruns = 0, missingFrames = 0;
    std::int64_t minimumFill = 65536;
    std::uint64_t swaps = 0, snapshotMisses = 0, allocations = 0;
    std::atomic<bool> failed{false};
    std::atomic<unsigned> stalls{0};
    std::int64_t lead = 1024; // Main sets before starting threads.
    bool priorityGranted = false; // Audio writes once.
};

// Device callback only. The main shared owner outlives ma_device_uninit,
// which waits for callbacks before the borrowed user-data pointer expires.
void callback(ma_device* device, void* destination, const void*, ma_uint32 frames) {
    auto& session = *static_cast<Session*>(device->pUserData);
    auto output = std::span<float>(static_cast<float*>(destination), static_cast<std::size_t>(frames) * 2);
    const auto begin = session.ring.readFloor();
    const auto available = session.ring.readableEnd() - begin;
    const auto count = std::min<std::int64_t>(frames, available);
    session.minimumFill = std::min(session.minimumFill, available);
    std::fill(output.begin(), output.end(), 0.0f);
    for (std::int64_t frame = 0; frame < count; ++frame) {
        session.ring.get(begin + frame, output[static_cast<std::size_t>(frame) * 2],
            output[static_cast<std::size_t>(frame) * 2 + 1]);
    }
    session.ring.release(begin + count);
    if (count != frames) {
        ++session.underruns;
        session.missingFrames += frames - static_cast<std::uint64_t>(count);
    }
    const auto room = session.recording.size() / 2 - session.recordedFrames;
    const auto copied = std::min<std::size_t>(frames, room);
    std::copy_n(output.begin(), copied * 2, session.recording.begin() + session.recordedFrames * 2);
    session.recordedFrames += copied;
    const auto now = std::chrono::duration_cast<std::chrono::nanoseconds>(Clock::now().time_since_epoch()).count();
    session.clock.store(ClockPair{session.callbackFrames, now});
    session.callbackFrames += frames;
}

// Main thread only. miniaudio owns backend resources until this RAII destructor.
class Context {
public:
    explicit Context(bool nullDevice) {
        const ma_backend backend = ma_backend_null;
        if (ma_context_init(nullDevice ? &backend : nullptr, nullDevice ? 1 : 0, nullptr, &value) != MA_SUCCESS) {
            throw std::runtime_error("Cannot initialize miniaudio context");
        }
    }
    ~Context() { ma_context_uninit(&value); }
    Context(const Context&) = delete;
    Context& operator=(const Context&) = delete;
    ma_context value{};
};

// Main thread owns device lifetime. miniaudio alone invokes the callback.
class Device {
public:
    Device(Session& session, const Options& options) : context_(options.nullDevice) {
        auto config = ma_device_config_init(ma_device_type_playback);
        config.playback.format = ma_format_f32;
        config.playback.channels = 2;
        config.sampleRate = options.rate;
        config.periodSizeInFrames = 256;
        config.dataCallback = callback;
        config.pUserData = &session;
        if (ma_device_init(&context_.value, &config, &value_) != MA_SUCCESS) {
            throw std::runtime_error("Cannot open playback device");
        }
    }
    ~Device() { ma_device_uninit(&value_); }
    Device(const Device&) = delete;
    Device& operator=(const Device&) = delete;
    void start() {
        if (ma_device_start(&value_) != MA_SUCCESS) { throw std::runtime_error("Cannot start playback"); }
    }
    void stop() { ma_device_stop(&value_); }
    unsigned period() const { return value_.playback.internalPeriodSizeInFrames; }
    unsigned hardwareRate() const { return value_.playback.internalSampleRate; }
    const char* backendName() const { return ma_get_backend_name(context_.value.backend); }
private:
    Context context_;
    ma_device value_{};
};

#ifdef _WIN32
// Audio thread only. MMCSS enrollment is reverted on the enrolling thread.
struct RevertPriority {
    void operator()(void* task) const { AvRevertMmThreadCharacteristics(task); }
};
// Audio thread only. The timer handle is closed after the render loop exits.
struct CloseTimer {
    void operator()(void* timer) const { CloseHandle(timer); }
};
#endif

// Audio thread only. Initialize once before allocation counting starts.
class ProducerWait {
public:
    bool ready() const {
#ifdef _WIN32
        return timer_ != nullptr;
#else
        return true;
#endif
    }
    bool pause() {
#ifdef _WIN32
        LARGE_INTEGER due;
        due.QuadPart = -1000; // Relative 100 microseconds, in 100 ns units.
        return SetWaitableTimerEx(timer_.get(), &due, 0, nullptr, nullptr, nullptr, 0) &&
            WaitForSingleObject(timer_.get(), INFINITE) == WAIT_OBJECT_0;
#else
        std::this_thread::sleep_for(100us);
        return true;
#endif
    }
private:
#ifdef _WIN32
    std::unique_ptr<void, CloseTimer> timer_{CreateWaitableTimerExW(
        nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)};
#endif
};

void render(std::stop_token stop, const std::weak_ptr<Session>& weak) {
    const auto session = weak.lock();
    if (!session) { return; }
#ifdef _WIN32
    DWORD index = 0;
    std::unique_ptr<void, RevertPriority> priority(AvSetMmThreadCharacteristicsW(L"Pro Audio", &index));
    session->priorityGranted = priority != nullptr;
#endif
    ProducerWait wait;
    if (!wait.ready()) { session->failed.store(true); return; }
    Block output{};
    Param param;
#ifndef NT_SANITIZED
    nt::testing::allocations = 0;
    nt::testing::countAllocations = true;
#endif
    while (!stop.stop_requested()) {
        if (session->ring.writeEnd() - session->ring.readFloor() >= session->lead) {
            if (!wait.pause()) { session->failed.store(true); break; }
            continue;
        }
        const auto started = Clock::now();
        if (session->plans.take()) { ++session->swaps; }
        if (!session->params.tryLoad(param, 64)) { ++session->snapshotMisses; }
        const auto& plan = session->plans.current();
        const auto frame = session->kernel.framesStepped();
        session->applied.store(Applied{param.revision, plan.revision, frame, 1, param.gain});
        session->kernel.render(plan, param, output);
        if (session->durationCount == session->durations.size() ||
            session->ring.write(output.data(), quantum) != quantum) {
            session->failed.store(true);
            break;
        }
        const double micros = std::chrono::duration<double, std::micro>(Clock::now() - started).count();
        session->durations[session->durationCount++] = micros;
    }
#ifndef NT_SANITIZED
    nt::testing::countAllocations = false;
    session->allocations = nt::testing::allocations;
#endif
}

void prepare(std::stop_token stop, const std::weak_ptr<Session>& weak, bool swap) {
    const auto session = weak.lock();
    if (!session) { return; }
    auto next = Clock::now() + 1s;
    std::uint64_t revision = 0;
    while (!stop.stop_requested()) {
        if (Clock::now() >= next) {
            ++revision;
            session->params.store(Param{revision, revision % 2 ? 0.08f : 0.12f});
            if (swap && !session->plans.publish(Plan{revision, revision, revision % 2 ? 0.6f : 1.0f})) {
                session->failed.store(true);
            }
            next += 1s;
        }
        std::this_thread::sleep_for(1ms);
    }
}

void writeWave(const std::string& path, const Session& session, unsigned rate) {
    if (path.empty()) { return; }
    std::ofstream stream(path, std::ios::binary);
    const auto word = [&stream](std::uint32_t value, unsigned bytes) {
        for (unsigned byte = 0; byte < bytes; ++byte) { stream.put(static_cast<char>(value >> (byte * 8))); }
    };
    const auto length = static_cast<std::uint32_t>(session.recordedFrames * 4);
    stream.write("RIFF", 4); word(36 + length, 4); stream.write("WAVEfmt ", 8);
    word(16, 4); word(1, 2); word(2, 2); word(rate, 4); word(rate * 4, 4);
    word(4, 2); word(16, 2); stream.write("data", 4); word(length, 4);
    for (std::size_t index = 0; index < session.recordedFrames * 2; ++index) {
        const float value = std::clamp(session.recording[index], -1.0f, 1.0f);
        word(static_cast<std::uint16_t>(static_cast<std::int16_t>(value * 32767)), 2);
    }
    stream.flush();
    if (!stream) { throw std::runtime_error("Cannot write the callback recording"); }
}
} // namespace

int main(int argc, char** argv) {
    try {
        const auto config = options(argc, argv);
#ifndef NT_SANITIZED
        if (!nt::testing::countsAnAllocation()) { throw std::runtime_error("Allocation counter control failed"); }
#endif
        // Main and workers share lifetime because callbacks borrow this session
        // until device stop, and each worker keeps it alive until its join.
        auto session = std::make_shared<Session>(config);
        Device device(*session, config);
        if (device.hardwareRate() == 0) { throw std::runtime_error("Device sample rate is unknown"); }
        const auto sessionPeriod = static_cast<std::int64_t>(std::ceil(
            static_cast<double>(device.period()) * config.rate / device.hardwareRate()));
        session->lead = std::max<std::int64_t>(sessionPeriod * 2, 8 * quantum);
        if (session->lead + static_cast<std::int64_t>(quantum) >= session->ring.capacity()) {
            throw std::runtime_error("Device period exceeds ring capacity");
        }
        const std::weak_ptr<Session> weak = session;
        std::jthread audio([weak](std::stop_token stop) { render(stop, weak); });
        const auto deadline = Clock::now() + 5s;
        while (session->ring.readableEnd() < session->lead && Clock::now() < deadline && !session->failed.load()) {
            std::this_thread::sleep_for(1ms);
        }
        if (session->ring.readableEnd() < session->lead) { throw std::runtime_error("Audio prefill failed"); }
        std::jthread producer([weak, swap = config.profile == "swap"](std::stop_token stop) { prepare(stop, weak, swap); });
        std::jthread worker([weak, stall = config.profile == "stall"](std::stop_token stop) {
            const auto owned = weak.lock();
            if (!owned) { return; }
            auto next = Clock::now() + 5s;
            while (!stop.stop_requested()) {
                if (stall && Clock::now() >= next) {
                    std::this_thread::sleep_for(500ms);
                    owned->stalls.fetch_add(1);
                    next += 5s;
                }
                std::this_thread::sleep_for(1ms);
            }
        });
        device.start();
        std::this_thread::sleep_for(std::chrono::duration<double>(config.seconds));
        device.stop();
        worker.request_stop(); producer.request_stop(); audio.request_stop();
        worker.join(); producer.join(); audio.join();
        if (session->failed.load() || session->durationCount == 0 || session->allocations != 0 ||
            session->recordedFrames == 0 ||
            (config.profile == "swap" && config.seconds >= 1.25 && session->swaps == 0) ||
            (config.profile == "stall" && config.seconds >= 5.75 && session->stalls.load() == 0) ||
            !std::all_of(session->recording.begin(), session->recording.begin() + session->recordedFrames * 2,
                [](float sample) { return std::isfinite(sample); })) {
            throw std::runtime_error("Audio invariant or allocation check failed");
        }
        writeWave(config.wave, *session, config.rate);
        session->durations.resize(session->durationCount);
        double sum = 0;
        std::size_t overBudget = 0, run = 0, longest = 0;
        for (const double value : session->durations) {
            sum += value;
            if (value > 2900) { ++overBudget; ++run; longest = std::max(longest, run); }
            else { run = 0; }
        }
        std::sort(session->durations.begin(), session->durations.end());
        const double mean = sum / session->durationCount;
        double variance = 0;
        for (const double value : session->durations) { variance += (value - mean) * (value - mean); }
        const auto applied = session->applied.load();
        std::cout << "{\"qualification\":false,\"backend\":\"" << device.backendName()
            << "\",\"profile\":\"" << config.profile << "\",\"seconds\":" << config.seconds
            << ",\"session_rate\":" << config.rate << ",\"device_rate\":" << device.hardwareRate()
            << ",\"device_period\":" << device.period() << ",\"ring_lead\":" << session->lead
            << ",\"session_period\":" << sessionPeriod
            << ",\"quanta\":" << session->durationCount << ",\"mean_us\":" << sum / session->durationCount
            << ",\"stddev_us\":" << std::sqrt(variance / session->durationCount)
            << ",\"worst_us\":" << session->durations.back()
            << ",\"p999_us\":" << session->durations[std::min(session->durationCount - 1, static_cast<std::size_t>(std::ceil(session->durationCount * 0.999)) - 1)]
            << ",\"over_2900_us\":" << overBudget << ",\"longest_over_budget_run\":" << longest
            << ",\"underruns\":" << session->underruns << ",\"missing_frames\":" << session->missingFrames
            << ",\"minimum_ring_fill\":" << session->minimumFill
#ifdef NT_SANITIZED
            << ",\"render_new_allocations\":null,\"allocation_audit\":\"separate_unsanitized_run_required\""
#else
            << ",\"render_new_allocations\":" << session->allocations << ",\"allocation_audit\":\"cpp_new\""
#endif
            << ",\"plan_swaps\":" << session->swaps << ",\"worker_stalls\":" << session->stalls.load()
            << ",\"snapshot_misses\":" << session->snapshotMisses << ",\"applied_revision\":" << applied.revision
            << ",\"applied_stream_frame\":" << applied.streamFrame
            << ",\"priority_granted\":" << (session->priorityGranted ? "true" : "false")
            << ",\"macos_policy_and_workgroup\":\"not_implemented\"}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
