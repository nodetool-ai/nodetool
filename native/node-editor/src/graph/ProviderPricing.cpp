#include "ProviderPricing.h"
#include "server/WorkflowVersions.h"
#include <QFile>
#include <QJsonDocument>
#include <QLocale>
#include <QRegularExpression>
#include <QStringList>
#include <cmath>

namespace nodetool::node_editor {
namespace {
QJsonObject readBundle(const QString &path, QString &writtenAt) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) { return {}; }
    const auto root = QJsonDocument::fromJson(file.readAll()).object();
    writtenAt = root.value("writtenAt").toString();
    return root.value("byNodeType").toObject();
}

bool isFalPricing(const QJsonObject &p) {
    return p.value("endpoint_id").isString() && p.value("unit_price").isDouble() && p.value("billing_unit").isString() &&
           p.value("currency").isString();
}

bool isKiePricing(const QJsonObject &p) {
    return p.value("model_id").isString() && p.value("unit_price").isDouble() && p.value("billing_unit").isString();
}

// Intl.NumberFormat with a fraction range: the fixed digits, trimmed down to the minimum.
QString decimal(double amount, int minimumDigits, int maximumDigits) {
    auto text = QLocale(QLocale::English, QLocale::UnitedStates).toString(amount, 'f', maximumDigits);
    const auto point = text.indexOf('.');
    if (point < 0) { return text; }
    auto end = text.size();
    while (end > point + 1 + minimumDigits && text[end - 1] == '0') { --end; }
    if (end == point + 1) { --end; }
    return text.left(end);
}

// currencyDisplay: "narrowSymbol" for the currencies the providers bill in.
QString withCurrency(const QString &amount, const QString &currency) {
    const auto code = currency.toUpper();
    if (code == "USD") { return "$" + amount; }
    if (code == "EUR") { return QStringLiteral("€") + amount; }
    if (code == "GBP") { return QStringLiteral("£") + amount; }
    return code + QStringLiteral(" ") + amount;
}

QString ageLine(const QJsonObject &pricing, const QDateTime &now) {
    const auto checked = pricing.value("checked_at").toString().trimmed();
    const auto at = QDateTime::fromString(checked, Qt::ISODateWithMs);
    if (checked.isEmpty() || !at.isValid()) { return QStringLiteral("Price · date unknown"); }
    return "Price from " + WorkflowVersions::relativeTime(at, now);
}

bool falVague(const QJsonObject &p) {
    static const QRegularExpression vague(QStringLiteral("\\bunits?\\b|\\bcredits?\\b"), QRegularExpression::CaseInsensitiveOption);
    return vague.match(p.value("billing_unit").toString().trimmed()).hasMatch();
}

bool kieVague(const QJsonObject &p) {
    if (p.value("tier_count").toDouble(1) > 1) { return true; }
    static const QRegularExpression varies(QStringLiteral("\\bvaries\\b"), QRegularExpression::CaseInsensitiveOption);
    return varies.match(p.value("billing_unit").toString().trimmed()).hasMatch();
}

// falUnitSuffix: "seconds" -> "s", "megapixels" -> "MP", "images" -> "image",
// "1000 characters" -> "1K chars". Empty for a blank unit or a bare count.
QString falUnitSuffix(const QString &billingUnit) {
    auto words = billingUnit.trimmed().toLower().split(QRegularExpression("\\s+"), Qt::SkipEmptyParts);
    static const QRegularExpression digits(QStringLiteral("^\\d+$"));
    if (words.isEmpty() || (words.size() == 1 && digits.match(words[0]).hasMatch())) { return {}; }
    const bool counted = words[0].front().isDigit();
    if (counted) {
        if (words[0] == "1000") { words[0] = "1K"; }
        if (words[0] == "1m") { words[0] = "1M"; }
    }
    static const QHash<QString, QString> units{{"second", "s"},      {"seconds", "s"},  {"megapixel", "MP"}, {"megapixels", "MP"},
                                               {"minute", "min"},    {"minutes", "min"}, {"characters", "chars"}};
    auto &last = words.last();
    if (const auto it = units.constFind(last); it != units.cend()) {
        last = *it;
    } else if (!counted && last.size() > 1 && last.endsWith('s') && !last.endsWith("ss")) {
        last.chop(1);
    }
    return words.join(' ');
}

QString creditAmount(double amount) {
    const bool whole = std::floor(amount) == amount;
    return decimal(amount, 0, whole ? 0 : 1) + " credits";
}

QString kieUnitSuffix(const QJsonObject &p) {
    const auto unit = p.value("billing_unit").toString().trimmed();
    return unit.isEmpty() || unit == "run" || unit == "varies" ? QString() : unit;
}
} // namespace

void PricingBundle::load() {
    loaded_ = true;
    fal_ = readBundle(QStringLiteral(":/editor/pricing/fal-nodes/src/generated/fal-node-type-pricing.json"), falWrittenAt_);
    kie_ = readBundle(QStringLiteral(":/editor/pricing/kie-nodes/src/generated/kie-node-type-pricing.json"), kieWrittenAt_);
}

QJsonObject PricingBundle::pricing(const QString &provider, const QString &nodeType, const QJsonObject &metadata) {
    const auto own = metadata.value(provider == "fal" ? "fal_unit_pricing" : "kie_unit_pricing").toObject();
    if (!own.isEmpty()) { return own; }
    if (!loaded_) { load(); }
    auto bundled = (provider == "fal" ? fal_ : kie_).value(nodeType).toObject();
    if (bundled.isEmpty()) { return {}; }
    bundled["source"] = "bundle";
    const auto &writtenAt = provider == "fal" ? falWrittenAt_ : kieWrittenAt_;
    if (!writtenAt.isEmpty()) { bundled["checked_at"] = writtenAt; }
    return bundled;
}

namespace provider_pricing {
QString money(double amount, const QString &currency) {
    const int digits = amount > 0 && amount < 0.01 ? 4 : 2;
    return withCurrency(decimal(amount, digits, 4), currency);
}

QString falShort(const QJsonObject &p) {
    if (falVague(p)) { return QStringLiteral("pricing varies"); }
    const auto amount = money(p.value("unit_price").toDouble(), p.value("currency").toString());
    const auto unit = falUnitSuffix(p.value("billing_unit").toString());
    return unit.isEmpty() ? amount : amount + " / " + unit;
}

QString falDetails(const QJsonObject &p, const QDateTime &now) {
    const bool vague = falVague(p);
    const auto line = money(p.value("unit_price").toDouble(), p.value("currency").toString()) + " per " +
                      p.value("billing_unit").toString();
    QStringList lines{vague ? line + " (SEE DETAILS)" : line};
    if (vague) { lines.append(QStringLiteral("\nVaries by resolution and quality.\nView on fal.ai to see detailed pricing.\n")); }
    lines.append(ageLine(p, now));
    lines.append("Endpoint: " + p.value("endpoint_id").toString());
    return lines.join('\n');
}

QString kieShort(const QJsonObject &p) {
    const auto base = creditAmount(p.value("unit_price").toDouble());
    const auto unit = kieUnitSuffix(p);
    if (kieVague(p)) { return unit.isEmpty() ? "from " + base : "from " + base + " / " + unit; }
    return unit.isEmpty() ? base : base + " / " + unit;
}

QString kieDetails(const QJsonObject &p, const QDateTime &now) {
    const bool vague = kieVague(p);
    const auto amount = creditAmount(p.value("unit_price").toDouble());
    const auto unit = kieUnitSuffix(p);
    auto perUnit = unit.isEmpty() ? amount : amount + " per " + unit;
    if (vague) { perUnit = "From " + perUnit; }
    QStringList lines{vague ? perUnit + QStringLiteral(" (lowest tier — see kie.ai for full pricing)") : perUnit};
    if (vague) { lines.append(QStringLiteral("Varies by resolution, duration, and quality.")); }
    if (const auto usd = p.value("usd_price"); usd.isDouble() && std::isfinite(usd.toDouble())) {
        lines.append(QStringLiteral("\n≈ $") + QString::number(usd.toDouble(), 'f', 4) + " USD");
    }
    lines.append(ageLine(p, now));
    lines.append("Model: " + p.value("model_id").toString());
    return lines.join('\n');
}

QString falEstimate(double totalCost, const QString &currency) {
    return "~" + money(totalCost, currency) + " per run (historical avg)";
}

QString credits(const QString &provider, const QJsonObject &response) {
    const auto balance = response.value("credit_balance");
    if (provider == "kie") {
        const auto amount = balance.isDouble() ? balance.toDouble() : balance.toObject().value("amount").toDouble(NAN);
        return std::isfinite(amount) ? decimal(std::round(amount), 0, 0) + " credits" : QStringLiteral("N/A");
    }
    if (balance.isDouble()) { return "$" + QString::number(balance.toDouble(), 'f', 2); }
    const auto object = balance.toObject();
    if (!object.value("amount").isDouble()) { return QStringLiteral("N/A"); }
    return withCurrency(decimal(object.value("amount").toDouble(), 2, 4), object.value("currency").toString("USD"));
}

bool detailSuggestsKeys(const QString &provider, const QString &detail) {
    const auto text = detail.trimmed().toLower();
    if (text.isEmpty()) { return false; }
    return !text.contains("reach " + provider) && !text.contains("try again later");
}

bool isKieNode(const QString &nodeType, const QJsonObject &metadata) {
    const auto ns = metadata.value("namespace").toString();
    return ns == "kie" || ns.startsWith("kie.") || nodeType.startsWith("kie.");
}

std::optional<PriceChipContent> chip(const QString &nodeType, const QJsonObject &metadata, PricingBundle &bundle,
                                     const QDateTime &now) {
    if (const auto fal = bundle.pricing("fal", nodeType, metadata); isFalPricing(fal)) {
        PriceChipContent content;
        content.provider = "fal";
        content.label = falShort(fal);
        content.tone = falVague(fal) ? "warning" : "success";
        content.live = fal.value("source").toString() == "live";
        content.heading = "FAL pricing";
        content.details = falDetails(fal, now);
        content.estimateEndpoint = fal.value("endpoint_id").toString();
        content.keysUrl = "https://fal.ai/dashboard/keys";
        content.keysLabel = "fal.ai API keys";
        content.links = {{"View on fal.ai", "https://fal.ai/models/" + content.estimateEndpoint}};
        return content;
    }
    if (!isKieNode(nodeType, metadata)) { return std::nullopt; }
    const auto kie = bundle.pricing("kie", nodeType, metadata);
    const bool priced = isKiePricing(kie);
    PriceChipContent content;
    content.provider = "kie";
    content.label = priced ? kieShort(kie) : QStringLiteral("KIE credits");
    content.tone = !priced ? "info" : kieVague(kie) ? "warning" : "success";
    content.live = priced && kie.value("source").toString() == "live";
    content.heading = "KIE pricing";
    content.detailsArePricing = priced;
    content.details = priced ? kieDetails(kie, now)
                             : QStringLiteral("No bundled list price for this node. Check kie.ai pricing or run with your "
                                              "API key to see account credits.");
    content.keysUrl = "https://kie.ai/api-key";
    content.keysLabel = "kie.ai API keys";
    const auto pricingUrl = priced ? kie.value("pricing_url").toString().trimmed() : QString();
    content.links = {{"View pricing on kie.ai", pricingUrl.isEmpty() ? QStringLiteral("https://kie.ai/pricing") : pricingUrl},
                     {"Top up credits", "https://kie.ai/billing"}};
    return content;
}
} // namespace provider_pricing
} // namespace nodetool::node_editor
