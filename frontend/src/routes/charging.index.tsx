import { createFileRoute } from "@tanstack/react-router";
import { ChargingPage } from "@/components/aura/ChargingPage";

export const Route = createFileRoute("/charging/")({
  head: () => ({
    meta: [
      { title: "Charging — AURA EV Command Deck" },
      { name: "description", content: "AURA charging station guidance and status." },
      { property: "og:title", content: "Charging — AURA EV Command Deck" },
      { property: "og:description", content: "AURA charging station guidance and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChargingPage,
});
