// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#include "midi/modal/ModalSynth.h"
#include "midi/modal/ModalPresets.h"

#include "audio/vst/VstAudioStages.h"

#include <QJsonObject>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <numbers>

namespace nt::midi {
namespace {

constexpr double kTwoPi = 2.0 * std::numbers::pi;
constexpr std::size_t kMaxSmoothChunkFrames = 512;
constexpr double kStructuralSwapFadeMs = 5.0;

inline double dbToLinear(double db) noexcept {
    return std::pow(10.0, std::clamp(db, -24.0, 24.0) / 20.0);
}

inline double clampFinite(double v, double lo, double hi, double fallback) noexcept {
    return std::isfinite(v) ? std::clamp(v, lo, hi) : fallback;
}

inline bool advanceSmootherBy(audio::ParameterSmoother& sm, std::size_t steps) noexcept {
    if (!sm.smoothing()) return false;
    for (std::size_t i = 0; i < steps && sm.smoothing(); ++i) {
        (void)sm.next();
    }
    return true;
}

}  // namespace

// ---------- ModalSynth ----------

ModalSynth::ModalSynth()
    : snapshots_{{std::make_unique<modal::ModalTableSnapshot>(),
                  std::make_unique<modal::ModalTableSnapshot>(),
                  std::make_unique<modal::ModalTableSnapshot>()}},
      ratioTables_(std::make_unique<modal::ModalRatioTables>()),
      voices_(std::make_unique<VoiceBank>()),
      swapOutVoices_(std::make_unique<VoiceBank>()) {}

ModalSynth::~ModalSynth() {
    stopTableWorker();
}

void ModalSynth::buildTableSnapshot(const ModalSynthParams& p, modal::ModalTableSnapshot& out,
                                    bool computeSerialAllNotes,
                                    const modal::ModalLookupTable* sinLut) noexcept {
    out.models.recalcBeam(true, p.a.ratio);
    out.models.recalcMembrane(true, p.a.ratio);
    out.models.recalcPlate(true, p.a.ratio);
    out.models.recalcBeam(false, p.b.ratio);
    out.models.recalcMembrane(false, p.b.ratio);
    out.models.recalcPlate(false, p.b.ratio);

    out.aModel = p.a.model;
    out.bModel = p.b.model;
    out.aPartials = modal::sanitizePartialCount(p.a.partials);
    out.bPartials = modal::sanitizePartialCount(p.b.partials);
    out.coupling = p.coupling;
    out.aOn = p.a.on;
    out.bOn = p.b.on;
    out.aRatio = p.a.ratio;
    out.bRatio = p.b.ratio;
    out.aPitchFactor = std::pow(2.0, (static_cast<double>(p.a.coarse) + static_cast<double>(p.a.fine) / 100.0) / 12.0);
    out.bPitchFactor = std::pow(2.0, (static_cast<double>(p.b.coarse) + static_cast<double>(p.b.fine) / 100.0) / 12.0);
    out.split = std::clamp(static_cast<double>(p.abSplit), 0.01, 1.0) * 100.0;

    // Always precompute serial shift tables when requested off-thread so live switches
    // from Parallel / B-disabled to Serial have exact matching tables immediately.
    if (computeSerialAllNotes) {
        const auto& baseA = out.models.ratios(true, p.a.model);
        const auto& baseB = out.models.ratios(false, p.b.model);
        for (int midiNote = 0; midiNote < 128; ++midiNote) {
            const double freq = modal::ModalVoice::noteToFreq(midiNote);
            std::array<double, modal::kMaxPartials> aRatios = baseA;
            std::array<double, modal::kMaxPartials> bRatios = baseB;
            if (p.a.model == modal::ModalModel::Djembe) {
                out.models.calcDjembe(freq, p.a.ratio, aRatios);
            }
            if (p.b.model == modal::ModalModel::Djembe) {
                out.models.calcDjembe(freq, p.b.ratio, bRatios);
            }
            if (out.aPitchFactor != 1.0) {
                for (double& r : aRatios) r *= out.aPitchFactor;
            }
            if (out.bPitchFactor != 1.0) {
                for (double& r : bRatios) r *= out.bPitchFactor;
            }
            const auto idx = static_cast<std::size_t>(midiNote);
            std::array<std::array<float, modal::kMaxPartials>, modal::kSerialSplitKnots> deltaA{};
            std::array<std::array<float, modal::kMaxPartials>, modal::kSerialSplitKnots> deltaB{};
            modal::ModalVoice::computeSerialShiftsMultiSplit(
                freq, out.split, aRatios, bRatios, out.serialA[idx], out.serialB[idx], deltaA, deltaB, sinLut);
            for (std::size_t k = 0; k < modal::kSerialSplitKnots; ++k) {
                out.serialDeltaA[k][idx] = deltaA[k];
                out.serialDeltaB[k][idx] = deltaB[k];
            }
        }
        out.serialShiftsValid = true;
        out.serialDeltasValid = true;
    } else {
        out.serialShiftsValid = false;
        out.serialDeltasValid = false;
    }
}

void ModalSynth::publishSnapshotLocked(const ModalSynthParams& params, bool fromLiveRequest,
                                       std::uint64_t requestSeq) noexcept {
    auto& slot = *snapshots_[static_cast<std::size_t>(publishWriteIdx_)];
    buildTableSnapshot(params, slot, true, sinLut_.initialized() ? &sinLut_ : nullptr);
    slot.generation = ++publishNextGen_;
    slot.fromLiveRequest = fromLiveRequest;
    slot.requestSeq = requestSeq;

    // Atomically exchange our newly written slot into the shared staging slot with
    // kTripleDirtyBit set, acquiring ownership of the previous staging slot.
    const std::uint32_t prev = sharedSnapshotSlot_.exchange(
        static_cast<std::uint32_t>(publishWriteIdx_) | kTripleDirtyBit,
        std::memory_order_acq_rel);
    publishWriteIdx_ = static_cast<int>(prev & kTripleSlotMask);
}

void ModalSynth::publishTablesOffThread(const ModalSynthParams& params) noexcept {
    std::lock_guard<std::mutex> lk(publishMutex_);
    publishSnapshotLocked(params, false, 0);
}

const modal::ModalTableSnapshot& ModalSynth::acquireRenderSnapshot() noexcept {
    const std::uint32_t cur = sharedSnapshotSlot_.load(std::memory_order_acquire);
    if ((cur & kTripleDirtyBit) != 0u) {
        // Exchange our consumer slot into shared (clean) and take exclusive ownership of the published slot.
        const std::uint32_t prev = sharedSnapshotSlot_.exchange(
            static_cast<std::uint32_t>(renderSnapshotIdx_),
            std::memory_order_acq_rel);
        renderSnapshotIdx_ = static_cast<int>(prev & kTripleSlotMask);
    }
    return *snapshots_[static_cast<std::size_t>(renderSnapshotIdx_)];
}

void ModalSynth::enqueueTableRequest() noexcept {
    if (!prepared_) return;
    auto& req = reqSlots_[static_cast<std::size_t>(reqWriteIdx_)];
    req.aModel = params_.a.model;
    req.bModel = params_.b.model;
    req.aPartials = params_.a.partials;
    req.bPartials = params_.b.partials;
    req.aOn = params_.a.on;
    req.bOn = params_.b.on;
    req.coupling = params_.coupling;
    req.aRatio = params_.a.ratio;
    req.bRatio = params_.b.ratio;
    req.aCoarse = params_.a.coarse;
    req.aFine = params_.a.fine;
    req.bCoarse = params_.b.coarse;
    req.bFine = params_.b.fine;
    req.abSplit = params_.abSplit;
    req.seq = ++reqNextSeq_;
    submittedRequestSeq_.store(req.seq, std::memory_order_release);

    const std::uint32_t prev = reqSharedSlot_.exchange(
        static_cast<std::uint32_t>(reqWriteIdx_) | kTripleDirtyBit,
        std::memory_order_acq_rel);
    reqWriteIdx_ = static_cast<int>(prev & kTripleSlotMask);
}

void ModalSynth::startTableWorker() noexcept {
    if (workerThread_.joinable()) return;
    stopWorker_.store(false, std::memory_order_release);
    workerThread_ = std::thread(&ModalSynth::tableWorkerLoop, this);
}

void ModalSynth::stopTableWorker() noexcept {
    if (!workerThread_.joinable()) return;
    {
        std::lock_guard<std::mutex> lk(shutdownMutex_);
        stopWorker_.store(true, std::memory_order_release);
    }
    shutdownCv_.notify_one();
    workerThread_.join();
    {
        std::lock_guard<std::mutex> lk(workerNotifyMutex_);
        stopWorker_.store(false, std::memory_order_release);
    }
    workerDoneCv_.notify_all();
}

void ModalSynth::tableWorkerLoop() noexcept {
    while (!stopWorker_.load(std::memory_order_acquire)) {
        const std::uint32_t cur = reqSharedSlot_.load(std::memory_order_acquire);
        if ((cur & kTripleDirtyBit) != 0u) {
            const std::uint32_t prev = reqSharedSlot_.exchange(
                static_cast<std::uint32_t>(reqReadIdx_),
                std::memory_order_acq_rel);
            reqReadIdx_ = static_cast<int>(prev & kTripleSlotMask);
            const TableRequest& req = reqSlots_[static_cast<std::size_t>(reqReadIdx_)];

            ModalSynthParams p{};
            p.a.model = req.aModel;
            p.b.model = req.bModel;
            p.a.partials = req.aPartials;
            p.b.partials = req.bPartials;
            p.a.on = req.aOn;
            p.b.on = req.bOn;
            p.coupling = req.coupling;
            p.a.ratio = req.aRatio;
            p.b.ratio = req.bRatio;
            p.a.coarse = req.aCoarse;
            p.a.fine = req.aFine;
            p.b.coarse = req.bCoarse;
            p.b.fine = req.bFine;
            p.abSplit = req.abSplit;

            {
                std::lock_guard<std::mutex> lk(publishMutex_);
                publishSnapshotLocked(p, true, req.seq);
            }
            {
                std::lock_guard<std::mutex> lk(workerNotifyMutex_);
                publishedRequestSeq_.store(req.seq, std::memory_order_release);
            }
            workerDoneCv_.notify_all();
            continue;
        }

        std::unique_lock<std::mutex> lk(shutdownMutex_);
        shutdownCv_.wait_for(lk, std::chrono::microseconds(500), [this]() noexcept {
            return stopWorker_.load(std::memory_order_acquire);
        });
    }
}

bool ModalSynth::waitForPublishedTables(int timeoutMs) noexcept {
    const std::uint64_t target = submittedRequestSeq_.load(std::memory_order_acquire);
    if (publishedRequestSeq_.load(std::memory_order_acquire) >= target) {
        return true;
    }
    std::unique_lock<std::mutex> lk(workerNotifyMutex_);
    return workerDoneCv_.wait_for(
               lk, std::chrono::milliseconds(std::max(1, timeoutMs)),
               [this, target]() noexcept {
                   return publishedRequestSeq_.load(std::memory_order_acquire) >= target ||
                          stopWorker_.load(std::memory_order_acquire);
               }) &&
           publishedRequestSeq_.load(std::memory_order_acquire) >= target;
}

void ModalSynth::prepare(double sampleRate) noexcept {
    stopTableWorker();

    sampleRate_ = (std::isfinite(sampleRate) && sampleRate > 0.0) ? sampleRate : 48000.0;
    totalSamplesBend_ = std::max(1, static_cast<int>(modal::kBendGlideMs * 0.001 * sampleRate_));
    structSwapTotalSamples_ = std::clamp(
        static_cast<int>(std::llround(kStructuralSwapFadeMs * 0.001 * sampleRate_)), 16, 1024);

    // Precompute per-instance lookup tables off the audio thread (zero global state).
    const double sr = sampleRate_;
    a1Lut_.init([sr](double f) { return -2.0 * std::cos(kTwoPi * f / sr); }, 1.0, 20000.0);
    sinLut_.init([](double norm) { return std::sin(kTwoPi * norm); }, 0.0, 1.0);
    if (!ratioTables_->initialized()) {
        ratioTables_->init();
    }

    comb_.init(sampleRate_);
    limiter_.init(sampleRate_);

    gainLinSm_.prepare(sampleRate_);
    abMixSm_.prepare(sampleRate_);
    malletMixSm_.prepare(sampleRate_);
    malletResSm_.prepare(sampleRate_);
    noiseMixNormSm_.prepare(sampleRate_);
    noiseResNormSm_.prepare(sampleRate_);
    noiseOscSm_.prepare(sampleRate_);

    aDecaySm_.prepare(sampleRate_);
    aDampSm_.prepare(sampleRate_);
    aToneSm_.prepare(sampleRate_);
    aHitSm_.prepare(sampleRate_);
    aInharmSm_.prepare(sampleRate_);
    aRatioSm_.prepare(sampleRate_);
    aCutSm_.prepare(sampleRate_);
    aRadiusSm_.prepare(sampleRate_);
    aCoarseSm_.prepare(sampleRate_);
    aFineSm_.prepare(sampleRate_);

    bDecaySm_.prepare(sampleRate_);
    bDampSm_.prepare(sampleRate_);
    bToneSm_.prepare(sampleRate_);
    bHitSm_.prepare(sampleRate_);
    bInharmSm_.prepare(sampleRate_);
    bRatioSm_.prepare(sampleRate_);
    bCutSm_.prepare(sampleRate_);
    bRadiusSm_.prepare(sampleRate_);
    bCoarseSm_.prepare(sampleRate_);
    bFineSm_.prepare(sampleRate_);

    abSplitSm_.prepare(sampleRate_);

    // Reset live request triple buffer before starting worker.
    reqWriteIdx_ = 1;
    reqReadIdx_ = 0;
    reqNextSeq_ = 0;
    reqSharedSlot_.store(2u, std::memory_order_relaxed);
    submittedRequestSeq_.store(0, std::memory_order_relaxed);
    publishedRequestSeq_.store(0, std::memory_order_relaxed);

    prepared_ = true;
    lastAModel_ = params_.a.model;
    lastBModel_ = params_.b.model;
    lastAPartials_ = modal::sanitizePartialCount(params_.a.partials);
    lastBPartials_ = modal::sanitizePartialCount(params_.b.partials);
    lastAOn_ = params_.a.on;
    lastBOn_ = params_.b.on;
    lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);

    publishTablesOffThread(params_);
    const auto& snap = acquireRenderSnapshot();
    appliedSnapshotGen_ = snap.generation;
    reset();
    snapParams();
    startTableWorker();
}

void ModalSynth::updateSmoothingTargets() noexcept {
    gainLinSm_.setTarget(dbToLinear(params_.gainDb));
    abMixSm_.setTarget(std::clamp(static_cast<double>(params_.abMix), 0.0, 1.0));
    malletMixSm_.setTarget(std::clamp(static_cast<double>(params_.malletMix), 0.0, 1.0));
    malletResSm_.setTarget(std::clamp(static_cast<double>(params_.malletRes), 0.0, 1.0));
    noiseMixNormSm_.setTarget(modal::skewToNorm(params_.noiseMix));
    noiseResNormSm_.setTarget(modal::skewToNorm(params_.noiseRes));
    noiseOscSm_.setTarget(std::clamp(static_cast<double>(params_.noiseOsc), 0.0, 1.0));

    aDecaySm_.setTarget(std::clamp(static_cast<double>(params_.a.decay), 0.01, 100.0));
    aDampSm_.setTarget(std::clamp(static_cast<double>(params_.a.damp), -1.0, 1.0));
    aToneSm_.setTarget(std::clamp(static_cast<double>(params_.a.tone), -1.0, 1.0));
    aHitSm_.setTarget(std::clamp(static_cast<double>(params_.a.hit), 0.02, 0.5));
    aInharmSm_.setTarget(std::clamp(static_cast<double>(params_.a.inharm), 0.0, 1.0));
    aRatioSm_.setTarget(std::clamp(static_cast<double>(params_.a.ratio), 0.1, 10.0));
    aCutSm_.setTarget(std::clamp(static_cast<double>(params_.a.cut), -1.0, 1.0));
    aRadiusSm_.setTarget(std::clamp(static_cast<double>(params_.a.radius), 0.0, 1.0));
    aCoarseSm_.setTarget(std::clamp(static_cast<double>(params_.a.coarse), -48.0, 48.0));
    aFineSm_.setTarget(std::clamp(static_cast<double>(params_.a.fine), -99.0, 99.0));

    bDecaySm_.setTarget(std::clamp(static_cast<double>(params_.b.decay), 0.01, 100.0));
    bDampSm_.setTarget(std::clamp(static_cast<double>(params_.b.damp), -1.0, 1.0));
    bToneSm_.setTarget(std::clamp(static_cast<double>(params_.b.tone), -1.0, 1.0));
    bHitSm_.setTarget(std::clamp(static_cast<double>(params_.b.hit), 0.02, 0.5));
    bInharmSm_.setTarget(std::clamp(static_cast<double>(params_.b.inharm), 0.0, 1.0));
    bRatioSm_.setTarget(std::clamp(static_cast<double>(params_.b.ratio), 0.1, 10.0));
    bCutSm_.setTarget(std::clamp(static_cast<double>(params_.b.cut), -1.0, 1.0));
    bRadiusSm_.setTarget(std::clamp(static_cast<double>(params_.b.radius), 0.0, 1.0));
    bCoarseSm_.setTarget(std::clamp(static_cast<double>(params_.b.coarse), -48.0, 48.0));
    bFineSm_.setTarget(std::clamp(static_cast<double>(params_.b.fine), -99.0, 99.0));

    abSplitSm_.setTarget(std::clamp(static_cast<double>(params_.abSplit), 0.01, 1.0));
}

void ModalSynth::snapParams() noexcept {
    gainLinSm_.snap(dbToLinear(params_.gainDb));
    abMixSm_.snap(std::clamp(static_cast<double>(params_.abMix), 0.0, 1.0));
    malletMixSm_.snap(std::clamp(static_cast<double>(params_.malletMix), 0.0, 1.0));
    malletResSm_.snap(std::clamp(static_cast<double>(params_.malletRes), 0.0, 1.0));
    noiseMixNormSm_.snap(modal::skewToNorm(params_.noiseMix));
    noiseResNormSm_.snap(modal::skewToNorm(params_.noiseRes));
    noiseOscSm_.snap(std::clamp(static_cast<double>(params_.noiseOsc), 0.0, 1.0));

    aDecaySm_.snap(std::clamp(static_cast<double>(params_.a.decay), 0.01, 100.0));
    aDampSm_.snap(std::clamp(static_cast<double>(params_.a.damp), -1.0, 1.0));
    aToneSm_.snap(std::clamp(static_cast<double>(params_.a.tone), -1.0, 1.0));
    aHitSm_.snap(std::clamp(static_cast<double>(params_.a.hit), 0.02, 0.5));
    aInharmSm_.snap(std::clamp(static_cast<double>(params_.a.inharm), 0.0, 1.0));
    aRatioSm_.snap(std::clamp(static_cast<double>(params_.a.ratio), 0.1, 10.0));
    aCutSm_.snap(std::clamp(static_cast<double>(params_.a.cut), -1.0, 1.0));
    aRadiusSm_.snap(std::clamp(static_cast<double>(params_.a.radius), 0.0, 1.0));
    aCoarseSm_.snap(std::clamp(static_cast<double>(params_.a.coarse), -48.0, 48.0));
    aFineSm_.snap(std::clamp(static_cast<double>(params_.a.fine), -99.0, 99.0));

    bDecaySm_.snap(std::clamp(static_cast<double>(params_.b.decay), 0.01, 100.0));
    bDampSm_.snap(std::clamp(static_cast<double>(params_.b.damp), -1.0, 1.0));
    bToneSm_.snap(std::clamp(static_cast<double>(params_.b.tone), -1.0, 1.0));
    bHitSm_.snap(std::clamp(static_cast<double>(params_.b.hit), 0.02, 0.5));
    bInharmSm_.snap(std::clamp(static_cast<double>(params_.b.inharm), 0.0, 1.0));
    bRatioSm_.snap(std::clamp(static_cast<double>(params_.b.ratio), 0.1, 10.0));
    bCutSm_.snap(std::clamp(static_cast<double>(params_.b.cut), -1.0, 1.0));
    bRadiusSm_.snap(std::clamp(static_cast<double>(params_.b.radius), 0.0, 1.0));
    bCoarseSm_.snap(std::clamp(static_cast<double>(params_.b.coarse), -48.0, 48.0));
    bFineSm_.snap(std::clamp(static_cast<double>(params_.b.fine), -99.0, 99.0));

    abSplitSm_.snap(std::clamp(static_cast<double>(params_.abSplit), 0.01, 1.0));

    finishStructuralSwap();
    pendingStructuralSwap_ = false;
    pendingSnapARatio_ = false;
    pendingSnapBRatio_ = false;
    pendingResonatorSync_ = false;
    pendingRatioSync_ = false;
    lastAModel_ = params_.a.model;
    lastBModel_ = params_.b.model;
    lastAPartials_ = modal::sanitizePartialCount(params_.a.partials);
    lastBPartials_ = modal::sanitizePartialCount(params_.b.partials);
    lastAOn_ = params_.a.on;
    lastBOn_ = params_.b.on;
    lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);

    if (prepared_) {
        const auto& curSnap = acquireRenderSnapshot();
        const double curAPitch = std::pow(2.0, (static_cast<double>(params_.a.coarse) + static_cast<double>(params_.a.fine) / 100.0) / 12.0);
        const double curBPitch = std::pow(2.0, (static_cast<double>(params_.b.coarse) + static_cast<double>(params_.b.fine) / 100.0) / 12.0);
        const double curSplit = std::clamp(static_cast<double>(params_.abSplit), 0.01, 1.0) * 100.0;
        const bool snapMatches =
            curSnap.serialShiftsValid &&
            curSnap.aModel == params_.a.model && curSnap.bModel == params_.b.model &&
            std::abs(curSnap.aRatio - static_cast<double>(params_.a.ratio)) <= 1e-7 &&
            std::abs(curSnap.bRatio - static_cast<double>(params_.b.ratio)) <= 1e-7 &&
            std::abs(curSnap.aPitchFactor - curAPitch) <= 1e-9 &&
            std::abs(curSnap.bPitchFactor - curBPitch) <= 1e-9 &&
            std::abs(curSnap.split - curSplit) <= 1e-6;
        if (!snapMatches) {
            publishTablesOffThread(params_);
        }
    }
    const auto& snap = acquireRenderSnapshot();
    appliedSnapshotGen_ = snap.generation;

    applyNoiseParamsToBank(*voices_);
    applyResonatorParamsToBank(*voices_, false, true, lastAModel_, lastBModel_, lastAPartials_, lastBPartials_, snap);
}

void ModalSynth::applyNoiseParamsToBank(VoiceBank& bank) noexcept {
    for (auto& voice : bank) {
        voice.noise.init(
            sampleRate_, params_.noiseFilterMode, params_.noiseFilterFreq, params_.noiseFilterQ,
            params_.noiseAttackMs, params_.noiseDecayMs, params_.noiseSustain, params_.noiseReleaseMs,
            params_.velNoiseFreq, params_.velNoiseQ,
            params_.noiseAttackTension, params_.noiseDecayTension, params_.noiseReleaseTension,
            params_.velNoiseAttack, params_.velNoiseDecay, params_.velNoiseSustain, params_.velNoiseRelease);
    }
}

void ModalSynth::applyResonatorParamsToBank(VoiceBank& bank, bool clearVoices, bool recomputeRatios,
                                            modal::ModalModel aModel, modal::ModalModel bModel,
                                            int aPartials, int bPartials,
                                            const modal::ModalTableSnapshot& snap) noexcept {
    if (clearVoices) {
        for (auto& voice : bank) voice.clear();
    }

    const double split = abSplitSm_.current() * 100.0;
    const modal::ModalLookupTable* a1Ptr = a1Lut_.initialized() ? &a1Lut_ : nullptr;
    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;

    for (auto& voice : bank) {
        voice.setPitch(aCoarseSm_.current(), bCoarseSm_.current(), aFineSm_.current(), bFineSm_.current(), curBend_);
        voice.setRatio(aRatioSm_.current(), bRatioSm_.current());
        voice.resA.setParams(
            sampleRate_, params_.a.on, aModel, aPartials,
            aDecaySm_.current(), aDampSm_.current(), aToneSm_.current(), aHitSm_.current(),
            params_.a.release, aInharmSm_.current(), aCutSm_.current(), aRadiusSm_.current(),
            params_.a.velDecay, params_.a.velHit, params_.a.velInharm, params_.a.velDamp, params_.a.velTone);
        voice.resB.setParams(
            sampleRate_, params_.b.on, bModel, bPartials,
            bDecaySm_.current(), bDampSm_.current(), bToneSm_.current(), bHitSm_.current(),
            params_.b.release, bInharmSm_.current(), bCutSm_.current(), bRadiusSm_.current(),
            params_.b.velDecay, params_.b.velHit, params_.b.velInharm, params_.b.velDamp, params_.b.velTone);
        voice.setCoupling(params_.coupling, split);
        if (recomputeRatios) {
            voice.markRatiosDirty();
        }
        if (voice.isSounding()) {
            if (voice.resA.on && !voice.resA.active) voice.resA.activate();
            if (voice.resB.on && !voice.resB.active) voice.resB.activate();
            voice.updateResonators(snap, recomputeRatios, a1Ptr, ratioPtr);
        }
    }
}

void ModalSynth::finishStructuralSwap() noexcept {
    if (structSwapFading_) {
        harvestVoiceDiagnostics();
        for (auto& v : *swapOutVoices_) v.clear();
        for (auto& v : *voices_) v.fadeInWithSwap = false;
    }
    structSwapFading_ = false;
    structSwapSamples_ = 0;
    swapOutStartGain_ = 1.0;
}

bool ModalSynth::hasNonFadeInSoundingVoice() const noexcept {
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    for (int i = 0; i < poly; ++i) {
        const auto& v = (*voices_)[static_cast<std::size_t>(i)];
        if (v.isSounding() && !v.fadeInWithSwap) return true;
    }
    return false;
}

void ModalSynth::populateIncomingSwapVoices(const modal::ModalTableSnapshot& snap) noexcept {
    applyNoiseParamsToBank(*voices_);
    applyResonatorParamsToBank(*voices_, true, true, lastAModel_, lastBModel_, lastAPartials_, lastBPartials_, snap);

    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    for (int i = 0; i < poly; ++i) {
        const auto& oldV = (*swapOutVoices_)[static_cast<std::size_t>(i)];
        if (!oldV.isPressed) continue;

        const int heldNote = oldV.isFading ? oldV.newNote : oldV.note;
        if (heldNote < 0) continue;
        const double heldVel = oldV.isFading ? oldV.newVel : oldV.vel;
        const auto& heldClipEnv = oldV.isFading ? oldV.newClipEnv : oldV.clipEnv;
        const std::uint64_t heldNoteId = oldV.isFading ? oldV.newNoteId : oldV.noteId;

        auto& newV = (*voices_)[static_cast<std::size_t>(i)];
        newV.pitchBend = curBend_;
        newV.trigger(oldV.pressedTs, sampleRate_, heldNote, heldVel, oldV.malletFreq,
                     true, heldClipEnv, heldNoteId, snap, ratioPtr);
        newV.sustainedReleasePending = oldV.sustainedReleasePending;
        newV.fadeInWithSwap = true;
    }
}

void ModalSynth::beginStructuralSwap(bool snapARatio, bool snapBRatio,
                                     const modal::ModalTableSnapshot& snap) noexcept {
    if (!prepared_) return;
    const int aPartials = modal::sanitizePartialCount(params_.a.partials);
    const int bPartials = modal::sanitizePartialCount(params_.b.partials);

    if (structSwapFading_) {
        // If zero frames of the first fade have rendered AND no new note has entered the
        // incoming bank at full gain, coalesce directly into the incoming bank while leaving
        // the original outgoing bank untouched at full gain (1.0).
        if (structSwapSamples_ == structSwapTotalSamples_ && !hasNonFadeInSoundingVoice()) {
            if (snapARatio) aRatioSm_.snap(std::clamp(static_cast<double>(params_.a.ratio), 0.1, 10.0));
            if (snapBRatio) bRatioSm_.snap(std::clamp(static_cast<double>(params_.b.ratio), 0.1, 10.0));
            lastAModel_ = params_.a.model;
            lastBModel_ = params_.b.model;
            lastAPartials_ = aPartials;
            lastBPartials_ = bPartials;
            lastAOn_ = params_.a.on;
            lastBOn_ = params_.b.on;
            lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);
            pendingStructuralSwap_ = false;
            pendingSnapARatio_ = false;
            pendingSnapBRatio_ = false;
            populateIncomingSwapVoices(snap);
            return;
        }
        // Otherwise defer and coalesce until the current 5 ms crossfade completes so neither
        // the still-audible outgoing bank nor any newly triggered full-gain note is dropped.
        pendingStructuralSwap_ = true;
        pendingSnapARatio_ = pendingSnapARatio_ || snapARatio;
        pendingSnapBRatio_ = pendingSnapBRatio_ || snapBRatio;
        return;
    }

    if (snapARatio) aRatioSm_.snap(std::clamp(static_cast<double>(params_.a.ratio), 0.1, 10.0));
    if (snapBRatio) bRatioSm_.snap(std::clamp(static_cast<double>(params_.b.ratio), 0.1, 10.0));

    if (!hasSoundingVoices()) {
        lastAModel_ = params_.a.model;
        lastBModel_ = params_.b.model;
        lastAPartials_ = aPartials;
        lastBPartials_ = bPartials;
        lastAOn_ = params_.a.on;
        lastBOn_ = params_.b.on;
        lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);
        appliedSnapshotGen_ = snap.generation;
        applyNoiseParamsToBank(*voices_);
        applyResonatorParamsToBank(*voices_, false, true, lastAModel_, lastBModel_, lastAPartials_, lastBPartials_, snap);
        return;
    }

    // Swap active voices into the outgoing bank in O(1) with zero heap allocations.
    swapOutAOn_ = lastAOn_;
    swapOutBOn_ = lastBOn_;
    swapOutSerial_ = lastSerial_;
    swapOutStartGain_ = 1.0;
    std::swap(voices_, swapOutVoices_);

    lastAModel_ = params_.a.model;
    lastBModel_ = params_.b.model;
    lastAPartials_ = aPartials;
    lastBPartials_ = bPartials;
    lastAOn_ = params_.a.on;
    lastBOn_ = params_.b.on;
    lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);
    appliedSnapshotGen_ = snap.generation;

    populateIncomingSwapVoices(snap);

    structSwapFading_ = true;
    structSwapSamples_ = structSwapTotalSamples_;
}

void ModalSynth::startDeferredStructuralSwapIfPending(const modal::ModalTableSnapshot& snap) noexcept {
    if (!pendingStructuralSwap_) return;
    const bool snapA = pendingSnapARatio_;
    const bool snapB = pendingSnapBRatio_;
    pendingStructuralSwap_ = false;
    pendingSnapARatio_ = false;
    pendingSnapBRatio_ = false;

    const int targetAPartials = modal::sanitizePartialCount(params_.a.partials);
    const int targetBPartials = modal::sanitizePartialCount(params_.b.partials);
    const bool stillChanged =
        params_.a.model != lastAModel_ || params_.b.model != lastBModel_ ||
        targetAPartials != lastAPartials_ || targetBPartials != lastBPartials_;
    if (stillChanged) {
        beginStructuralSwap(snapA, snapB, snap);
    } else {
        if (snapA) aRatioSm_.setTarget(std::clamp(static_cast<double>(params_.a.ratio), 0.1, 10.0));
        if (snapB) bRatioSm_.setTarget(std::clamp(static_cast<double>(params_.b.ratio), 0.1, 10.0));
        pendingRatioSync_ = true;
    }
}

void ModalSynth::applyAllParamsToVoices(bool allowCrossfadeOnStructuralChange,
                                        const modal::ModalTableSnapshot& snap) noexcept {
    const int aPartials = modal::sanitizePartialCount(params_.a.partials);
    const int bPartials = modal::sanitizePartialCount(params_.b.partials);
    const bool aModelChanged = params_.a.model != lastAModel_;
    const bool bModelChanged = params_.b.model != lastBModel_;
    const bool structuralChanged =
        aModelChanged || bModelChanged ||
        aPartials != lastAPartials_ || bPartials != lastBPartials_;

    if (structuralChanged) {
        if (allowCrossfadeOnStructuralChange) {
            beginStructuralSwap(aModelChanged, bModelChanged, snap);
            return;
        }
        lastAModel_ = params_.a.model;
        lastBModel_ = params_.b.model;
        lastAPartials_ = aPartials;
        lastBPartials_ = bPartials;
        applyNoiseParamsToBank(*voices_);
        applyResonatorParamsToBank(*voices_, false, true, lastAModel_, lastBModel_, lastAPartials_, lastBPartials_, snap);
        return;
    }

    applyNoiseParamsToBank(*voices_);
    lastAOn_ = params_.a.on;
    lastBOn_ = params_.b.on;
    lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);
    applyResonatorParamsToBank(*voices_, false, true, lastAModel_, lastBModel_, lastAPartials_, lastBPartials_, snap);
}

void ModalSynth::syncResonatorSmoothersToVoices(bool recomputeRatios,
                                                const modal::ModalTableSnapshot& snap) noexcept {
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    const int aPartials = lastAPartials_;
    const int bPartials = lastBPartials_;
    const double split = abSplitSm_.current() * 100.0;
    const modal::ModalLookupTable* a1Ptr = a1Lut_.initialized() ? &a1Lut_ : nullptr;
    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;

    for (int i = 0; i < poly; ++i) {
        auto& voice = (*voices_)[static_cast<std::size_t>(i)];
        if (recomputeRatios) {
            voice.setPitch(aCoarseSm_.current(), bCoarseSm_.current(), aFineSm_.current(), bFineSm_.current(), curBend_);
            voice.setRatio(aRatioSm_.current(), bRatioSm_.current());
            voice.setCoupling(params_.coupling, split);
            voice.markRatiosDirty();
        }
        voice.resA.setParams(
            sampleRate_, params_.a.on, lastAModel_, aPartials,
            aDecaySm_.current(), aDampSm_.current(), aToneSm_.current(), aHitSm_.current(),
            params_.a.release, aInharmSm_.current(), aCutSm_.current(), aRadiusSm_.current(),
            params_.a.velDecay, params_.a.velHit, params_.a.velInharm, params_.a.velDamp, params_.a.velTone);
        voice.resB.setParams(
            sampleRate_, params_.b.on, lastBModel_, bPartials,
            bDecaySm_.current(), bDampSm_.current(), bToneSm_.current(), bHitSm_.current(),
            params_.b.release, bInharmSm_.current(), bCutSm_.current(), bRadiusSm_.current(),
            params_.b.velDecay, params_.b.velHit, params_.b.velInharm, params_.b.velDamp, params_.b.velTone);
        if (voice.isSounding()) {
            if (voice.resA.on && !voice.resA.active) voice.resA.activate();
            if (voice.resB.on && !voice.resB.active) voice.resB.activate();
            voice.updateResonators(snap, recomputeRatios, a1Ptr, ratioPtr);
        }
    }
}

void ModalSynth::setParams(const ModalSynthParams& params) noexcept {
    params_ = params;
    params_.polyphony = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    params_.a.partials = modal::sanitizePartialCount(params_.a.partials);
    params_.b.partials = modal::sanitizePartialCount(params_.b.partials);
    params_.a.inharm = std::clamp(params_.a.inharm, 0.0f, 1.0f);
    params_.b.inharm = std::clamp(params_.b.inharm, 0.0f, 1.0f);
    publishTablesOffThread(params_);
    const auto& snap = acquireRenderSnapshot();
    updateSmoothingTargets();
    if (prepared_) {
        appliedSnapshotGen_ = snap.generation;
        applyAllParamsToVoices(true, snap);
    }
}

bool ModalSynth::setParameter(std::string_view name, double value) noexcept {
    if (!std::isfinite(value)) return false;

    bool structuralSwap = false;
    bool modelChangedA = false;
    bool modelChangedB = false;
    bool noiseChanged = false;
    bool resConfigChanged = false;
    bool resRatioConfigChanged = false;
    bool tableParamsChanged = false;

    // Mallet exciter
    if (name == "malletMix" || name == "mallet_mix") {
        params_.malletMix = static_cast<float>(std::clamp(value, 0.0, 1.0));
        malletMixSm_.setTarget(params_.malletMix);
        return true;
    }
    if (name == "malletRes" || name == "mallet_res") {
        params_.malletRes = static_cast<float>(std::clamp(value, 0.0, 1.0));
        malletResSm_.setTarget(params_.malletRes);
        return true;
    }
    if (name == "malletStiff" || name == "mallet_stiff") {
        params_.malletStiff = static_cast<float>(std::clamp(value, 100.0, 5000.0));
        return true;
    }
    if (name == "velMalletMix") {
        params_.velMalletMix = static_cast<float>(std::clamp(value, -1.0, 1.0));
        return true;
    }
    if (name == "velMalletRes") {
        params_.velMalletRes = static_cast<float>(std::clamp(value, -1.0, 1.0));
        return true;
    }
    if (name == "velMalletStiff") {
        params_.velMalletStiff = static_cast<float>(std::clamp(value, -1.0, 1.0));
        return true;
    }

    // Noise / oscillator exciter
    if (name == "noiseOsc" || name == "noise_osc") {
        params_.noiseOsc = static_cast<float>(std::clamp(value, 0.0, 1.0));
        noiseOscSm_.setTarget(params_.noiseOsc);
        return true;
    }
    if (name == "noiseMix" || name == "noise_mix") {
        params_.noiseMix = static_cast<float>(std::clamp(value, 0.0, 1.0));
        noiseMixNormSm_.setTarget(modal::skewToNorm(params_.noiseMix));
        return true;
    }
    if (name == "noiseRes" || name == "noise_res") {
        params_.noiseRes = static_cast<float>(std::clamp(value, 0.0, 1.0));
        noiseResNormSm_.setTarget(modal::skewToNorm(params_.noiseRes));
        return true;
    }
    if (name == "noiseFilterMode") {
        params_.noiseFilterMode = static_cast<modal::NoiseFilterMode>(
            std::clamp(static_cast<int>(std::llround(value)), 0, 2));
        noiseChanged = true;
    } else if (name == "noiseFilterFreq") {
        params_.noiseFilterFreq = static_cast<float>(std::clamp(value, 20.0, 20000.0));
        noiseChanged = true;
    } else if (name == "noiseFilterQ") {
        params_.noiseFilterQ = static_cast<float>(std::clamp(value, 0.707, 4.0));
        noiseChanged = true;
    } else if (name == "noiseAttackMs") {
        params_.noiseAttackMs = static_cast<float>(std::clamp(value, 1.0, 20000.0));
        noiseChanged = true;
    } else if (name == "noiseDecayMs") {
        params_.noiseDecayMs = static_cast<float>(std::clamp(value, 1.0, 20000.0));
        noiseChanged = true;
    } else if (name == "noiseSustain") {
        params_.noiseSustain = static_cast<float>(std::clamp(value, 0.0, 1.0));
        noiseChanged = true;
    } else if (name == "noiseReleaseMs") {
        params_.noiseReleaseMs = static_cast<float>(std::clamp(value, 1.0, 20000.0));
        noiseChanged = true;
    } else if (name == "noiseAttackTension") {
        params_.noiseAttackTension = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "noiseDecayTension") {
        params_.noiseDecayTension = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "noiseReleaseTension") {
        params_.noiseReleaseTension = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "velNoiseMix") {
        params_.velNoiseMix = static_cast<float>(std::clamp(value, -1.0, 1.0));
        return true;
    } else if (name == "velNoiseRes") {
        params_.velNoiseRes = static_cast<float>(std::clamp(value, -1.0, 1.0));
        return true;
    } else if (name == "velNoiseFreq") {
        params_.velNoiseFreq = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "velNoiseQ") {
        params_.velNoiseQ = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "velNoiseAttack") {
        params_.velNoiseAttack = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "velNoiseDecay") {
        params_.velNoiseDecay = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "velNoiseSustain") {
        params_.velNoiseSustain = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;
    } else if (name == "velNoiseRelease") {
        params_.velNoiseRelease = static_cast<float>(std::clamp(value, -1.0, 1.0));
        noiseChanged = true;

    // Coupling & master
    } else if (name == "abMix" || name == "ab_mix") {
        params_.abMix = static_cast<float>(std::clamp(value, 0.0, 1.0));
        abMixSm_.setTarget(params_.abMix);
        return true;
    } else if (name == "abSplit" || name == "ab_split") {
        const float next = static_cast<float>(std::clamp(value, 0.01, 1.0));
        if (next != params_.abSplit) tableParamsChanged = true;
        params_.abSplit = next;
        if (abSplitSm_.setTarget(params_.abSplit)) {
            resRatioConfigChanged = true;
        }
    } else if (name == "gainDb" || name == "gain") {
        params_.gainDb = static_cast<float>(std::clamp(value, -24.0, 24.0));
        gainLinSm_.setTarget(dbToLinear(params_.gainDb));
        return true;
    } else if (name == "coupling" || name == "couple") {
        const auto next = value >= 0.5 ? modal::ModalCoupling::Serial : modal::ModalCoupling::Parallel;
        if (next != params_.coupling) tableParamsChanged = true;
        params_.coupling = next;
        lastSerial_ = (params_.coupling == modal::ModalCoupling::Serial);
        resRatioConfigChanged = true;
    } else if (name == "pitchBendRange") {
        params_.pitchBendRange = std::clamp(static_cast<int>(std::llround(value)), 1, 24);
        return true;
    } else if (name == "stereoizer") {
        const bool next = value >= 0.5;
        if (params_.stereoizer && !next) {
            comb_.clear();
            combTailRemaining_ = 0;
        }
        params_.stereoizer = next;
        return true;
    } else if (name == "polyphony") {
        const int nextPoly = std::clamp(static_cast<int>(std::llround(value)), 1, modal::kMaxPolyphony);
        if (nextPoly < params_.polyphony) {
            for (int i = nextPoly; i < modal::kMaxPolyphony; ++i) {
                (*voices_)[static_cast<std::size_t>(i)].clear();
                (*swapOutVoices_)[static_cast<std::size_t>(i)].clear();
            }
        }
        params_.polyphony = nextPoly;
        return true;
    } else if (name == "reuseVoices") {
        params_.reuseVoices = value >= 0.5;
        return true;
    } else if (name == "fadeoutRepeats") {
        params_.fadeoutRepeats = value >= 0.5;
        return true;

    // Resonator A
    } else if (name == "aOn" || name == "a_on") {
        const bool next = value >= 0.5;
        if (next != params_.a.on) tableParamsChanged = true;
        params_.a.on = next;
        lastAOn_ = params_.a.on;
        resRatioConfigChanged = true;
    } else if (name == "aModel" || name == "a_model") {
        const auto next = static_cast<modal::ModalModel>(
            std::clamp(static_cast<int>(std::llround(value)), 0, modal::kModelCount - 1));
        if (next != params_.a.model) {
            params_.a.model = next;
            params_.a.ratio = static_cast<float>(modal::defaultRatioForModel(next));
            if (!structSwapFading_) {
                aRatioSm_.setTarget(params_.a.ratio);
            }
            modelChangedA = true;
            structuralSwap = true;
            tableParamsChanged = true;
        }
    } else if (name == "aPartials" || name == "a_partials") {
        const int next = modal::sanitizePartialCount(static_cast<int>(std::llround(value)));
        if (next != params_.a.partials) {
            params_.a.partials = next;
            structuralSwap = true;
            tableParamsChanged = true;
        }
    } else if (name == "aDecay" || name == "a_decay") {
        params_.a.decay = static_cast<float>(std::clamp(value, 0.01, 100.0));
        if (aDecaySm_.setTarget(params_.a.decay)) resConfigChanged = true;
    } else if (name == "aDamp" || name == "a_damp") {
        params_.a.damp = static_cast<float>(std::clamp(value, -1.0, 1.0));
        if (aDampSm_.setTarget(params_.a.damp)) resConfigChanged = true;
    } else if (name == "aTone" || name == "a_tone") {
        params_.a.tone = static_cast<float>(std::clamp(value, -1.0, 1.0));
        if (aToneSm_.setTarget(params_.a.tone)) resConfigChanged = true;
    } else if (name == "aHit" || name == "a_hit") {
        params_.a.hit = static_cast<float>(std::clamp(value, 0.02, 0.5));
        if (aHitSm_.setTarget(params_.a.hit)) resConfigChanged = true;
    } else if (name == "aRelease" || name == "a_rel") {
        params_.a.release = static_cast<float>(std::clamp(value, 0.001, 1.0));
        resConfigChanged = true;
    } else if (name == "aInharm" || name == "a_inharm") {
        params_.a.inharm = static_cast<float>(std::clamp(value, 0.0, 1.0));
        if (aInharmSm_.setTarget(params_.a.inharm)) resConfigChanged = true;
    } else if (name == "aRatio" || name == "a_ratio") {
        const float next = static_cast<float>(std::clamp(value, 0.1, 10.0));
        if (next != params_.a.ratio) tableParamsChanged = true;
        params_.a.ratio = next;
        if (aRatioSm_.setTarget(params_.a.ratio)) resRatioConfigChanged = true;
    } else if (name == "aCut" || name == "a_cut") {
        params_.a.cut = static_cast<float>(std::clamp(value, -1.0, 1.0));
        if (aCutSm_.setTarget(params_.a.cut)) resConfigChanged = true;
    } else if (name == "aRadius" || name == "a_radius") {
        params_.a.radius = static_cast<float>(std::clamp(value, 0.0, 1.0));
        if (aRadiusSm_.setTarget(params_.a.radius)) resConfigChanged = true;
    } else if (name == "aCoarse" || name == "a_coarse") {
        const float next = static_cast<float>(std::clamp(value, -48.0, 48.0));
        if (next != params_.a.coarse) tableParamsChanged = true;
        params_.a.coarse = next;
        if (aCoarseSm_.setTarget(params_.a.coarse)) resRatioConfigChanged = true;
    } else if (name == "aFine" || name == "a_fine") {
        const float next = static_cast<float>(std::clamp(value, -99.0, 99.0));
        if (next != params_.a.fine) tableParamsChanged = true;
        params_.a.fine = next;
        if (aFineSm_.setTarget(params_.a.fine)) resRatioConfigChanged = true;
    } else if (name == "velADecay") {
        params_.a.velDecay = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velAHit") {
        params_.a.velHit = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velAInharm") {
        params_.a.velInharm = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velADamp") {
        params_.a.velDamp = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velATone") {
        params_.a.velTone = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;

    // Resonator B
    } else if (name == "bOn" || name == "b_on") {
        const bool next = value >= 0.5;
        if (next != params_.b.on) tableParamsChanged = true;
        params_.b.on = next;
        lastBOn_ = params_.b.on;
        resRatioConfigChanged = true;
    } else if (name == "bModel" || name == "b_model") {
        const auto next = static_cast<modal::ModalModel>(
            std::clamp(static_cast<int>(std::llround(value)), 0, modal::kModelCount - 1));
        if (next != params_.b.model) {
            params_.b.model = next;
            params_.b.ratio = static_cast<float>(modal::defaultRatioForModel(next));
            if (!structSwapFading_) {
                bRatioSm_.setTarget(params_.b.ratio);
            }
            modelChangedB = true;
            structuralSwap = true;
            tableParamsChanged = true;
        }
    } else if (name == "bPartials" || name == "b_partials") {
        const int next = modal::sanitizePartialCount(static_cast<int>(std::llround(value)));
        if (next != params_.b.partials) {
            params_.b.partials = next;
            structuralSwap = true;
            tableParamsChanged = true;
        }
    } else if (name == "bDecay" || name == "b_decay") {
        params_.b.decay = static_cast<float>(std::clamp(value, 0.01, 100.0));
        if (bDecaySm_.setTarget(params_.b.decay)) resConfigChanged = true;
    } else if (name == "bDamp" || name == "b_damp") {
        params_.b.damp = static_cast<float>(std::clamp(value, -1.0, 1.0));
        if (bDampSm_.setTarget(params_.b.damp)) resConfigChanged = true;
    } else if (name == "bTone" || name == "b_tone") {
        params_.b.tone = static_cast<float>(std::clamp(value, -1.0, 1.0));
        if (bToneSm_.setTarget(params_.b.tone)) resConfigChanged = true;
    } else if (name == "bHit" || name == "b_hit") {
        params_.b.hit = static_cast<float>(std::clamp(value, 0.02, 0.5));
        if (bHitSm_.setTarget(params_.b.hit)) resConfigChanged = true;
    } else if (name == "bRelease" || name == "b_rel") {
        params_.b.release = static_cast<float>(std::clamp(value, 0.001, 1.0));
        resConfigChanged = true;
    } else if (name == "bInharm" || name == "b_inharm") {
        params_.b.inharm = static_cast<float>(std::clamp(value, 0.0, 1.0));
        if (bInharmSm_.setTarget(params_.b.inharm)) resConfigChanged = true;
    } else if (name == "bRatio" || name == "b_ratio") {
        const float next = static_cast<float>(std::clamp(value, 0.1, 10.0));
        if (next != params_.b.ratio) tableParamsChanged = true;
        params_.b.ratio = next;
        if (bRatioSm_.setTarget(params_.b.ratio)) resRatioConfigChanged = true;
    } else if (name == "bCut" || name == "b_cut") {
        params_.b.cut = static_cast<float>(std::clamp(value, -1.0, 1.0));
        if (bCutSm_.setTarget(params_.b.cut)) resConfigChanged = true;
    } else if (name == "bRadius" || name == "b_radius") {
        params_.b.radius = static_cast<float>(std::clamp(value, 0.0, 1.0));
        if (bRadiusSm_.setTarget(params_.b.radius)) resConfigChanged = true;
    } else if (name == "bCoarse" || name == "b_coarse") {
        const float next = static_cast<float>(std::clamp(value, -48.0, 48.0));
        if (next != params_.b.coarse) tableParamsChanged = true;
        params_.b.coarse = next;
        if (bCoarseSm_.setTarget(params_.b.coarse)) resRatioConfigChanged = true;
    } else if (name == "bFine" || name == "b_fine") {
        const float next = static_cast<float>(std::clamp(value, -99.0, 99.0));
        if (next != params_.b.fine) tableParamsChanged = true;
        params_.b.fine = next;
        if (bFineSm_.setTarget(params_.b.fine)) resRatioConfigChanged = true;
    } else if (name == "velBDecay") {
        params_.b.velDecay = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velBHit") {
        params_.b.velHit = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velBInharm") {
        params_.b.velInharm = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velBDamp") {
        params_.b.velDamp = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else if (name == "velBTone") {
        params_.b.velTone = static_cast<float>(std::clamp(value, -1.0, 1.0));
        resConfigChanged = true;
    } else {
        return false;
    }

    if (prepared_) {
        if (tableParamsChanged) {
            enqueueTableRequest();
        }
        if (noiseChanged) {
            applyNoiseParamsToBank(*voices_);
        }
        if (structuralSwap) {
            const auto& snap = acquireRenderSnapshot();
            beginStructuralSwap(modelChangedA, modelChangedB, snap);
        } else {
            if (resRatioConfigChanged) pendingRatioSync_ = true;
            if (resConfigChanged) pendingResonatorSync_ = true;
        }
    }
    return true;
}

int ModalSynth::pickVoice(int midiNote) const noexcept {
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    if (params_.reuseVoices) {
        for (int i = 0; i < poly; ++i) {
            const auto& v = (*voices_)[static_cast<std::size_t>(i)];
            const int activeNote = v.isFading ? v.newNote : v.note;
            if (activeNote == midiNote) {
                return i;
            }
        }
    }

    // Strict priority tiers:
    // 0: completely silent (!isSounding)
    // 1: released but ringing tail (!isPressed && isSounding), oldest release first
    // 2: currently held (isPressed), oldest press first
    auto tier = [](const modal::ModalVoice& v) noexcept -> int {
        if (!v.isSounding()) return 0;
        if (!v.isPressed) return 1;
        return 2;
    };

    int pick = 0;
    for (int i = 1; i < poly; ++i) {
        const auto& v1 = (*voices_)[static_cast<std::size_t>(i)];
        const auto& v2 = (*voices_)[static_cast<std::size_t>(pick)];
        const int t1 = tier(v1);
        const int t2 = tier(v2);
        if (t1 < t2) {
            pick = i;
        } else if (t1 == t2) {
            if (t1 == 2) {
                if (v1.pressedTs < v2.pressedTs) pick = i;
            } else {
                const std::uint64_t r1 = v1.isFading && v1.pendingRelease ? v1.pendingReleaseTs : v1.releaseTs;
                const std::uint64_t r2 = v2.isFading && v2.pendingRelease ? v2.pendingReleaseTs : v2.releaseTs;
                if (r1 < r2) pick = i;
            }
        }
    }
    return pick;
}

void ModalSynth::noteOn(int midiNote, float velocity, float clipGain, std::uint64_t noteId) noexcept {
    modal::VoiceClipEnvelope env{};
    env.clipGain = clipGain;
    noteOn(midiNote, velocity, env, noteId);
}

void ModalSynth::noteOn(int midiNote, float velocity, const modal::VoiceClipEnvelope& clipEnv,
                        std::uint64_t noteId) noexcept {
    if (!prepared_) return;
    const auto& snap = acquireRenderSnapshot();
    if (pendingResonatorSync_ || pendingRatioSync_) {
        syncResonatorSmoothersToVoices(pendingRatioSync_, snap);
        pendingResonatorSync_ = false;
        pendingRatioSync_ = false;
    }

    const int clampedNote = std::clamp(midiNote, 0, 127);
    const double vel = std::clamp(static_cast<double>(velocity), 0.0, 1.0);

    const int nvoice = pickVoice(clampedNote);
    auto& voice = (*voices_)[static_cast<std::size_t>(nvoice)];
    const int prevActiveNote = voice.isFading ? voice.newNote : voice.note;
    const bool skipFadeout = params_.reuseVoices && !params_.fadeoutRepeats && prevActiveNote == clampedNote;

    const double stiff = std::clamp(static_cast<double>(params_.malletStiff), 100.0, 5000.0);
    const double malletFreq = std::clamp(
        std::exp(std::log(stiff) + vel * static_cast<double>(params_.velMalletStiff) * 2.0 * (std::log(5000.0) - std::log(100.0))),
        100.0, 5000.0);

    voice.pitchBend = curBend_;
    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;
    voice.trigger(++notePressCount_, sampleRate_, clampedNote, vel, malletFreq, skipFadeout,
                  clipEnv, noteId, snap, ratioPtr);
    if (params_.stereoizer) {
        combTailRemaining_ = comb_.delayLen();
    }
}

void ModalSynth::releaseNoteImmediate(int midiNote, std::uint64_t noteId,
                                      const modal::ModalTableSnapshot& snap) noexcept {
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;
    for (int i = 0; i < poly; ++i) {
        auto& voice = (*voices_)[static_cast<std::size_t>(i)];
        if (voice.isFading) {
            if (voice.newNote == midiNote && !voice.pendingRelease &&
                (noteId == 0 || voice.newNoteId == noteId)) {
                voice.pendingRelease = true;
                voice.pendingReleaseTs = ++noteReleaseCount_;
                voice.isPressed = false;
                voice.sustainedReleasePending = false;
            }
        } else if (voice.note == midiNote && !voice.isRelease &&
                   (noteId == 0 || voice.noteId == noteId)) {
            voice.release(++noteReleaseCount_, snap, ratioPtr);
        }
    }
}

void ModalSynth::noteOff(int midiNote, std::uint64_t noteId) noexcept {
    if (!prepared_) return;
    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (!sustainPedal_) {
        const auto& snap = acquireRenderSnapshot();
        releaseNoteImmediate(clampedNote, noteId, snap);
        return;
    }
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    for (int i = 0; i < poly; ++i) {
        auto& voice = (*voices_)[static_cast<std::size_t>(i)];
        if (voice.isFading) {
            if (voice.newNote == clampedNote && !voice.pendingRelease &&
                (noteId == 0 || voice.newNoteId == noteId)) {
                voice.sustainedReleasePending = true;
            }
        } else if (voice.note == clampedNote && !voice.isRelease &&
                   (noteId == 0 || voice.noteId == noteId)) {
            voice.sustainedReleasePending = true;
        }
    }
}

void ModalSynth::setSustainPedal(bool down) noexcept {
    if (!prepared_) return;
    if (down) {
        sustainPedal_ = true;
        return;
    }
    sustainPedal_ = false;
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    const auto& snap = acquireRenderSnapshot();
    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;
    for (int i = 0; i < poly; ++i) {
        auto& voice = (*voices_)[static_cast<std::size_t>(i)];
        if (!voice.sustainedReleasePending) continue;
        voice.sustainedReleasePending = false;
        if (voice.isFading) {
            if (!voice.pendingRelease) {
                voice.pendingRelease = true;
                voice.pendingReleaseTs = ++noteReleaseCount_;
                voice.isPressed = false;
            }
        } else if (!voice.isRelease) {
            voice.release(++noteReleaseCount_, snap, ratioPtr);
        }
    }
}

void ModalSynth::setPitchBend(double normalizedMinus1To1) noexcept {
    if (!prepared_ || !std::isfinite(normalizedMinus1To1)) return;
    const double norm = std::clamp(normalizedMinus1To1, -1.0, 1.0);
    const double range = static_cast<double>(std::clamp(params_.pitchBendRange, 1, 24));
    targetBend_ = std::pow(2.0, norm * range / 12.0);
    remainingSamplesBend_ = totalSamplesBend_;
    bendStep_ = (targetBend_ - curBend_) / static_cast<double>(std::max(1, totalSamplesBend_));
}

void ModalSynth::panic() noexcept {
    for (auto& voice : *voices_) voice.clear();
    for (auto& voice : *swapOutVoices_) voice.clear();
    sustainPedal_ = false;
    comb_.clear();
    combTailRemaining_ = 0;
    limiter_.clear();
    structSwapFading_ = false;
    structSwapSamples_ = 0;
    swapOutStartGain_ = 1.0;
    pendingStructuralSwap_ = false;
    pendingSnapARatio_ = false;
    pendingSnapBRatio_ = false;
}

void ModalSynth::resetDiagnostics() noexcept {
    nonFiniteCount_ = 0;
    waveguideClampCount_ = 0;
    maxRawResonatorAbs_ = 0.0;
    maxPreLimiterAbs_ = 0.0;
    maxPreClampAbs_ = 0.0;
    auto clearBankDiag = [](VoiceBank& bank) noexcept {
        for (auto& voice : bank) {
            auto clearRes = [](modal::ModalResonator& res) noexcept {
                for (auto& p : res.partials) p.resetDiagnostics();
                res.waveguide.resetDiagnostics();
                res.filter.resetDiagnostics();
            };
            clearRes(voice.resA);
            clearRes(voice.resB);
        }
    };
    clearBankDiag(*voices_);
    clearBankDiag(*swapOutVoices_);
}

void ModalSynth::harvestVoiceDiagnostics() noexcept {
    auto harvestRes = [&](modal::ModalResonator& res) noexcept {
        if (modal::isWaveguideModel(res.model)) {
            nonFiniteCount_ += res.waveguide.nonFiniteCount;
            waveguideClampCount_ += res.waveguide.clampCount;
            if (res.waveguide.maxRawAbs > maxRawResonatorAbs_) {
                maxRawResonatorAbs_ = res.waveguide.maxRawAbs;
            }
            res.waveguide.resetDiagnostics();
        } else {
            const int count = std::clamp(res.npartials, 0, modal::kMaxPartials);
            for (int p = 0; p < count; ++p) {
                auto& part = res.partials[static_cast<std::size_t>(p)];
                nonFiniteCount_ += part.nonFiniteCount;
                if (part.maxRawAbs > maxRawResonatorAbs_) {
                    maxRawResonatorAbs_ = part.maxRawAbs;
                }
                part.resetDiagnostics();
            }
        }
        nonFiniteCount_ += res.filter.nonFiniteCount;
        if (res.filter.maxRawAbs > maxRawResonatorAbs_) {
            maxRawResonatorAbs_ = res.filter.maxRawAbs;
        }
        res.filter.resetDiagnostics();
    };

    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    for (int i = 0; i < poly; ++i) {
        auto& v = (*voices_)[static_cast<std::size_t>(i)];
        harvestRes(v.resA);
        harvestRes(v.resB);
    }
    if (structSwapFading_) {
        for (int i = 0; i < poly; ++i) {
            auto& v = (*swapOutVoices_)[static_cast<std::size_t>(i)];
            harvestRes(v.resA);
            harvestRes(v.resB);
        }
    }
}

void ModalSynth::reset() noexcept {
    panic();
    notePressCount_ = 0;
    noteReleaseCount_ = 0;
    curBend_ = 1.0;
    targetBend_ = 1.0;
    bendStep_ = 0.0;
    remainingSamplesBend_ = -1;
    pendingResonatorSync_ = false;
    pendingRatioSync_ = false;
    resetDiagnostics();
    if (prepared_) {
        gainLinSm_.snapToTarget();
        abMixSm_.snapToTarget();
        malletMixSm_.snapToTarget();
        malletResSm_.snapToTarget();
        noiseMixNormSm_.snapToTarget();
        noiseResNormSm_.snapToTarget();
        noiseOscSm_.snapToTarget();
        aDecaySm_.snapToTarget();
        aDampSm_.snapToTarget();
        aToneSm_.snapToTarget();
        aHitSm_.snapToTarget();
        aInharmSm_.snapToTarget();
        aRatioSm_.snapToTarget();
        aCutSm_.snapToTarget();
        aRadiusSm_.snapToTarget();
        aCoarseSm_.snapToTarget();
        aFineSm_.snapToTarget();
        bDecaySm_.snapToTarget();
        bDampSm_.snapToTarget();
        bToneSm_.snapToTarget();
        bHitSm_.snapToTarget();
        bInharmSm_.snapToTarget();
        bRatioSm_.snapToTarget();
        bCutSm_.snapToTarget();
        bRadiusSm_.snapToTarget();
        bCoarseSm_.snapToTarget();
        bFineSm_.snapToTarget();
        abSplitSm_.snapToTarget();
        lastAModel_ = params_.a.model;
        lastBModel_ = params_.b.model;
        lastAPartials_ = modal::sanitizePartialCount(params_.a.partials);
        lastBPartials_ = modal::sanitizePartialCount(params_.b.partials);
        const auto& snap = acquireRenderSnapshot();
        applyNoiseParamsToBank(*voices_);
        applyResonatorParamsToBank(*voices_, false, true, lastAModel_, lastBModel_, lastAPartials_, lastBPartials_, snap);
    }
}

bool ModalSynth::hasSoundingVoices() const noexcept {
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    for (int i = 0; i < poly; ++i) {
        if ((*voices_)[static_cast<std::size_t>(i)].isSounding()) return true;
    }
    return false;
}

bool ModalSynth::hasActiveSound() const noexcept {
    return hasSoundingVoices() || (params_.stereoizer && combTailRemaining_ > 0) || structSwapFading_;
}

int ModalSynth::activeVoiceCount() const noexcept {
    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    int count = 0;
    for (int i = 0; i < poly; ++i) {
        if ((*voices_)[static_cast<std::size_t>(i)].isSounding()) ++count;
    }
    return count;
}

void ModalSynth::advanceBlockRateSmoothers(std::size_t steps,
                                           const modal::ModalTableSnapshot& snap) noexcept {
    bool coeffMoved = pendingResonatorSync_;
    bool ratioMoved = pendingRatioSync_;

    coeffMoved |= advanceSmootherBy(aDecaySm_, steps);
    coeffMoved |= advanceSmootherBy(aDampSm_, steps);
    coeffMoved |= advanceSmootherBy(aToneSm_, steps);
    coeffMoved |= advanceSmootherBy(aHitSm_, steps);
    coeffMoved |= advanceSmootherBy(aInharmSm_, steps);
    coeffMoved |= advanceSmootherBy(aCutSm_, steps);
    coeffMoved |= advanceSmootherBy(aRadiusSm_, steps);

    coeffMoved |= advanceSmootherBy(bDecaySm_, steps);
    coeffMoved |= advanceSmootherBy(bDampSm_, steps);
    coeffMoved |= advanceSmootherBy(bToneSm_, steps);
    coeffMoved |= advanceSmootherBy(bHitSm_, steps);
    coeffMoved |= advanceSmootherBy(bInharmSm_, steps);
    coeffMoved |= advanceSmootherBy(bCutSm_, steps);
    coeffMoved |= advanceSmootherBy(bRadiusSm_, steps);

    ratioMoved |= advanceSmootherBy(aRatioSm_, steps);
    ratioMoved |= advanceSmootherBy(bRatioSm_, steps);
    ratioMoved |= advanceSmootherBy(aCoarseSm_, steps);
    ratioMoved |= advanceSmootherBy(aFineSm_, steps);
    ratioMoved |= advanceSmootherBy(bCoarseSm_, steps);
    ratioMoved |= advanceSmootherBy(bFineSm_, steps);
    ratioMoved |= advanceSmootherBy(abSplitSm_, steps);

    pendingResonatorSync_ = false;
    pendingRatioSync_ = false;

    if (coeffMoved || ratioMoved) {
        syncResonatorSmoothersToVoices(ratioMoved, snap);
    }
}

void ModalSynth::renderSubBlock(std::span<float> stereo, std::size_t startFrame, std::size_t frames,
                                double startTimeMs, double msPerFrame) noexcept {
    // Acquire and pin one immutable snapshot for the entire sub-block operation.
    const auto& snap = acquireRenderSnapshot();
    const modal::ModalRatioTables* ratioPtr = ratioTables_->initialized() ? ratioTables_.get() : nullptr;

    // Check if a newer control-thread snapshot was published since the last block.
    if (snap.generation != appliedSnapshotGen_) {
        appliedSnapshotGen_ = snap.generation;
        if (!snap.fromLiveRequest) {
            const bool snapStructuralChanged =
                snap.aModel != lastAModel_ || snap.bModel != lastBModel_ ||
                snap.aPartials != lastAPartials_ || snap.bPartials != lastBPartials_;
            if (snapStructuralChanged) {
                const bool aModChg = snap.aModel != lastAModel_;
                const bool bModChg = snap.bModel != lastBModel_;
                params_.a.model = snap.aModel;
                params_.b.model = snap.bModel;
                if (aModChg) params_.a.ratio = static_cast<float>(snap.aRatio);
                if (bModChg) params_.b.ratio = static_cast<float>(snap.bRatio);
                params_.a.partials = snap.aPartials;
                params_.b.partials = snap.bPartials;
                beginStructuralSwap(aModChg, bModChg, snap);
            } else {
                pendingRatioSync_ = true;
            }
        } else {
            pendingRatioSync_ = true;
        }
    }

    if (!hasActiveSound()) {
        // Advance all per-sample and block-rate smoothers during silence.
        (void)advanceSmootherBy(gainLinSm_, frames);
        (void)advanceSmootherBy(abMixSm_, frames);
        (void)advanceSmootherBy(malletMixSm_, frames);
        (void)advanceSmootherBy(malletResSm_, frames);
        (void)advanceSmootherBy(noiseMixNormSm_, frames);
        (void)advanceSmootherBy(noiseResNormSm_, frames);
        (void)advanceSmootherBy(noiseOscSm_, frames);
        advanceBlockRateSmoothers(frames, snap);

        // Keep pitch bend glide advancing during silence so the next note starts at target bend.
        if (remainingSamplesBend_ > 0) {
            const int stepCount = static_cast<int>(
                std::min<std::size_t>(frames, static_cast<std::size_t>(remainingSamplesBend_)));
            curBend_ += bendStep_ * static_cast<double>(stepCount);
            remainingSamplesBend_ -= stepCount;
            if (remainingSamplesBend_ == 0) {
                curBend_ = targetBend_;
                remainingSamplesBend_ = -1;
            }
            for (auto& voice : *voices_) voice.pitchBend = curBend_;
        } else if (remainingSamplesBend_ == 0) {
            curBend_ = targetBend_;
            remainingSamplesBend_ = -1;
            for (auto& voice : *voices_) voice.pitchBend = curBend_;
        }

        // Keep limiter release advancing during silence.
        limiter_.advanceSilence(frames);
        return;
    }

    // Update smoothed resonator parameters once per block (block rate) using pinned immutable tables.
    advanceBlockRateSmoothers(frames, snap);

    const int poly = std::clamp(params_.polyphony, 1, modal::kMaxPolyphony);
    const bool aOn = params_.a.on;
    const bool bOn = params_.b.on;
    const bool serial = (params_.coupling == modal::ModalCoupling::Serial);
    const bool stereoizer = params_.stereoizer;
    const double velMalletMix = params_.velMalletMix;
    const double velMalletRes = params_.velMalletRes;
    const double velNoiseMix = params_.velNoiseMix;
    const double velNoiseRes = params_.velNoiseRes;
    const bool useTimelineClock = (startTimeMs >= 0.0 && msPerFrame > 0.0);

    auto renderBankFrame = [&](VoiceBank& bank, bool bankAOn, bool bankBOn, bool bankSerial,
                               bool usePerVoiceSwapIn, double swapGain,
                               double malletMix, double malletRes,
                               double noiseMixNorm, double noiseResNorm, double noiseOsc,
                               double abMix, double frameTimeMs, bool applyBendThisSample,
                               double& outDir, double& outRes) noexcept -> bool {
        double bankAOut = 0.0;
        double bankBOut = 0.0;
        bool anyActive = false;

        for (int i = 0; i < poly; ++i) {
            auto& voice = bank[static_cast<std::size_t>(i)];
            if (!voice.isSounding()) continue;
            anyActive = true;

            if (applyBendThisSample) {
                voice.applyPitchBend(curBend_, a1Lut_);
            }

            const double voiceFadeEnv = voice.isFading ? voice.fadeOut(snap, ratioPtr) : 1.0;
            double voiceClipFade = 1.0;
            if (useTimelineClock && voice.clipEnv.hasFades) {
                voiceClipFade = audio::clipFadeGain(
                    voice.clipEnv.fades, voice.clipEnv.clipDurationMs,
                    frameTimeMs - voice.clipEnv.clipStartMs);
            }
            const double bankGain = usePerVoiceSwapIn ? (voice.fadeInWithSwap ? swapGain : 1.0) : swapGain;
            const double voiceOutGain = voiceFadeEnv * voiceClipFade * bankGain;
            const double cg = static_cast<double>(voice.clipEnv.clipGain);
            double resIn = 0.0;

            const double msample = voice.mallet.process();
            if (msample != 0.0) {
                outDir += msample * std::clamp(malletMix + velMalletMix * voice.vel, 0.0, 1.0) * voiceOutGain * cg;
                resIn += msample * std::clamp(malletRes + velMalletRes * voice.vel, 0.0, 1.0) * cg;
            }

            const double nsample = voice.noise.process(rngState_);
            if (voice.noise.active()) {
                const double osc = (noiseOsc > 0.0 && (noiseResNorm > 0.0 || velNoiseRes > 0.0))
                    ? voice.noise.processOsc(voice.processOscillators(false, sinLut_) +
                                             voice.processOscillators(true, sinLut_)) * noiseOsc
                    : 0.0;
                const double nMixGain = modal::normToSkew(std::clamp(noiseMixNorm + velNoiseMix * voice.vel, 0.0, 1.0));
                const double nResGain = modal::normToSkew(std::clamp(noiseResNorm + velNoiseRes * voice.vel, 0.0, 1.0));
                outDir += nsample * nMixGain * voiceOutGain * cg;
                resIn += (nsample * (1.0 - noiseOsc) + osc) * nResGain * cg;
            }

            double outFromA = 0.0;
            if (bankAOn) {
                double out = voice.resA.process(resIn);
                if (voice.resA.cut != 0.0) {
                    out = voice.resA.filter.df1(out);
                }
                bankAOut += out * voiceOutGain;
                outFromA = out;
            }

            if (bankBOn) {
                double out = voice.resB.process((bankAOn && bankSerial) ? outFromA : resIn);
                if (voice.resB.cut != 0.0) {
                    out = voice.resB.filter.df1(out);
                }
                bankBOut += out * voiceOutGain;
            }
        }

        if (bankAOn && bankBOn) {
            outRes += bankSerial ? bankBOut : (bankAOut * (1.0 - abMix) + bankBOut * abMix);
        } else {
            outRes += bankAOut + bankBOut;
        }
        return anyActive;
    };

    for (std::size_t f = 0; f < frames; ++f) {
        const double gainLin = gainLinSm_.next();
        const double abMix = abMixSm_.next();
        const double malletMix = malletMixSm_.next();
        const double malletRes = malletResSm_.next();
        const double noiseMixNorm = noiseMixNormSm_.next();
        const double noiseResNorm = noiseResNormSm_.next();
        const double noiseOsc = noiseOscSm_.next();

        // Structural swap crossfade ramp (outgoing bank ramps 1 -> 0, carried-over incoming ramps 0 -> 1).
        double swapOutGain = 0.0;
        double swapInGain = 1.0;
        if (structSwapFading_) {
            if (structSwapSamples_ <= 0) {
                finishStructuralSwap();
                startDeferredStructuralSwapIfPending(snap);
            }
            if (structSwapFading_ && structSwapSamples_ > 0) {
                const double t = static_cast<double>(structSwapSamples_) /
                                 static_cast<double>(std::max(1, structSwapTotalSamples_));
                swapOutGain = t * swapOutStartGain_;
                swapInGain = 1.0 - t;
                --structSwapSamples_;
            }
        }

        // Interpolate pitch bend.
        bool applyBendThisSample = false;
        if (remainingSamplesBend_ > 0) {
            curBend_ += bendStep_;
            --remainingSamplesBend_;
            if (remainingSamplesBend_ == 0) {
                curBend_ = targetBend_;
            }
            applyBendThisSample = true;
        } else if (remainingSamplesBend_ == 0) {
            applyBendThisSample = true;
            remainingSamplesBend_ = -1;
        }

        const double frameTimeMs = useTimelineClock ? (startTimeMs + static_cast<double>(f) * msPerFrame) : 0.0;

        double dirOut = 0.0;
        double resOut = 0.0;
        bool anyVoiceActiveThisFrame = renderBankFrame(
            *voices_, aOn, bOn, serial, structSwapFading_, swapInGain,
            malletMix, malletRes, noiseMixNorm, noiseResNorm, noiseOsc, abMix,
            frameTimeMs, applyBendThisSample, dirOut, resOut);

        if (swapOutGain > 0.0) {
            anyVoiceActiveThisFrame |= renderBankFrame(
                *swapOutVoices_, swapOutAOn_, swapOutBOn_, swapOutSerial_, false, swapOutGain,
                malletMix, malletRes, noiseMixNorm, noiseResNorm, noiseOsc, abMix,
                frameTimeMs, false, dirOut, resOut);
        }

        if (stereoizer) {
            if (anyVoiceActiveThisFrame) {
                combTailRemaining_ = comb_.delayLen();
            } else if (combTailRemaining_ > 0) {
                --combTailRemaining_;
            }
        }

        const double totalOut = dirOut + resOut * gainLin;

        double spl0 = totalOut;
        double spl1 = totalOut;
        if (stereoizer) {
            const auto [l, r] = comb_.process(totalOut);
            spl0 = l;
            spl1 = r;
        }

        // Pre-limiter finiteness and peak diagnostics (measured before OutputLimiter).
        if (!std::isfinite(totalOut) || !std::isfinite(spl0) || !std::isfinite(spl1)) [[unlikely]] {
            ++nonFiniteCount_;
        } else {
            const double preLimPk = std::max({std::abs(totalOut), std::abs(spl0), std::abs(spl1)});
            if (preLimPk > maxPreLimiterAbs_) maxPreLimiterAbs_ = preLimPk;
        }

        const auto [left, right] = limiter_.process(spl0, spl1);

        // Post-limiter / pre-clamp diagnostics.
        if (!std::isfinite(left) || !std::isfinite(right)) [[unlikely]] {
            ++nonFiniteCount_;
        } else {
            const double pk = std::max(std::abs(left), std::abs(right));
            if (pk > maxPreClampAbs_) maxPreClampAbs_ = pk;
        }

        const std::size_t idx = (startFrame + f) * 2;
        stereo[idx] += static_cast<float>(clampFinite(left, -4.0, 4.0, 0.0));
        stereo[idx + 1] += static_cast<float>(clampFinite(right, -4.0, 4.0, 0.0));

        if (structSwapFading_ && structSwapSamples_ <= 0) {
            finishStructuralSwap();
            startDeferredStructuralSwapIfPending(snap);
        }
    }

    harvestVoiceDiagnostics();
}

void ModalSynth::renderFrames(std::span<float> stereo, std::size_t startFrame, std::size_t frameCount,
                              double startTimeMs, double msPerFrame) noexcept {
    if (!prepared_ || frameCount == 0) return;
    const std::size_t maxFrames = stereo.size() / 2;
    if (startFrame >= maxFrames) return;
    const std::size_t totalFrames = std::min(frameCount, maxFrames - startFrame);

    // For oversized offline render calls while smoothers are moving, slice into block-rate chunks.
    const bool resSmoothing =
        pendingResonatorSync_ || pendingRatioSync_ ||
        aDecaySm_.smoothing() || aDampSm_.smoothing() || aToneSm_.smoothing() ||
        aHitSm_.smoothing() || aInharmSm_.smoothing() || aRatioSm_.smoothing() ||
        aCutSm_.smoothing() || aRadiusSm_.smoothing() ||
        aCoarseSm_.smoothing() || aFineSm_.smoothing() ||
        bDecaySm_.smoothing() || bDampSm_.smoothing() || bToneSm_.smoothing() ||
        bHitSm_.smoothing() || bInharmSm_.smoothing() || bRatioSm_.smoothing() ||
        bCutSm_.smoothing() || bRadiusSm_.smoothing() ||
        bCoarseSm_.smoothing() || bFineSm_.smoothing() || abSplitSm_.smoothing();

    if (!resSmoothing || totalFrames <= kMaxSmoothChunkFrames) {
        renderSubBlock(stereo, startFrame, totalFrames, startTimeMs, msPerFrame);
        return;
    }

    std::size_t done = 0;
    while (done < totalFrames) {
        const std::size_t chunk = std::min(totalFrames - done, kMaxSmoothChunkFrames);
        const double subTimeMs = (startTimeMs >= 0.0 && msPerFrame > 0.0)
            ? (startTimeMs + static_cast<double>(done) * msPerFrame)
            : -1.0;
        renderSubBlock(stereo, startFrame + done, chunk, subTimeMs, msPerFrame);
        done += chunk;
    }
}

void ModalSynth::renderBlock(std::span<float> stereo, std::span<const NoteEvent> events) noexcept {
    if (!prepared_) return;
    const std::size_t totalFrames = stereo.size() / 2;
    if (totalFrames == 0) return;

    std::size_t cursor = 0;
    for (const auto& ev : events) {
        const std::size_t offset = static_cast<std::size_t>(std::clamp(ev.frameOffset, 0, static_cast<int>(totalFrames)));
        if (offset > cursor) {
            renderFrames(stereo, cursor, offset - cursor);
            cursor = offset;
        }
        switch (ev.kind) {
        case EventKind::NoteOff:
            noteOff(ev.midiNote, ev.noteId);
            break;
        case EventKind::NoteOn:
            noteOn(ev.midiNote, ev.velocity, ev.clipGain, ev.noteId);
            break;
        case EventKind::SustainPedal:
            setSustainPedal(ev.velocity >= 0.5f);
            break;
        case EventKind::PitchBend:
            setPitchBend(static_cast<double>(ev.velocity));
            break;
        }
    }
    if (cursor < totalFrames) {
        renderFrames(stereo, cursor, totalFrames - cursor);
    }
}

// ---------- ModalSynthProcessor (nt::audio::BlockProcessor) ----------

ModalSynthProcessor::ModalSynthProcessor(const Timeline& timeline, const Track& track)
    : timelineRaw_(timeline.raw) {
    id = "instrument";
    const QJsonObject instrument = track.raw.value(u"instrument").toObject();
    synth_.setParams(modalParamsFromJson(instrument));

    const double maxGainDb = 20.0 * std::log10(static_cast<double>(std::numeric_limits<float>::max()) / 4.0);
    const double documentBpm = timeline.raw.value(u"tempo").toObject().value(u"bpm").toDouble(120.0);
    bpm_ = (std::isfinite(documentBpm) && documentBpm > 0.0) ? documentBpm : 120.0;

    for (const auto& clip : timeline.clips) {
        if (clip.trackId != track.id || clip.mediaType != MediaType::Midi ||
            clip.muted || clip.hidden || clip.durationMs <= 0.0) {
            continue;
        }
        const auto fades = audio::resolveClipFades(
            clip.fadeInMs, clip.fadeOutMs,
            audio::parseFadeShape(clip.fadeInShape), audio::parseFadeShape(clip.fadeOutShape),
            clip.durationMs);
        const float clipGain = static_cast<float>(std::pow(10.0, std::clamp(clip.volumeDb, -6000.0, maxGainDb) / 20.0));
        modal::VoiceClipEnvelope env{};
        env.clipGain = clipGain;
        env.clipStartMs = clip.startMs;
        env.clipDurationMs = clip.durationMs;
        env.fades = fades;
        env.hasFades = (fades.fadeInMs > 0.0 || fades.fadeOutMs > 0.0);

        clipSources_.push_back(MidiClipSource{clip.raw, clip.startMs, clip.inPointMs, clip.durationMs, env});
    }

    // Build initial schedule at 48 kHz so hasPendingOutput(0) works before prepare(rate).
    rebuildEvents(48000.0);
    reset();
}

void ModalSynthProcessor::rebuildEvents(double sampleRate) {
    const double sr = (std::isfinite(sampleRate) && sampleRate > 0.0) ? sampleRate : 48000.0;
    if (eventsBuiltRate_ == sr) return;

    events_.clear();
    intervals_.clear();
    const double framesPerMs = sr / 1000.0;

    std::uint64_t nextNoteId = 1;
    for (const auto& clip : clipSources_) {
        const auto extracted = audio::vst::extractMidiNoteEvents(
            clip.raw, bpm_, sr, clip.inPointMs, clip.durationMs, timelineRaw_);
        const double clipEndMs = clip.startMs + clip.durationMs;

        for (const auto& ev : extracted) {
            const double startMs = clip.startMs + static_cast<double>(ev.startFrame) / framesPerMs;
            const double offMs = std::min(clip.startMs + static_cast<double>(ev.gateOffFrame) / framesPerMs, clipEndMs);
            if (offMs <= startMs) continue;
            const float vel = std::clamp(static_cast<float>(ev.velocity) / 127.0f, 0.0f, 1.0f);
            const std::uint64_t noteId = nextNoteId++;

            intervals_.push_back(NoteInterval{startMs, offMs, ev.pitch, vel, clip.clipEnv, noteId});
            events_.push_back(ScheduledEvent{startMs, ModalSynth::EventKind::NoteOn, ev.pitch, vel, clip.clipEnv, noteId});
            events_.push_back(ScheduledEvent{offMs, ModalSynth::EventKind::NoteOff, ev.pitch, 0.0f, clip.clipEnv, noteId});
        }
    }

    std::stable_sort(events_.begin(), events_.end(), [](const ScheduledEvent& a, const ScheduledEvent& b) {
        if (a.timeMs != b.timeMs) return a.timeMs < b.timeMs;
        return static_cast<int>(a.kind) < static_cast<int>(b.kind);
    });
    std::stable_sort(intervals_.begin(), intervals_.end(), [](const NoteInterval& a, const NoteInterval& b) {
        return a.startMs < b.startMs;
    });
    eventsBuiltRate_ = sr;
}

void ModalSynthProcessor::prepare(double rate) {
    synth_.prepare(rate);
    rebuildEvents(synth_.sampleRate());
    next_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

void ModalSynthProcessor::reset() noexcept {
    audio::BlockProcessor::reset();
    synth_.reset();
    next_ = 0;
    expectedMs_ = std::numeric_limits<double>::quiet_NaN();
}

bool ModalSynthProcessor::hasPendingOutput(int) const noexcept {
    return next_ < events_.size() || synth_.hasActiveSound();
}

bool ModalSynthProcessor::setParameter(std::string_view name, double value) noexcept {
    return synth_.setParameter(name, value);
}

void ModalSynthProcessor::chaseAt(double timeMs) noexcept {
    reset();
    while (next_ < events_.size() && events_[next_].timeMs < timeMs) {
        ++next_;
    }
    for (const auto& iv : intervals_) {
        if (iv.startMs >= timeMs) break;
        if (iv.offMs > timeMs) {
            synth_.noteOn(iv.midiNote, iv.velocity, iv.clipEnv, iv.noteId);
        }
    }
}

void ModalSynthProcessor::process(std::span<float> stereo, const audio::BlockContext& context) noexcept {
    if (!std::isfinite(context.timelineMs) || context.msPerFrame <= 0.0) return;
    const std::size_t totalFrames = stereo.size() / 2;
    if (totalFrames == 0) return;

    if (!std::isfinite(expectedMs_) || std::abs(context.timelineMs - expectedMs_) > 0.001) {
        chaseAt(context.timelineMs);
    }

    const double blockStartMs = context.timelineMs;
    const double blockEndMs = blockStartMs + static_cast<double>(totalFrames) * context.msPerFrame;

    std::size_t cursor = 0;
    while (next_ < events_.size() && events_[next_].timeMs < blockEndMs) {
        const auto& ev = events_[next_++];
        const double deltaFrames = (ev.timeMs - blockStartMs) / context.msPerFrame;
        const std::size_t evFrame = static_cast<std::size_t>(
            std::clamp<long long>(std::llround(deltaFrames), 0LL, static_cast<long long>(totalFrames)));
        if (evFrame > cursor) {
            const double sliceTimeMs = blockStartMs + static_cast<double>(cursor) * context.msPerFrame;
            synth_.renderFrames(stereo, cursor, evFrame - cursor, sliceTimeMs, context.msPerFrame);
            cursor = evFrame;
        }
        if (ev.kind == ModalSynth::EventKind::NoteOff) {
            synth_.noteOff(ev.midiNote, ev.noteId);
        } else {
            synth_.noteOn(ev.midiNote, ev.velocity, ev.clipEnv, ev.noteId);
        }
    }

    if (cursor < totalFrames) {
        const double sliceTimeMs = blockStartMs + static_cast<double>(cursor) * context.msPerFrame;
        synth_.renderFrames(stereo, cursor, totalFrames - cursor, sliceTimeMs, context.msPerFrame);
    }

    expectedMs_ = blockEndMs;
}

}  // namespace nt::midi
