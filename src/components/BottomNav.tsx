import { MessageCircle, Waves, Bell, LifeBuoy } from 'lucide-react';
import type { Strings } from '../i18n/strings';

export type Tab = 'chat' | 'sea' | 'alerts' | 'help';

interface Props {
  strings: Strings;
  tab: Tab;
  onTab: (t: Tab) => void;
  alertCount: number;
}

export default function BottomNav({ strings, tab, onTab, alertCount }: Props) {
  const items: { id: Tab; label: string; icon: typeof MessageCircle; badge?: number }[] = [
    { id: 'chat', label: strings.navChat, icon: MessageCircle },
    { id: 'sea', label: strings.navSea, icon: Waves },
    { id: 'alerts', label: strings.navAlerts, icon: Bell, badge: alertCount },
    { id: 'help', label: strings.navHelp, icon: LifeBuoy },
  ];

  return (
    <nav
      aria-label="Main"
      className="relative z-10 mx-4 mb-3 mt-1 grid grid-cols-4 gap-1 rounded-3xl bg-white/[0.07] p-2 ring-1 ring-white/12 backdrop-blur"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onTab(it.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition active:scale-95 ${
              active ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <it.icon className="h-5 w-5" />
            {it.label}
            {typeof it.badge === 'number' && it.badge > 0 && (
              <span className="absolute right-4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white">
                {it.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
