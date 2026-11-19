#pragma once

#include "assets/AssetMedia.h"
#include "server/TimelineAssetCacheContext.h"

namespace nt::assets {

// UI thread only. Copies given to workers retain the leases until the workers
// finish, even if QML destroys the controller first.
class TimelineMediaConsumer : public server::TimelineCacheConsumer<QObject> {
protected:
    using TimelineCacheConsumer::TimelineCacheConsumer;

    const std::shared_ptr<MediaProtection>& mediaProtection() {
        if (!m_protection) {
            m_protection = std::make_shared<MediaProtection>(cacheRoot());
        }
        return m_protection;
    }

private:
    std::shared_ptr<MediaProtection> m_protection;
};

} // namespace nt::assets
