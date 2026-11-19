#pragma once

#include "server/AssetCache.h"

#include <QQmlContext>
#include <QQmlEngine>
#include <QQmlParserStatus>
#include <optional>
#include <utility>

namespace nt::server {

// UI thread only. The engine owns this context object and its copy of the
// host's cache handle. QML consumers copy the handle during construction.
class TimelineAssetCacheContext final : public QObject {
public:
    static void install(QQmlEngine& engine, const AssetCacheRoot& root) {
        if (root.path().isEmpty()) {
            qFatal("Missing timeline asset cache directory");
        }
        auto* context = engine.rootContext();
        if (context->contextProperty(QStringLiteral("timelineAssetCache")).isValid()) {
            qFatal("Timeline asset cache already installed");
        }
        // The engine's root context owns the object.
        context->setContextProperty(QStringLiteral("timelineAssetCache"), new TimelineAssetCacheContext(root, context));
    }

    static const AssetCacheRoot& require(QQmlEngine* engine) {
        auto* context = engine ? dynamic_cast<TimelineAssetCacheContext*>(
            engine->rootContext()->contextProperty(QStringLiteral("timelineAssetCache")).value<QObject*>()) : nullptr;
        if (!context) {
            qFatal("Missing timeline asset cache. Install it on the QML engine before loading timeline components.");
        }
        return context->m_root;
    }

private:
    TimelineAssetCacheContext(const AssetCacheRoot& root, QObject* parent) : QObject(parent), m_root(root) {}

    const AssetCacheRoot m_root;
};

// UI thread only. A C++ constructor supplies the root directly. QML supplies
// it at classBegin, before evaluating the component's property bindings.
template<typename Base>
class TimelineCacheConsumer : public Base, public QQmlParserStatus {
public:
    void classBegin() override {
        setCacheRoot(TimelineAssetCacheContext::require(qmlEngine(this)));
    }

    void componentComplete() override {}

protected:
    using Base::Base;

    void setCacheRoot(const AssetCacheRoot& root) { m_cache.emplace(root); }

    const AssetCacheRoot& cacheRoot() const {
        if (!m_cache) {
            qFatal("Missing timeline asset cache for C++ consumer");
        }
        return *m_cache;
    }

private:
    std::optional<AssetCacheRoot> m_cache;
};

} // namespace nt::server
