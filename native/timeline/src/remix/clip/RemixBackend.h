#pragma once

// What Remix needs from the server: a local file for an asset, and a place to
// keep the baked audio. A test supplies its own implementation. Calls block and
// run on the controller's worker thread.

#include "assets/AssetMedia.h"
#include "model/TimelineTypes.h"
#include "server/AutosaveController.h"

#include <QJsonObject>
#include <QString>

#include <memory>

namespace nt::remix {

struct ResolvedAudio {
    nt::Clip media;  // the clip whose `raw` keys the model's media table, with audioPath set
    QJsonObject asset;
    QString error;
    bool ok() const { return error.isEmpty() && !media.audioPath.empty(); }
};
struct UploadedAudio {
    QJsonObject asset;
    QString error;
    bool ok() const { return error.isEmpty() && !asset.value("id").toString().isEmpty(); }
};

class Backend {
public:
    virtual ~Backend() = default;
    // Finds or downloads the file of `assetId`.
    virtual ResolvedAudio resolve(const QString& assetId, nt::assets::MediaProtection& protection, quint64 generation) = 0;
    // Creates an audio asset next to `siblingAssetId` from the WAV file at `wavPath`.
    virtual UploadedAudio upload(const QString& wavPath, const QString& name, const QString& siblingAssetId) = 0;
};

// The server the timeline was opened from, or null when it was opened from a file.
std::shared_ptr<Backend> serverBackend();
std::shared_ptr<Backend> serverBackend(const nt::server::SaveTarget& target);

}  // namespace nt::remix
