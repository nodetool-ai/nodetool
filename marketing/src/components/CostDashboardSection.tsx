"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  CurrencyDollarIcon,
  Squares2X2Icon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

/**
 * Marketing recreation of the in-app Costs dashboard. The real component lives in
 * the web app (web/src/components/costs) and is wired to tRPC + ui_primitives, so
 * it can't be imported here. This is a static, on-brand rebuild with clean demo
 * data that tells the cost-transparency story: spend tracked per node execution,
 * no markup, exportable.
 */

const PROVIDERS = [
  { id: "kie", label: "Kie", color: "#4d8bff", amount: "$4.35" },
  { id: "openai", label: "OpenAI", color: "#34d399", amount: "$1.85" },
  { id: "fal", label: "fal.ai", color: "#8b7bf0", amount: "$1.50" },
] as const;

// Daily spend ($) split by provider — mostly quiet, one render-heavy spike, matching
// the real shape of a creative workload that batches a video job on one day.
const DAYS: { k: number; o: number; f: number }[] = [
  { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 }, { k: 0, o: 0.18, f: 0 },
  { k: 0, o: 0.16, f: 0 }, { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 },
  { k: 0, o: 0.55, f: 0 }, { k: 0, o: 0.4, f: 0 }, { k: 0, o: 0, f: 0 },
  { k: 0, o: 0, f: 0 }, { k: 0.22, o: 0, f: 0 }, { k: 0.18, o: 0, f: 0 },
  { k: 0, o: 0, f: 0 }, { k: 0, o: 0.12, f: 0 }, { k: 0, o: 0, f: 0 },
  { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 }, { k: 0, o: 0.18, f: 0 },
  { k: 0, o: 0, f: 0 }, { k: 0, o: 0.05, f: 0 }, { k: 0.18, o: 0, f: 0.62 },
  { k: 0, o: 0, f: 0 }, { k: 2.62, o: 1.74, f: 0 }, { k: 0, o: 0, f: 0 },
  { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 },
  { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 }, { k: 0, o: 0, f: 0 },
];

const TABLE = [
  { name: "BytedanceSeedance2", runs: 1, share: 40, cost: "$3.08" },
  { name: "GptImage2Edit", runs: 10, share: 18, cost: "$1.41" },
  { name: "gpt-5.4-mini", runs: 37, share: 16, cost: "$1.25" },
  { name: "GrokImagineTextToVideo", runs: 21, share: 13, cost: "$1.01" },
  { name: "gpt-5-mini", runs: 29, share: 4, cost: "$0.34" },
];

const GROUP_TABS = ["Execution", "Node type", "Workflow", "Provider", "Model"];
const RANGE_TABS = ["7d", "14d", "30d", "90d"];

const CHART_H = 150; // px, plotting area
const Y_MAX = 5.39; // matches the top axis tick

function StatCard({
  label,
  icon: Icon,
  children,
  caption,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  caption: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </span>
        <Icon className="h-4 w-4 text-slate-600" />
      </div>
      <div className="mt-3 text-2xl font-semibold leading-none text-white">
        {children}
      </div>
      <div className="mt-2 text-xs text-slate-500">{caption}</div>
    </div>
  );
}

export default function CostDashboardSection() {
  return (
    <section
      id="costs"
      aria-labelledby="costs-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background glow, emerald to echo the "money saved" read */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-900/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-base font-medium leading-7 text-blue-400">
            Cost transparency
          </h2>
          <h3
            id="costs-title"
            className="mt-2 text-3xl font-bold tracking-tight text-white md:text-5xl"
          >
            See what every run actually costs
          </h3>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            NodeTool prices every node execution and rolls it up by workflow,
            provider, or model. You bring your own keys and pay providers
            directly, so the numbers are the real ones.
          </p>
        </div>

        {/* Dashboard window */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative mx-auto max-w-5xl"
        >
          <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#0b0d12] shadow-strong">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
              <div className="h-3 w-3 rounded-full border border-red-500/50 bg-red-500/20" />
              <div className="h-3 w-3 rounded-full border border-yellow-500/50 bg-yellow-500/20" />
              <div className="h-3 w-3 rounded-full border border-green-500/50 bg-green-500/20" />
              <div className="ml-4 flex items-center gap-2 text-xs font-medium text-slate-400">
                <CurrencyDollarIcon className="h-3.5 w-3.5" />
                Costs
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {/* Toolbar */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">Costs</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Spend per node execution across 9 workflows · last 90 days
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
                    {RANGE_TABS.map((t) => (
                      <span
                        key={t}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          t === "90d"
                            ? "bg-white/10 text-white"
                            : "text-slate-500"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="hidden items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white sm:inline-flex">
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    Export CSV
                  </span>
                </div>
              </div>

              {/* Stat cards */}
              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Total spend"
                  icon={CurrencyDollarIcon}
                  caption="across 9 workflows"
                >
                  $7.71
                </StatCard>
                <StatCard
                  label="Node executions"
                  icon={Squares2X2Icon}
                  caption="0 failed"
                >
                  194
                </StatCard>
                <StatCard
                  label="Avg / execution"
                  icon={ArrowTrendingUpIcon}
                  caption="across all node types"
                >
                  $0.040
                </StatCard>
                <StatCard
                  label="Top cost driver"
                  icon={ChartBarIcon}
                  caption="$3.08 · 40% of spend"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#4d8bff]" />
                    <span className="truncate">BytedanceSeedance2</span>
                  </span>
                </StatCard>
              </div>

              {/* Spend over time */}
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-sm font-semibold text-white">
                    Spend over time
                  </span>
                  <span className="text-xs text-slate-500">
                    daily · last 90 days
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    {PROVIDERS.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 text-xs text-slate-400"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: p.color }}
                        />
                        {p.label}
                        <span className="text-slate-600">{p.amount}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                <div className="mt-4 flex gap-3">
                  <div
                    className="flex w-10 shrink-0 flex-col justify-between text-right text-[10px] text-slate-600"
                    style={{ height: CHART_H }}
                  >
                    <span>$5.39</span>
                    <span>$2.70</span>
                    <span>$0</span>
                  </div>
                  <div className="relative flex-1">
                    {/* Gridlines */}
                    <div
                      className="absolute inset-x-0 top-0 flex flex-col justify-between"
                      style={{ height: CHART_H }}
                      aria-hidden="true"
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="border-t border-white/[0.05]" />
                      ))}
                    </div>
                    {/* Bars */}
                    <div
                      className="relative flex items-end gap-[3px]"
                      style={{ height: CHART_H }}
                    >
                      {DAYS.map((d, i) => {
                        const total = d.k + d.o + d.f;
                        return (
                          <motion.div
                            key={i}
                            className="flex flex-1 origin-bottom flex-col-reverse overflow-hidden rounded-t-[2px]"
                            style={{ height: (total / Y_MAX) * CHART_H }}
                            initial={{ scaleY: 0 }}
                            whileInView={{ scaleY: 1 }}
                            viewport={{ once: true }}
                            transition={{
                              duration: 0.5,
                              delay: 0.2 + i * 0.012,
                              ease: [0.2, 0.8, 0.2, 1],
                            }}
                          >
                            {d.k > 0 && (
                              <div
                                style={{
                                  height: `${(d.k / total) * 100}%`,
                                  background: "#4d8bff",
                                }}
                              />
                            )}
                            {d.o > 0 && (
                              <div
                                style={{
                                  height: `${(d.o / total) * 100}%`,
                                  background: "#34d399",
                                }}
                              />
                            )}
                            {d.f > 0 && (
                              <div
                                style={{
                                  height: `${(d.f / total) * 100}%`,
                                  background: "#8b7bf0",
                                }}
                              />
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group-by table */}
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Group by
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {GROUP_TABS.map((t) => (
                      <span
                        key={t}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          t === "Node type"
                            ? "bg-white/10 text-white"
                            : "text-slate-500"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="ml-auto text-xs text-slate-600">
                    5 of 31
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-[1.6fr_0.6fr_2fr_0.7fr] items-center gap-3 border-b border-white/5 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                  <span>Node type</span>
                  <span className="text-right">Runs</span>
                  <span>Share of spend</span>
                  <span className="text-right">Cost</span>
                </div>

                {TABLE.map((row, i) => (
                  <div
                    key={row.name}
                    className="grid grid-cols-[1.6fr_0.6fr_2fr_0.7fr] items-center gap-3 border-b border-white/[0.04] py-2.5 text-sm last:border-0"
                  >
                    <span className="truncate font-medium text-slate-200">
                      {row.name}
                    </span>
                    <span className="text-right text-slate-500">
                      {row.runs}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <motion.div
                          className="h-full origin-left rounded-full bg-[#4d8bff]"
                          style={{ width: `${row.share}%` }}
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.6,
                            delay: 0.3 + i * 0.06,
                            ease: [0.2, 0.8, 0.2, 1],
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs text-slate-500">
                        {row.share}%
                      </span>
                    </div>
                    <span className="text-right font-medium tabular-nums text-slate-200">
                      {row.cost}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Value props */}
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              title: "Per-node accounting",
              body: "Every execution priced on its own, grouped by node, workflow, provider, or model.",
            },
            {
              title: "No markup",
              body: "Pay OpenAI, fal.ai, and the rest directly with your own keys. NodeTool takes zero cut.",
            },
            {
              title: "Export anytime",
              body: "Pull the full breakdown to CSV for your own books, billing, or client invoices.",
            },
          ].map(({ title, body }) => (
            <div key={title}>
              <h4 className="text-base font-semibold text-white">{title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
