export type EnemyType = "bug" | "hopper";

export type EnemySpawnPosition = {
  x: number;
  y: number;
};

export type EnemySpawnPlan = EnemySpawnPosition & {
  id: number;
  type: EnemyType;
  orbitSeed: number;
};

export function createEnemySpawnPlan(
  spawnPositions: readonly EnemySpawnPosition[],
  roundsFinished: number,
): EnemySpawnPlan[] {
  const enemyCount = Math.min(spawnPositions.length, 5 + Math.max(0, Math.floor(roundsFinished)));
  return spawnPositions.slice(0, enemyCount).map((spawnPosition, index) => ({
    id: index,
    type: roundsFinished >= 1 && index === enemyCount - 1 ? "hopper" : "bug",
    x: spawnPosition.x,
    y: spawnPosition.y,
    orbitSeed: index * 0.6,
  }));
}
