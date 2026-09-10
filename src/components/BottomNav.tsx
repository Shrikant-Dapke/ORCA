import type { Strings } from '../i18n/strings';

export type Tab = 'chat' | 'sea' | 'alerts' | 'help';

interface Props {
  strings: Strings;
  tab: Tab;
  onTab: (t: Tab) => void;
  alertCount: number;
}

/**
 * Stitch bottom navigation: four Material-symbol tabs, active tab in bold
 * primary-container. Labels stay ours (Chat/Sea/Alerts/Help) because each
 * maps to real implemented functionality — no PFZ/navigation tabs whose
 * features do not exist.
 */
export default function BottomNav({ strings, tab, onTab, alertCount }: Props) {
  const items: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'chat', label: strings.navChat, icon: 'smart_toy' },
    { id: 'sea', label: strings.navSea, icon: 'waves' },
    { id: 'alerts', label: strings.navAlerts, icon: 'crisis_alert', badge: alertCount },
    { id: 'help', label: strings.navHelp, icon: 'help' },
  ];

  return (
    <nav
      aria-label="Main"
      className="relative z-10 bg-surface/85 backdrop-blur-xl"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-4 grid grid-cols-4 gap-1 rounded-t-3xl px-2 pt-1 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onTab(it.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition active:scale-95 ${
                active ? 'font-bold text-primary-container' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[26px]">{it.icon}</span>
              {it.label}
              {typeof it.badge === 'number' && it.badge > 0 && (
                <span className="absolute right-4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-extrabold text-on-primary">
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
