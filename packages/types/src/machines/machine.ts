/**
 * Durum makinesi çekirdeği (D8). Servisler status kolonuna doğrudan yazmaz;
 * `transition()` çağırır. Geçersiz geçiş fırlatır — sessiz kabul yok.
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`${machine}: '${from}' → '${to}' geçişi tanımlı değil`);
    this.name = 'InvalidTransitionError';
  }
}

export interface Machine<S extends string> {
  readonly name: string;
  readonly initial: S;
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  readonly terminal: readonly S[];
}

export function defineMachine<S extends string>(m: Machine<S>): Machine<S> {
  return m;
}

export function canTransition<S extends string>(m: Machine<S>, from: S, to: S): boolean {
  return m.transitions[from].includes(to);
}

export function transition<S extends string>(m: Machine<S>, from: S, to: S): S {
  if (!canTransition(m, from, to)) throw new InvalidTransitionError(m.name, from, to);
  return to;
}

export function isTerminal<S extends string>(m: Machine<S>, s: S): boolean {
  return m.terminal.includes(s);
}
