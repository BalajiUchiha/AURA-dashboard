import { createFileRoute } from "@tanstack/react-router";
import { RangePage } from "@/components/aura/RangePage";

export const Route = createFileRoute("/range")({
  head: () => ({
    meta: [
      { title: "Range & Prediction — AURA EV Command Deck" },
      {
        name: "description",
        content:
          "AURA range analysis: baseline vs adjusted range trends, battery degradation over time, and the factors driving it.",
      },
      { property: "og:title", content: "Range & Prediction — AURA EV Command Deck" },
      {
        property: "og:description",
        content: "Live range trend analysis and degradation prediction from AURA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RangePage,
});
