"use client";
import React, { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

interface ModelNameOrbitProps {
  groups: readonly { label: string; models: readonly { name: string; color: string; url?: string }[] }[];
  reducedMotion: boolean;
}

export default function ModelNameOrbit({ groups, reducedMotion }: ModelNameOrbitProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const pausedRef = useRef(false);
  const runningRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    pausedRef.current = paused;
    runningRef.current?.();
  }, [paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setReady(false);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let visible = false;
    let starting = false;
    let release: (() => void) | undefined;
    let updateRunning: (() => void) | undefined;

    const start = async () => {
      if (starting || disposed || reducedMotion || preference.matches) return;
      starting = true;
      try {
        const [{ PerspectiveCamera, Scene }, { CSS3DRenderer, CSS3DObject }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/renderers/CSS3DRenderer.js"),
        ]);
        if (disposed) return;
        const scene = new Scene();
        const camera = new PerspectiveCamera(42, 1, 1, 3000);
        camera.position.z = 1050;
        const renderer = new CSS3DRenderer();
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.appendChild(renderer.domElement);
        const labels = groups.flatMap((group, row) => group.models.map((model, slot) => {
          const element = document.createElement(model.url ? "a" : "span");
          if (element instanceof HTMLAnchorElement && model.url) {
            element.href = model.url;
            element.target = "_blank";
            element.rel = "noopener noreferrer";
            element.tabIndex = -1;
          }
          element.className = `${model.color} whitespace-nowrap text-4xl md:text-5xl font-semibold tracking-tight drop-shadow-lg`;
          element.textContent = model.name;
          const sprite = new CSS3DObject(element);
          sprite.scale.setScalar(1.4);
          scene.add(sprite);
          return { sprite, element, row, slot, count: group.models.length };
        }));
        let angle = 0;
        let frame = 0;
        let previous = 0;
        const draw = () => {
          labels.forEach(({ sprite, element, row, slot, count }) => {
            const phase = angle * (row === 1 ? -1 : 1) + slot * Math.PI * 2 / count + row * .45;
            const depth = Math.cos(phase);
            sprite.position.set(
              Math.sin(phase) * Math.max(700, count * 100),
              (1 - row) * 155 + Math.sin(phase) * 10,
              depth * 220,
            );
            sprite.rotation.set(-.035, -Math.sin(phase) * .24, Math.sin(phase) * .008);
            element.style.opacity = String(Math.pow(Math.max(0, (depth + .25) / 1.25), 1.4));
          });
          renderer.render(scene, camera);
        };
        const resize = () => {
          const width = host.clientWidth;
          const height = host.clientHeight;
          camera.aspect = width / height;
          camera.position.z = width < 640 ? 1500 : 1050;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          draw();
        };
        const tick = (now: number) => {
          angle += Math.min((now - previous) / 1000, .05) * .17;
          previous = now;
          draw();
          frame = requestAnimationFrame(tick);
        };
        updateRunning = () => {
          cancelAnimationFrame(frame);
          if (visible && !document.hidden && !pausedRef.current && !reducedMotion && !preference.matches) {
            previous = performance.now();
            frame = requestAnimationFrame(tick);
          }
          setReady(!preference.matches && !reducedMotion);
        };
        runningRef.current = updateRunning;
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        document.addEventListener("visibilitychange", updateRunning);
        resize();
        updateRunning();
        release = () => {
          cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          if (updateRunning) document.removeEventListener("visibilitychange", updateRunning);
          renderer.domElement.remove();
          scene.clear();
        };
      } catch {
        // Keep the readable HTML list if the optional 3D chunk fails to load.
        if (!disposed) setReady(false);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) void start();
      updateRunning?.();
    });
    const preferenceChanged = () => {
      if (visible) void start();
      updateRunning?.();
    };
    observer.observe(host);
    preference.addEventListener("change", preferenceChanged);
    return () => {
      disposed = true;
      observer.disconnect();
      preference.removeEventListener("change", preferenceChanged);
      release?.();
      runningRef.current = undefined;
    };
  }, [groups, reducedMotion]);

  return (
    <div className="relative">
      <div
        ref={hostRef}
        className={`h-80 md:h-96 overflow-hidden ${ready ? "opacity-100" : "opacity-0 absolute inset-0"}`}
      />
      {ready && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {groups.map((group, index) => <span key={group.label} style={{ top: `${12 + index * 27}%` }} className="absolute left-0 text-xs font-medium tracking-wide text-slate-400">{group.label}</span>)}
        </div>
      )}
      <div className={ready ? "sr-only focus-within:not-sr-only" : "space-y-8 py-8"}>
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-4 text-sm text-slate-400">{group.label}</h3>
            <ul className="flex flex-wrap justify-center gap-x-8 gap-y-5">
              {group.models.map((model) => <li key={model.name} className={`${model.color} text-xl font-semibold`}>
                {model.url ? <a href={model.url} target="_blank" rel="noopener noreferrer" className="focus-ring">{model.name}</a> : model.name}
              </li>)}
            </ul>
          </div>
        ))}
      </div>
      {ready && (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Rotate model names" : "Pause model rotation"}
          className="absolute bottom-0 right-0 rounded-full border border-slate-700 p-2 text-slate-300 hover:text-white focus-ring"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}
