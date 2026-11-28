import type { Metadata } from "next";
import { ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import FaqSection from "../../components/FaqSection";
import JsonLd from "../../components/JsonLd";
import PageUpdated from "@/components/PageUpdated";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { breadcrumbSchema } from "@/lib/jsonld";
import {
  COST_POINTS,
  FLOW_STEPS,
  INDIAN_DESCRIPTION,
  INDIAN_EYEBROW,
  INDIAN_FAQ,
  INDIAN_H1,
  INDIAN_LEAD,
  INDIAN_LIMITS,
  INDIAN_LINKS,
  INDIAN_TITLE,
  MORE_JOBS,
  TRANSCRIBE_LANGUAGES,
  VOICE_FEATURES,
  VOICE_LANGUAGES,
} from "@/data/indianLanguagesPage";

export const metadata: Metadata = {
  title: INDIAN_TITLE,
  description: INDIAN_DESCRIPTION,
  alternates: { canonical: "/indian-languages" },
  openGraph: { title: INDIAN_TITLE, description: INDIAN_DESCRIPTION, url: "https://nodetool.ai/indian-languages", siteName: "NodeTool", type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: INDIAN_TITLE, description: INDIAN_DESCRIPTION },
};

/** Each voice language in its own script, keyed by the English name in VOICE_LANGUAGES. */
const NATIVE_NAMES: Record<string, { name: string; lang: string }> = {
  Hindi: { name: "हिन्दी", lang: "hi" },
  Tamil: { name: "தமிழ்", lang: "ta" },
  Telugu: { name: "తెలుగు", lang: "te" },
  Bengali: { name: "বাংলা", lang: "bn" },
  Marathi: { name: "मराठी", lang: "mr" },
  Gujarati: { name: "ગુજરાતી", lang: "gu" },
  Kannada: { name: "ಕನ್ನಡ", lang: "kn" },
  Malayalam: { name: "മലയാളം", lang: "ml" },
  Punjabi: { name: "ਪੰਜਾਬੀ", lang: "pa" },
  Odia: { name: "ଓଡ଼ିଆ", lang: "or" },
};

const HERO_LANGUAGES = Object.keys(NATIVE_NAMES).filter((name) => VOICE_LANGUAGES.includes(name));

const sectionTitle = "max-w-sm text-3xl font-semibold tracking-tight md:text-4xl";
const bodyText = "leading-relaxed text-slate-300";

export default function IndianLanguagesPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-32 md:pt-36 lg:px-8">
          <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0">
              <p className="mb-5 text-base font-medium text-cyan-200">{INDIAN_EYEBROW}</p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">{INDIAN_H1}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">{INDIAN_LEAD}</p>
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <SmartDownloadButton icon={<Download className="h-4 w-4" aria-hidden="true" />} classNameOverride="focus-ring inline-flex items-center rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100" />
                <a href="/hi" hrefLang="hi" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">हिन्दी में पढ़ें</a>
              </div>
            </div>
            <figure className="m-0 min-w-0 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
              <figcaption className="text-sm font-medium text-slate-300">Bulbul voices, by language</figcaption>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {HERO_LANGUAGES.map((english) => (
                  <li key={english} className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2">
                    <span lang={NATIVE_NAMES[english].lang} className="block text-lg text-slate-100">{NATIVE_NAMES[english].name}</span>
                    <span className="block text-xs text-slate-400">{english}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">Plus Indian English and Hinglish voices.</p>
            </figure>
          </section>

          <section aria-labelledby="voices-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="voices-title" className={sectionTitle}>Sarvam voices on your own key</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>Sarvam AI builds speech models for Indian languages. NodeTool calls it directly with the key you add.</p>
            </div>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {VOICE_FEATURES.map((feature) => (
                <li key={feature.title}>
                  <h3 className="text-xl font-medium">{feature.title}</h3>
                  <p className={`mt-2 ${bodyText}`}>{feature.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="flow-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="flow-title" className={sectionTitle}>From script to captioned cut</h2>
            <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.title}>
                  <p className="font-mono text-sm text-cyan-200">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-1 text-xl font-medium">{step.title}</h3>
                  <p className={`mt-2 ${bodyText}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="transcribe-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="transcribe-title" className={sectionTitle}>Transcribe 22 Indian languages</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>Sarvam Saaras v3 and v4 turn speech into text in these languages and English. Use it to start a dub from existing footage or to check a voiced line.</p>
            </div>
            <ul className="flex flex-wrap content-start gap-2" aria-label="Languages Saaras transcribes">
              {TRANSCRIBE_LANGUAGES.map((language) => (
                <li key={language} className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200">{language}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="jobs-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="jobs-title" className={sectionTitle}>Dubs, translations and vertical cuts</h2>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {MORE_JOBS.map((job) => (
                <li key={job.title}>
                  <h3 className="text-xl font-medium">{job.title}</h3>
                  <p className={`mt-2 ${bodyText}`}>{job.body}</p>
                  <a href={job.href} className="focus-ring mt-3 inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100">{job.linkLabel}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cost-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="cost-title" className={sectionTitle}>What it costs</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>Studio is free. Plans, keys and a cost calculator are on <a href="/pricing" className="focus-ring rounded font-medium text-cyan-200 underline underline-offset-2 hover:text-cyan-100">Pricing</a>.</p>
            </div>
            <ul className="max-w-2xl list-disc space-y-3 pl-5 text-slate-300">
              {COST_POINTS.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </section>

          <section aria-labelledby="limits-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="limits-title" className={sectionTitle}>Good to know</h2>
            <ul className="max-w-2xl list-disc space-y-2 pl-5 text-slate-300">
              {INDIAN_LIMITS.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          </section>

          <FaqSection items={INDIAN_FAQ} heading="Questions about Indian languages" className="mt-24 max-w-3xl" id="indian-faq" />

          <nav aria-labelledby="indian-links-title" className="mt-16 max-w-3xl">
            <h2 id="indian-links-title" className="text-xl font-semibold">Read more</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {INDIAN_LINKS.map((link) => (
                <li key={link.href}><a href={link.href} className="focus-ring inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100">{link.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
          <PageUpdated route="/indian-languages" className="text-sm text-slate-400" />
        </div>
        <JsonLd data={breadcrumbSchema([{ name: "Indian languages", url: "/indian-languages" }])} />
      </main>
      <SiteFooter />
    </>
  );
}
