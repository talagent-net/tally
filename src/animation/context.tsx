import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { AnimationEngine } from "./engine";
import type { AnimationFn, RendererFn } from "./engine";

const EngineContext = createContext<AnimationEngine | null>(null);

export function AnimationProvider({ children }: { children: ReactNode }) {
  const engine = useMemo(() => new AnimationEngine(), []);
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): AnimationEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useEngine must be used inside AnimationProvider");
  return engine;
}

// Declare a capability and its rest value.
export function useCapability(key: string, rest: number): void {
  const engine = useEngine();
  useEffect(() => {
    engine.registerCapability(key, rest);
  }, [engine, key, rest]);
}

// Register a per-frame renderer. The callback should be stable (memoized).
export function useAnimationRenderer(render: RendererFn): void {
  const engine = useEngine();
  useEffect(() => engine.registerRenderer(render), [engine, render]);
}

// Mount/unmount an animation that drives a capability. releaseMs optionally overrides the
// engine's conflict-release/unwind duration for this animation's install (e.g. 0 for an instant
// handoff); omitted = engine default.
export function useCapabilityAnimation(key: string, anim: AnimationFn | null, releaseMs?: number): void {
  const engine = useEngine();
  useEffect(() => {
    engine.setAnimation(key, anim, releaseMs);
    return () => engine.setAnimation(key, null);
  }, [engine, key, anim, releaseMs]);
}

// Declare a set of capability keys as mutually exclusive. The engine will smoothly unwind any
// off-rest partner when one of them gets a new animation, and defer the new animation's start
// until the unwind is complete. Pass a stable array (module-level constant or memoized) — the
// engine deduplicates registrations anyway, but a stable ref avoids unnecessary effect re-runs.
export function useConflict(keys: string[]): void {
  const engine = useEngine();
  useEffect(() => {
    engine.registerConflict(keys);
  }, [engine, keys]);
}
