#include "music/MusicCleanupPlan.h"

#include <QHash>

#include <deque>

namespace nt::music {
namespace {

const QString kLocked = QStringLiteral("Its clip or track is locked.");
const QString kJobHolds = QStringLiteral("A music job still holds this audio.");
const QString kStillUsed = QStringLiteral("Another clip or take still uses this audio.");
const QString kContextNamed = QStringLiteral("A take that stays names it as its context.");
const QString kContextJob = QStringLiteral("A music job still needs it.");

bool isHex(QChar c) { return (c >= u'0' && c <= u'9') || (c >= u'a' && c <= u'f'); }

void collect(const QJsonValue& value, const QSet<QString>& ids, QSet<QString>& found) {
    if (value.isString()) {
        const auto text = value.toString();
        if (ids.contains(text)) {
            found.insert(text);
            return;
        }
        // Every maximal run of exactly 32 hex characters: an id inside a URI or a URL.
        qsizetype i = 0;
        while (i < text.size()) {
            if (!isHex(text[i])) {
                ++i;
                continue;
            }
            qsizetype end = i;
            while (end < text.size() && isHex(text[end])) ++end;
            if (end - i == 32) {
                const auto run = text.mid(i, 32);
                if (ids.contains(run)) found.insert(run);
            }
            i = end;
        }
    } else if (value.isArray()) {
        for (const auto& item : value.toArray()) collect(item, ids, found);
    } else if (value.isObject()) {
        const auto object = value.toObject();
        for (auto it = object.begin(); it != object.end(); ++it) collect(it.value(), ids, found);
    }
}

struct Candidate {
    int clip = 0;
    CleanupTake take;
    QSet<QString> names;  // the assets its own version names, its own audio left out
    bool locked = false;
};

bool isUnusedMusicTake(const QJsonObject& clip, const QJsonObject& version) {
    if (version.value(u"musicGeneration").toObject().isEmpty()) return false;
    const auto id = version.value(u"id").toString();
    const auto asset = version.value(u"assetId").toString();
    if (id.isEmpty() || asset.isEmpty()) return false;
    return id != clip.value(u"activeTakeId").toString() && asset != clip.value(u"currentAssetId").toString();
}

QSet<QString> lockedTracks(const QJsonObject& raw) {
    QSet<QString> out;
    for (const auto& value : raw.value(u"tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value(u"locked").toBool()) out.insert(track.value(u"id").toString());
    }
    return out;
}

}  // namespace

QJsonObject CleanupPlan::removal() const {
    QJsonArray list;
    for (const auto& take : takes) {
        if (take.keptReason.isEmpty()) list.append(QJsonObject{{"clipId", take.clipId}, {"takeId", take.takeId}});
    }
    return {{"takes", list}};
}

bool isContextAssetOf(const QJsonObject& asset, const QString& sequenceId) {
    const auto metadata = asset.value(u"metadata").toObject();
    return !sequenceId.isEmpty() && metadata.value(u"generation_context").toString() == u"music" &&
           metadata.value(u"sequence_id").toString() == sequenceId && !asset.value(u"id").toString().isEmpty();
}

QSet<QString> namedAssetIds(const QJsonValue& value, const QSet<QString>& ids) {
    QSet<QString> found;
    if (!ids.isEmpty()) collect(value, ids, found);
    return found;
}

CleanupPlan planTakeCleanup(const QJsonObject& rawSequence, const QJsonArray& contextAssets,
                            const QSet<QString>& protectedAssetIds) {
    CleanupPlan plan;
    const auto sequenceId = rawSequence.value(u"id").toString();
    const auto locked = lockedTracks(rawSequence);
    const auto clips = rawSequence.value(u"clips").toArray();

    std::vector<Candidate> candidates;
    QHash<QString, QList<int>> byAsset;
    QSet<QString> relevant;
    for (qsizetype c = 0; c < clips.size(); ++c) {
        const auto clip = clips[c].toObject();
        const bool clipLocked = clip.value(u"locked").toBool() || locked.contains(clip.value(u"trackId").toString());
        for (const auto& value : clip.value(u"versions").toArray()) {
            const auto version = value.toObject();
            if (!isUnusedMusicTake(clip, version)) continue;
            Candidate candidate;
            candidate.clip = static_cast<int>(c);
            candidate.locked = clipLocked;
            candidate.take = {clip.value(u"id").toString(), clip.value(u"name").toString(), version.value(u"id").toString(),
                              version.value(u"label").toString(), version.value(u"assetId").toString(), {}};
            byAsset[candidate.take.assetId].append(static_cast<int>(candidates.size()));
            relevant.insert(candidate.take.assetId);
            candidates.push_back(std::move(candidate));
        }
    }
    QList<CleanupContext> contexts;
    QSet<QString> seenContexts;
    for (const auto& value : contextAssets) {
        const auto asset = value.toObject();
        const auto id = asset.value(u"id").toString();
        if (!isContextAssetOf(asset, sequenceId) || seenContexts.contains(id) || byAsset.contains(id)) continue;
        seenContexts.insert(id);
        contexts.append({id, asset.value(u"name").toString(), {}});
        relevant.insert(id);
    }

    // What the document names once every candidate is gone.
    auto rest = rawSequence;
    {
        QSet<QString> candidateIds;
        for (const auto& candidate : candidates) candidateIds.insert(candidate.take.clipId + u'\n' + candidate.take.takeId);
        QJsonArray restClips;
        for (const auto& value : clips) {
            auto clip = value.toObject();
            QJsonArray versions;
            bool changed = false;
            for (const auto& entry : clip.value(u"versions").toArray()) {
                if (candidateIds.contains(clip.value(u"id").toString() + u'\n' + entry.toObject().value(u"id").toString())) {
                    changed = true;
                } else {
                    versions.append(entry);
                }
            }
            if (changed) clip.insert("versions", versions);
            restClips.append(clip);
        }
        rest.insert("clips", restClips);
    }
    const auto namedByRest = namedAssetIds(rest, relevant);
    for (auto& candidate : candidates) {
        const auto clip = clips[candidate.clip].toObject();
        for (const auto& value : clip.value(u"versions").toArray()) {
            if (value.toObject().value(u"id").toString() == candidate.take.takeId) {
                candidate.names = namedAssetIds(value, relevant);
                candidate.names.remove(candidate.take.assetId);
                break;
            }
        }
    }

    // Keeping a take keeps its audio, every take of that audio, and what its record names.
    QSet<QString> keptAssets;
    std::deque<QString> queue;
    const auto keep = [&](const QString& asset, const QString& reason) {
        if (!byAsset.contains(asset) || keptAssets.contains(asset)) return;
        keptAssets.insert(asset);
        for (const int index : byAsset.value(asset)) {
            if (candidates[index].take.keptReason.isEmpty()) candidates[index].take.keptReason = reason;
        }
        queue.push_back(asset);
    };
    for (const auto& candidate : candidates) {
        if (candidate.locked) keep(candidate.take.assetId, kLocked);
    }
    for (const auto& asset : protectedAssetIds) keep(asset, kJobHolds);
    for (const auto& asset : namedByRest) keep(asset, kStillUsed);
    QSet<QString> namedByKept;
    while (!queue.empty()) {
        const auto asset = queue.front();
        queue.pop_front();
        for (const int index : byAsset.value(asset)) {
            for (const auto& named : candidates[index].names) {
                namedByKept.insert(named);
                keep(named, kStillUsed);
            }
        }
    }

    QSet<QString> deleted;
    for (const auto& candidate : candidates) {
        plan.takes.append(candidate.take);
        if (candidate.take.keptReason.isEmpty() && !deleted.contains(candidate.take.assetId)) {
            deleted.insert(candidate.take.assetId);
            plan.deleteAssetIds.append(candidate.take.assetId);
        }
    }
    for (auto& context : contexts) {
        if (namedByRest.contains(context.assetId) || namedByKept.contains(context.assetId)) {
            context.keptReason = kContextNamed;
        } else if (protectedAssetIds.contains(context.assetId)) {
            context.keptReason = kContextJob;
        } else {
            plan.deleteAssetIds.append(context.assetId);
        }
        plan.contexts.append(context);
    }
    return plan;
}

QJsonObject removeTakes(QJsonObject raw, const QJsonObject& payload) {
    QHash<QString, QSet<QString>> byClip;
    for (const auto& value : payload.value(u"takes").toArray()) {
        const auto entry = value.toObject();
        const auto clipId = entry.value(u"clipId").toString();
        const auto takeId = entry.value(u"takeId").toString();
        if (!clipId.isEmpty() && !takeId.isEmpty()) byClip[clipId].insert(takeId);
    }
    if (byClip.isEmpty()) return raw;
    const auto locked = lockedTracks(raw);
    auto clips = raw.value(u"clips").toArray();
    bool changed = false;
    for (qsizetype c = 0; c < clips.size(); ++c) {
        auto clip = clips[c].toObject();
        const auto wanted = byClip.constFind(clip.value(u"id").toString());
        if (wanted == byClip.cend()) continue;
        if (clip.value(u"locked").toBool() || locked.contains(clip.value(u"trackId").toString())) continue;
        QJsonArray versions;
        bool removed = false;
        for (const auto& value : clip.value(u"versions").toArray()) {
            const auto version = value.toObject();
            // Only an unused music take goes: never the active one.
            if (wanted->contains(version.value(u"id").toString()) && isUnusedMusicTake(clip, version)) {
                removed = true;
            } else {
                versions.append(value);
            }
        }
        if (!removed) continue;
        clip.insert("versions", versions);
        clips.replace(c, clip);
        changed = true;
    }
    if (!changed) return raw;
    raw.insert("clips", clips);
    return raw;
}

}  // namespace nt::music
