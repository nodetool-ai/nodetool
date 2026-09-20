## Recommendation
Integrate a third-party embedded-analytics vendor rather than build the dashboard internally. Use the six-week window for product-specific metrics, UX, permissions, and integration—not for recreating charts, filtering, exports, and dashboard infrastructure.

## Why
- Two engineers for six weeks is unlikely to produce a polished, reliable reporting product; embedded analytics materially reduces implementation risk against the one-quarter ship target.
- Weak reporting is a top-3 churn driver, so shipping a credible feature quickly is more valuable than owning the underlying analytics stack.
- A roughly $2k/month budget is likely cheaper than the opportunity cost of diverting scarce engineering capacity from core SaaS work.
- Vendors typically provide mature capabilities—filters, drilldowns, exports, sharing, responsive UI, caching, and permissions—that customers expect but are expensive to build and maintain.
- The team can preserve differentiation by owning the metric definitions, data model, onboarding, and customer workflow while outsourcing generic dashboard mechanics.

## Strongest counterargument
A vendor may impose unacceptable limits on data isolation, customization, performance, branding, or pricing as usage grows; it can also create long-term dependency around your reporting model. If the product requires highly bespoke analytics, has strict compliance or latency requirements, or already has a strong reusable reporting foundation, building a narrow first-party dashboard could produce a better customer experience and lower total cost.
