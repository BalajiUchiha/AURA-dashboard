import { createFileRoute } from "@tanstack/react-router";
import { StationNavPage } from "@/components/aura/StationNavPage";

export const Route = createFileRoute("/charging/station")({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search["name"] === "string" ? search["name"] : "Charging station",
    lat: Number(search["lat"] ?? 0),
    lon: Number(search["lon"] ?? 0),
    dist: search["dist"] != null ? Number(search["dist"]) : undefined,
    eta: search["eta"] != null ? Number(search["eta"]) : undefined,
    address: typeof search["address"] === "string" ? search["address"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Navigate — AURA EV Command Deck" },
      { name: "description", content: "Full-screen navigation to the selected charging station." },
      { property: "og:title", content: "Navigate — AURA EV Command Deck" },
      {
        property: "og:description",
        content: "Full-screen navigation to the selected charging station.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationNavPage,
});
