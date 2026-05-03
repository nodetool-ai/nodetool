import Link from "next/link";

export const dynamic = "force-static";

const LAST_UPDATED = "2 May 2026";

export default function ImprintPage() {
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
            Imprint
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <article className="legal-article">
          <p>
            Legal information pursuant to § 5 DDG (Digitale-Dienste-Gesetz) and
            Art. 13 GDPR.
          </p>

          <h2>Provider</h2>
          <p>
            <strong>NodeTool B.V.</strong>
            <br />
            Prinsengracht 263
            <br />
            1016 GV Amsterdam
            <br />
            The Netherlands
          </p>

          <h2>Represented by</h2>
          <p>
            Managing Directors: Matti Georgi, David de Vries
          </p>

          <h2>Contact</h2>
          <p>
            Email: <a href="mailto:hello@nodetool.ai">hello@nodetool.ai</a>
            <br />
            Phone: +31 20 123 4567
          </p>

          <h2>Commercial register</h2>
          <p>
            Registered with the Kamer van Koophandel (Dutch Chamber of
            Commerce)
            <br />
            KvK no.: 87654321
          </p>

          <h2>VAT identification number</h2>
          <p>
            VAT ID pursuant to Art. 214 of Council Directive 2006/112/EC:
            <br />
            NL864209876B01
          </p>

          <h2>Responsible for content pursuant to § 18 (2) MStV</h2>
          <p>
            Matti Georgi
            <br />
            c/o NodeTool B.V.
            <br />
            Prinsengracht 263, 1016 GV Amsterdam, The Netherlands
          </p>

          <h2>Data Protection Officer</h2>
          <p>
            You can reach our Data Protection Officer at{" "}
            <a href="mailto:dpo@nodetool.ai">dpo@nodetool.ai</a>.
          </p>

          <h2>Lead supervisory authority</h2>
          <p>
            Autoriteit Persoonsgegevens (Dutch Data Protection Authority)
            <br />
            Hoge Nieuwstraat 8, 2514 EL Den Haag, The Netherlands
            <br />
            <a
              href="https://autoriteitpersoonsgegevens.nl"
              target="_blank"
              rel="noopener noreferrer"
            >
              autoriteitpersoonsgegevens.nl
            </a>
          </p>

          <h2>EU online dispute resolution</h2>
          <p>
            The European Commission provides a platform for online dispute
            resolution (ODR):{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://ec.europa.eu/consumers/odr
            </a>
            . We are not obliged and not willing to participate in dispute
            resolution proceedings before a consumer arbitration board.
          </p>

          <h2>Digital Services Act — single point of contact</h2>
          <p>
            Pursuant to Art. 11 and Art. 12 of Regulation (EU) 2022/2065 (DSA),
            authorities and users can contact us in English, German, or Dutch
            at <a href="mailto:dsa@nodetool.ai">dsa@nodetool.ai</a>.
          </p>

          <p className="text-sm text-slate-400">
            See also our <Link href="/privacy">Privacy Policy</Link> and{" "}
            <Link href="/terms">Terms of Use</Link>.
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
