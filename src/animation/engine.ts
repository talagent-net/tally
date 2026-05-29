// Capability values are normalized scalars (0..1 or -1..+1) keyed by string,
// e.g. "eyes.blink", "head.tilt". The engine owns a single rAF loop and:
//   1. ticks every registered animation, writing new values into the capabilities map
//   2. calls every registered renderer with the updated capabilities map
// Renderers write transforms/styles directly to DOM nodes — React is not involved.

export type AnimationFn = (elapsedMs: number, deltaMs: number) => number;
export type RendererFn = (caps: ReadonlyMap<string, number>) => void;

// Release-to-rest tween duration when a capability is unwound — either because its own
// animation was set to null, or because a conflict-group partner just received a new animation
// and this one needs to clear out of the way. Smoothstep curve.
const RELEASE_MS = 250;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export class AnimationEngine {
  private capabilities = new Map<string, number>();
  private restValues = new Map<string, number>();
  private animations = new Map<string, AnimationFn>();
  private renderers = new Set<RendererFn>();
  private conflictGroups: Array<Set<string>> = [];
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

  // Declare a set of capability keys as mutually exclusive. When setAnimation is called for any
  // key in a group, every OTHER key in the group that's currently off-rest gets a release-to-rest
  // tween installed, AND the incoming animation is wrapped to wait until those releases have
  // completed before it starts producing values. The result: a smooth handoff between visually
  // incompatible capabilities (e.g. head.tilt and head.turn on the same head) without the brief
  // overlap of both rendering at once.
  // Idempotent — re-registering the same set is a no-op (matters for React effects that may
  // re-fire across renders without stable array identity).
  registerConflict(keys: string[]): void {
    const newSet = new Set(keys);
    for (const existing of this.conflictGroups) {
      if (existing.size !== newSet.size) continue;
      let same = true;
      for (const k of newSet) {
        if (!existing.has(k)) { same = false; break; }
      }
      if (same) return;
    }
    this.conflictGroups.push(newSet);
  }

  getCapability(key: string): number {
    return this.capabilities.get(key) ?? this.restValues.get(key) ?? 0;
  }

  // releaseMs overrides the conflict-release / unwind duration for THIS call only (defaults to
  // RELEASE_MS). An action that wants an instant handoff — e.g. walk, which must turn the body
  // toward travel immediately rather than waiting out the ambient head pose's unwind — passes 0:
  // off-rest conflict partners snap to rest at once and the incoming animation starts this frame
  // instead of being deferred.
  setAnimation(key: string, anim: AnimationFn | null, releaseMs: number = RELEASE_MS): void {
    if (anim === null) {
      // Removing an animation: unwind gracefully to rest if the capability is currently off-rest,
      // otherwise just clear the slot.
      const current = this.capabilities.get(key);
      const rest = this.restValues.get(key);
      if (current !== undefined && rest !== undefined && current !== rest) {
        this.installReleaseTween(key, current, rest, releaseMs);
      } else {
        this.animations.delete(key);
      }
      return;
    }

    // For each conflict partner that is currently off-rest, install a release tween. Capture the
    // longest release end — the new anim waits until then before producing values, so the rule
    // "never both at the same time" holds throughout the transition. With releaseMs = 0 the
    // partners snap instantly and nothing is deferred.
    let releaseUntil = this.currentElapsed;
    for (const group of this.conflictGroups) {
      if (!group.has(key)) continue;
      for (const otherKey of group) {
        if (otherKey === key) continue;
        const otherCurrent = this.capabilities.get(otherKey);
        const otherRest = this.restValues.get(otherKey);
        if (otherCurrent === undefined || otherRest === undefined || otherCurrent === otherRest) continue;
        const releaseEnd = this.installReleaseTween(otherKey, otherCurrent, otherRest, releaseMs);
        if (releaseEnd > releaseUntil) releaseUntil = releaseEnd;
      }
    }

    const rest = this.restValues.get(key) ?? 0;
    const wrapped: AnimationFn = releaseUntil > this.currentElapsed
      ? (elapsed, dt) => (elapsed < releaseUntil ? rest : anim(elapsed, dt))
      : anim;
    this.animations.set(key, wrapped);
  }

  // Install a smoothstep tween that interpolates startVal → restVal over releaseMs. After the
  // tween settles, it just returns restVal forever — the next setAnimation for this key
  // overwrites it. Returns the elapsed time at which the tween completes so setAnimation can
  // coordinate the deferred-start wrap. releaseMs <= 0 snaps straight to rest with no deferral.
  private installReleaseTween(key: string, startVal: number, restVal: number, releaseMs: number = RELEASE_MS): number {
    const startElapsed = this.currentElapsed;
    if (releaseMs <= 0) {
      this.animations.set(key, () => restVal);
      return startElapsed;
    }
    const endElapsed = startElapsed + releaseMs;
    this.animations.set(key, (elapsed) => {
      if (elapsed >= endElapsed) return restVal;
      const t = (elapsed - startElapsed) / releaseMs;
      return startVal + (restVal - startVal) * smoothstep(t);
    });
    return endElapsed;
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
