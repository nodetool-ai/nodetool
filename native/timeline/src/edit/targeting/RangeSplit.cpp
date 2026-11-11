#include "RangeSplit.h"
#include <algorithm>
#include <map>

namespace nt::targeting {
using namespace nt::edit;
namespace {
std::optional<QJsonObject> sampleAt(const QJsonArray& samples, double ms) {
    if (samples.isEmpty()) { return std::nullopt; }
    const auto first = samples.first().toObject();
    const auto last = samples.last().toObject();
    if (ms <= first.value("sourceMs").toDouble()) { return first; }
    if (ms >= last.value("sourceMs").toDouble()) { return last; }
    for (qsizetype i = 1; i < samples.size(); ++i) {
        const auto b = samples[i].toObject();
        if (ms > b.value("sourceMs").toDouble()) { continue; }
        const auto a = samples[i - 1].toObject();
        const double span = b.value("sourceMs").toDouble() - a.value("sourceMs").toDouble();
        const double t = span > 0 ? (ms - a.value("sourceMs").toDouble()) / span : 0;
        const auto nearer = t < 0.5 ? a : b;
        QJsonObject out{{"sourceMs", ms}};
        for (const auto key : {"x", "y", "width", "height", "rotation", "confidence"}) {
            const auto av = a.value(key);
            const auto bv = b.value(key);
            if (av.isDouble() && bv.isDouble()) {
                out.insert(key, av.toDouble() + (bv.toDouble() - av.toDouble()) * t);
            } else if (av.isDouble() || bv.isDouble()) {
                out.insert(key, av.isDouble() ? av : bv);
            }
        }
        for (const auto key : {"quad", "maskAssetId"}) {
            if (nearer.contains(key)) { out.insert(key, nearer.value(key)); }
        }
        return out;
    }
    return last;
}
QJsonObject reslice(QJsonObject track, const QJsonObject& half) {
    const double fromMs = std::max(0.0, half.value("inPointMs").toDouble());
    const double toMs = fromMs + clipDurationMs(half) * sourceRate(half);
    const auto samples = track.value("samples").toArray();
    QJsonArray kept;
    for (const auto& sample : samples) {
        const double ms = sample.toObject().value("sourceMs").toDouble();
        if (ms >= fromMs && ms <= toMs) { kept.append(sample); }
    }
    QJsonArray sliced;
    if (!samples.isEmpty()) {
        if (kept.isEmpty() || kept.first().toObject().value("sourceMs").toDouble() > fromMs) {
            if (auto boundary = sampleAt(samples, fromMs)) {
                boundary->insert("sourceMs", fromMs);
                sliced.append(*boundary);
            }
        }
        for (const auto& sample : kept) { sliced.append(sample); }
        if (kept.isEmpty() || kept.last().toObject().value("sourceMs").toDouble() < toMs) {
            if (auto boundary = sampleAt(samples, toMs)) {
                boundary->insert("sourceMs", toMs);
                sliced.append(*boundary);
            }
        }
    }
    track.insert("sourceStartMs", fromMs);
    track.insert("sourceEndMs", toMs);
    track.insert("samples", sliced);
    track.insert("id", newId());
    track.insert("clipId", clipId(half));
    return track;
}
void splitMediaTracks(QJsonArray& mediaTracks, const QString& originalId, QJsonObject& left, QJsonObject& right) {
    QJsonArray next;
    const auto originalReframeId = left.value("reframe").toObject().value("trackId").toString();
    for (const auto& value : mediaTracks) {
        const auto track = value.toObject();
        if (track.value("clipId").toString() != originalId) {
            next.append(value);
            continue;
        }
        const auto leftTrack = reslice(track, left);
        const auto rightTrack = reslice(track, right);
        next.append(leftTrack);
        next.append(rightTrack);
        if (!originalReframeId.isEmpty() && track.value("id").toString() == originalReframeId) {
            auto reframe = left.value("reframe").toObject();
            reframe.insert("trackId", leftTrack.value("id"));
            left.insert("reframe", reframe);
            reframe = right.value("reframe").toObject();
            reframe.insert("trackId", rightTrack.value("id"));
            right.insert("reframe", reframe);
        }
    }
    mediaTracks = next;
}
}
RangeResult splitRangeClips(const ClipList& clips, const QJsonArray& mediaTracks, double atMs, const IdSet& targets) {
    const auto contains = [atMs](const auto& c) {
        return !isGroupClip(c) && atMs > clipStartMs(c) && atMs < clipEndMs(c);
    };
    IdSet toSplit;
    IdSet affectedLinks;
    for (const auto& c : clips) {
        if (targets.contains(clipId(c)) && contains(c)) {
            toSplit.insert(clipId(c));
            if (!clipLinkId(c).isEmpty()) { affectedLinks.insert(clipLinkId(c)); }
        }
    }
    for (const auto& c : clips) {
        if (!clipLinkId(c).isEmpty() && affectedLinks.contains(clipLinkId(c)) && contains(c)) {
            toSplit.insert(clipId(c));
        }
    }
    RangeResult result{{}, mediaTracks};
    result.clips.reserve(clips.size() + toSplit.size());
    std::map<QString, QString> leftLinks;
    std::map<QString, QString> rightLinks;
    const auto groupLink = [](auto& links, const QString& original) {
        auto [it, inserted] = links.try_emplace(original);
        if (inserted) { it->second = newId(); }
        return it->second;
    };
    for (const auto& c : clips) {
        if (toSplit.contains(clipId(c))) {
            try {
                auto [left, right] = splitClip(c, atMs);
                const auto link = clipLinkId(c);
                if (!link.isEmpty()) {
                    left.insert("linkId", groupLink(leftLinks, link));
                    right.insert("linkId", groupLink(rightLinks, link));
                } else {
                    left.remove("linkId");
                    right.remove("linkId");
                }
                splitMediaTracks(result.mediaTracks, clipId(c), left, right);
                result.clips.push_back(std::move(left));
                result.clips.push_back(std::move(right));
                continue;
            } catch (const OpError&) {
                // Match the web's per-clip refusal, preserving its other siblings.
            }
        }
        result.clips.push_back(c);
    }
    return result;
}
}
