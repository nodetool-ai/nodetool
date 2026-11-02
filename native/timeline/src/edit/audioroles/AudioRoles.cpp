#include "AudioRoles.h"

#include "AudioRoleJson.h"
#include "app/Preferences/PreferencesSettings.h"

#include <QJsonArray>
#include <QMetaObject>
#include <QSet>
#include <QSettings>
#include <QThread>

#include <algorithm>
#include <cmath>
#include <set>

using namespace nt::audioroles;

namespace {

QString plural(int n, const char* one, const char* many) { return QStringLiteral("%1 %2").arg(n).arg(QLatin1String(n == 1 ? one : many)); }

QString db(double value) { return QString::number(value, 'f', 1); }

bool ducked(const QString& role) { return role == u"music" || role == u"ambience"; }

// What an analysis depends on: every clip as the mix reads it, and the tracks, but not what the action writes.
// Matching and normalizing ignore every volume, since they render the clip at a volume of their own. Ducking
// hears the trigger clips with their volume and dips from the track fader, so it keeps both, except for the
// volume of the clips it ducks. The volume lanes are left out: a switched-off lane is checked when the edit is made.
// A result is applied only to a document with the same key.
QJsonObject analysisKey(const nt::Timeline& timeline, bool keepVolumes, const QSet<QString>& ignoreVolumeOf) {
    QJsonArray clips;
    for (const auto& clip : timeline.clips) {
        auto raw = clip.raw;
        if (!keepVolumes || ignoreVolumeOf.contains(QString::fromStdString(clip.id))) raw.remove("volumeDb");
        clips.append(QJsonObject{{"clip", raw}, {"media", QString::fromStdString(clip.mediaPath)},
                                 {"audio", QString::fromStdString(clip.audioPath)}});
    }
    QJsonArray tracks;
    for (const auto& track : timeline.tracks) {
        auto raw = track.raw;
        raw.remove("automation");
        if (!keepVolumes) raw.remove("volumeDb");
        tracks.append(raw);
    }
    return {{"clips", clips}, {"tracks", tracks}};
}

}  // namespace

AudioRoles* AudioRoles::forTimeline(TimelineModel* timeline) {
    if (!timeline) return nullptr;
    if (auto* existing = timeline->findChild<AudioRoles*>(QString(), Qt::FindDirectChildrenOnly)) return existing;
    return new AudioRoles(timeline);
}

AudioRoles::AudioRoles(TimelineModel* timeline) : QObject(timeline), m_timeline(timeline) {
    const auto settings = nt::app::openTimelinePreferences();
    for (const auto& role : roles()) {
        const double value = settings->value(QStringLiteral("audio/targetLufs/") + role, defaultTargetLufs(role)).toDouble();
        m_targets.insert(role, std::isfinite(value) ? std::clamp(value, -60.0, 0.0) : defaultTargetLufs(role));
    }
    m_duck.reduceDb = std::clamp(settings->value("audio/duck/reduceDb", 15.0).toDouble(), 0.0, 40.0);
    m_duck.sensitivity = std::clamp(settings->value("audio/duck/sensitivity", 6.0).toDouble(), 0.0, 10.0);
    m_duck.fadeS = std::clamp(settings->value("audio/duck/fadeS", 0.8).toDouble(), 0.0, 5.0);
    QStringList against;
    for (const auto& role : settings->value("audio/duck/against", QStringList{"dialogue"}).toStringList()) {
        if (isRole(role) && !ducked(role)) against.append(role);
    }
    m_duck.against = against.isEmpty() ? QStringList{QStringLiteral("dialogue")} : against;
    // A timeline replaced under a running job makes the job's result stale. The generation check in
    // `start` catches it, and the panel offers to run it again.
}

AudioRoles::~AudioRoles() {
    if (m_cancel) m_cancel->store(true);
    if (m_thread) {
        m_thread->wait();
        delete m_thread;
        m_thread = nullptr;
    }
}

void AudioRoles::saveSettings() const {
    const auto settings = nt::app::openTimelinePreferences();
    for (auto it = m_targets.begin(); it != m_targets.end(); ++it) {
        settings->setValue(QStringLiteral("audio/targetLufs/") + it.key(), it.value());
    }
    settings->setValue("audio/duck/reduceDb", m_duck.reduceDb);
    settings->setValue("audio/duck/sensitivity", m_duck.sensitivity);
    settings->setValue("audio/duck/fadeS", m_duck.fadeS);
    settings->setValue("audio/duck/against", m_duck.against);
}

QVariantMap AudioRoles::targets() const { return m_targets; }

void AudioRoles::setTarget(const QString& role, double lufs) {
    if (!isRole(role) || !std::isfinite(lufs)) return;
    lufs = std::clamp(lufs, -60.0, 0.0);
    if (m_targets.value(role).toDouble() == lufs) return;
    m_targets.insert(role, lufs);
    saveSettings();
    emit settingsChanged();
}
void AudioRoles::setDuckReduceDb(double value) {
    if (!std::isfinite(value)) return;
    value = std::clamp(std::abs(value), 0.0, 40.0);
    if (value == m_duck.reduceDb) return;
    m_duck.reduceDb = value;
    saveSettings();
    emit settingsChanged();
}
void AudioRoles::setDuckSensitivity(double value) {
    if (!std::isfinite(value)) return;
    value = std::clamp(value, 0.0, 10.0);
    if (value == m_duck.sensitivity) return;
    m_duck.sensitivity = value;
    saveSettings();
    emit settingsChanged();
}
void AudioRoles::setDuckFadeS(double value) {
    if (!std::isfinite(value)) return;
    value = std::clamp(value, 0.0, 5.0);
    if (value == m_duck.fadeS) return;
    m_duck.fadeS = value;
    saveSettings();
    emit settingsChanged();
}
void AudioRoles::setDuckAgainst(const QStringList& list) {
    QStringList next;
    for (const auto& role : roles()) {
        if (list.contains(role) && !ducked(role)) next.append(role);
    }
    if (next.isEmpty() || next == m_duck.against) return;
    m_duck.against = next;
    saveSettings();
    emit settingsChanged();
}

void AudioRoles::report(const QString& text, bool error) {
    m_message = text;
    m_messageIsError = error;
    emit messageChanged();
}
void AudioRoles::dismissMessage() {
    if (m_message.isEmpty()) return;
    report({}, false);
}

QString AudioRoles::roleOf(const QString& clipId) const {
    if (!m_timeline) return {};
    const auto* clip = m_timeline->timeline().findClip(clipId.toStdString());
    return clip && soundingType(clip->raw.value("mediaType").toString()) ? effectiveRole(clip->raw) : QString();
}

QVariantMap AudioRoles::roleSummary(const QStringList& ids) const {
    QString shared;
    int count = 0, explicitCount = 0;
    bool mixed = false;
    for (const auto& id : ids) {
        if (!m_timeline) break;
        const auto* clip = m_timeline->timeline().findClip(id.toStdString());
        if (!clip || !soundingType(clip->raw.value("mediaType").toString())) continue;
        const auto role = effectiveRole(clip->raw);
        if (isRole(clip->raw.value("audioRole").toString())) ++explicitCount;
        if (count == 0) shared = role;
        else if (role != shared) mixed = true;
        ++count;
    }
    // `explicitCount`: how many of them have the role as a field. The others read it from how they were made.
    return {{"role", mixed ? QStringLiteral("mixed") : shared}, {"count", count}, {"explicitCount", explicitCount}};
}

bool AudioRoles::setRole(const QStringList& ids, const QString& role) {
    if (!m_timeline || busy() || (!role.isEmpty() && !isRole(role))) return false;
    return m_timeline->applyEdit("setClipsAudioRole", {{"selectedIds", QJsonArray::fromStringList(ids)}, {"role", role}}) != 0;
}

// Sounding, unlocked clips among `ids` (all when empty) whose role `wantRole` accepts.
QStringList AudioRoles::soundingIds(const QStringList& ids, const std::function<bool(const QString&)>& wantRole,
                                    int* skippedNoRole, int* skippedLocked) const {
    QStringList out;
    if (!m_timeline) return out;
    const auto& timeline = m_timeline->timeline();
    const bool all = ids.isEmpty();
    const QSet<QString> chosen(ids.begin(), ids.end());
    for (const auto& clip : timeline.clips) {
        const auto id = QString::fromStdString(clip.id);
        if (!all && !chosen.contains(id)) continue;
        if (!soundingType(clip.raw.value("mediaType").toString())) continue;
        const auto* track = timeline.findTrack(clip.trackId);
        if (clip.raw.value("locked").toBool() || (track && track->locked)) {
            if (!all && skippedLocked) ++*skippedLocked;
            continue;
        }
        if (!wantRole(effectiveRole(clip.raw))) {
            if (!all && skippedNoRole) ++*skippedNoRole;
            continue;
        }
        out.append(id);
    }
    return out;
}

void AudioRoles::cancel() {
    if (m_cancel) m_cancel->store(true);
}

void AudioRoles::start(const QString& task, std::function<QJsonObject(const nt::Timeline&)> keyOf,
                       std::function<void(const CancelFn&, const ProgressFn&)> work, std::function<bool()> apply) {
    m_cancel = std::make_shared<std::atomic_bool>(false);
    m_generation = m_timeline->documentGeneration();
    m_keyOf = std::move(keyOf);
    m_key = m_keyOf(m_timeline->timeline());
    m_task = task;
    m_progress = 0;
    const auto cancelFlag = m_cancel;
    const QPointer<AudioRoles> self(this);
    auto* thread = QThread::create([self, cancelFlag, work = std::move(work)] {
        const CancelFn cancelled = [cancelFlag] { return cancelFlag->load(std::memory_order_relaxed); };
        const ProgressFn progress = [self, cancelFlag](double fraction) {
            if (!self || cancelFlag->load(std::memory_order_relaxed)) return;
            QMetaObject::invokeMethod(self.data(), [self, fraction] {
                if (self && self->m_thread) {
                    self->m_progress = std::clamp(fraction, 0.0, 1.0);
                    emit self->progressChanged();
                }
            }, Qt::QueuedConnection);
        };
        work(cancelled, progress);
    });
    m_thread = thread;
    m_thread->setObjectName(QStringLiteral("audio-roles-analysis"));
    connect(thread, &QThread::finished, this, [this, thread, cancelFlag, task, apply = std::move(apply)] {
        if (m_thread != thread) return;
        m_thread = nullptr;
        thread->deleteLater();
        m_progress = 0;
        const QString finishedTask = task;
        bool applied = false;
        if (cancelFlag->load()) {
            report(QStringLiteral("Cancelled. Nothing was changed."), false);
        } else if (!m_timeline || m_timeline->documentGeneration() != m_generation ||
                   m_keyOf(m_timeline->timeline()) != m_key) {
            report(QStringLiteral("The timeline changed while measuring, so nothing was changed. Run it again."), true);
        } else {
            applied = apply();
        }
        m_task.clear();
        emit busyChanged();
        emit progressChanged();
        emit finished(finishedTask, applied);
    });
    emit busyChanged();
    emit progressChanged();
    thread->start();
}

void AudioRoles::matchLoudness(const QStringList& ids) {
    if (!m_timeline || busy()) return;
    int noRole = 0, locked = 0;
    const auto chosen = soundingIds(ids, [](const QString& role) { return !role.isEmpty(); }, &noRole, &locked);
    if (chosen.isEmpty()) {
        report(!ids.isEmpty() && noRole > 0 ? QStringLiteral("Choose a role for the clip first: Dialogue, Music, SFX or Ambience.")
               : locked > 0                 ? QStringLiteral("The selected clips are locked.")
                                            : QStringLiteral("No clip has a role yet. Choose Dialogue, Music, SFX or Ambience for a clip."),
               true);
        return;
    }
    report({}, false);
    std::vector<std::string> list;
    for (const auto& id : chosen) list.push_back(id.toStdString());
    const auto snapshot = m_timeline->snapshot();
    const auto settingsTargets = m_targets;
    m_measurements.clear();
    start(QStringLiteral("match"), [](const nt::Timeline& t) { return analysisKey(t, false, {}); },
        [this, snapshot, list, settingsTargets](const CancelFn& cancelled, const ProgressFn& progress) {
            const Goal goal{[settingsTargets](const nt::Clip& clip) {
                return settingsTargets.value(effectiveRole(clip.raw), defaultTargetLufs({})).toDouble();
            }, false};
            m_measurements = measureClips(*snapshot, list, goal, cancelled, progress);
        },
        [this, skipped = noRole + locked] {
            const auto plan = volumesFor(m_measurements);
            const auto volumes = plan.volumes;
            const int silent = plan.silent, clamped = plan.clamped;
            if (volumes.isEmpty()) {
                report(plan.firstProblem.isEmpty() ? QStringLiteral("There was nothing to match.") : plan.firstProblem, true);
                return false;
            }
            const bool applied = m_timeline->applyEdit("setClipsVolumeDb", {{"volumes", volumes}}) != 0;
            QString text = applied ? QStringLiteral("Matched %1 to their role targets.").arg(plural(int(volumes.size()), "clip", "clips"))
                                   : QStringLiteral("The clips already match their role targets.");
            if (silent > 0) text += QStringLiteral(" %1 not measured. %2").arg(plural(silent, "clip was", "clips were"), plan.firstProblem);
            if (skipped > 0) text += QStringLiteral(" %1 skipped for having no role or being locked.").arg(plural(skipped, "clip", "clips"));
            if (clamped > 0) text += QStringLiteral(" %1 limited to the volume range.").arg(plural(clamped, "clip", "clips"));
            if (plan.missed > 0) text += QStringLiteral(" %1 kept off the target by its effects.").arg(plural(plan.missed, "clip was", "clips were"));
            report(text, false);
            return applied;
        });
}

void AudioRoles::normalize(const QStringList& ids, const QString& mode, double target) {
    if (!m_timeline || busy()) return;
    const bool peak = mode == u"peak";
    if ((!peak && mode != u"loudness") || !std::isfinite(target)) return;
    int noRole = 0, locked = 0;
    const auto chosen = soundingIds(ids, [](const QString&) { return true; }, &noRole, &locked);
    if (chosen.isEmpty()) {
        report(QStringLiteral("None of the selected clips has sound to measure."), true);
        return;
    }
    report({}, false);
    std::vector<std::string> list;
    for (const auto& id : chosen) list.push_back(id.toStdString());
    const auto snapshot = m_timeline->snapshot();
    m_measurements.clear();
    start(QStringLiteral("normalize"), [](const nt::Timeline& t) { return analysisKey(t, false, {}); },
        [this, snapshot, list, peak, target](const CancelFn& cancelled, const ProgressFn& progress) {
            const Goal goal{[target](const nt::Clip&) { return target; }, peak};
            m_measurements = measureClips(*snapshot, list, goal, cancelled, progress);
        },
        [this, peak, target] {
            const auto plan = volumesFor(m_measurements);
            const auto volumes = plan.volumes;
            const int silent = plan.silent, clamped = plan.clamped;
            if (volumes.isEmpty()) {
                report(plan.firstProblem.isEmpty() ? QStringLiteral("There was nothing to normalize.") : plan.firstProblem, true);
                return false;
            }
            const bool applied = m_timeline->applyEdit("setClipsVolumeDb", {{"volumes", volumes}}) != 0;
            QString text = applied ? QStringLiteral("Normalized %1 to %2 %3.").arg(plural(int(volumes.size()), "clip", "clips"), db(target),
                                                                                     peak ? QStringLiteral("dBFS") : QStringLiteral("LUFS"))
                                   : QStringLiteral("The clips already sit at %1 %2.").arg(db(target), peak ? QStringLiteral("dBFS") : QStringLiteral("LUFS"));
            if (silent > 0) text += QStringLiteral(" %1 not measured. %2").arg(plural(silent, "clip was", "clips were"), plan.firstProblem);
            if (clamped > 0) text += QStringLiteral(" %1 limited to the volume range.").arg(plural(clamped, "clip", "clips"));
            if (plan.missed > 0) text += QStringLiteral(" %1 kept off the target by its effects.").arg(plural(plan.missed, "clip was", "clips were"));
            report(text, false);
            return applied;
        });
}

void AudioRoles::duck(const QStringList& ids) {
    if (!m_timeline || busy()) return;
    int notDucked = 0, locked = 0;
    const auto chosen = soundingIds(ids, [](const QString& role) { return ducked(role); }, &notDucked, &locked);
    if (chosen.isEmpty()) {
        report(locked > 0 && notDucked == 0 ? QStringLiteral("The selected clips are locked.")
                                            : QStringLiteral("Select Music or Ambience clips to duck. Ducking lowers them under Dialogue."),
               true);
        return;
    }
    report({}, false);
    std::vector<std::string> list;
    for (const auto& id : chosen) list.push_back(id.toStdString());
    const auto snapshot = m_timeline->snapshot();
    const auto settings = m_duck;
    m_plans.clear();
    const QSet<QString> targets(chosen.begin(), chosen.end());
    start(QStringLiteral("duck"), [targets](const nt::Timeline& t) { return analysisKey(t, true, targets); },
        [this, snapshot, list, settings](const CancelFn& cancelled, const ProgressFn& progress) {
            m_plans = planDucking(*snapshot, list, settings, cancelled, progress);
        },
        [this, skipped = notDucked + locked] {
            int dipped = 0, problems = 0;
            QString firstProblem;
            std::size_t passages = 0;
            for (const auto& plan : m_plans) {
                if (!plan.problem.isEmpty()) { ++problems; if (firstProblem.isEmpty()) firstProblem = plan.problem; continue; }
                if (!plan.points.empty()) dipped += plan.clips;
                passages += plan.regionsMs.size();
            }
            const auto payload = duckingPayload(m_plans);
            if (payload.value("entries").toArray().isEmpty()) {
                report(firstProblem.isEmpty() ? QStringLiteral("There was nothing to duck.") : firstProblem, true);
                return false;
            }
            const bool applied = m_timeline->applyEdit("applyDucking", payload) != 0;
            QString text;
            if (dipped > 0) {
                text = QStringLiteral("Ducked %1 under %2.").arg(plural(dipped, "clip", "clips"),
                    plural(int(passages), "passage", "passages"));
            } else {
                text = applied ? QStringLiteral("No trigger sound overlaps these clips, so their ducking was cleared.")
                               : QStringLiteral("No trigger sound overlaps these clips, so they need no ducking.");
            }
            if (dipped > 0 && !applied) text = QStringLiteral("The ducking is already up to date.");
            if (problems > 0) text += QStringLiteral(" %1").arg(firstProblem);
            if (skipped > 0) text += QStringLiteral(" %1 skipped for not being Music or Ambience, or being locked.").arg(plural(skipped, "clip", "clips"));
            report(text, false);
            return applied;
        });
}
