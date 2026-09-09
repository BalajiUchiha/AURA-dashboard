import { createFileRoute } from "@tanstack/react-router";
import { AlertsPage } from "@/components/aura/AlertsPage";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "JARVIS Log — AURA EV Command Deck" },
      {
        name: "description",
        content:
          "AURA co-pilot log: every JARVIS message and alert from the session, with severity filters.",
      },
      { property: "og:title", content: "JARVIS Log — AURA EV Command Deck" },
      {
        property: "og:description",
        content: "Alert history and JARVIS co-pilot messages from AURA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});
