import { createFileRoute } from "@tanstack/react-router";
import { SystemPage } from "@/components/aura/SystemPage";

export const Route = createFileRoute("/system")({
  head: () => ({
    meta: [
      { title: "System Diagnostics — AURA EV Command Deck" },
      { name: "description", content: "AURA backend health, signal conditioning, and pipeline status." },
      { property: "og:title", content: "System Diagnostics — AURA EV Command Deck" },
      { property: "og:description", content: "AURA backend health, signal conditioning, and pipeline status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SystemPage,
});
