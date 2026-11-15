#include "PriceChip.h"

namespace nodetool::node_editor {

PriceChip::PriceChip(QObject *parent) : QObject(parent) {}

PriceChip::~PriceChip() = default;

void PriceChip::setNode(const QString &nodeId, const Content &content) {
    const bool same = nodeId == nodeId_ && content.provider == provider_ && content.label == label_ &&
                      content.tone == tone_ && content.live == live_ && content.details == details_ &&
                      content.links == links_;
    if (same) { return; }
    nodeId_ = nodeId;
    provider_ = content.provider;
    label_ = content.label;
    tone_ = content.tone;
    live_ = content.live;
    heading_ = content.heading;
    details_ = content.details;
    detailsArePricing_ = content.detailsArePricing;
    keysUrl_ = content.keysUrl;
    keysLabel_ = content.keysLabel;
    links_ = content.links;
    open_ = false;
    estimateState_.clear();
    estimate_.clear();
    creditsState_.clear();
    credits_.clear();
    showKeys_ = false;
    emit changed();
}

void PriceChip::clear() {
    if (provider_.isEmpty() && nodeId_.isEmpty()) { return; }
    setNode({}, {});
}

void PriceChip::setOpen(bool open) {
    if (open_ == open) { return; }
    open_ = open;
    emit changed();
}

void PriceChip::setEstimate(const QString &state, const QString &text) {
    estimateState_ = state;
    estimate_ = text;
    emit changed();
}

void PriceChip::setCredits(const QString &state, const QString &text, bool showKeys) {
    creditsState_ = state;
    credits_ = text;
    showKeys_ = showKeys;
    emit changed();
}

}  // namespace nodetool::node_editor
