#pragma once
#include <algorithm>
#include "preview/effects/ClipAnalysis.h"
#include "preview/compose/ComposeRegistry.h"

namespace nt::effects {
inline std::vector<SecondSourceRequest> denoiseSources(const ActiveLayer& layer,const Clip& clip) {
    if (clip.mediaType!=MediaType::Video || layer.mediaPath.empty()) { return {}; }
    const auto effects=layer.ext.value("clipEffects").toArray();
    if (!std::any_of(effects.begin(),effects.end(),[](const QJsonValue& value) {
        const auto e=value.toObject();return e.value("type")=="denoise" && e.value("enabled").toBool() && e.value("temporalStrength").toDouble()>0;
    })) { return {}; }
    const auto [first,last]=analysisRange(clip);const double end=std::max(first,last-.001);
    return {{"denoise:before",layer.mediaPath,std::clamp(layer.sourceTimeMs-1000./30,first,end)},
            {"denoise:after",layer.mediaPath,std::clamp(layer.sourceTimeMs+1000./30,first,end)}};
}
}
