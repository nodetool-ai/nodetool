## Recommendation

Integrate a third-party embedded-analytics vendor for the first release, rather than building the dashboard in-house. Choose a vendor that supports your data model, tenant isolation, white-label embedding, and fits the roughly $2k/month budget.

## Why

- **The one-quarter target favors integration:** Two engineers have only six weeks, making a reliable build—charts, filters, permissions, exports, performance, and responsive UX—high risk.
- **Reporting directly affects retention:** A proven analytics product reduces the chance that a rushed internal dashboard becomes another churn driver.
- **It preserves scarce engineering capacity:** The team can focus on core product differentiation, data correctness, and integrating the highest-value reports instead of maintaining visualization infrastructure.
- **The economics are favorable at this stage:** About $12k in vendor cost over six months is likely cheaper than the opportunity cost of two engineers, especially given reporting’s role in churn.
- **It enables validation before commitment:** Ship the most-requested workflows now, measure usage and retention impact, then consider replacing the vendor only if scale, UX limitations, or pricing justify it.

## Strongest counterargument

A vendor can create long-term cost and product constraints: per-user or per-query pricing may exceed $2k/month as adoption grows, embedding and customization may be limited, and sensitive B2B data may require controls the vendor cannot provide. Build in-house instead if no credible vendor meets tenant-level security and core reporting requirements within budget, or if the dashboard itself is a central differentiator rather than a supporting feature.
