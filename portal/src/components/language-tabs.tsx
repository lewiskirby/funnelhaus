"use client";

import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "fh-language";

/**
 * Flag buttons that switch a task between its original and translated versions. Remembers the choice.
 * `shared` (e.g. a video above the language row in Notion) shows in every language.
 */
export function LanguageTabs({ tabs, shared }: { tabs: { flag: string; label: string; content: ReactNode }[]; shared?: ReactNode }) {
  const [active, setActive] = useState(tabs[0].flag);

  // Restore the viewer's last choice after the page has loaded.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- only runs once, after hydration
      if (saved && tabs.some((t) => t.flag === saved)) setActive(saved);
    } catch {}
  }, [tabs]);

  function choose(flag: string) {
    setActive(flag);
    try {
      localStorage.setItem(STORAGE_KEY, flag);
    } catch {}
  }

  return (
    <>
      <div role="tablist" aria-label="Language" className="inline-flex rounded-full bg-canvas p-1 ring-1 ring-line">
        {tabs.map((t) => (
          <button
            key={t.flag}
            type="button"
            role="tab"
            aria-selected={active === t.flag}
            onClick={() => choose(t.flag)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-semibold transition ${
              active === t.flag ? "bg-white text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
            }`}
          >
            <span className="text-[17px] leading-none">{t.flag}</span>
            {t.label}
          </button>
        ))}
      </div>
      {shared}
      {tabs.map((t) => (
        <div key={t.flag} role="tabpanel" hidden={active !== t.flag} className="space-y-4">
          {t.content}
        </div>
      ))}
    </>
  );
}
