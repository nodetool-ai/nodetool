#pragma once

#include "server/TimelineAssetCacheContext.h"

#include <QTemporaryDir>

// Keeps test media out of the user's cache. Declare before the consumers.
class TestAssetCacheRoot {
public:
    const nt::server::AssetCacheRoot& root() const { return m_root; }

    void install(QQmlEngine& engine) const {
        nt::server::TimelineAssetCacheContext::install(engine, m_root);
    }

private:
    QTemporaryDir m_directory;
    const nt::server::AssetCacheRoot m_root{m_directory.path()};
};
