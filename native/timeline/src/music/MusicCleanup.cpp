#include "music/MusicCleanup.h"

#include "app/EditRegistry.h"
#include "music/MusicJobs.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"

#include <QThread>

#include <algorithm>

namespace nt::music {
namespace {

// Bounce assets are named `music-<mix|dry>-context-<frame>.wav` (MusicBounce.cpp).
const QString kContextQuery = QStringLiteral("-context-");
constexpr int kPageSize = 500;

// One undo step that removes unused takes (MusicCleanupPlan.h).
const bool removeTakesEdit = nt::app::registerEdit("music.removeTakes", removeTakes);

QString removalKey(const QString& clipId, const QString& takeId) { return clipId + u'\n' + takeId; }

QSet<QString> removalKeys(const CleanupPlan& plan) {
    QSet<QString> keys;
    for (const auto& take : plan.takes) {
        if (take.keptReason.isEmpty()) keys.insert(removalKey(take.clipId, take.takeId));
    }
    return keys;
}

}  // namespace

MusicCleanup::MusicCleanup(QObject* parent) : QObject(parent) {}

MusicCleanup::~MusicCleanup() {
    if (m_worker) {
        m_worker->requestInterruption();
        m_worker->wait();
    }
}

void MusicCleanup::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) return;
    m_timeline = timeline;
    m_target = nt::server::serverSaveTarget();
    reset();
}

void MusicCleanup::setAutosave(QObject* autosave) {
    auto* controller = qobject_cast<nt::server::AutosaveController*>(autosave);
    if (m_autosave == controller) return;
    if (m_autosave) disconnect(m_autosave, nullptr, this, nullptr);
    m_autosave = controller;
    if (m_autosave) {
        connect(m_autosave, &nt::server::AutosaveController::stateChanged, this, &MusicCleanup::autosaveChanged);
    }
    emit changed();
}

QVariantList MusicCleanup::takes() const {
    QVariantList rows;
    for (const auto& take : m_plan.takes) {
        rows.append(QVariantMap{{"clipName", take.clipName},
                                {"label", take.label},
                                {"assetId", take.assetId},
                                {"sizeBytes", m_sizes.value(take.assetId, -1)},
                                {"kept", !take.keptReason.isEmpty()},
                                {"reason", take.keptReason}});
    }
    return rows;
}

QVariantList MusicCleanup::contexts() const {
    QVariantList rows;
    for (const auto& context : m_plan.contexts) {
        rows.append(QVariantMap{{"name", context.name},
                                {"assetId", context.assetId},
                                {"sizeBytes", m_sizes.value(context.assetId, -1)},
                                {"kept", !context.keptReason.isEmpty()},
                                {"reason", context.keptReason}});
    }
    return rows;
}

int MusicCleanup::removeCount() const { return static_cast<int>(removalKeys(m_plan).size()); }

double MusicCleanup::deleteBytes() const {
    double total = 0;
    for (const auto& id : m_plan.deleteAssetIds) total += std::max(0.0, m_sizes.value(id, 0));
    return total;
}

bool MusicCleanup::busy() const {
    return m_state == u"scanning" || m_state == u"saving" || m_state == u"deleting";
}

void MusicCleanup::setState(const QString& state, const QString& message) {
    m_state = state;
    m_message = message;
    emit changed();
}

QSet<QString> MusicCleanup::jobAssets() const {
    auto* jobs = MusicJobs::forTimeline(m_timeline);
    if (!jobs) return {};
    const auto ids = jobs->heldAssetIds();
    return {ids.cbegin(), ids.cend()};
}

void MusicCleanup::reset() {
    if (m_state == u"scanning" || m_state == u"deleting") return;
    m_plan = {};
    m_contextRows = {};
    m_sizes.clear();
    m_shownRemovals.clear();
    m_shownDeletes.clear();
    m_pending.clear();
    m_removed.clear();
    setState(QStringLiteral("idle"));
}

bool MusicCleanup::scan() {
    if (busy() || m_worker) return false;
    if (!m_timeline || !m_target) {
        setState(QStringLiteral("failed"), QStringLiteral("Open a music project from the server to clean up its takes."));
        return false;
    }
    const auto snapshot = m_timeline->timeline().raw;
    const auto sequenceId = snapshot.value(u"id").toString();
    QStringList takeAssets;
    for (const auto& take : planTakeCleanup(snapshot, {}, {}).takes) takeAssets.append(take.assetId);
    takeAssets.removeDuplicates();
    setState(QStringLiteral("scanning"));
    const QPointer<MusicCleanup> self(this);
    m_worker.reset(QThread::create([self, sequenceId, takeAssets, target = *m_target] {
        ScanResult result;
        const auto interrupted = [] { return QThread::currentThread()->isInterruptionRequested(); };
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        QString cursor;
        QSet<QString> cursors;
        do {
            QJsonObject input{{"query", kContextQuery}, {"page_size", kPageSize}};
            if (!cursor.isEmpty()) input.insert("cursor", cursor);
            const auto response = client.query(QStringLiteral("assets.search"), input);
            if (!response.ok()) {
                result.error = QStringLiteral("Could not list the context bounces: ") + response.describe();
                break;
            }
            const auto page = response.data.toObject();
            for (const auto& value : page.value(u"assets").toArray()) {
                const auto asset = value.toObject();
                if (!isContextAssetOf(asset, sequenceId)) continue;
                result.contexts.append(asset);
                if (asset.value(u"size").isDouble()) result.sizes.insert(asset.value(u"id").toString(), asset.value(u"size").toDouble());
            }
            cursor = page.value(u"next_cursor").toString();
            if (cursors.contains(cursor)) break;
            cursors.insert(cursor);
        } while (!cursor.isEmpty() && !interrupted());
        if (result.error.isEmpty() && !interrupted() && !takeAssets.isEmpty()) {
            std::vector<std::pair<QString, QJsonObject>> calls;
            for (const auto& id : takeAssets) calls.emplace_back(QStringLiteral("assets.get"), QJsonObject{{"id", id}});
            const auto answers = client.queryAll(calls);
            for (std::size_t i = 0; i < answers.size() && i < calls.size(); ++i) {
                const auto size = answers[i].data.toObject().value(u"size");
                if (answers[i].ok() && size.isDouble()) result.sizes.insert(takeAssets[static_cast<qsizetype>(i)], size.toDouble());
            }
        }
        // `self` outlives this thread: ~MusicCleanup joins it first.
        QMetaObject::invokeMethod(
            self.data(), [self, result] {
                if (self) self->scanned(result);
            },
            Qt::QueuedConnection);
    }));
    m_worker->start();
    return true;
}

void MusicCleanup::scanned(const ScanResult& result) {
    if (m_worker) {
        m_worker->wait();
        m_worker.reset();
    }
    if (!result.error.isEmpty() || !m_timeline) {
        setState(QStringLiteral("failed"), result.error.isEmpty() ? QStringLiteral("The timeline closed.") : result.error);
        return;
    }
    m_contextRows = result.contexts;
    m_sizes = result.sizes;
    // The document as it is now: an edit during the scan is in the list.
    m_plan = planTakeCleanup(m_timeline->timeline().raw, m_contextRows, jobAssets());
    m_shownRemovals = removalKeys(m_plan);
    m_shownDeletes = {m_plan.deleteAssetIds.cbegin(), m_plan.deleteAssetIds.cend()};
    setState(QStringLiteral("ready"), m_plan.deleteAssetIds.isEmpty() ? QStringLiteral("There is nothing to clean up.") : QString());
}

bool MusicCleanup::confirm() {
    if (m_state != u"ready" || !m_timeline) return false;
    if (!m_autosave) {
        setState(QStringLiteral("failed"), QStringLiteral("This timeline does not save to the server, so nothing was removed."));
        return false;
    }
    const auto plan = planTakeCleanup(m_timeline->timeline().raw, m_contextRows, jobAssets());
    const QSet<QString> deletes{plan.deleteAssetIds.cbegin(), plan.deleteAssetIds.cend()};
    if (removalKeys(plan) != m_shownRemovals || deletes != m_shownDeletes) {
        // Never remove or delete what the person did not see.
        m_plan = plan;
        m_shownRemovals = removalKeys(plan);
        m_shownDeletes = deletes;
        setState(QStringLiteral("ready"), QStringLiteral("The sequence changed. Check the updated list and confirm again."));
        return false;
    }
    if (plan.deleteAssetIds.isEmpty()) {
        setState(QStringLiteral("done"), QStringLiteral("There is nothing to clean up."));
        return true;
    }
    const auto removal = plan.removal();
    if (!removal.value(u"takes").toArray().isEmpty() && m_timeline->applyEdit(QStringLiteral("music.removeTakes"), removal) == 0) {
        setState(QStringLiteral("failed"), QStringLiteral("The takes could not be removed. Check clip and track locks."));
        return false;
    }
    m_plan = plan;
    m_removed = removalKeys(plan);
    m_pending = plan.deleteAssetIds;
    setState(QStringLiteral("saving"), QStringLiteral("Waiting for the sequence to save before deleting audio."));
    autosaveChanged();
    return true;
}

void MusicCleanup::autosaveChanged() {
    if (m_state != u"saving") return;
    if (!m_autosave || !m_timeline) {
        m_pending.clear();
        setState(QStringLiteral("failed"), QStringLiteral("The timeline closed before it saved. No audio was deleted."));
        return;
    }
    if (m_autosave->dirty() || m_autosave->saving()) return;
    // The server holds this document. A removed take back on its clip is an undo of the
    // clean-up: it cancels every deletion.
    bool undone = false;
    for (const auto& value : m_timeline->timeline().raw.value(u"clips").toArray()) {
        const auto clip = value.toObject();
        for (const auto& version : clip.value(u"versions").toArray()) {
            undone = undone || m_removed.contains(removalKey(clip.value(u"id").toString(), version.toObject().value(u"id").toString()));
        }
    }
    if (undone) {
        m_pending.clear();
        setState(QStringLiteral("done"), QStringLiteral("The clean-up was undone, so no audio was deleted."));
        return;
    }
    // Keep whatever the document names again or a job holds.
    const QSet<QString> pending{m_pending.cbegin(), m_pending.cend()};
    const auto named = namedAssetIds(m_timeline->timeline().raw, pending);
    const auto held = jobAssets();
    QStringList targets;
    for (const auto& id : m_pending) {
        if (!named.contains(id) && !held.contains(id)) targets.append(id);
    }
    m_pending.clear();
    if (targets.isEmpty()) {
        setState(QStringLiteral("done"), QStringLiteral("Everything is in use again, so no audio was deleted."));
        return;
    }
    if (!m_target || m_worker) {
        setState(QStringLiteral("failed"), QStringLiteral("No audio was deleted: the server is not available."));
        return;
    }
    setState(QStringLiteral("deleting"));
    const QPointer<MusicCleanup> self(this);
    m_worker.reset(QThread::create([self, targets, target = *m_target] {
        DeleteResult result;
        nt::server::ServerClient client(target.server, target.token);
        client.setExpectedInstance(target.expectedInstance);
        for (const auto& id : targets) {
            if (QThread::currentThread()->isInterruptionRequested()) {
                result.failed.append(id + QStringLiteral(": cancelled"));
                continue;
            }
            const auto response = client.mutate(QStringLiteral("assets.delete"), {{"id", id}});
            // Already gone is what the clean-up wanted.
            if (response.ok() || response.error.code == u"NOT_FOUND") {
                result.deleted.append(id);
            } else {
                result.failed.append(id + QStringLiteral(": ") + response.describe());
            }
        }
        // `self` outlives this thread: ~MusicCleanup joins it first.
        QMetaObject::invokeMethod(
            self.data(), [self, result] {
                if (self) self->deletedAssets(result);
            },
            Qt::QueuedConnection);
    }));
    m_worker->start();
}

void MusicCleanup::deletedAssets(const DeleteResult& result) {
    if (m_worker) {
        m_worker->wait();
        m_worker.reset();
    }
    double bytes = 0;
    for (const auto& id : result.deleted) bytes += std::max(0.0, m_sizes.value(id, 0));
    const auto summary = QStringLiteral("Deleted %1 audio files (%2 MB).")
                             .arg(result.deleted.size())
                             .arg(bytes / (1024.0 * 1024.0), 0, 'f', 1);
    if (result.failed.isEmpty()) {
        setState(QStringLiteral("done"), summary);
    } else {
        setState(QStringLiteral("failed"), summary + QStringLiteral(" Could not delete: ") + result.failed.join(QStringLiteral("; ")));
    }
}

}  // namespace nt::music
