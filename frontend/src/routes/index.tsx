import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/aura/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AURA — EV Command Deck" },
      {
        name: "description",
        content:
          "Live EV telemetry HUD: speed, voltage, range, alerts and an AI co-pilot that speaks.",
      },
      { property: "og:title", content: "AURA — EV Command Deck" },
      {
        property: "og:description",
        content:
          "Live EV telemetry HUD: speed, voltage, range, alerts and an AI co-pilot that speaks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
