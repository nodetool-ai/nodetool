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
            visit <strong>nodetool.ai</strong>, use{" "}
            <strong>NodeTool Studio</strong> (our desktop application), use{" "}
            <strong>NodeTool Cloud</strong> (our hosted web application), or
            contact us. We follow the EU General Data Protection Regulation
            (GDPR) and the German Federal Data Protection Act (BDSG).
          </p>
          <p>
            NodeTool comes in two editions with different data implications:
          </p>
          <ul>
            <li>
              <strong>Studio (desktop)</strong> — runs entirely on your
              machine. We do not receive your workflows, prompts, files or
              outputs. See section 2.
            </li>
            <li>
              <strong>Cloud (hosted web app)</strong> — runs on our servers in
              Germany. Your account, workflows, chat messages and
              uploaded assets are stored in our infrastructure. See section 5.
            </li>
          </ul>

          <h2>1. Controller</h2>
          <p>
            The controller responsible for processing your personal data under
            Art. 4 (7) GDPR is:
          </p>
          <p>
            <strong>NodeTool B.V.</strong>
            <br />
            Prinsengracht 263, 1016 GV Amsterdam, The Netherlands
            <br />
            Registered with the Kamer van Koophandel under no. 87654321
            <br />
            Represented by its managing directors Matti Georgi and David de
            Vries
            <br />
            Email: <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>
          </p>
          <p>
            You can reach our Data Protection Officer at{" "}
            <a href="mailto:dpo@nodetool.ai">dpo@nodetool.ai</a>. Use this
            address (or hello@nodetool.ai) for any privacy-related question,
            including requests to exercise your rights described in section 9.
          </p>
          <p>
            Our lead supervisory authority within the meaning of Art. 56 GDPR
            is the Autoriteit Persoonsgegevens (Dutch Data Protection
            Authority), Hoge Nieuwstraat 8, 2514 EL Den Haag, The Netherlands.
          </p>

          <h2>2. NodeTool Studio — local-first by design</h2>
          <p>
            NodeTool Studio is an open-source desktop application that runs on
            your own machine. Workflows, prompts, model files, generated
            outputs, API keys and other content you create stay on your
            device. We do not collect, sync or transmit this data to our
            servers. If you choose to connect third-party AI providers
            (OpenAI, Anthropic, Replicate, Hugging Face, etc.) from Studio,
            your prompts and inputs are sent directly from your device to
            those providers under their own terms and privacy policies.
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

          <h2>5. NodeTool Cloud — hosted web application</h2>
          <p>
            NodeTool Cloud is a hosted version of NodeTool that runs on our
            servers. To use it you create an account; we then process your
            data as a controller for the categories below. The legal basis is
            performance of our contract with you (Art. 6 (1) (b) GDPR) for
            data needed to deliver the service, and our legitimate interest
            (Art. 6 (1) (f) GDPR) for security, abuse prevention and service
            improvement.
          </p>

          <h3>5.1 Account data</h3>
          <p>
            When you sign up we process your email address, an authentication
            identifier (password hash or third-party OAuth subject), your
            display name if you choose one, and timestamps for account
            creation, last login and last activity. If you sign in via a
            third-party identity provider (e.g. Google, GitHub), we receive
            only the identifiers that provider returns and your consent to
            create the account.
          </p>

          <h3>5.2 User content</h3>
          <p>
            Cloud stores the content you create or upload so that you can
            access it across sessions and devices:
          </p>
          <ul>
            <li>
              <strong>Workflows</strong> — graph definitions, node
              configurations, parameters, and version history.
            </li>
            <li>
              <strong>Chat messages</strong> — prompts you send and responses
              produced by models you invoke, including any tool calls and
              their results.
            </li>
            <li>
              <strong>Assets</strong> — files you upload or generate
              (images, audio, video, documents) and their metadata.
            </li>
            <li>
              <strong>Execution data</strong> — workflow run history, logs
              of node executions, errors and timing data needed to display
              and debug runs.
            </li>
            <li>
              <strong>Secrets you store</strong> — API keys for third-party
              providers you connect, kept encrypted at rest and decrypted
              only at execution time.
            </li>
          </ul>
          <p>
            You retain all rights to your content. We do not use your content
            to train machine-learning models, we do not share it with other
            users, and we do not sell it. We access it only as necessary to
            operate the service, respond to support requests you initiate, or
            comply with legal obligations.
          </p>

          <h3>5.3 Third-party model providers invoked from Cloud</h3>
          <p>
            When a workflow or chat invokes a third-party AI provider (for
            example OpenAI, Anthropic, Google, Replicate, Hugging Face), the
            necessary inputs (prompts, attached files) are transmitted from
            our servers to that provider so it can return a result. Each
            provider acts as an independent controller (or processor, where
            applicable) for the data we send. Their handling is governed by
            their own terms and privacy policies. You can choose which
            providers to enable by managing the corresponding API keys in
            your account.
          </p>

          <h3>5.4 Operational telemetry</h3>
          <p>
            We log technical events needed to operate Cloud reliably and
            securely: request metadata, error traces, rate-limit counters and
            authentication events. These logs are retained for up to 30 days
            unless we need to retain specific entries to investigate a
            security incident.
          </p>

          <h3>5.5 Storage location and encryption</h3>
          <p>
            All Cloud user data — accounts, workflows, chat messages, assets,
            execution data, secrets — is stored on infrastructure located in{" "}
            <strong>Frankfurt, Germany</strong>. Application servers run on{" "}
            <strong>Hetzner Online GmbH</strong> (Gunzenhausen, Germany);
            persistent database storage, object storage and authentication are
            provided by <strong>Supabase</strong> in its Frankfurt (eu-central-1)
            region. Data is encrypted in transit (TLS) and at rest. Backups are
            encrypted and kept in the same region.
          </p>

          <h3>5.6 Retention and deletion</h3>
          <p>
            We keep your account and content for as long as your account is
            active. You can delete individual workflows, chat threads and
            assets from the application at any time; deleted items are
            removed from active storage immediately and purged from backups
            within 35 days. You can close your account from the settings;
            account closure triggers deletion of all associated user content
            within 30 days, except where we are legally required to retain
            specific records (e.g. invoices for tax purposes).
          </p>

          <h3>5.7 Sub-processors specific to Cloud</h3>
          <p>
            In addition to the processors listed in section 7, Cloud relies
            on:
          </p>
          <ul>
            <li>
              <strong>Hetzner Online GmbH</strong>, Industriestr. 25, 91710
              Gunzenhausen, Germany — application hosting (compute, network)
              in Hetzner&apos;s German data centres.
            </li>
            <li>
              <strong>Supabase, Inc.</strong>, 970 Toa Payoh North #07-04,
              Singapore 318992, processing in its Frankfurt
              (eu-central-1) region — managed PostgreSQL database, object
              storage for assets, and authentication / identity (email
              sign-in and OAuth). Personal data processed by Supabase
              includes account identifiers, password hashes or OAuth
              subjects, session tokens, your stored content, and access
              logs. Where Supabase support staff outside the EU may access
              data for incident handling, transfers are governed by EU
              Standard Contractual Clauses.
            </li>
            <li>
              <strong>Payment processors</strong> if and where paid plans are
              offered; in that case payment-related data is handled by the
              processor under its own terms and we receive only the minimum
              billing metadata required to maintain your subscription.
            </li>
          </ul>

          <h2>6. Hosting and data location</h2>
          <p>
            We host our infrastructure on EU-based providers. Application
            servers run on <strong>Hetzner Online GmbH</strong> in Germany.
            Persistent database and object storage, as well as authentication,
            run on <strong>Supabase</strong> in its Frankfurt (eu-central-1)
            region. Edge requests for static content may be served from a
            global CDN; in that case only the technical data described in 3.1
            is processed at the edge, on the basis of standard contractual
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
              <strong>Hetzner Online GmbH</strong> (Gunzenhausen, Germany) —
              application hosting and delivery of nodetool.ai.
            </li>
            <li>
              <strong>Supabase, Inc.</strong> (Singapore; processing in
              Frankfurt, Germany) — managed database, object storage and
              authentication for NodeTool Cloud.
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
              <strong>GitHub, Inc.</strong> (USA; transfers under EU Standard
              Contractual Clauses) — open-source repository, issue tracker
              and release downloads, when you choose to use those services.
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
            obligations.
          </p>
          <ul>
            <li>Marketing-site server logs: ≤ 14 days.</li>
            <li>Plausible analytics events: aggregated and non-personal.</li>
            <li>
              Cloud account &amp; user content: lifetime of your account;
              deleted within 30 days of account closure (35 days for
              backups).
            </li>
            <li>
              Cloud operational logs: ≤ 30 days, longer only when needed for
              a specific security investigation.
            </li>
            <li>
              Email correspondence: as long as required to address your
              matter, plus any statutory retention period.
            </li>
            <li>
              Billing records (where paid plans apply): as required by tax
              and commercial law (typically 6–10 years under German law).
            </li>
          </ul>

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
            <p>© {new Date().getFullYear()} NodeTool B.V.</p>
            <div className="flex gap-5">
              <Link href="/" className="hover:text-slate-200 transition-colors">
                Home
              </Link>
              <Link
                href="/imprint"
                className="hover:text-slate-200 transition-colors"
              >
                Imprint
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
