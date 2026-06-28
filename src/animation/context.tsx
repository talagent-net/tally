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

// Register a per-frame renderer. The callback should be stable (memoized). Anatomy/rig changes are
// handled by remounting the whole engine subtree (see Avagent), so renderers are always freshly bound.
export function useAnimationRenderer(render: RendererFn): void {
  const engine = useEngine();
  useEffect(() => engine.registerRenderer(render), [engine, render]);
}

// Mount/unmount an animation that drives a capability. When the animation is removed (null or
// unmount), the engine eases the capability back to rest.
export function useCapabilityAnimation(key: string, anim: AnimationFn | null): void {
  const engine = useEngine();
  useEffect(() => {
    engine.setAnimation(key, anim);
    return () => engine.setAnimation(key, null);
  }, [engine, key, anim]);
}
