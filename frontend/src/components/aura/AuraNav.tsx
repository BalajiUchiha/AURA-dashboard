import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/dashboard", label: "Drive" },
  { to: "/range", label: "Range" },
  { to: "/alerts", label: "Alerts" },
  { to: "/charging", label: "Charging" },
] as const;

export function AuraNav() {
  return (
    <nav className="flex flex-wrap gap-1.5">
      {ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="border border-border px-3 py-1.5 text-[10px] tracking-[0.25em] text-muted-foreground uppercase transition-colors hover:border-hud hover:text-hud"
          activeProps={{
            className:
              "border-foreground bg-foreground text-background hover:border-foreground hover:text-background",
          }}
          activeOptions={{ exact: item.to !== "/charging" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
