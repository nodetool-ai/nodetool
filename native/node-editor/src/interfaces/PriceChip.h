#pragma once
#include <QObject>
#include <QString>
#include <QVariantList>

namespace nodetool::node_editor {

// What the price chip under a selected FAL or KIE card (ProviderPriceChip.qml,
// web FalPricingFooter.tsx and KieCreditsFooter.tsx) reads and does: the chip
// label and tone, and the popover with the list price, the FAL per-run
// estimate, the account credits and the provider links.
//
// The owner fills the state and handles the *Requested signals. An empty
// provider hides the chip. QML gets a non-owning pointer through a required
// property.
//
// UI thread only.
class PriceChip : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString nodeId READ nodeId NOTIFY changed)
    // "fal", "kie" or empty.
    Q_PROPERTY(QString provider READ provider NOTIFY changed)
    Q_PROPERTY(QString label READ label NOTIFY changed)
    // success, warning or info.
    Q_PROPERTY(QString tone READ tone NOTIFY changed)
    Q_PROPERTY(bool live READ live NOTIFY changed)
    Q_PROPERTY(bool open READ open NOTIFY changed)
    Q_PROPERTY(QString heading READ heading NOTIFY changed)
    Q_PROPERTY(QString details READ details NOTIFY changed)
    // False when details is the KIE note for a node without a list price.
    Q_PROPERTY(bool detailsArePricing READ detailsArePricing NOTIFY changed)
    // "", "loading" or "ready".
    Q_PROPERTY(QString estimateState READ estimateState NOTIFY changed)
    Q_PROPERTY(QString estimate READ estimate NOTIFY changed)
    // "", "loading", "ok", "error" or "unavailable".
    Q_PROPERTY(QString creditsState READ creditsState NOTIFY changed)
    // The balance when ok, the server's reason when unavailable.
    Q_PROPERTY(QString credits READ credits NOTIFY changed)
    // The API keys link, shown when the reason is not about the network.
    Q_PROPERTY(QString keysUrl READ keysUrl NOTIFY changed)
    Q_PROPERTY(QString keysLabel READ keysLabel NOTIFY changed)
    // {label, url} entries at the foot of the popover.
    Q_PROPERTY(QVariantList links READ links NOTIFY changed)
public:
    explicit PriceChip(QObject *parent = nullptr);
    ~PriceChip() override;

    QString nodeId() const { return nodeId_; }
    QString provider() const { return provider_; }
    QString label() const { return label_; }
    QString tone() const { return tone_; }
    bool live() const { return live_; }
    bool open() const { return open_; }
    QString heading() const { return heading_; }
    QString details() const { return details_; }
    bool detailsArePricing() const { return detailsArePricing_; }
    QString estimateState() const { return estimateState_; }
    QString estimate() const { return estimate_; }
    QString creditsState() const { return creditsState_; }
    QString credits() const { return credits_; }
    QString keysUrl() const { return showKeys_ ? keysUrl_ : QString(); }
    QString keysLabel() const { return keysLabel_; }
    QVariantList links() const { return links_; }

    struct Content {
        QString provider;
        QString label;
        QString tone;
        bool live = false;
        QString heading;
        QString details;
        bool detailsArePricing = true;
        QString keysUrl;
        QString keysLabel;
        QVariantList links;
    };
    // A new node or new content closes the popover.
    void setNode(const QString &nodeId, const Content &content);
    void clear();
    void setOpen(bool open);
    void setEstimate(const QString &state, const QString &text);
    void setCredits(const QString &state, const QString &text, bool showKeys = false);

    Q_INVOKABLE void toggle() { emit toggleRequested(); }
    Q_INVOKABLE void close() { setOpen(false); }
    Q_INVOKABLE void openLink(const QString &url) { emit linkRequested(url); }

signals:
    void changed();
    void toggleRequested();
    void linkRequested(const QString &url);

private:
    QString nodeId_;
    QString provider_;
    QString label_;
    QString tone_;
    bool live_ = false;
    bool open_ = false;
    QString heading_;
    QString details_;
    bool detailsArePricing_ = true;
    QString estimateState_;
    QString estimate_;
    QString creditsState_;
    QString credits_;
    QString keysUrl_;
    QString keysLabel_;
    bool showKeys_ = false;
    QVariantList links_;
};

}  // namespace nodetool::node_editor
