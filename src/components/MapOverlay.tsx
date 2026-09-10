import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FishingZone, RouteInfo } from '../../shared/orca-contract';
import type { Strings } from '../i18n/strings';

export interface MapUser {
  latitude: number;
  longitude: number;
}

interface Props {
  strings: Strings;
  user: MapUser | null;
  zones: FishingZone[];
  route?: RouteInfo | null;
  demoWaters: boolean;
  onClose: () => void;
}

function emojiIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${emoji}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/**
 * Minimal honest map: user fix, candidate zones, calculated route.
 * OSM tiles need internet (graceful gray + note offline); positions and
 * overlays are ours either way. Demo waters are labeled, never navigation.
 */
export default function MapOverlay({ strings, user, zones, route, demoWaters, onClose }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView([12, 77], 5);
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const bounds: Array<[number, number]> = [];
    if (user) {
      L.marker([user.latitude, user.longitude], { icon: emojiIcon('🧍'), title: 'You' }).addTo(map);
      bounds.push([user.latitude, user.longitude]);
    }
    for (const z of zones) {
      L.marker([z.latitude, z.longitude], { icon: emojiIcon('🎣'), title: z.name }).addTo(map);
      bounds.push([z.latitude, z.longitude]);
    }
    if (route && route.waypoints.length >= 2) {
      const line = route.waypoints.map((w) => [w.latitude, w.longitude] as [number, number]);
      L.polyline(line, { color: '#00507d', weight: 4 }).addTo(map);
    }
    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds).pad(0.35));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [user, zones, route]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-label={strings.viewMap}>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className="font-headline text-[16px] font-bold text-on-surface">{strings.viewMap}</p>
        <button
          onClick={onClose}
          aria-label={strings.closeMap}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface-low text-primary active:scale-95"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>
      <div ref={divRef} className="min-h-0 flex-1" />
      <p className="px-4 py-2 text-center text-[11px] text-on-surface-variant">
        {demoWaters ? `${strings.demoMapNote} · ` : ''}
        {!user ? `${strings.locationDenied} · ` : ''}
        © OpenStreetMap
      </p>
    </div>
  );
}
