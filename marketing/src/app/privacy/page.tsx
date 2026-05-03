import Link from "next/link";

export const dynamic = "force-static";

const LAST_UPDATED = "2 May 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <nav className="mb-10 text-sm text-slate-400">
          <Link href="/" className="hover:text-white transition-colors">
            ← Back to NodeTool
          </Link>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <article className="legal-article">
          <p>
            This Privacy Policy explains how we process personal data when you
            visit <strong>nodetool.ai</strong>, use the <strong>NodeTool</strong>{" "}
            desktop application, or contact us. We follow the EU General Data
            Protection Regulation (GDPR) and the German Federal Data Protection
            Act (BDSG).
          </p>

          <h2>1. Controller</h2>
          <p>
            The controller responsible for processing your personal data under
            Art. 4 (7) GDPR is the NodeTool team. You can reach us at{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a> for any
            privacy-related question, including requests to exercise your rights
            described in section 9.
          </p>

          <h2>2. Local-first by design</h2>
          <p>
            NodeTool is an open-source desktop application that runs on your own
            machine. Workflows, prompts, model files, generated outputs, API
            keys and other content you create stay on your device. We do not
            collect, sync or transmit this data to our servers. If you choose
            to connect third-party AI providers (OpenAI, Anthropic, Replicate,
            Hugging Face, etc.), your prompts and inputs are sent directly from
            your device to those providers under their own terms and privacy
            policies.
          </p>

          <h2>3. Data we process when you visit nodetool.ai</h2>
          <h3>3.1 Server logs</h3>
          <p>
            When you load a page, our hosting provider temporarily processes
            technical data needed to deliver the site: IP address, user agent,
            referrer, requested URL, response status and timestamp. This data
            is processed on the legal basis of our legitimate interest in
            operating a secure, stable website (Art. 6 (1) (f) GDPR) and is
            deleted or anonymised within 14 days unless we need to retain
            specific entries to investigate a security incident.
          </p>

          <h3>3.2 Privacy-friendly analytics (Plausible)</h3>
          <p>
            We use{" "}
            <a
              href="https://plausible.io/privacy-focused-web-analytics"
              target="_blank"
              rel="noopener noreferrer"
            >
              Plausible Analytics
            </a>{" "}
            to understand aggregate traffic patterns. Plausible is hosted in
            the EU, does not use cookies and does not collect personal data or
            cross-site identifiers. IP addresses are processed transiently to
            generate a daily, salted hash and are never stored. Because no
            personal data is processed, no consent is required (Art. 6 (1) (f)
            GDPR — legitimate interest in measuring product reach).
          </p>

          <h3>3.3 Cookies and local storage</h3>
          <p>
            The marketing website does not set advertising or tracking cookies.
            We may use strictly necessary local storage for UI preferences such
            as theme. Strictly necessary storage does not require consent under
            § 25 (2) Nr. 2 TDDDG.
          </p>

          <h2>4. Data we process when you contact us</h2>
          <p>
            If you email us (e.g. <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>,{" "}
            <a href="mailto:matti@nodetool.ai">matti@nodetool.ai</a>,{" "}
            <a href="mailto:david@nodetool.ai">david@nodetool.ai</a>), we
            process your email address and the contents of your message to
            respond to your enquiry. Legal basis: Art. 6 (1) (b) GDPR
            (pre-contractual / contractual) or Art. 6 (1) (f) GDPR (legitimate
            interest in handling enquiries). We retain correspondence for as
            long as needed to address your matter and afterwards in accordance
            with statutory retention periods.
          </p>

          <h2>5. Optional cloud services</h2>
          <p>
            Some parts of the NodeTool ecosystem (for example a hosted runner,
            account features, or future cloud sync) may be offered as opt-in
            services. Where such services exist, the data they process is
            described in service-specific terms presented at sign-up. By
            default, no account is required to use NodeTool.
          </p>

          <h2>6. Hosting and data location</h2>
          <p>
            We host our infrastructure on EU-based providers. Persistent
            application data is stored in <strong>Frankfurt, Germany</strong>.
            Edge requests for static content may be served from a global CDN;
            in that case only the technical data described in 3.1 is
            processed at the edge, on the basis of standard contractual
            clauses where applicable.
          </p>

          <h2>7. Recipients and processors</h2>
          <p>
            We use carefully selected processors who act only on our
            documented instructions under data processing agreements (Art. 28
            GDPR), including:
          </p>
          <ul>
            <li>
              <strong>Hosting / CDN</strong> — delivery of nodetool.ai (EU
              region, Frankfurt for persistent storage).
            </li>
            <li>
              <strong>Plausible Analytics</strong> (Plausible Insights OÜ,
              Estonia) — cookieless, aggregated traffic statistics.
            </li>
            <li>
              <strong>Email providers</strong> — to receive and respond to
              messages you send us.
            </li>
            <li>
              <strong>GitHub</strong> — for our open-source repository,
              issues, and downloads, when you choose to use those services.
            </li>
          </ul>
          <p>
            We do not sell personal data, and we do not use your data to train
            machine-learning models.
          </p>

          <h2>8. International transfers</h2>
          <p>
            Where a processor is located outside the EU/EEA, we rely on an
            adequacy decision or, where none exists, on EU Standard Contractual
            Clauses together with appropriate supplementary measures.
          </p>

          <h2>9. Your rights</h2>
          <p>Under the GDPR you have the right to:</p>
          <ul>
            <li>access your personal data (Art. 15);</li>
            <li>request rectification (Art. 16);</li>
            <li>request erasure (Art. 17);</li>
            <li>request restriction of processing (Art. 18);</li>
            <li>data portability (Art. 20);</li>
            <li>
              object to processing based on legitimate interests (Art. 21);
            </li>
            <li>
              withdraw any consent you have given, with effect for the future
              (Art. 7 (3)).
            </li>
          </ul>
          <p>
            To exercise any of these rights, write to{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>. You also
            have the right to lodge a complaint with a data protection
            supervisory authority, in particular the authority of your habitual
            residence, place of work, or place of the alleged infringement
            (Art. 77 GDPR).
          </p>

          <h2>10. Retention</h2>
          <p>
            We keep personal data only for as long as necessary for the
            purposes for which it was collected and to comply with legal
            obligations. Server logs: ≤ 14 days. Analytics events: aggregated
            and non-personal. Email correspondence: as long as required to
            address your matter, plus any statutory retention period.
          </p>

          <h2>11. Security</h2>
          <p>
            We use TLS for all traffic, restrict administrative access on a
            need-to-know basis, keep dependencies up to date, and follow
            current best practices for the technologies we use. No system is
            perfectly secure; if you believe you have found a vulnerability,
            please report it to{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>.
          </p>

          <h2>12. Children</h2>
          <p>
            NodeTool is not directed at children under 16 and we do not
            knowingly collect personal data from them.
          </p>

          <h2>13. Changes to this policy</h2>
          <p>
            We may update this policy to reflect changes in our services or
            legal obligations. Material changes will be highlighted on this
            page. The current version is identified by the &quot;Last updated&quot;
            date above.
          </p>

          <p className="text-sm text-slate-400">
            See also our <Link href="/terms">Terms of Use</Link>.
          </p>
        </article>
      </div>

      <footer className="relative border-t border-slate-800/50 bg-slate-950 py-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row text-sm text-slate-500">
            <p>© {new Date().getFullYear()} NodeTool</p>
            <div className="flex gap-5">
              <Link href="/" className="hover:text-slate-200 transition-colors">
                Home
              </Link>
              <Link
                href="/privacy"
                className="hover:text-slate-200 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="hover:text-slate-200 transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
