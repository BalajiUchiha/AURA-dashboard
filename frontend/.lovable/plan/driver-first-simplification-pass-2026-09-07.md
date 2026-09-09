# Driver-first simplification pass

Goal: cut cognitive load while driving, fix the flickering map, upgrade the loading state, and make a charger tappable into a full navigation view.

## 1. Loading state (all pages)
Replace the plain bar + text with one shared `AuraLoader`: skeleton versions of the real cards (same boxes, same positions) plus a single sweeping scan line and one status word. No spinner text walls. Pages keep their layout so nothing jumps when data arrives.

## 2. Map flicker
Cause: the map iframe URL is rebuilt from `station_lat/lon` on every 6s poll, and the mock jitters the values, so the iframe reloads constantly. Fixes:
- Lock the map to the station identity (`station_name` / station id), not to changing coordinates — coordinates are only read once when the station changes.
- Round coordinates to 4 decimals before building the URL so tiny drift never re-renders.
- Memoize the iframe so an unchanged station never remounts.

## 3. Charger tap → navigation view
New route `/charging/station` (opened by tapping a station card or the hero card):
- Big map filling most of the screen.
- Large single instruction line (distance + station name + ETA), one primary action ("Start", "Open in Maps"), one back control.
- Nothing else on the screen.
The existing charging page keeps only: adjusted range, one suggested station, and a short list of recents.

## 4. Driver-mode simplification per page
Each page gets one primary number, at most two supporting values, and everything else moves behind a "Details" toggle (off by default).

- Dashboard: keep speed, range, battery, and the alert/JARVIS line. Voltage, current, motor temp move under Details.
- Range: keep adjusted range + one delta line + confidence. Charts and factor breakdown move under Details.
- Alerts: show only the latest critical/warning as a large card; full history collapsed under "History". Cards stay tappable to expand.
- Charging: as described in section 3.
- System: this is an engineer page, not a driving page — mark it as such and keep it dense, but hide it from the main nav (reachable by direct link or from Details).

Nav shrinks to Drive (dashboard), Range, Alerts, Charging.

## What backend needs to know
No breaking changes required. Nothing is removed from the API — the frontend simply stops showing some fields by default.

Nice-to-have additions that would let us drop client-side guessing:
- `severity` present on every alert (not optional).
- `charging-status`: stable `station_id`, and `eta_seconds` always sent when a suggestion is active (we currently estimate it from distance at 30 km/h).
- `charging-status`: stop jittering `station_lat/station_lon` between polls for the same station — send fixed coordinates per station.
- Optional `priority` or `driver_visible` flag on alerts so the frontend knows what deserves the big card.
- `/diagnostics` stays as-is; it now backs an engineer-only page.

## Technical notes
- New `src/components/aura/AuraLoader.tsx` and `DetailsDisclosure.tsx`, reused by every page.
- New route `src/routes/charging.station.tsx` reusing `StationMap`, extracted from `ChargingPage.tsx` into its own component file.
- No changes to API modules or polling hooks except a stable-station memo in `useChargingStatus`.
