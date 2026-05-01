"use client";
import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

const BusinessHero = dynamic(() => import("../../components/business/BusinessHero"), {
  ssr: false,
});
const BusinessFeaturesSection = dynamic(
  () => import("../../components/business/BusinessFeaturesSection"),
  { ssr: false }
);
const BusinessUseCasesSection = dynamic(
  () => import("../../components/business/BusinessUseCasesSection"),
  { ssr: false }
);
const ROISection = dynamic(() => import("../../components/business/ROISection"), {
  ssr: false,
});
const SecuritySection = dynamic(
  () => import("../../components/business/SecuritySection"),
  { ssr: false }
);
const CommunitySection = dynamic(
  () => import("../../components/CommunitySection"),
  { ssr: false }
);
const ContactSection = dynamic(
  () => import("../../components/ContactSection"),
  { ssr: false }
);


const navigation = [
  { name: "Home", href: "/" },
  { name: "Features", href: "#features" },
  { name: "Use Cases", href: "#use-cases" },
  { name: "ROI", href: "#roi" },
  { name: "Security", href: "#security" },
  { name: "Docs", href: "https://docs.nodetool.ai" },
] as const;

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";
const focusRing = "focus-ring";

// Prefer reduced motion hook
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export default function BusinessPage() {
  const [hash, setHash] = useState<string>("");
  const [stars, setStars] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Avoid background scroll while the mobile menu is open.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileMenuOpen]);

  // Global section fly-in using IntersectionObserver + CSS transitions
  useEffect(() => {
    if (reducedMotion) return;
    const root = document.getElementById("content");
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section"));
    sections.forEach((el, i) => {
      el.classList.add("fly-in");
      const delay = Math.min(i * 60, 300);
      el.style.setProperty("--fly-delay", `${delay}ms`);
    });
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.classList.add("is-visible");
            obs.unobserve(el);
          }
        });
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );
    sections.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reducedMotion]);

  // Track hash for navigation
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  // Fetch GitHub stars
  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => {});
  }, []);

  // Parallax with reduced-motion guard
  useEffect(() => {
    if (reducedMotion) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (parallaxRef.current) {
          const scrollPosition = window.scrollY;
          const yOffset = scrollPosition * 0.5;
          parallaxRef.current.style.transform = `translate3d(0, ${yOffset}px, 0)`;
        }
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reducedMotion]);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Soft radial glows */}
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
          animate={reducedMotion ? undefined : { y: [0, 10, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 18, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <motion.div
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-blue-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
          animate={reducedMotion ? undefined : { x: [0, -12, 0], y: [0, 4, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 22, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)" }}
        />
        {/* Grid overlay */}
        <div
          ref={parallaxRef}
          aria-hidden="true"
          className="h-full w-full will-change-transform bg-grid-pattern"
          style={{ transform: "translate3d(0,0,0)" }}
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[.28]"
          shapeRendering="crispEdges"
        >
          <defs>
            <pattern
              id="page-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.33"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#page-grid)" />
        </svg>
      </div>

      {/* Nav */}
      <header>
        <nav
          className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/60 bg-glass supports-[backdrop-filter]:bg-glass shadow-[0_1px_0_0_rgba(16,185,129,0.08)]"
          aria-label="Primary"
        >
          <div className={`${sectionContainer} py-2 sm:py-4 lg:py-2`}>
            <div className="relative flex items-center justify-center gap-6 w-full min-h-[44px] sm:min-h-[64px]">
              {/* Logo */}
              <div className="absolute left-0 flex items-center h-12 sm:h-10">
                <a href="/" className={`group flex items-center gap-2 rounded`}>
                  <Image
                    src="/logo_small.png"
                    alt="NodeTool"
                    width={48}
                    height={48}
                    priority
                    sizes="180px"
                    className="brightness-0 invert transition-all duration-300 group-hover:brightness-100 group-hover:invert-0"
                  />
                  <span className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                    nodetool
                  </span>
                </a>
              </div>
              {/* Navigation */}
              <ul className="hidden md:flex items-center gap-2 lg:gap-4 mx-auto rounded-full bg-slate-900/40 ring-1 ring-white/5 px-2 py-1 border border-slate-800/50">
                {navigation.map((item) => {
                  const active = hash === item.href;
                  return (
                    <li key={item.name} className="list-none">
                      <a
                        href={item.href}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full lift ${
                          active
                            ? "bg-emerald-600/25 text-emerald-200 border border-emerald-500/40"
                            : "text-slate-300 hover:text-emerald-200 hover:bg-slate-800/60"
                        }`}
                        aria-current={active ? "page" : undefined}
                      >
                        {item.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
              {/* GitHub */}
              <div className="absolute right-0 flex items-center gap-2 h-full">
                {/* Mobile menu button */}
                <button
                  type="button"
                  className="md:hidden rounded-md p-2 text-slate-300 hover:bg-slate-800/60 transition-colors"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                </button>
                <a
                  href="https://github.com/nodetool-ai/nodetool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-lg p-1 transition-colors hover:bg-emerald-900/20 ${focusRing}`}
                  aria-label="NodeTool on GitHub"
                >
                  <Image
                    src="/github-mark-white.svg"
                    alt=""
                    width={24}
                    height={24}
                    role="presentation"
                  />
                </a>
              </div>
            </div>
            {/* Mobile-only persona links */}
            <div className="md:hidden flex items-center justify-center gap-2 pt-1.5 pb-0.5">
              <a
                href="/"
                className="px-3 py-1 text-xs font-medium rounded-full lift text-slate-300 bg-slate-900/40 ring-1 ring-white/5 border border-slate-800/50 hover:text-blue-200 hover:bg-slate-800/60"
              >
                Home
              </a>
              <a
                href="/agents"
                className="px-3 py-1 text-xs font-medium rounded-full lift text-slate-300 bg-slate-900/40 ring-1 ring-white/5 border border-slate-800/50 hover:text-blue-200 hover:bg-slate-800/60"
              >
                Agents
              </a>
              <a
                href="/creatives"
                className="px-3 py-1 text-xs font-medium rounded-full lift text-slate-300 bg-slate-900/40 ring-1 ring-white/5 border border-slate-800/50 hover:text-blue-200 hover:bg-slate-800/60"
              >
                Creatives
              </a>
            </div>
          </div>
        </nav>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/90"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            />
            <div className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-6 sm:max-w-sm border-l border-slate-800/60">
              <div className="flex items-center justify-between">
                <a href="/" className="flex items-center gap-2">
                  <Image
                    src="/logo_small.png"
                    alt="NodeTool"
                    width={40}
                    height={40}
                    className="brightness-0 invert"
                  />
                  <span className="text-lg font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                    nodetool
                  </span>
                </a>
                <button
                  type="button"
                  className="rounded-md p-2 text-slate-300 hover:bg-slate-800/60 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-6 flow-root">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white rounded-lg transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <div
        id="content"
        className="relative isolate overflow-hidden pt-24 sm:pt-36 md:pt-24"
      >
        {/* Hero */}
        <section aria-labelledby="hero-title" className="pt-2 relative">
          <div className={`${sectionContainer}`}>
            <BusinessHero />
          </div>
        </section>

        {/* Features */}
        <BusinessFeaturesSection reducedMotion={reducedMotion} />

        {/* Use Cases */}
        <BusinessUseCasesSection reducedMotion={reducedMotion} />

        {/* ROI */}
        <ROISection reducedMotion={reducedMotion} />

        {/* Security */}
        <SecuritySection reducedMotion={reducedMotion} />

        {/* Community */}
        <CommunitySection stars={stars} />

        {/* Divider */}
        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-emerald-800/20 to-transparent" />

        {/* Contact */}
        <ContactSection />
      </div>

      {/* Footer */}
      <footer className="relative border-t border-slate-800/50 bg-slate-950 py-10">
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-800/40 to-transparent" />
        <div className={`${sectionContainer}`}>
          <p className="text-center text-sm text-slate-500">
            <span className="text-emerald-400">
              Built with ❤️ by the NodeTool team
            </span>
          </p>
          <div className="mt-4 flex justify-center gap-6 text-xs text-slate-500">
            <a
              href="https://github.com/nodetool-ai/nodetool"
              className="hover:text-slate-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/WmQTWZRcYE"
              className="hover:text-slate-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
