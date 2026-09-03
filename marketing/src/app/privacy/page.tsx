import Link from "next/link";

/*
  DRAFT — NOT LEGAL ADVICE. This policy must be reviewed by a qualified data
  protection advisor before it is published.

  Items a human must confirm before this page goes live:
  1. Signed Art. 28 data processing agreements with Fly.io, Supabase,
     Cloudflare, Plausible, the email provider, and every AI provider offered
     in the hosted service. This page states that such agreements are in
     place; that fact is not verifiable from the repository.
  2. The transfer mechanism actually relied on per non-EU recipient
     (adequacy / EU-U.S. Data Privacy Framework certification / SCCs).
  3. The Supabase project region. `fly.toml` documents the app's primary
     region as `fra` and notes the database sits in AWS eu-central-1, but the
     Supabase project settings are the authority.
  4. The 14-day server-log figure. It is a commitment we make, not a setting
     read from Fly.io or Cloudflare configuration in this repository.
  5. Sections 5, 6, 10 and 11 describe the hosted service's activity log,
     data export and account deletion. Do not publish this page before those
     ship — at the time of writing they are being implemented in `packages/`.
  6. That the retention sweep is actually switched on for the hosted
     deployment (`NODETOOL_STORAGE_AUTO_CLEANUP=1`). Section 11 promises run
     history and snapshots expire on a schedule; without that flag the sweep
     only runs when someone triggers it.
*/

export const dynamic = "force-static";

const LAST_UPDATED = "3 September 2026";

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
            desktop application, use the hosted service at{" "}
            <strong>app.nodetool.ai</strong>, or contact us. We follow the EU
            General Data Protection Regulation (GDPR) and the German Federal
            Data Protection Act (BDSG).
          </p>

          <h2>1. Controller</h2>
          <p>
            The controller responsible for processing your personal data under
            Art. 4 (7) GDPR is the NodeTool team. You can reach us at{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a> for any
            privacy-related question, including requests to exercise your rights
            described in section 10.
          </p>

          <h2>2. Two ways to run NodeTool</h2>
          <p>
            NodeTool is open-source software that you can run in two different
            places. What we process depends entirely on which one you use, so
            read this section first — the rest of the policy refers back to it.
          </p>

          <h3>2.1 Desktop and self-hosted installs</h3>
          <p>
            The NodeTool desktop application runs on your own machine, and the
            same server code can be run on infrastructure you control.
            Workflows, prompts, model files, generated outputs, API keys and
            other content you create are stored on that machine — in a local
            database and local files — and stay there. We do not collect, sync
            or transmit that content to our servers. If you connect third-party
            AI providers (OpenAI, Anthropic, Replicate, Hugging Face, and
            others), your prompts and inputs are sent from your machine directly
            to those providers under their own terms and privacy policies; we
            are not a party to that exchange.
          </p>
          <p>
            Two things do leave your machine. The desktop application checks
            GitHub Releases for updates, which tells GitHub your IP address,
            platform and installed version. And any provider you connect
            receives whatever you send it. Product analytics are not loaded in
            the desktop application at all.
          </p>
          <p>
            If you host the NodeTool server yourself, you are the controller for
            the data it stores. This policy describes our own operation of the
            hosted service, not yours.
          </p>

          <h3>2.2 The hosted service (app.nodetool.ai)</h3>
          <p>
            The hosted service is a web application we operate. It requires an
            account, and the local-first description above does not apply to
            it. Your workflows, chats, generated assets and connected
            credentials are stored on our servers, and calls to AI providers are
            made <em>by our servers</em> rather than from your device. Sections
            5, 6, 7, 8, 9 and 11 describe that processing.
          </p>

          <h2>3. Data we process when you visit our websites</h2>
          <h3>3.1 Server logs</h3>
          <p>
            When you load a page, our hosting provider temporarily processes
            technical data needed to deliver the site: IP address, user agent,
            referrer, requested URL, response status and timestamp. This data
            is processed on the legal basis of our legitimate interest in
            operating a secure, stable website (Art. 6 (1) (f) GDPR). We keep it
            no longer than 14 days unless we need specific entries to
            investigate a security incident.
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
            to understand aggregate traffic patterns, on the marketing site
            (nodetool.ai) and on the hosted application (app.nodetool.ai).
            Plausible states that its service is hosted in the EU, sets no
            cookies, and collects no personal data and no cross-site
            identifiers; IP addresses are processed transiently to generate a
            daily, salted hash and are not stored. On the marketing site the
            script additionally counts outbound link clicks, file downloads and
            a fixed set of named events such as a download or a demo view. These
            are aggregate counts and are not linked to an account. Because no
            personal data is processed, no consent is required (Art. 6 (1) (f)
            GDPR — legitimate interest in measuring product reach). Analytics
            are not loaded in the desktop application.
          </p>

          <h3>3.3 Cookies and local storage</h3>
          <p>
            We do not set advertising or tracking cookies on any of our sites.
            The marketing site may use strictly necessary local storage for UI
            preferences such as theme. The hosted application stores your
            sign-in session in your browser so you stay logged in. Strictly
            necessary storage does not require consent under § 25 (2) Nr. 2
            TDDDG.
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

          <h2>5. Data stored in a hosted account</h2>
          <p>
            This section applies to the hosted service only. Everything below is
            stored under your account identifier and is separated from other
            users&apos; data.
          </p>
          <ul>
            <li>
              <strong>Account identity</strong> — the account identifier issued
              by our authentication provider, your email address, and any
              sign-in or messaging identities you link to the account. Legal
              basis: Art. 6 (1) (b) GDPR (necessary to provide the service you
              signed up for).
            </li>
            <li>
              <strong>Content you author</strong> — workflows and their version
              history, projects, apps and scripts, storyboards, timeline
              sequences, image documents, workspace files and your settings.
              Legal basis: Art. 6 (1) (b) GDPR.
            </li>
            <li>
              <strong>Chat and agent memory</strong> — conversation threads and
              the messages in them, including message text, files you attach,
              and the tool calls the agent made. Separately, the agent records
              memories — short notes, facts, preferences and decisions — so it
              can reuse them in later sessions. You can read and delete these in
              the product. Legal basis: Art. 6 (1) (b) GDPR.
            </li>
            <li>
              <strong>Generated assets</strong> — images, video, audio and other
              files produced by your runs, together with their file metadata.
              Legal basis: Art. 6 (1) (b) GDPR.
            </li>
            <li>
              <strong>Run and spend records</strong> — records of each workflow
              run (the graph and parameters it ran with, status, timing, errors
              and logs) and one record per media or model generation, holding
              the provider and model used, the parameters sent to that provider,
              token counts and the resulting cost. These records are what your
              spend view and your plan usage are calculated from. Legal basis:
              Art. 6 (1) (b) GDPR (service delivery and billing).
            </li>
            <li>
              <strong>Credentials you connect</strong> — provider API keys and
              OAuth tokens for the services you link, and access tokens you
              create for API or agent access. Provider keys and OAuth tokens are
              encrypted before they are stored (see section 12). Legal basis:
              Art. 6 (1) (b) GDPR.
            </li>
            <li>
              <strong>Plan and usage records</strong> — which plan the account
              is on, and the record of usage allowances granted and consumed.
              Legal basis: Art. 6 (1) (b) GDPR.
            </li>
            <li>
              <strong>Security and activity events</strong> — described in
              section 6. Legal basis: Art. 6 (1) (f) GDPR.
            </li>
          </ul>

          <h2>6. Security and activity log</h2>
          <p>
            The hosted service keeps a log of security-relevant account activity
            so that we can investigate suspected account compromise and
            reconstruct who changed something that other people can see. It
            records three kinds of events:
          </p>
          <ul>
            <li>
              authentication and credential events — signing in and out,
              creating or revoking an access token, linking or unlinking a
              sign-in identity;
            </li>
            <li>
              actions that cannot be undone or that reach outside your account —
              deleting a workflow or an asset, storing or revoking a provider
              credential, sharing or unsharing a workflow, deploying,
              publishing or unpublishing an app;
            </li>
            <li>
              consent given or withdrawn, acceptance of our terms, and requests
              you make under section 10 (export, erasure).
            </li>
          </ul>
          <p>
            What this log does not contain is as important as what it does. It
            is not behavioural tracking: there are no page views, clicks,
            feature-usage counters or session recordings tied to your account,
            and no prompt, message, asset or workflow content is written to it.
            It records that an action of a given kind happened, by which
            account, to which item, and when. It holds no IP address, no
            browser user agent and no free-text field.
          </p>
          <p>
            Legal basis: Art. 6 (1) (f) GDPR — our legitimate interest in
            keeping accounts secure and in being able to account for changes to
            shared resources. We consider this interest not to be overridden by
            your interests because the log is limited to the event categories
            listed above and excludes content. Records of consent and of
            data-subject requests are additionally kept as evidence that we met
            our obligations (Art. 5 (2), Art. 6 (1) (c) GDPR). You can object to
            processing based on legitimate interests under Art. 21 GDPR; see
            section 10.
          </p>

          <h2>7. Hosting and data location</h2>
          <p>
            The hosted application server runs on <strong>Fly.io</strong> with
            its primary region in <strong>Frankfurt, Germany</strong>. The
            database, authentication and asset storage behind it are provided by{" "}
            <strong>Supabase</strong>, configured on European infrastructure in
            the Frankfurt region. The marketing site nodetool.ai is served from{" "}
            <strong>Cloudflare</strong>&apos;s edge network, which is global; only
            the technical data described in 3.1 is processed at the edge.
          </p>

          <h2>8. Recipients and processors</h2>
          <p>
            We use selected processors who act on our documented instructions
            under data processing agreements (Art. 28 GDPR), including:
          </p>
          <ul>
            <li>
              <strong>Fly.io</strong> — runs the hosted application server
              (Frankfurt region).
            </li>
            <li>
              <strong>Supabase</strong> — database, authentication and asset
              storage for the hosted service.
            </li>
            <li>
              <strong>Cloudflare</strong> — delivery and caching of nodetool.ai.
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
              <strong>GitHub</strong> — our open-source repository, issues,
              downloads and desktop application updates.
            </li>
          </ul>
          <p>
            <strong>AI and media providers.</strong> In the hosted service, a
            run that calls a model sends the prompt, the inputs you supplied and
            the run parameters from our servers to the provider you selected.
            The categories are: language-model providers (for example OpenAI,
            Anthropic, Google, Mistral, Groq, Cohere, DeepSeek, xAI), image,
            video, audio and 3D generation providers (for example Replicate,
            FAL, kie, ElevenLabs), model hosts and routers (for example Hugging
            Face, OpenRouter, Together), embedding and reranking services, and
            web-search services used by agents. Which of them receive anything
            depends on the models and tools you choose; a provider you never
            select receives nothing. On the desktop application these calls go
            from your own machine instead, as described in 2.1.
          </p>
          <p>
            We do not sell personal data, and we do not use your data to train
            machine-learning models. Providers process content under their own
            terms; check those terms before sending confidential material to a
            provider.
          </p>

          <h2>9. International transfers</h2>
          <p>
            Several of the recipients named in section 8 are established outside
            the EU/EEA, principally in the United States. In the hosted service
            we are the exporter for those transfers, because the call to the
            provider is made by our servers rather than from your device.
          </p>
          <p>
            Where a recipient is outside the EU/EEA, we rely on an adequacy
            decision where one covers that recipient, and otherwise on EU
            Standard Contractual Clauses together with appropriate supplementary
            measures. For a current list of the recipients relevant to your
            account and the mechanism relied on for each, write to{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>.
          </p>

          <h2>10. Your rights</h2>
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
            In the hosted service you can act on two of these yourself, without
            asking us. <strong>Export</strong> produces a machine-readable copy
            of the data held in your account. <strong>Delete account</strong>{" "}
            erases your account and the content stored under it, subject to the
            retention exceptions in section 11. Both are in the account settings
            of the application.
          </p>
          <p>
            For anything else — or if you would rather we did it — write to{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>. You also
            have the right to lodge a complaint with a data protection
            supervisory authority, in particular the authority of your habitual
            residence, place of work, or place of the alleged infringement
            (Art. 77 GDPR).
          </p>

          <h2>11. Retention</h2>
          <p>
            We keep personal data only for as long as necessary for the purposes
            for which it was collected and to comply with legal obligations.
          </p>
          <ul>
            <li>
              <strong>Server logs</strong> — 14 days or less.
            </li>
            <li>
              <strong>Analytics events</strong> — aggregated and non-personal.
            </li>
            <li>
              <strong>Email correspondence</strong> — as long as required to
              address your matter, plus any statutory retention period.
            </li>
            <li>
              <strong>Content you author in a hosted account</strong> —
              workflows, chats, memories, assets and files are kept until you
              delete them or close the account.
            </li>
            <li>
              <strong>Run history and workflow version snapshots</strong> —
              removed on the retention schedule configured for your account in
              Settings, which covers autosaved snapshots, older manual versions
              and finished run records.
            </li>
            <li>
              <strong>Security and activity events</strong> (section 6) — 180
              days.
            </li>
            <li>
              <strong>Consent records and records of data-subject requests</strong>{" "}
              — kept as evidence that we met our legal obligations, beyond the
              deletion of the account they relate to.
            </li>
            <li>
              <strong>Billing records</strong> — kept for the statutory periods
              that apply to them, which can outlast an account.
            </li>
          </ul>

          <h2>12. Security</h2>
          <p>
            We use TLS for all traffic, restrict administrative access on a
            need-to-know basis, keep dependencies up to date, and follow current
            best practices for the technologies we use. Provider API keys and
            OAuth tokens stored in a hosted account are encrypted with AES-256-GCM
            under a key derived per user, so they are not readable from the
            database alone. No system is perfectly secure; if you believe you
            have found a vulnerability, please report it to{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>.
          </p>

          <h2>13. Children</h2>
          <p>
            NodeTool is not directed at children under 16 and we do not
            knowingly collect personal data from them.
          </p>

          <h2>14. Changes to this policy</h2>
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
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row text-sm text-slate-400">
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
