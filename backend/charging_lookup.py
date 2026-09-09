"""
charging_lookup.py — OpenChargeMap API integration.

Finds the nearest EV charging station to a fixed lat/lng.
Only called when alert_flag == "low_battery" or adjusted_range is below
threshold, to avoid unnecessary API hits.

Export:
    find_nearest_station(lat, lon) → dict | None
"""

import requests
import config as cfg

BASE_URL = "https://api.openchargemap.io/v3/poi/"


def find_nearest_station(
    lat: float = cfg.FIXED_LAT,
    lon: float = cfg.FIXED_LON,
) -> dict | None:
    """
    Query OpenChargeMap for the single nearest charging station.

    Returns:
        { "station_name": str, "station_distance_km": float,
          "station_address": str }
        or None on failure / no results.
    """
    params = {
        "key":          cfg.OPENCHARGEMAP_API_KEY,
        "latitude":     str(lat),
        "longitude":    str(lon),
        "maxresults":   "1",
        "distanceunit": "KM",
        "compact":      "true",
        "verbose":      "false",
    }

    try:
        response = requests.get(
            BASE_URL,
            params=params,
            headers={"Accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if not isinstance(data, list) or len(data) == 0:
            print("  ⚡ OpenChargeMap returned no results for the given location.")
            return None

        poi = data[0]
        address = poi.get("AddressInfo", {})

        station_name = (
            address.get("Title")
            or (poi.get("OperatorInfo") or {}).get("Title")
            or "Unknown Station"
        )

        station_distance_km = round(float(address.get("Distance", 0)), 2)
        eta_seconds = int(round((station_distance_km / 30.0) * 3600)) if station_distance_km > 0 else 0

        st_lat = round(float(address.get("Latitude") if address.get("Latitude") is not None else lat), 4)
        st_lon = round(float(address.get("Longitude") if address.get("Longitude") is not None else lon), 4)

        poi_id = poi.get("ID")
        if poi_id:
            station_id = f"station-{poi_id}"
        else:
            slug = "".join(c.lower() if c.isalnum() else "-" for c in station_name).strip("-")
            station_id = f"station-{slug}"

        station_address = ", ".join(
            filter(None, [
                address.get("AddressLine1"),
                address.get("Town"),
                address.get("StateOrProvince"),
                address.get("Postcode"),
            ])
        ) or "Address unavailable"

        return {
            "station_id": station_id,
            "station_name": station_name,
            "station_distance_km": station_distance_km,
            "station_address": station_address,
            "station_lat": st_lat,
            "station_lon": st_lon,
            "eta_seconds": eta_seconds,
        }

    except requests.Timeout:
        print("  ⚡ OpenChargeMap request timed out (10s).")
        return None
    except requests.RequestException as e:
        print(f"  ⚡ OpenChargeMap lookup failed: {e}")
        return None
    except Exception as e:
        print(f"  ⚡ OpenChargeMap unexpected error: {e}")
        return None
