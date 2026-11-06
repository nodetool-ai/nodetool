#pragma once

#include "preview/SceneEval.h"

#include <set>
#include <span>

namespace nt {

struct TransitionPair {
    LayerTransition incoming;
    std::optional<LayerTransition> outgoing;
    const Clip* outgoingClip = nullptr;
};

// The partner has a strictly earlier start and overlaps the incoming head.
std::optional<TransitionPair> resolveTransition(const Clip& clip, const Clip* partner, double t);

std::unordered_map<std::string, LayerTransition> resolveDocumentTransitions(std::span<const Clip* const> clips, double t);

namespace transitions::detail {
const std::set<std::string>& knownTransitionTypes();
LayerTransition incomingRecord(const std::string& type, double progress, const Clip& clip);
LayerTransition outgoingRecord(const std::string& type, double progress, const Clip& clip);
}  // namespace transitions::detail

}  // namespace nt
