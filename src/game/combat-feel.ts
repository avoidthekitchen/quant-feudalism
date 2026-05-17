export const INPUT_BUFFER_MS = 150;
export const STATEMENT_CHAIN_WINDOW_MS = 450;
export const STATEMENT_CHAIN_DAMAGE_MULTIPLIERS = [1, 1.1, 1.25] as const;

export type StatementChainIndex = 0 | 1 | 2;

export function advanceStatementChain(
  previousIndex: StatementChainIndex,
  elapsedSinceStatementMs: number,
): StatementChainIndex {
  if (elapsedSinceStatementMs > STATEMENT_CHAIN_WINDOW_MS) {
    return 0;
  }

  return Math.min(previousIndex + 1, 2) as StatementChainIndex;
}

export function statementChainDamage(baseDamage: number, chainIndex: StatementChainIndex): number {
  return Math.round(baseDamage * STATEMENT_CHAIN_DAMAGE_MULTIPLIERS[chainIndex]);
}

export function shouldExpireInputBuffer(ageMs: number): boolean {
  return ageMs > INPUT_BUFFER_MS;
}
