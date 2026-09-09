import { AuraNav } from "./AuraNav";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="relative min-h-screen">
      <div className="hud-grid pointer-events-none fixed inset-0 opacity-60" />
      <main className="relative mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-glow text-hud text-2xl font-semibold tracking-[0.4em] uppercase">
            {title}
          </h1>
          <AuraNav />
        </header>
        <div className="panel-brutal mt-10 flex h-64 flex-col items-center justify-center gap-4">
          <div className="bg-hud h-1 w-40 overflow-hidden">
            <div className="bg-hud-ok h-1 w-1/3" style={{ animation: "hud-sweep 1.4s linear infinite" }} />
          </div>
          <p className="text-xs tracking-[0.35em] text-muted-foreground uppercase">
            Module offline — coming online soon
          </p>
        </div>
      </main>
    </div>
  );
}
