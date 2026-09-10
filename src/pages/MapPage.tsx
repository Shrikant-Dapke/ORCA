import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../app-context';
import { useChatQuery } from '../api/hooks';
import { QUERIES } from '../api/services';
import { Card, PageHeader, StateView } from '../components/ui';
import type { FishingZone, RouteInfo } from '../../shared/orca-contract';

const OFFLINE_TILE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce9f2"/><path d="M0 200 Q64 188 128 200 T256 200 V256 H0 Z" fill="#c2d8e6"/><path d="M0 216 Q64 206 128 216 T256 216 V256 H0 Z" fill="#b0cddd"/></svg>`,
  );

function emojiIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${emoji}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/**
 * Full-page live map. Zones + route come from one backend question;
 * user fix from GPS. Vessel/satellite/weather-overlay layers are shown
 * disabled with honest unavailable notes — never faked.
 */
export default function MapPage() {
  const { strings, area, coords, locale } = useApp();
  const query = useMemo(
    () => ({ message: QUERIES.zonesToday, area, coords, locale }),
    [area, coords, locale],
  );
  const res = useChatQuery(query, { offline: strings.locationDenied });
  const zones: FishingZone[] = res.data?.zones ?? [];
  const route: RouteInfo | null = res.data?.route ?? null;

  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [tilesDown, setTilesDown] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showRoute, setShowRoute] = useState(true);

  useEffect(() => {
    if (!divRef.current || mapRef.current || res.loading || !res.data) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView([12, 77], 5);
    mapRef.current = map;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
      errorTileUrl: OFFLINE_TILE,
    });
    layer.on('tileerror', () => setTilesDown(true));
    layer.addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [res.loading, res.data]);

  // Overlays refresh when data/layers change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const drawn: L.Layer[] = [];
    const bounds: Array<[number, number]> = [];
    if (coords) {
      const m = L.marker([coords.latitude, coords.longitude], { icon: emojiIcon('🧍'), title: 'You' });
      m.addTo(map);
      drawn.push(m);
      bounds.push([coords.latitude, coords.longitude]);
    }
    if (showZones) {
      for (const z of zones) {
        const m = L.marker([z.latitude, z.longitude], { icon: emojiIcon('🎣'), title: z.name });
        m.addTo(map);
        drawn.push(m);
        bounds.push([z.latitude, z.longitude]);
      }
    }
    if (showRoute && route && route.waypoints.length >= 2) {
      const line = L.polyline(
        route.waypoints.map((w) => [w.latitude, w.longitude] as [number, number]),
        { color: '#00507d', weight: 4 },
      );
      line.addTo(map);
      drawn.push(line);
    }
    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds).pad(0.35));
    return () => {
      for (const l of drawn) map.removeLayer(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef.current, zones, route, coords, showZones, showRoute]);

  const resetView = () => {
    const map = mapRef.current;
    if (map) map.setView([12, 77], 5);
  };
  const fullscreen = () => {
    divRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={strings.navMap} sub={res.data ? `Source: ${res.data.meta?.live ? 'live' : 'demo'}` : undefined} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <LayerToggle on={showZones} onFlip={() => setShowZones((v) => !v)} label={`🎣 ${strings.zoneTitle}`} />
        <LayerToggle
          on={showRoute}
          onFlip={() => setShowRoute((v) => !v)}
          label={`🛣 ${strings.routeTitle}`}
          disabled={!route}
          note={!route ? strings.routeUnavailable : undefined}
        />
        <LayerToggle on={false} onFlip={() => {}} label="🚢 Vessels" disabled note={strings.vesselsUnavailable} />
        <LayerToggle on={false} onFlip={() => {}} label="🛰 Satellite" disabled note={strings.satelliteUnavailable} />
        <div className="ml-auto flex gap-1.5">
          <MapBtn icon="my_location" label={strings.locateMe} onClick={resetView} />
          <MapBtn icon="fullscreen" label={strings.fullscreen} onClick={fullscreen} />
        </div>
      </div>
      <div className="relative mx-4 mb-2 min-h-[320px] flex-1 overflow-hidden rounded-2xl shadow-md">
        <StateView strings={strings} loading={res.loading} error={res.error} offline={res.offline} onRetry={res.reload}>
          <div ref={divRef} className="absolute inset-0" />
        </StateView>
        {tilesDown && (
          <p role="status" className="absolute inset-x-0 top-0 bg-caution-bg px-3 py-1.5 text-center text-[11px] font-semibold text-caution-text">
            {strings.mapTilesDown}
          </p>
        )}
      </div>
      <p className="px-4 pb-3 text-center text-[11px] text-on-surface-variant">
        {res.data?.meta?.locationMode !== 'gps' ? `${strings.demoMapNote} · ` : ''}© OpenStreetMap
      </p>
    </div>
  );
}

function LayerToggle(props: { on: boolean; onFlip: () => void; label: string; disabled?: boolean; note?: string }) {
  return (
    <button
      onClick={props.onFlip}
      disabled={props.disabled}
      title={props.note}
      aria-pressed={props.on}
      className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition active:scale-95 disabled:opacity-50 ${
        props.on ? 'bg-primary-container/20 text-primary ring-1 ring-primary/40' : 'bg-surface-low text-on-surface-variant'
      }`}
    >
      {props.label}
    </button>
  );
}

function MapBtn(props: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      className="grid h-9 w-9 place-items-center rounded-full bg-surface-lowest text-primary shadow-sm active:scale-90"
    >
      <span className="material-symbols-outlined text-[20px]">{props.icon}</span>
    </button>
  );
}
