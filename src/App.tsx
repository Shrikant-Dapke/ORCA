import { useEffect, useState } from 'react';
import { AppProvider } from './app-context';
import Landing from './pages/Landing';
import Shell from './pages/Shell';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import AiPage from './pages/AiPage';
import FishingPage from './pages/FishingPage';
import WeatherPage from './pages/WeatherPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';

export type AppPage = 'home' | 'map' | 'ai' | 'fishing' | 'weather' | 'alerts' | 'settings';
export type Route = { name: 'landing' } | { name: 'app'; page: AppPage; query?: string };

/** Minimal hash router (no dependency): #/ → landing, #/app/<page>. */
export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, qs] = clean.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'app') return { name: 'landing' };
  const pages: AppPage[] = ['home', 'map', 'ai', 'fishing', 'weather', 'alerts', 'settings'];
  const page = (parts[1] ?? 'home') as AppPage;
  const params = new URLSearchParams(qs ?? '');
  return { name: 'app', page: pages.includes(page) ? page : 'home', query: params.get('q') ?? undefined };
}

export function appHref(page: AppPage, query?: string): string {
  return `#/app/${page}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  return (
    <AppProvider>
      <div className="orca-bg flex h-full justify-center">
        <div className="relative flex h-full w-full max-w-[1100px] flex-col overflow-hidden">
          {route.name === 'landing' ? (
            <Landing />
          ) : (
            <Shell page={route.page}>
              {route.page === 'home' && <HomePage />}
              {route.page === 'map' && <MapPage />}
              {route.page === 'ai' && <AiPage initialQuery={route.query} />}
              {route.page === 'fishing' && <FishingPage />}
              {route.page === 'weather' && <WeatherPage />}
              {route.page === 'alerts' && <AlertsPage />}
              {route.page === 'settings' && <SettingsPage />}
            </Shell>
          )}
        </div>
      </div>
    </AppProvider>
  );
}
