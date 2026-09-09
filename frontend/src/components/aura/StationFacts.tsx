interface Fact {
  label: string;
  value: string;
  tone?: "hud" | "warn" | "ok" | "muted";
}

const TONE: Record<string, string> = {
  hud: "text-hud",
  warn: "text-hud-warn",
  ok: "text-hud-ok",
  muted: "text-foreground",
};

export interface StationFactsInput {
  network?: string | null | undefined;
  powerKw?: number | null | undefined;
  connectors?: string[] | null | undefined;
  available?: number | null | undefined;
  total?: number | null | undefined;
  pricePerKwh?: number | null | undefined;
  arrivalSoc?: number | null | undefined;
  chargeMinutes?: number | null | undefined;
  isOpen?: boolean | null | undefined;
}

export function buildStationFacts(i: StationFactsInput): Fact[] {
  const facts: Fact[] = [];
  if (i.available != null)
    facts.push({
      label: "Stalls free",
      value: i.total != null ? `${i.available} / ${i.total}` : String(i.available),
      tone: i.available > 0 ? "ok" : "warn",
    });
  if (i.powerKw != null) facts.push({ label: "Max power", value: `${i.powerKw} kW`, tone: "hud" });
  if (i.connectors?.length)
    facts.push({ label: "Connector", value: i.connectors.join(" · "), tone: "muted" });
  if (i.arrivalSoc != null)
    facts.push({
      label: "Battery on arrival",
      value: `${i.arrivalSoc}%`,
      tone: i.arrivalSoc < 10 ? "warn" : "hud",
    });
  if (i.chargeMinutes != null)
    facts.push({ label: "Charge to 80%", value: `${i.chargeMinutes} min`, tone: "muted" });
  if (i.pricePerKwh != null)
    facts.push({ label: "Price", value: `₹${i.pricePerKwh}/kWh`, tone: "muted" });
  if (i.network) facts.push({ label: "Network", value: i.network, tone: "muted" });
  if (i.isOpen != null)
    facts.push({
      label: "Status",
      value: i.isOpen ? "Open now" : "Closed",
      tone: i.isOpen ? "ok" : "warn",
    });
  return facts;
}

/** Compact fact grid used by the charging hero card and the navigation view. */
export function StationFacts({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className="border-border border bg-background px-3 py-3">
          <dt className="text-[9px] tracking-[0.22em] text-muted-foreground uppercase">
            {f.label}
          </dt>
          <dd className={`mt-1 text-base font-semibold tabular-nums ${TONE[f.tone ?? "muted"]}`}>
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
