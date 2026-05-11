import Link from "next/link";
import { LayoutDashboard, ListTodo, Target, Sparkles } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/plans", label: "Plans", icon: Target },
  { href: "/sessions", label: "Sessions", icon: Sparkles },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container flex h-12 items-center gap-1">
        <Link href="/" className="mr-4 flex items-center gap-2">
          <span className="size-4 rounded-sm bg-foreground" />
          <span className="text-sm font-semibold tracking-tight">NodeTool Tasks</span>
        </Link>
        <nav className="flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <item.icon className="size-3.5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <a
            className="hover:text-foreground transition-colors"
            href="https://github.com/nodetool-ai/nodetool/tree/main/.tasks"
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        </div>
      </div>
    </header>
  );
}
