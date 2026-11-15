#pragma once
#include <QDateTime>
#include <QJsonObject>
#include <QList>
#include <QString>
#include <optional>

namespace nodetool::node_editor {

// The price chip a selected FAL or KIE node shows under its card, as
// FalPricingFooter.tsx and KieCreditsFooter.tsx build it, and the formatting
// of its popover. FAL nodes show it only with a list price. Every KIE node
// shows it, labeled "KIE credits" when no list price is bundled.
struct PriceLink {
    QString label;
    QString url;
};
struct PriceChipContent {
    QString provider; // "fal" or "kie"
    QString label;
    // success, warning (pricing varies) or info (a KIE node without a price).
    QString tone;
    bool live = false;
    QString heading;
    // The pricing lines, or the KIE note when no list price is bundled.
    QString details;
    bool detailsArePricing = true;
    // The FAL endpoint whose per-run estimate the popover loads, or empty.
    QString estimateEndpoint;
    QString keysUrl;
    QString keysLabel;
    QList<PriceLink> links;
};

// The bundled list prices by node type (packages/fal-nodes and kie-nodes
// generated/*-node-type-pricing.json, as attachBundle*UnitPricing.ts merges
// them into metadata). The files load on the first lookup.
// UI thread only. Its window owns it.
class PricingBundle {
public:
    // The metadata's own price when it has one, else the bundled price with
    // source "bundle" and the bundle's writtenAt as checked_at.
    QJsonObject pricing(const QString &provider, const QString &nodeType, const QJsonObject &metadata);

private:
    void load();
    bool loaded_ = false;
    QJsonObject fal_, kie_;
    QString falWrittenAt_, kieWrittenAt_;
};

namespace provider_pricing {
bool isKieNode(const QString &nodeType, const QJsonObject &metadata);
std::optional<PriceChipContent> chip(const QString &nodeType, const QJsonObject &metadata, PricingBundle &bundle,
                                     const QDateTime &now = QDateTime::currentDateTimeUtc());
// formatMoney in formatFalUnitPricing.ts: two decimals, four below one cent.
QString money(double amount, const QString &currency);
QString falShort(const QJsonObject &pricing);
QString falDetails(const QJsonObject &pricing, const QDateTime &now);
QString kieShort(const QJsonObject &pricing);
QString kieDetails(const QJsonObject &pricing, const QDateTime &now);
// formatFalPerRunEstimate.
QString falEstimate(double totalCost, const QString &currency);
// formatCredits and formatKieCredits: the account balance from /api/<provider>/credits.
QString credits(const QString &provider, const QJsonObject &response);
// fal/kieCreditsDetailSuggestsKeysLink: an error that is not about the network.
bool detailSuggestsKeys(const QString &provider, const QString &detail);
} // namespace provider_pricing
} // namespace nodetool::node_editor
