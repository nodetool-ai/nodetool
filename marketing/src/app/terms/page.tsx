import Link from "next/link";

export const dynamic = "force-static";

const LAST_UPDATED = "2 May 2026";

export default function TermsPage() {
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
            Terms of Use
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <article className="legal-article">
          <p>
            These Terms of Use govern your use of <strong>nodetool.ai</strong>,
            the <strong>NodeTool</strong> desktop application, and related
            services we make available (together, the &quot;Services&quot;). By using
            the Services you agree to these terms. If you do not agree, do not
            use the Services.
          </p>

          <h2>1. The Services</h2>
          <p>
            NodeTool is an open-source visual programming tool for building AI
            workflows. The desktop application runs locally on your machine.
            The marketing website provides information about the project and
            links to downloads, documentation, and the source repository.
          </p>

          <h2>2. Open-source license</h2>
          <p>
            The NodeTool source code is published on{" "}
            <a
              href="https://github.com/nodetool-ai/nodetool"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>{" "}
            under the license stated in the repository. Use of the source code
            and binaries is governed by that license. These Terms cover use of
            the website and any hosted services we operate; in case of
            conflict between the open-source license and these Terms with
            respect to the source code, the open-source license prevails.
          </p>

          <h2>3. Eligibility and accounts</h2>
          <p>
            You must be at least 16 years old to use the Services. No account
            is required to download or run the desktop application. Where an
            account is offered for an optional service, you are responsible
            for keeping your credentials secure and for activity under your
            account.
          </p>

          <h2>4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              use the Services to break the law or infringe someone else&apos;s
              rights;
            </li>
            <li>
              attempt to disrupt, overload, or gain unauthorised access to
              our infrastructure;
            </li>
            <li>
              reverse engineer parts of any hosted service that are not
              published as open source;
            </li>
            <li>
              use the Services to generate or distribute illegal content,
              including content that sexualises minors, incites violence, or
              violates applicable export-control or sanctions laws;
            </li>
            <li>misrepresent your affiliation with NodeTool.</li>
          </ul>

          <h2>5. Your content</h2>
          <p>
            Workflows, prompts, files, and outputs you create with the
            desktop application stay on your device. You retain all rights to
            your content. You are responsible for ensuring that you have the
            necessary rights to any inputs you process and for complying with
            the terms of any third-party model providers you connect.
          </p>

          <h2>6. Third-party services and models</h2>
          <p>
            NodeTool can connect to third-party services such as OpenAI,
            Anthropic, Replicate, Hugging Face, Ollama, and others. Your use
            of those services is governed by the terms and privacy policies
            of the respective providers. We are not responsible for outputs,
            availability, billing or data handling by third parties.
          </p>

          <h2>7. AI-generated content</h2>
          <p>
            Outputs from AI models can be inaccurate, biased, or otherwise
            unsuitable. You are responsible for reviewing outputs before
            relying on them, particularly in regulated domains (medical,
            legal, financial, safety-critical). NodeTool provides tools, not
            professional advice.
          </p>

          <h2>8. Intellectual property</h2>
          <p>
            The NodeTool name, logo and branding are owned by the NodeTool
            team. Beyond the rights granted by the open-source license, no
            other rights are granted. All rights not expressly granted are
            reserved.
          </p>

          <h2>9. Availability and changes</h2>
          <p>
            We may change, suspend, or discontinue any part of the Services
            at any time. We make reasonable efforts to communicate material
            changes in advance, but we cannot guarantee uninterrupted
            availability of any hosted service.
          </p>

          <h2>10. Disclaimer of warranties</h2>
          <p>
            To the fullest extent permitted by law, the Services are provided
            &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind,
            whether express or implied, including warranties of
            merchantability, fitness for a particular purpose, and
            non-infringement. Statutory rights of consumers under mandatory
            law remain unaffected.
          </p>

          <h2>11. Limitation of liability</h2>
          <p>
            To the extent permitted by law, NodeTool, its team and
            contributors shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages, or any loss of
            profits, data, or goodwill arising from your use of the Services.
            Where mandatory law (in particular German and EU consumer law)
            limits or excludes the exclusion of liability, our liability is
            limited to the extent permitted by such law; this includes,
            without limitation, liability for intent and gross negligence,
            for breach of essential contractual duties (limited to typical
            and foreseeable damages), for personal injury, and under the
            German Product Liability Act.
          </p>

          <h2>12. Privacy</h2>
          <p>
            Our handling of personal data is described in our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>

          <h2>13. Governing law and venue</h2>
          <p>
            These Terms are governed by the laws of the Federal Republic of
            Germany, excluding the UN Convention on Contracts for the
            International Sale of Goods. Mandatory consumer protection law of
            the country where you have your habitual residence remains
            unaffected. To the extent permitted by law, the place of
            jurisdiction for disputes is Germany.
          </p>

          <h2>14. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes
            will be highlighted on this page; continued use of the Services
            after changes take effect constitutes acceptance of the updated
            Terms.
          </p>

          <h2>15. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>.
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
