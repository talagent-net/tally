// Capability values are normalized scalars (0..1 or -1..+1) keyed by string,
// e.g. "eyes.blink", "head.tilt". The engine owns a single rAF loop and:
//   1. ticks every registered animation, writing new values into the capabilities map
//   2. calls every registered renderer with the updated capabilities map
// Renderers write transforms/styles directly to DOM nodes — React is not involved.

export type AnimationFn = (elapsedMs: number, deltaMs: number) => number;
export type RendererFn = (caps: ReadonlyMap<string, number>) => void;

// Release-to-rest tween duration when a capability is unwound — its animation is set to null (or
// unmounted) while the value is currently off-rest, so it eases back to rest. Smoothstep curve.
const RELEASE_MS = 160;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export class AnimationEngine {
  private capabilities = new Map<string, number>();
  private restValues = new Map<string, number>();
  private animations = new Map<string, AnimationFn>();
  private renderers = new Set<RendererFn>();
  private rafId: number | null = null;
  private startTime = 0;
  private lastTime = 0;
  private currentElapsed = 0;

  registerCapability(key: string, rest: number): void {
    if (!this.capabilities.has(key)) {
      this.capabilities.set(key, rest);
      this.restValues.set(key, rest);
    }
  }

  getCapability(key: string): number {
    return this.capabilities.get(key) ?? this.restValues.get(key) ?? 0;
  }

  setAnimation(key: string, anim: AnimationFn | null): void {
    if (anim === null) {
      // Removing an animation: unwind gracefully to rest if the capability is currently off-rest,
      // otherwise just clear the slot.
      const current = this.capabilities.get(key);
      const rest = this.restValues.get(key);
      if (current !== undefined && rest !== undefined && current !== rest) {
        this.installReleaseTween(key, current, rest);
      } else {
        this.animations.delete(key);
      }
      return;
    }
    this.animations.set(key, anim);
  }

  // Install a smoothstep tween that interpolates startVal → restVal over RELEASE_MS. After the
  // tween settles, it just returns restVal forever — the next setAnimation for this key
  // overwrites it. This is the graceful return-to-rest when an animation is removed.
  private installReleaseTween(key: string, startVal: number, restVal: number): void {
    const startElapsed = this.currentElapsed;
    const endElapsed = startElapsed + RELEASE_MS;
    this.animations.set(key, (elapsed) => {
      if (elapsed >= endElapsed) return restVal;
      const t = (elapsed - startElapsed) / RELEASE_MS;
      return startVal + (restVal - startVal) * smoothstep(t);
    });
  }

  registerRenderer(fn: RendererFn): () => void {
    this.renderers.add(fn);
    return () => {
      this.renderers.delete(fn);
    };
  }

  start(): void {
    if (this.rafId !== null) return;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    const loop = (now: number) => {
      const elapsed = now - this.startTime;
      const dt = now - this.lastTime;
      this.lastTime = now;
      this.currentElapsed = elapsed;

      for (const [key, anim] of this.animations) {
        this.capabilities.set(key, anim(elapsed, dt));
      }

      for (const render of this.renderers) {
        render(this.capabilities);
      }

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
