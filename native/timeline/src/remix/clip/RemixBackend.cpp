#include "remix/clip/RemixBackend.h"

#include "server/ServerSource.h"

#include <QDir>
#include <QThread>

namespace nt::remix {
namespace {
class ServerBackend final : public Backend {
public:
    explicit ServerBackend(nt::server::SaveTarget target) : m_target(std::move(target)) {}

    ResolvedAudio resolve(const QString& assetId, nt::assets::MediaProtection& protection, quint64 generation) override {
        nt::server::ServerClient client(m_target.server, m_target.token);
        client.setExpectedInstance(m_target.expectedInstance);
        ResolvedAudio out;
        const auto asset = client.getAsset(assetId);
        if (!asset.ok()) { out.error = asset.describe(); return out; }
        out.asset = asset.data.toObject();
        // ServerSource places backups at <cacheRoot>/<serverKey>/<userKey>/timelines.
        const auto cacheRoot = QDir::cleanPath(QDir(m_target.backupDir).absoluteFilePath("../../.."));
        const QJsonObject clip{{"mediaType", "audio"}, {"currentAssetId", assetId}};
        out.media = nt::assets::resolveDroppedMedia(client, cacheRoot, out.asset, clip, protection, generation);
        if (out.media.audioPath.empty()) { out.error = QStringLiteral("The audio could not be downloaded."); }
        return out;
    }

    UploadedAudio upload(const QString& wavPath, const QString& name, const QString& siblingAssetId) override {
        nt::server::ServerClient client(m_target.server, m_target.token);
        client.setExpectedInstance(m_target.expectedInstance);
        UploadedAudio out;
        QJsonObject fields{{"name", name}, {"content_type", "audio/wav"}};
        const auto sibling = client.getAsset(siblingAssetId);
        if (sibling.ok()) {
            const auto asset = sibling.data.toObject();
            for (const auto* key : {"parent_id", "project_id", "workflow_id"}) {
                if (!asset.value(key).toString().isEmpty()) { fields.insert(key, asset.value(key)); }
            }
        }
        if (QThread::currentThread()->isInterruptionRequested()) { out.error = QStringLiteral("Cancelled."); return out; }
        const auto uploaded = client.upload(fields, wavPath, "audio/wav");
        if (!uploaded.ok()) { out.error = uploaded.describe(); return out; }
        out.asset = uploaded.data.toObject();
        if (out.asset.value("id").toString().isEmpty()) { out.error = QStringLiteral("The server did not return the new asset."); }
        return out;
    }

private:
    nt::server::SaveTarget m_target;
};
}  // namespace

std::shared_ptr<Backend> serverBackend(const nt::server::SaveTarget& target) {
    return std::make_shared<ServerBackend>(target);
}
std::shared_ptr<Backend> serverBackend() {
    const auto target = nt::server::serverSaveTarget();
    return target ? serverBackend(*target) : nullptr;
}
}  // namespace nt::remix
