"use client";
import React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { track } from "../lib/analytics";
import { useGithubStars, formatStars } from "../lib/useGithubStars";
import AnnouncementBar from "./AnnouncementBar";

/**
 * Single shared site header used by every route (P3). Replaces the per-page
 * nav blocks that had drifted apart. Active state derives from the current
 * pathname, so cross-linking between personas is consistent everywhere.
 */

type NavItem = { name: string; href: string; external?: boolean };

const NAV: NavItem[] = [
  { name: "Studio", href: "/studio" },
  { name: "Cloud", href: "/cloud" },
  { name: "Agents", href: "/agents" },
  { name: "Developers", href: "/developers" },
  { name: "Marketing", href: "/marketing" },
  { name: "Pricing", href: "/pricing" },
  { name: "Blog", href: "/blog" },
  { name: "Docs", href: "https://docs.nodetool.ai", external: true },
];

const GITHUB_URL = "https://github.com/nodetool-ai/nodetool";

function Wordmark() {
  return (
    <a
      href="/"
      className="group flex items-center gap-2 rounded focus-ring"
      aria-label="NodeTool home"
    >
      <Image
        src="/logo_small.webp"
        alt=""
        width={48}
        height={48}
        priority
        sizes="48px"
        className="h-8 w-8 sm:h-10 sm:w-10 brightness-0 invert transition-all duration-300 group-hover:brightness-100 group-hover:invert-0"
      />
      {/* Solid near-white wordmark — the legacy amber/orange gradient is retired (P5). */}
      <span className="text-base sm:text-xl font-bold tracking-widest text-white">
        nodetool
      </span>
    </a>
  );
}

/**
 * The menu runs on a `data-nav-open` attribute rather than React state, driven
 * by this script, which the browser executes as it parses the header — seconds
 * before React hydrates. The landing page is one big `"use client"` tree, so
 * hydration lands ~2.7s in on a 6x-throttled phone while the hamburger has been
 * on screen since ~0.3s; every tap in that window used to be swallowed.
 * Visibility is CSS (`html[data-nav-open]`, see globals.css), so nothing here
 * waits on a bundle.
 *
 * The listener is delegated on `document`, which outlives a soft navigation —
 * a `next/link` route change re-renders the header but does not re-run an
 * inline script.
 *
 * Opening pins the page rather than only setting `overflow: hidden`, which iOS
 * Safari ignores — without the pin a flick inside the panel scrolls the
 * document behind it.
 */
const NAV_MENU_SCRIPT = `(function(){
if(window.__ntNavMenu)return;
var html=document.documentElement,saved=null;
function expanded(v){var b=document.querySelector('[data-nav="open"]');if(b)b.setAttribute("aria-expanded",v?"true":"false");}
function open(){
  if(html.hasAttribute("data-nav-open"))return;
  var b=document.body,y=window.scrollY;
  saved={y:y,position:b.style.position,top:b.style.top,left:b.style.left,right:b.style.right,overflow:b.style.overflow};
  b.style.position="fixed";b.style.top=-y+"px";b.style.left="0";b.style.right="0";b.style.overflow="hidden";
  html.setAttribute("data-nav-open","");expanded(true);
}
function close(){
  if(!html.hasAttribute("data-nav-open"))return;
  html.removeAttribute("data-nav-open");expanded(false);
  if(!saved)return;
  var b=document.body,s=saved;saved=null;
  b.style.position=s.position;b.style.top=s.top;b.style.left=s.left;b.style.right=s.right;b.style.overflow=s.overflow;
  var behavior=html.style.scrollBehavior;html.style.scrollBehavior="auto";window.scrollTo(0,s.y);html.style.scrollBehavior=behavior;
}
document.addEventListener("click",function(e){
  var t=e.target;
  if(!t||typeof t.closest!=="function")return;
  var hit=t.closest("[data-nav]");
  if(!hit)return;
  if(hit.getAttribute("data-nav")==="open"){open();}else{close();}
});
document.addEventListener("keydown",function(e){if(e.key==="Escape")close();});
var wide=window.matchMedia("(min-width: 768px)");
(wide.addEventListener?wide.addEventListener.bind(wide,"change"):wide.addListener.bind(wide))(function(e){if(e.matches)close();});
window.__ntNavMenu={open:open,close:close};
})();`;

export default function SiteHeader() {
  const pathname = usePathname();
  const stars = useGithubStars();

  const isActive = (item: NavItem) =>
    !item.external && (pathname === item.href);

  return (
    <header>
      <script dangerouslySetInnerHTML={{ __html: NAV_MENU_SCRIPT }} />
      <AnnouncementBar />
      <nav
        className="fixed top-[var(--announce-h)] left-0 right-0 z-50 border-b border-slate-800/60 bg-glass supports-[backdrop-filter]:bg-glass shadow-[0_1px_0_0_rgba(59,130,246,0.08)]"
        aria-label="Primary"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-2 sm:py-3">
          <div className="relative flex items-center justify-center gap-6 w-full min-h-[44px] sm:min-h-[56px]">
            <div className="absolute left-0 flex items-center h-9 sm:h-10">
              <Wordmark />
            </div>

            <ul className="hidden md:flex items-center gap-1 lg:gap-2 mx-auto rounded-full bg-slate-900/40 ring-1 ring-white/5 px-2 py-1 border border-slate-800/50">
              {NAV.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.name} className="list-none">
                    <a
                      href={item.href}
                      {...(item.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      onClick={
                        item.name === "Docs"
                          ? () => track("Open Docs")
                          : undefined
                      }
                      className={`px-3 py-1.5 text-sm font-medium rounded-full lift focus-ring ${
                        active
                          ? "bg-blue-600/25 text-blue-200 border border-blue-500/40"
                          : "text-slate-300 hover:text-blue-200 hover:bg-slate-800/60"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.name}
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="absolute right-0 flex items-center gap-2 h-full">
              <button
                type="button"
                className="md:hidden rounded-md p-1.5 text-slate-300 hover:bg-slate-800/60 transition-colors focus-ring"
                data-nav="open"
                aria-expanded={false}
                aria-label="Open menu"
              >
                <Bars3Icon className="h-5 w-5" aria-hidden="true" />
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Star GitHub")}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-2 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/70 focus-ring"
                aria-label="Star NodeTool on GitHub"
              >
                <Image
                  src="/github-mark-white.svg"
                  alt=""
                  width={18}
                  height={18}
                  role="presentation"
                />
                <span>Star on GitHub</span>
                {stars !== null && (
                  <span className="ml-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-slate-300">
                    {formatStars(stars)}
                  </span>
                )}
              </a>
            </div>
          </div>
        </div>
      </nav>

      <div
        className="site-nav-overlay fixed inset-0 z-[70]"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/90"
          data-nav="close"
          aria-label="Close menu"
        />
        <div className="mobile-menu-panel absolute inset-y-0 right-0 w-full overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-6 sm:max-w-sm border-l border-slate-800/60">
          <div className="flex items-center justify-between">
            <Wordmark />
            <button
              type="button"
              className="rounded-md p-2 text-slate-300 hover:bg-slate-800/60 transition-colors focus-ring"
              data-nav="close"
              aria-label="Close menu"
            >
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-6 space-y-2">
            {NAV.map((item) => (
              <a
                key={item.name}
                href={item.href}
                {...(item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white rounded-lg transition-colors focus-ring"
                data-nav="close"
              >
                {item.name}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-nav="close"
              onClick={() => track("Star GitHub")}
              className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white rounded-lg transition-colors focus-ring"
            >
              Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
