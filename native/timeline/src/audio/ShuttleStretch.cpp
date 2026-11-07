#include "audio/ShuttleStretch.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <numbers>

namespace nt::audio {

ShuttleStretcher::ShuttleStretcher(double sampleRate)
    : m_sampleRate(std::isfinite(sampleRate) ? std::clamp(sampleRate, 8000., 192000.) : 48000.),
      m_input(static_cast<std::size_t>(m_sampleRate * .081 + 16) * 2),
      m_mono(m_input.size() / 2),
      m_previous(static_cast<std::size_t>(m_sampleRate * .041 + 16) * 2),
      m_grain(m_previous.size()), m_window(m_previous.size() / 2) {
    begin(1, 0);
}

void ShuttleStretcher::begin(double rate, double anchorMs) noexcept {
    m_rate = std::isfinite(rate) ? std::clamp(rate, kShuttleMinRate, kShuttleMaxRate) : 1.;
    m_anchorMs = std::isfinite(anchorMs) ? anchorMs : 0.;
    m_hop = std::max(1, static_cast<int>(std::round(m_sampleRate * .020 / std::max(1., m_rate))));
    m_search = static_cast<int>(m_sampleRate * (m_rate > 1 ? .005 : .010));
    m_fadeLength = std::max(1, static_cast<int>(m_sampleRate * .005));
    m_next = m_centre = -1;
    m_inputFirst = m_inputEnd = 0;
    for (int i = 0; i < m_hop; ++i) {
        const double s = std::sin(std::numbers::pi * .5 * i / m_hop);
        m_window[i] = static_cast<float>(s * s);
    }
}

float ShuttleStretcher::sample(std::int64_t frame, int channel) const noexcept {
    if (frame < m_inputFirst || frame >= m_inputEnd) return 0;
    const float x = m_input[static_cast<std::size_t>(frame - m_inputFirst) * 2 + channel];
    return std::isfinite(x) ? x : 0;
}

void ShuttleStretcher::input(ShuttleSource& source, std::int64_t first, std::int64_t end) noexcept {
    first = std::max<std::int64_t>(0, first);
    end = std::max(first, end);
    if (first > m_inputEnd) {
        // At fast rates skip unused source spans instead of mixing them.
        m_inputFirst = m_inputEnd = first;
    } else if (first > m_inputFirst) {
        const auto keep = m_inputEnd - first;
        std::memmove(m_input.data(), m_input.data() + (first - m_inputFirst) * 2,
                     static_cast<std::size_t>(keep) * 2 * sizeof(float));
        std::memmove(m_mono.data(), m_mono.data() + (first - m_inputFirst),
                     static_cast<std::size_t>(keep) * sizeof(float));
        m_inputFirst = first;
    }
    const auto capacityEnd = m_inputFirst + static_cast<std::int64_t>(m_input.size() / 2);
    end = std::min(end, capacityEnd);
    // At most four requests even at the maximum supported sample rate.
    while (m_inputEnd < end) {
        const int n = static_cast<int>(std::min<std::int64_t>(kShuttleMaxRequestFrames, end - m_inputEnd));
        source.mix(m_anchorMs + m_inputEnd * 1000. / m_sampleRate, n,
                   m_input.data() + (m_inputEnd - m_inputFirst) * 2);
        const auto offset = m_inputEnd - m_inputFirst;
        for (int i = 0; i < n; ++i) {
            auto* stereo = m_input.data() + (offset + i) * 2;
            for (int c = 0; c < 2; ++c) {
                if (!std::isfinite(stereo[c])) stereo[c] = 0;
            }
            m_mono[offset + i] = stereo[0] * .5f + stereo[1] * .5f;
        }
        m_inputEnd += n;
    }
}

void ShuttleStretcher::grain(ShuttleSource& source, std::int64_t centre, bool match) noexcept {
    const auto nominal = static_cast<std::int64_t>(std::llround(centre * m_rate)) - m_hop;
    const auto low = nominal - m_search;
    const auto high = nominal + m_search;
    input(source, low, high + 2 * m_hop);
    auto chosen = nominal;
    if (match) {
        constexpr int kSamples = 64;
        std::array<double, kSamples> reference{};
        double refEnergy = 0;
        for (int i = 0; i < kSamples; ++i) {
            const int j = i * m_hop / kSamples;
            reference[i] = m_previous[2 * (m_hop + j)] * .5f + m_previous[2 * (m_hop + j) + 1] * .5f;
            refEnergy += reference[i] * reference[i];
        }
        if (refEnergy > 1e-12) {
            double best = -2;
            for (auto candidate = low; candidate <= high; ++candidate) {
                double dot = 0, energy = 0;
                if (candidate >= m_inputFirst && candidate + m_hop <= m_inputEnd) {
                    // Sanitize and sum stereo once when extending the cache.
                    // The search's common path then has no per-sample bounds
                    // checks or repeated interleaved channel loads.
                    const float* mono = m_mono.data() + (candidate - m_inputFirst);
                    for (int i = 0; i < kSamples; ++i) {
                        const double x = mono[i * m_hop / kSamples];
                        dot += reference[i] * x;
                        energy += x * x;
                    }
                } else {
                    for (int i = 0; i < kSamples; ++i) {
                        const auto at = candidate + i * m_hop / kSamples;
                        const double x = at >= m_inputFirst && at < m_inputEnd ? m_mono[at - m_inputFirst] : 0.;
                        dot += reference[i] * x;
                        energy += x * x;
                    }
                }
                const double score = dot / std::sqrt(refEnergy * energy + 1e-30) -
                                     std::abs(double(candidate - nominal)) * 1e-9;
                if (score > best) { best = score; chosen = candidate; }
            }
        }
    }
    for (int i = 0; i < 2 * m_hop; ++i) {
        m_grain[2 * i] = sample(chosen + i, 0);
        m_grain[2 * i + 1] = sample(chosen + i, 1);
    }
}

void ShuttleStretcher::render(ShuttleSource& source, std::int64_t outFrame, int frames, float* out) noexcept {
    if (frames <= 0) return;
    std::fill_n(out, static_cast<std::size_t>(frames) * 2, 0.f);
    // Leave ample headroom for rate multiplication, grain lookahead and the
    // end-of-call index. Reject before any signed coordinate arithmetic.
    constexpr std::int64_t kLimit = INT64_MAX / 32;
    if (outFrame < 0 || outFrame > kLimit - frames) { m_next = -1; return; }
    if (outFrame != m_next) {
        m_centre = outFrame / m_hop * m_hop;
        m_fade = m_fadeLength;
        grain(source, m_centre, false);
        m_previous.swap(m_grain);
        grain(source, m_centre + m_hop, true);
    }
    for (int done = 0; done < frames;) {
        const auto at = outFrame + done;
        if (at >= m_centre + m_hop) {
            m_centre += m_hop;
            m_previous.swap(m_grain);
            grain(source, m_centre + m_hop, true);
        }
        const int offset = static_cast<int>(at - m_centre);
        const int n = std::min(frames - done, m_hop - offset);
        for (int i = 0; i < n; ++i) {
            const int j = offset + i;
            const float w = m_window[j];
            const float fade = m_fade > 0 ? float(m_fadeLength - m_fade--) / m_fadeLength : 1.f;
            for (int c = 0; c < 2; ++c) {
                out[2 * (done + i) + c] = fade * ((1 - w) * m_previous[2 * (m_hop + j) + c] + w * m_grain[2 * j + c]);
            }
        }
        done += n;
    }
    m_next = outFrame + frames;
}
}  // namespace nt::audio
