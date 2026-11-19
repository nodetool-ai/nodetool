#include "ui/CanvasOverlay.h"
#include "EditorWindow.h"
#include "ui/CanvasSurface.h"
#include <QPointer>
#include <QQuickItem>
#include <cmath>
#include <QQuickWidget>

namespace nodetool {

void EditorWindow::syncPriceChip() {
    if (!tabOwner_) {
        activeEditor_->syncPriceChip();
        return;
    }
    // The web chip shows under each selected FAL or KIE card. Native shows it
    // for a single selected card, where the card toolbar also shows.
    const auto ids = selectedIds();
    const auto node = ids.size() == 1 ? document_.node(ids.first()) : QJsonObject();
    const auto type = node.value("type").toString();
    QJsonObject metadata;
    for (const auto &v : metadata_) {
        if (v.toObject().value("node_type").toString() == type) {
            metadata = v.toObject();
            break;
        }
    }
    const auto content = type.isEmpty() ? std::nullopt : node_editor::provider_pricing::chip(type, metadata, pricingBundle_);
    if (!content) {
        ++priceRequest_;
        priceEstimateEndpoint_.clear();
        priceChip_.clear();
        positionPriceChip();
        return;
    }
    QVariantList links;
    for (const auto &link : content->links) { links.append(QVariantMap{{"label", link.label}, {"url", link.url}}); }
    const auto before = priceChip_.nodeId();
    priceChip_.setNode(ids.first(), {.provider = content->provider,
                                     .label = content->label,
                                     .tone = content->tone,
                                     .live = content->live,
                                     .heading = content->heading,
                                     .details = content->details,
                                     .detailsArePricing = content->detailsArePricing,
                                     .keysUrl = content->keysUrl,
                                     .keysLabel = content->keysLabel,
                                     .links = links});
    if (before != ids.first()) { ++priceRequest_; }
    priceEstimateEndpoint_ = content->estimateEndpoint;
    positionPriceChip();
}

void EditorWindow::positionPriceChip() {
    if (!priceChipOverlay_ || !canvas_) { return; }
    QRectF bounds;
    if (!priceChip_.provider().isEmpty() && !browserVisible() && !canvas_->scene().nodeDragActive()) {
        for (const auto id : model_.allNodeIds()) {
            if (model_.resourceId(id) == priceChip_.nodeId()) {
                bounds = canvas_->nodeRect(id);
                break;
            }
        }
    }
    const auto area = canvas_->hostWidget().rect();
    const auto card = bounds.isEmpty() ? QRect() : canvas_->mapFromScene(bounds).translated(canvas_->viewportWidget().pos());
    if (bounds.isEmpty() || !QRect(QPoint(), area.size()).intersects(card)) {
        priceChipOverlay_->hide();
        return;
    }
    // FalPricingFooter.tsx: a 20 px chip 25 px below the card's bottom edge, 4 px in from its right edge.
    constexpr int chipInset = 4;
    constexpr int chipGap = 5;
    const auto *root = priceChipOverlay_->rootObject();
    const QSize chipSize(int(std::ceil(root->implicitWidth())), int(std::ceil(root->implicitHeight())));
    const int x = card.x() + card.width() - chipInset - chipSize.width();
    const int y = card.y() + card.height() + chipGap;
    priceChipOverlay_->setGeometry(std::clamp(x, 0, std::max(0, area.width() - chipSize.width())),
                                   std::clamp(y, 0, std::max(0, area.height() - chipSize.height())), chipSize.width(),
                                   chipSize.height());
    priceChipOverlay_->show();
}

void EditorWindow::togglePricePopover() {
    if (priceChip_.open()) {
        priceChip_.close();
        return;
    }
    priceChip_.setOpen(true);
    // FalPricingFooter.tsx and KieCreditsFooter.tsx load the account credits,
    // and FAL the per-run estimate, each time the popover opens.
    const auto request = ++priceRequest_;
    const auto provider = priceChip_.provider();
    auto *session = &workflowHost()->session_;
    QPointer<EditorWindow> self(this);
    priceChip_.setCredits(QStringLiteral("loading"), {});
    session->providerCredits(provider, [self, request, provider](QJsonObject response, QString error) {
        if (!self || self->priceRequest_ != request) { return; }
        if (!error.isEmpty()) {
            self->priceChip_.setCredits(QStringLiteral("error"), tr("Could not load credits"));
            return;
        }
        if (response.value("unavailable").toBool()) {
            const auto detail = response.value("detail").toString();
            self->priceChip_.setCredits(QStringLiteral("unavailable"), detail.isEmpty() ? tr("Credits unavailable") : detail,
                                        node_editor::provider_pricing::detailSuggestsKeys(provider, detail));
            return;
        }
        self->priceChip_.setCredits(QStringLiteral("ok"), tr("%1 remaining").arg(node_editor::provider_pricing::credits(provider, response)));
    });
    if (priceEstimateEndpoint_.isEmpty()) { return; }
    priceChip_.setEstimate(QStringLiteral("loading"), {});
    session->falPricingEstimate(priceEstimateEndpoint_, [self, request](QJsonObject response, QString error) {
        if (!self || self->priceRequest_ != request) { return; }
        if (!error.isEmpty() || !response.value("total_cost").isDouble()) {
            self->priceChip_.setEstimate({}, {});
            return;
        }
        self->priceChip_.setEstimate(QStringLiteral("ready"),
                                     node_editor::provider_pricing::falEstimate(response.value("total_cost").toDouble(),
                                                                                response.value("currency").toString("USD")));
    });
}

} // namespace nodetool
