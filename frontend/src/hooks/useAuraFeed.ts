import { useEffect, useRef, useState, useCallback } from "react";
import { WS_URL, getLatest } from "@/lib/aura-api";
import { demoFrame, SIMULATED_SCENARIOS } from "@/lib/demo-feed";
import type { AuraTelemetry, LinkState } from "@/lib/aura-types";
import type { SimulatedEventScenario } from "@/components/aura/ScenarioModal";

function normalizeFrame(raw: any): AuraTelemetry | null {
  if (!raw) return null;
  if (raw.status === "warming_up") return raw;

  const veh = raw.vehicle || {};
  const pred = raw.prediction || {};
  const volt = raw.voltage ?? veh.voltage ?? raw.filtered?.voltage ?? 0;
  const bat = raw.capacity_remaining_percent ?? raw.battery_pct ?? (volt > 0 ? Math.min(100, Math.max(0, Math.round(volt * 10))) : 80);

  return {
    ...raw,
    speed: raw.speed ?? veh.speed ?? 0,
    voltage: volt,
    range_km: raw.range_km ?? veh.range_km ?? 0,
    adjusted_range_km: raw.adjusted_range_km ?? pred.adjusted_range_km ?? raw.range_km ?? veh.range_km ?? 0,
    baseline_range_km: raw.baseline_range_km ?? pred.baseline_range_km ?? raw.range_km ?? veh.range_km ?? 0,
    battery_pct: bat,
    capacity_remaining_percent: raw.capacity_remaining_percent ?? pred.capacity_remaining_percent ?? bat,
    estimated_runtime_seconds: raw.estimated_runtime_seconds ?? pred.estimated_runtime_seconds ?? null,
    degradation_percent: raw.degradation_percent ?? pred.degradation_percent,
    primary_factor: raw.primary_factor ?? pred.primary_factor,
    range_factors: raw.range_factors ?? pred.range_factors ?? {},
    alert: raw.alert ?? null,
    jarvis_message: raw.jarvis_message ?? null,
    charging_station: raw.charging_station ?? null,
  };
}

export type FeedMode = "live" | "simulated";

export function useAuraFeed() {
  const [frame, setFrame] = useState<AuraTelemetry | null>(null);
  const [link, setLink] = useState<LinkState>("booting");
  const [feedMode, setFeedMode] = useState<FeedMode>("live");

  // Simulation state
  const [simEventIndex, setSimEventIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const failuresRef = useRef(0);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toggle Mode helper
  const toggleFeedMode = useCallback((mode?: FeedMode) => {
    const target = mode ?? (feedMode === "live" ? "simulated" : "live");
    setFeedMode(target);

    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }

    if (target === "simulated") {
      setLink("simulated");
      setSimEventIndex(0);
      setIsModalOpen(true);
      // Pre-set frame to event 1 telemetry
      setFrame(normalizeFrame(SIMULATED_SCENARIOS[0].telemetry));
    } else {
      setIsModalOpen(false);
      setLink("booting");
    }
  }, [feedMode]);

  // Close modal -> activate event run on dashboard
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    const scenario = SIMULATED_SCENARIOS[simEventIndex];
    if (scenario) {
      setFrame(normalizeFrame(scenario.telemetry));
    }
  }, [simEventIndex]);

  // Handle Speech Completion -> 3s delay -> Advance to next event modal
  const handleSpeechFinished = useCallback(() => {
    if (feedMode !== "simulated" || isModalOpen) return;

    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
    }

    nextTimerRef.current = setTimeout(() => {
      setSimEventIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % SIMULATED_SCENARIOS.length;
        setIsModalOpen(true);
        setFrame(normalizeFrame(SIMULATED_SCENARIOS[nextIndex].telemetry));
        return nextIndex;
      });
    }, 3000);
  }, [feedMode, isModalOpen]);

  // Live WebSocket / Polling Effect
  useEffect(() => {
    if (feedMode !== "live") return;

    let disposed = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let sim: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let tick = 0;

    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const stopSim = () => {
      if (sim) clearInterval(sim);
      sim = null;
    };

    const startSim = () => {
      if (sim || disposed) return;
      setLink("simulated");
      setFrame(normalizeFrame(demoFrame(tick)));
      sim = setInterval(() => {
        tick += 1;
        setFrame(normalizeFrame(demoFrame(tick)));
      }, 2500);
    };

    const pollOnce = async () => {
      try {
        const data = await getLatest();
        if (disposed) return;
        failuresRef.current = 0;
        stopSim();
        setFrame(normalizeFrame(data));
        setLink((s) => (s === "live" ? s : "polling"));
      } catch {
        if (disposed) return;
        failuresRef.current += 1;
        setLink((s) => (s === "live" || s === "simulated" ? s : "reconnecting"));
        if (failuresRef.current >= 1) startSim();
      }
    };

    const startPolling = () => {
      if (poll) return;
      void pollOnce();
      poll = setInterval(() => void pollOnce(), 4000);
    };

    const connect = () => {
      if (disposed) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(WS_URL);
      } catch {
        startPolling();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        failuresRef.current = 0;
        stopPoll();
        stopSim();
        setLink("live");
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const parsed = JSON.parse(event.data as string);
          if (parsed && parsed.status === "warming_up" && !frame) {
            return;
          }
          setFrame(normalizeFrame(parsed));
          setLink("live");
        } catch {
          /* ignore */
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (disposed) return;
        setLink((s) => (s === "simulated" ? s : "reconnecting"));
        startPolling();
        retry = setTimeout(connect, 8000);
      };
    };

    connect();
    startPolling();

    return () => {
      disposed = true;
      stopPoll();
      stopSim();
      if (retry) clearTimeout(retry);
      const ws = socketRef.current;
      if (ws) {
        ws.onclose = null;
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        } else {
          ws.close();
        }
      }
    };
  }, [feedMode]);

  const currentScenario: SimulatedEventScenario = SIMULATED_SCENARIOS[simEventIndex] || SIMULATED_SCENARIOS[0];
  const warming = !frame || frame.status === "warming_up";

  return {
    frame,
    link,
    warming,
    feedMode,
    toggleFeedMode,
    isModalOpen,
    closeModal,
    currentScenario,
    totalScenarios: SIMULATED_SCENARIOS.length,
    handleSpeechFinished,
  };
}
