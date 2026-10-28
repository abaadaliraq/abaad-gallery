export type LiveScope =
  | "protocol"
  | "bookings"
  | "sales"
  | "staff"
  | "settings"
  | "overview";
export type LiveState<T> = {
  data: T | null;
  error: string;
  fetching: boolean;
  slow: boolean;
  checkedAt: number;
  limited: boolean;
  denied: boolean;
};
type Entry = {
  scope: LiveScope;
  dependencies: LiveScope[];
  dirty?: boolean;
  invalidation: number;
  state: LiveState<unknown>;
  listeners: Set<() => void>;
  pending?: Promise<void>;
  controller?: AbortController;
  generation: number;
};
export const signature = (value: unknown) =>
  JSON.stringify(value, (key, item) =>
    key === "observed_at" ? undefined : item,
  );
export class LiveStore {
  private accessDenied = false;
  private details = new Map<
    string,
    { version: string; at: number; value?: unknown; pending?: Promise<unknown> }
  >();
  async detail<T>(
    scope: LiveScope,
    id: string,
    version: string,
    read: () => Promise<T>,
  ): Promise<T> {
    if (this.destroyed || this.accessDenied)
      throw Error("انتهت صلاحية القراءة.");
    const key = scope + ":" + id,
      previous = this.details.get(key);
    if (previous?.version === version) {
      if (previous.pending) return previous.pending as Promise<T>;
      if (previous.value !== undefined && this.clock() - previous.at < 120000)
        return previous.value as T;
    }
    const entry: {
      version: string;
      at: number;
      value?: unknown;
      pending?: Promise<unknown>;
    } = { version, at: 0 };
    this.details.set(key, entry);
    const generation = this.generation;
    entry.pending = read()
      .then((value) => {
        if (generation !== this.generation || this.destroyed)
          throw Error("انتهت صلاحية القراءة.");
        if (this.details.get(key) === entry) {
          entry.value = value;
          entry.at = this.clock();
          entry.pending = undefined;
        }
        return value;
      })
      .catch((error) => {
        if (this.details.get(key) === entry) this.details.delete(key);
        throw error;
      });
    if (this.details.size > 32)
      for (const oldKey of this.details.keys()) {
        if (oldKey !== key) {
          this.details.delete(oldKey);
          break;
        }
      }
    return entry.pending as Promise<T>;
  }

  readonly safetyListeners = new Set<() => void>();
  readonly entries = new Map<string, Entry>();
  private tokens: Record<string, string> = {};
  private probe?: Promise<void>;
  private generation = 0;
  private fallbackAt = 0;
  private lastProbe = 0;
  private destroyed = false;
  constructor(
    readonly role: string,
    readonly onDenied: () => void,
    // Native browser fetch must keep its global receiver, not the LiveStore instance.
    readonly request: typeof fetch = (input, init) => globalThis.fetch(input, init),
    readonly clock = () => Date.now(),
    readonly userId = "",
  ) {}
  entry(key: string, scope: LiveScope) {
    let e = this.entries.get(key);
    if (!e) {
      e = {
        scope,
        invalidation: 0,
        dependencies:
          scope === "bookings" &&
          new URLSearchParams(key.split("?")[1] || "").get("q")
            ? ["bookings", "protocol"]
            : [scope],
        state: {
          data: null,
          error: "",
          fetching: false,
          slow: false,
          checkedAt: 0,
          limited: false,
          denied: false,
        },
        listeners: new Set(),
        generation: this.generation,
      };
      this.entries.set(key, e);
      if (this.entries.size > 24) {
        for (const [oldKey, old] of this.entries) {
          if (!old.listeners.size && !old.pending && oldKey !== key) {
            this.entries.delete(oldKey);
            break;
          }
        }
      }
    }
    return e;
  }
  private emit(e: Entry, patch: Partial<LiveState<unknown>>) {
    e.state = { ...e.state, ...patch };
    e.listeners.forEach((fn) => fn());
    this.safetyListeners.forEach((fn) => fn());
  }
  subscribe(key: string, scope: LiveScope, listener: () => void) {
    const e = this.entry(key, scope);
    e.listeners.add(listener);
    return () => {
      e.listeners.delete(listener);
    };
  }
  deny() {
    this.accessDenied = true;
    this.details.clear();
    this.generation++;
    for (const e of this.entries.values()) {
      e.controller?.abort();
      this.emit(e, {
        data: null,
        error: "انتهت الجلسة أو تغيرت صلاحية الوصول.",
        fetching: false,
        slow: false,
        denied: true,
      });
    }
    this.tokens = {};
    this.onDenied();
  }
  offline() {
    this.details.clear();
    for (const e of this.entries.values()) {
      e.controller?.abort();
      this.emit(e, {
        error:
          "الاتصال مقطوع. المحتوى المعروض آخر نسخة مؤكدة، والعمليات متوقفة حتى التحقق.",
        fetching: false,
        slow: false,
      });
    }
  }
  async load(key: string, scope: LiveScope, force = false) {
    const e = this.entry(key, scope);
    if (this.destroyed || this.accessDenied || e.state.denied) return;
    if (e.pending) return e.pending;
    if (
      !force &&
      !e.dirty &&
      e.state.data &&
      this.clock() - e.state.checkedAt < 5000
    )
      return;
    const generation = this.generation,
      controller = new AbortController();
    e.controller = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(12000),
    ]);
    this.emit(e, { fetching: true, slow: false });
    const timer = setTimeout(() => {
      if (e.state.fetching) this.emit(e, { slow: true });
    }, 3500);
    let retry = false;
    e.pending = (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const version = e.invalidation;
          const response = await this.request(key, {
            cache: "no-store",
            signal,
          });
          if (
            response.redirected ||
            response.status === 401 ||
            response.status === 403
          ) {
            this.deny();
            return;
          }
          const data = await response.json();
          if (!response.ok)
            throw Error(data.error || "تعذر تحديث البيانات. أعد المحاولة.");
          if (
            generation !== this.generation ||
            controller.signal.aborted ||
            this.destroyed
          )
            return;
          if (version !== e.invalidation) {
            retry = true;
            continue;
          }
          retry = false;
          e.dirty = false;
          this.emit(e, {
            data:
              signature(data) === signature(e.state.data) ? e.state.data : data,
            error: "",
            checkedAt: this.clock(),
          });
          break;
        }
      } catch (error) {
        retry = false;
        if (
          generation === this.generation &&
          !controller.signal.aborted &&
          !this.destroyed
        )
          this.emit(e, {
            error:
              error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
                ? error.message
                : "تعذر التحقق من البيانات. المعروض آخر نسخة مؤكدة؛ أعد المحاولة.",
          });
      } finally {
        clearTimeout(timer);
        e.pending = undefined;
        if (generation === this.generation && !this.destroyed) {
          this.emit(e, { fetching: retry, slow: false });
          if (retry && e.listeners.size)
            queueMicrotask(() => void this.load(key, scope, true));
        }
      }
    })();
    return e.pending;
  }
  async invalidate(scopes?: LiveScope[]) {
    for (const key of this.details.keys())
      if (!scopes || scopes.some((scope) => key.startsWith(scope + ":")))
        this.details.delete(key);
    const matches = [...this.entries.entries()].filter(
      ([, e]) =>
        !scopes || e.dependencies.some((scope) => scopes.includes(scope)),
    );
    matches.forEach(([, e]) => {
      e.dirty = true;
      e.invalidation++;
    });
    await Promise.all(
      matches
        .filter(([, e]) => e.listeners.size)
        .map(([key, e]) => this.load(key, e.scope, true)),
    );
  }
  async check(force = false) {
    if (this.destroyed || this.accessDenied) return;
    if (this.probe) return this.probe;
    if (!force && this.clock() - this.lastProbe < 1500) return;
    this.lastProbe = this.clock();
    const scopes = [
      ...new Set(
        [...this.entries.values()]
          .filter((e) => e.listeners.size)
          .flatMap((e) => e.dependencies),
      ),
    ].sort();
    this.probe = (async () => {
      try {
        const response = await this.request(
          "/api/ui/changes?" +
            new URLSearchParams({ role: this.role, scopes: scopes.join(",") }),
          { cache: "no-store", signal: AbortSignal.timeout(10000) },
        );
        if (
          response.redirected ||
          response.status === 401 ||
          response.status === 403
        ) {
          this.deny();
          return;
        }
        const data = await response.json();
        if (!response.ok) throw Error("تعذر التحقق من الاتصال والصلاحية.");
        if (this.destroyed) return;
        if (data.limited) {
          for (const e of this.entries.values())
            this.emit(e, { limited: true });
          if (this.clock() - this.fallbackAt >= 60000) {
            this.fallbackAt = this.clock();
            await this.invalidate();
          }
          return;
        }
        if (
          !data.revisions ||
          Array.isArray(data.revisions) ||
          scopes.some((scope) => typeof data.revisions[scope] !== "string")
        )
          throw Error("invalid revisions");
        const changed = scopes.filter(
          (scope) => this.tokens[scope] !== String(data.revisions?.[scope]),
        );
        this.tokens = Object.fromEntries(
          Object.entries(data.revisions || {}).map(([k, v]) => [k, String(v)]),
        );
        for (const e of this.entries.values()) {
          if (e.state.limited) this.emit(e, { limited: false });
          if (e.state.error && e.listeners.size && !changed.includes(e.scope))
            changed.push(e.scope);
        }
        if (changed.length) await this.invalidate(changed);
      } catch {
        if (!this.destroyed)
          for (const e of this.entries.values()) {
            if (e.listeners.size)
              this.emit(e, {
                error:
                  "تعذر التحقق من الاتصال. المحتوى آخر نسخة مؤكدة، والعمليات متوقفة حتى التحقق.",
              });
          }
      } finally {
        this.probe = undefined;
      }
    })();
    return this.probe;
  }
  activate() {
    this.destroyed = false;
  }
  dispose() {
    this.destroyed = true;
    this.generation++;
    for (const e of this.entries.values()) e.controller?.abort();
    this.entries.clear();
    this.details.clear();
    this.tokens = {};
  }
}
