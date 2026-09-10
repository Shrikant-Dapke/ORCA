import type { ReactNode } from 'react';
import type { Strings } from '../i18n/strings';

/** Small shared primitives — presentation only, no data logic. */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface-lowest p-4 shadow-md ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-4 pb-1 pt-4">
      <h1 className="font-headline text-[20px] font-bold text-on-surface">{title}</h1>
      {sub && <p className="text-[12px] text-on-surface-variant">{sub}</p>}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded-lg bg-surface-high" style={{ width: `${95 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function StateView(props: {
  strings: Strings;
  loading?: boolean;
  error?: string | null;
  offline?: boolean;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { strings, loading, error, offline, empty, emptyText, onRetry, children } = props;
  if (loading) {
    return (
      <Card>
        <Skeleton />
        <p className="mt-2 text-center text-xs text-on-surface-variant">{strings.loading}</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <p className="text-center text-[15px] font-bold text-on-error-container">{offline ? '📡' : '⚠️'}</p>
        <p className="mt-1 text-center text-[13px] text-on-surface">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mx-auto mt-2.5 flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 text-[13px] font-bold text-on-primary active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            {strings.retry}
          </button>
        )}
      </Card>
    );
  }
  if (empty) {
    return (
      <Card>
        <p className="text-center text-[14px] font-bold text-on-surface">{emptyText ?? strings.unavailable}</p>
      </Card>
    );
  }
  return <>{children}</>;
}

export function StatusBadge({ state }: { state: 'safe' | 'caution' | 'danger' | 'unknown' }) {
  const tone =
    state === 'danger'
      ? 'bg-error text-on-primary'
      : state === 'caution'
        ? 'bg-caution-bg text-caution-text ring-1 ring-caution-ring'
        : state === 'unknown'
          ? 'bg-surface-high text-on-surface-variant'
          : 'bg-tertiary text-on-tertiary';
  const dot = state === 'danger' ? '🔴' : state === 'caution' ? '🟡' : state === 'unknown' ? '⚪' : '🟢';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold uppercase ${tone}`}>
      {dot} {state}
    </span>
  );
}

/** Honest source line: live provider vs demo vs unavailable. */
export function SourceLine({ text }: { text: string }) {
  return <p className="mt-1 text-[11px] text-on-surface-variant">Source: {text}</p>;
}
