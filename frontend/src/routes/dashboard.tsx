import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/aura/Dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AURA EV Command Deck" },
      {
        name: "description",
        content: "Real-time EV dashboard with live telemetry, alerts and a speaking AI co-pilot.",
      },
      { property: "og:title", content: "Dashboard — AURA EV Command Deck" },
      {
        property: "og:description",
        content: "Real-time EV dashboard with live telemetry, alerts and a speaking AI co-pilot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
