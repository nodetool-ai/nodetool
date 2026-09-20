## Recommendation
Integrate a third-party embedded-analytics vendor rather than build the dashboard in-house. Use the six weeks to implement a narrow, opinionated reporting experience on top of a validated data model.

## Why
- Two engineers for six weeks cannot reliably deliver charting, filtering, exports, permissions, performance, and cross-customer isolation to production quality before the quarter ends.
- Reporting is a top-three churn driver, so reducing time to a credible customer-facing feature has greater near-term value than owning the full analytics stack.
- A vendor provides mature visualization, dashboard authoring, embedding, and often row-level security, reducing operational and maintenance burden for a 12-person team.
- A roughly $2k/month budget is likely sufficient for a focused rollout, provided pricing is validated against expected tenants, users, query volume, and embedding requirements.
- The team can retain strategic control by owning the semantic model, metric definitions, data pipeline, and product-specific workflow while outsourcing commodity visualization infrastructure.

## Strongest counterargument
This recommendation is wrong if vendor pricing scales sharply with customers or usage, security/compliance requirements rule out the available providers, or the product needs highly bespoke workflows that embedded tools cannot support. In those cases, a narrowly scoped custom dashboard—limited to the few reports prospects use to make decisions—could produce a better long-term experience and avoid lock-in, even if it requires deferring advanced analytics capabilities.
