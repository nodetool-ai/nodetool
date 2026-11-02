#include "LibraryScrub.h"
#include "LibraryScrubSource.h"
#include "SourceViewerState.h"
#include "app/Preferences/PreferencesSettings.h"
#include "assets/AssetClip.h"
#include "server/ServerSource.h"
#include <QCoreApplication>
#include <QDateTime>
#include <QDir>
#include <QKeyEvent>
#include <QPainter>
#include <QQmlEngine>
#include <QQuickWindow>
#include <algorithm>
#include <cmath>

namespace {
constexpr int kDwellMs = 150;
constexpr qsizetype kMaxPaths = 256;
// Files kept in the cache while a tile may still show them.
constexpr qsizetype kMaxLeases = 8;
constexpr qint64 kRetryAfterMs = 30000;
const QString kPreference = QStringLiteral("library/hoverScrub");

double durationSeconds(const QVariantMap& asset) {
    const double seconds = asset.value("duration").toDouble();
    return std::isfinite(seconds) && seconds > 0 ? seconds : 0;
}
bool insideSource(const QQuickItem* item) {
    for (; item; item = item->parentItem()) {
        if (item->objectName() == u"sourceViewer") { return true; }
    }
    return false;
}
}  // namespace

LibraryScrub::LibraryScrub(QObject* parent) : QObject(parent) {
    m_enabled = nt::app::openTimelinePreferences()->value(kPreference, true).toBool();
    m_dwell.setSingleShot(true);
    m_dwell.setInterval(kDwellMs);
    connect(&m_dwell, &QTimer::timeout, this, &LibraryScrub::settle);
    connect(&nt::ui::MediaPreviewCache::instance(), &nt::ui::MediaPreviewCache::thumbnailsReady, this,
            [this](const QString& path) { if (path == m_path) { acquire(); } });
    if (auto* app = QCoreApplication::instance()) { app->installEventFilter(this); }
}

LibraryScrub::~LibraryScrub() {
    if (auto* app = QCoreApplication::instance()) { app->removeEventFilter(this); }
    nt::ui::MediaPreviewCache::instance().unsubscribe(this);
}

bool LibraryScrub::scrubbable(const QVariantMap& asset) {
    return !asset.value("id").toString().isEmpty() &&
        nt::assets::assetMediaType(QJsonObject{{"content_type", QJsonValue::fromVariant(asset.value("content_type"))}}) == "video";
}

SourceViewerState* LibraryScrub::source() {
    if (!m_source) {
        if (auto* engine = qmlEngine(this)) {
            m_source = engine->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        }
    }
    return m_source;
}

int LibraryScrub::frameIndex() const {
    if (!m_set || m_set->thumbs.empty()) { return -1; }
    const int last = static_cast<int>(m_set->thumbs.size()) - 1;
    return std::clamp(static_cast<int>(std::lround(m_fraction * last)), 0, last);
}

bool LibraryScrub::hasTime() const {
    return !hoveredId().isEmpty() && (durationSeconds(m_asset) > 0 || frameIndex() >= 0);
}

double LibraryScrub::timeMs() const {
    if (const double seconds = durationSeconds(m_asset); seconds > 0) { return m_fraction * seconds * 1000; }
    const int index = frameIndex();
    return index >= 0 ? m_set->thumbs[static_cast<size_t>(index)].timeSec * 1000 : 0;
}

void LibraryScrub::setEnabled(bool value) {
    if (m_enabled == value) { return; }
    m_enabled = value;
    auto settings = nt::app::openTimelinePreferences();
    settings->setValue(kPreference, value);
    settings->sync();
    if (value) {
        if (!hoveredId().isEmpty()) { m_dwell.start(); }
    } else {
        release();
    }
    emit enabledChanged();
}

bool LibraryScrub::toggle() {
    setEnabled(!m_enabled);
    return true;
}

void LibraryScrub::release() {
    m_dwell.stop();
    m_settled = false;
    m_path.clear();
    nt::ui::MediaPreviewCache::instance().unsubscribe(this);
    if (m_set) {
        m_set.reset();
        emit readyChanged();
    }
}

void LibraryScrub::hover(const QVariantMap& asset, double fraction) {
    if (!scrubbable(asset)) {
        clear();
        return;
    }
    const double next = std::isfinite(fraction) ? std::clamp(fraction, 0.0, 1.0) : 0;
    const bool another = hoveredId() != asset.value("id").toString();
    if (another) {
        release();
        m_asset = asset;
        m_fraction = next;
        if (m_enabled) { m_dwell.start(); }
        emit hoveredChanged();
        emit positionChanged();
        return;
    }
    m_asset = asset;
    if (next != m_fraction) {
        m_fraction = next;
        emit positionChanged();
    }
}

void LibraryScrub::leave(const QString& assetId) {
    if (assetId == hoveredId()) { clear(); }
}

void LibraryScrub::clear() {
    if (m_asset.isEmpty()) { return; }
    release();
    m_asset.clear();
    m_fraction = 0;
    emit hoveredChanged();
    emit positionChanged();
}

void LibraryScrub::settle() {
    m_settled = true;
    acquire();
}

void LibraryScrub::acquire() {
    const QString id = hoveredId();
    if (!m_enabled || !m_settled || id.isEmpty()) { return; }
    if (m_testSet) {
        if (m_set != m_testSet) {
            m_set = m_testSet;
            emit readyChanged();
            emit positionChanged();
        }
        return;
    }
    QString path = m_path;
    if (path.isEmpty()) {
        path = m_resolver ? m_resolver(m_asset) : m_paths.value(id);
    }
    if (path.isEmpty()) {
        if (!m_resolver) { startFetch(); }
        return;
    }
    m_path = path;
    auto set = nt::ui::MediaPreviewCache::instance().thumbnails(path, QStringLiteral("video"), this);
    if (set == m_set) { return; }
    m_set = std::move(set);
    emit readyChanged();
    emit positionChanged();
}

void LibraryScrub::startFetch() {
    const QString id = hoveredId();
    if (m_worker) { return; }
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (const auto failed = m_failedAtMs.constFind(id); failed != m_failedAtMs.constEnd() && now - failed.value() < kRetryAfterMs) {
        return;
    }
    const auto target = nt::server::serverSaveTarget();
    if (!target) { return; }
    ++m_fetches;
    const QPointer<LibraryScrub> self(this);
    const auto listed = QJsonObject::fromVariantMap(m_asset);
    auto* worker = QThread::create([self, listed, target, id] {
        const auto interrupted = [] { return QThread::currentThread()->isInterruptionRequested(); };
        nt::assets::ScrubSource found;
        nt::server::ServerClient client(target->server, target->token, 10000);
        client.setExpectedInstance(target->expectedInstance);
        const auto answer = client.getAsset(id);
        if (answer.ok() && !interrupted()) {
            auto asset = listed;
            const auto fetched = answer.data.toObject();
            for (auto it = fetched.begin(); it != fetched.end(); ++it) { asset.insert(it.key(), it.value()); }
            const auto cacheRoot = QDir::cleanPath(QDir(target->backupDir).absoluteFilePath("../../.."));
            found = nt::assets::fetchScrubSource(client, cacheRoot, asset, interrupted);
        }
        if (!self) { return; }
        QMetaObject::invokeMethod(self, [self, id, found] { if (self) { self->received(id, found.path, found.lease); } },
                                  Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    m_worker = worker;
    worker->start();
}

void LibraryScrub::received(const QString& id, const QString& path, nt::server::AssetCache::Lease lease) {
    m_worker.clear();
    if (path.isEmpty()) {
        m_failedAtMs.insert(id, QDateTime::currentMSecsSinceEpoch());
    } else {
        m_paths.insert(id, path);
        m_pathOrder.removeAll(id);
        m_pathOrder.append(id);
        while (m_pathOrder.size() > kMaxPaths) { m_paths.remove(m_pathOrder.takeFirst()); }
        m_leases.insert(id, std::move(lease));
        m_leaseOrder.removeAll(id);
        m_leaseOrder.append(id);
        while (m_leaseOrder.size() > kMaxLeases) { m_leases.remove(m_leaseOrder.takeFirst()); }
    }
    // The pointer may have moved on to a clip that waited for this worker.
    acquire();
}

bool LibraryScrub::mark(const QString& edge) {
    auto* state = source();
    if (!m_enabled || !state || !hasTime()) { return false; }
    return state->markAsset(m_asset, edge, timeMs());
}

bool LibraryScrub::cue(const QVariantMap& asset) {
    auto* state = source();
    if (!m_enabled || !state || !hasTime() || asset.value("id").toString() != hoveredId()) { return false; }
    state->cue(asset, timeMs());
    return true;
}

bool LibraryScrub::eventFilter(QObject* watched, QEvent* event) {
    if (event->type() != QEvent::KeyPress || hoveredId().isEmpty()) { return false; }
    auto* window = qobject_cast<QQuickWindow*>(watched);
    if (!window) { return false; }
    const auto* key = static_cast<QKeyEvent*>(event);
    if (key->isAutoRepeat()) { return false; }
    const auto modifiers = key->modifiers() & ~Qt::KeypadModifier;
    const bool toggleKey = key->key() == Qt::Key_H && modifiers == Qt::ShiftModifier;
    const bool markKey = (key->key() == Qt::Key_I || key->key() == Qt::Key_O) && modifiers == Qt::NoModifier;
    if (!toggleKey && !markKey) { return false; }
    // Typing goes to the field, and Source marks its own clip when it has the keys.
    const auto* focused = window->activeFocusItem();
    if (focused && focused->inputMethodQuery(Qt::ImEnabled).toBool()) { return false; }
    if (markKey && (!m_enabled || insideSource(focused))) { return false; }
    if (toggleKey) { return toggle(); }
    return mark(key->key() == Qt::Key_I ? QStringLiteral("in") : QStringLiteral("out"));
}

LibraryScrubFrame::LibraryScrubFrame(QQuickItem* parent) : QQuickPaintedItem(parent) {
    setAntialiasing(false);
}

void LibraryScrubFrame::setScrub(LibraryScrub* scrub) {
    if (m_scrub == scrub) { return; }
    if (m_scrub) { m_scrub->disconnect(this); }
    m_scrub = scrub;
    if (m_scrub) {
        connect(m_scrub, &LibraryScrub::positionChanged, this, [this] { update(); });
        connect(m_scrub, &LibraryScrub::readyChanged, this, [this] { update(); });
    }
    update();
    emit scrubChanged();
}

void LibraryScrubFrame::paint(QPainter* painter) {
    if (!m_scrub) { return; }
    const auto frames = m_scrub->frames();
    const int index = m_scrub->frameIndex();
    if (!frames || index < 0 || frames->thumbSize.isEmpty() || width() <= 0 || height() <= 0) { return; }
    // Cover the item and crop the overflow, as the tile's poster does.
    const QSize cell = frames->thumbSize;
    const double scale = std::max(width() / cell.width(), height() / cell.height());
    const QSizeF shown(width() / scale, height() / scale);
    const QRectF from(index * cell.width() + (cell.width() - shown.width()) / 2, (cell.height() - shown.height()) / 2,
                      shown.width(), shown.height());
    painter->setRenderHint(QPainter::SmoothPixmapTransform);
    painter->drawImage(QRectF(0, 0, width(), height()), frames->atlas, from);
}
