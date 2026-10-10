import { useEffect, useState, type ReactNode } from "react";
import { Icon, Logo } from "./Icon.js";
import type { Route, Tab } from "./router.js";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "today", label: "Brief", icon: "home" },
  { id: "capture", label: "Capture", icon: "capture" },
  { id: "plan", label: "Plan", icon: "plan" },
  { id: "review", label: "Review", icon: "review" },
  { id: "notes", label: "Notes", icon: "notes" },
];

export function TabBar({ route, navigate, counts }: { route: Route; navigate: (r: Route) => void; counts: Partial<Record<Tab, number>> }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="brand">
        <Logo size={26} /> freenotes
      </div>
      {TABS.map((t) => (
        <button key={t.id} className={route.tab === t.id ? "on" : ""} onClick={() => navigate({ tab: t.id })} aria-current={route.tab === t.id ? "page" : undefined}>
          <span className="ic">
            <Icon name={t.icon} size={22} />
          </span>
          {t.label}
          {counts[t.id] ? <span className="sr-only">{counts[t.id]}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function TopBar({ title, subtitle, onBack, right, variant = "default" }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode; variant?: "default" | "brief" }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`topbar ${variant} ${scrolled ? "scrolled" : ""}`}>
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      ) : (
        <span style={{ width: 8 }} />
      )}
      <h1>
        {title}
        {subtitle && <span className="sub">{subtitle}</span>}
      </h1>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        {title && (
          <div className="row between" style={{ marginBottom: 12 }}>
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph">
        <Icon name={icon} size={26} />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}
