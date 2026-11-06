#include "motion/mattes/MatteResolver.h"
#include "model/TimelineModel.h"
#include "server/ServerClient.h"
#include "server/ServerTimeline.h"
#include <QDir>
#include <QFileInfo>

namespace nt::motion {
MatteResolver::MatteResolver(TimelineModel& model, nt::server::SaveTarget target)
    : QObject(&model), m_model(&model), m_target(std::move(target)) {
    connect(&model, &TimelineModel::documentReplaced, this, [this] { reset(); });
    connect(&model, &TimelineModel::clipsChanged, this, [this] { scan(); });
    reset();
    scan();
}
MatteResolver::~MatteResolver() {
    if (m_worker) { m_worker->requestInterruption(); m_worker->wait(); }
}
void MatteResolver::reset() {
    m_pending.clear();
    m_queued.clear();
    QSet<QString> paths;
    if (m_model) {
        for (const auto& clip : m_model->timeline().clips) {
            if (!clip.mediaPath.empty()) paths.insert(QString::fromStdString(clip.mediaPath));
            if (!clip.audioPath.empty()) paths.insert(QString::fromStdString(clip.audioPath));
            if (!clip.generatedMattePath.empty()) paths.insert(QString::fromStdString(clip.generatedMattePath));
        }
    }
    m_protection->reset(std::move(paths));
}
void MatteResolver::scan() {
    if (!m_model) { return; }
    for (const auto& clip : m_model->timeline().clips) {
        m_protection->protect(QString::fromStdString(clip.mediaPath));
        m_protection->protect(QString::fromStdString(clip.audioPath));
        m_protection->protect(QString::fromStdString(clip.generatedMattePath));
        const auto matte = clip.raw.value("generatedMatte").toObject();
        const auto id = matte.value("assetId").toString();
        if (nt::server::assetIdForReference(id).isEmpty() || !clip.generatedMattePath.empty() ||
            !matte.value("mediaPath").toString().isEmpty() || matte.value("status").toString("ready") != "ready" ||
            m_queued.contains(id)) { continue; }
        m_queued.insert(id);
        m_pending.push_back(id);
    }
    next();
}
void MatteResolver::next() {
    if (!m_model || m_worker || m_pending.empty()) { return; }
    const auto id = m_pending.front();
    m_pending.pop_front();
    const auto lookupId = nt::server::assetIdForReference(id);
    const auto generation = m_model->documentGeneration();
    const auto protectionGeneration = m_protection->generation();
    const auto root = QDir::cleanPath(QDir(m_target.backupDir).absoluteFilePath("../../.."));
    auto result = std::make_shared<nt::Clip>();
    const auto target = m_target;
    auto* worker = QThread::create([target, lookupId, root, protection = m_protection, protectionGeneration, result] {
        nt::server::ServerClient client(target.server, target.token, 10000);
        client.setExpectedInstance(target.expectedInstance);
        if (protection->generation() != protectionGeneration || QThread::currentThread()->isInterruptionRequested()) return;
        const auto asset = client.getAsset(lookupId);
        if (!asset.ok()) return;
        *result = nt::assets::resolveDroppedMedia(client, root, asset.data.toObject(),
            QJsonObject{{"mediaType", "image"}}, *protection, protectionGeneration);
    });
    worker->setParent(this);
    m_worker = worker;
    connect(worker, &QThread::finished, this, [this, worker, result, id, generation] {
        m_worker.clear();
        worker->deleteLater();
        if (m_model && m_model->documentGeneration() == generation) {
            m_queued.remove(id);
            if (QFileInfo::exists(QString::fromStdString(result->mediaPath))) m_model->registerMatteMedia(id, result->mediaPath);
        }
        next();
    });
    worker->start();
}
}
