"use client";

const NAV_ITEMS = [
  { id: "home", label: "Home", active: true },
  { id: "search", label: "Search", active: false },
  { id: "camera", label: "Record", active: false, primary: true },
  { id: "messages", label: "Messages", active: false },
  { id: "profile", label: "Profile", active: false },
] as const;

function NavIcon({ id }: { id: string }) {
  const className = "h-6 w-6";
  switch (id) {
    case "home":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l9 8h-3v9H6v-9H3l9-8z" />
        </svg>
      );
    case "search":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" />
        </svg>
      );
    case "camera":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "messages":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16v11H7l-3 3V5z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="9" r="4" />
          <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" />
        </svg>
      );
  }
}

export function BottomNav() {
  return (
    <nav
      className="relative z-20 flex items-center justify-around border-t border-border bg-surface/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg sm:px-2 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pt-2"
      aria-label="Main"
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] transition ${
            "primary" in item && item.primary
              ? "-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30"
              : item.active
                ? "text-foreground"
                : "text-muted hover:text-foreground/80"
          }`}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
        >
          <NavIcon id={item.id} />
          {!("primary" in item && item.primary) && <span>{item.label}</span>}
        </button>
      ))}
    </nav>
  );
}
