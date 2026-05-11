export type BugFlockAgentType = "bug" | "hopper";

export type BugFlockVector = {
  x: number;
  y: number;
};

export type BugFlockAgent = BugFlockVector & {
  id: number;
  type: BugFlockAgentType;
  velocity: BugFlockVector;
  orbitSeed: number;
};

export type BugFlockPlayer = BugFlockVector;

export type BugFlockConfig = {
  separationRadius: number;
  innerSeparationRadius: number;
  playerAvoidRadius: number;
  playerPressureMinRadius: number;
  playerPressureMaxRadius: number;
  closeSpeed: number;
  chaseSpeed: number;
  separationWeight: number;
  playerSeekWeight: number;
  playerAvoidWeight: number;
  orbitWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
};

export const DEFAULT_BUG_FLOCK_CONFIG: BugFlockConfig = {
  separationRadius: 92,
  innerSeparationRadius: 56,
  playerAvoidRadius: 82,
  playerPressureMinRadius: 105,
  playerPressureMaxRadius: 175,
  closeSpeed: 68,
  chaseSpeed: 132,
  separationWeight: 1.35,
  playerSeekWeight: 1,
  playerAvoidWeight: 1.2,
  orbitWeight: 0.45,
  alignmentWeight: 0.12,
  cohesionWeight: 0.08,
};

export function calculateBugFlockVelocity(
  agent: BugFlockAgent,
  neighbors: readonly BugFlockAgent[],
  player: BugFlockPlayer,
  config: BugFlockConfig = DEFAULT_BUG_FLOCK_CONFIG,
): BugFlockVector {
  const toPlayer = subtract(player, agent);
  const distanceToPlayer = length(toPlayer);
  const directionToPlayer = normalizeOr(toPlayer, seededDirection(agent));
  const speed = distanceToPlayer > config.playerPressureMaxRadius
    ? config.chaseSpeed
    : config.closeSpeed;

  const steering = addMany([
    scale(playerSteering(directionToPlayer, distanceToPlayer, config), config.playerSeekWeight),
    scale(separationSteering(agent, neighbors, config), config.separationWeight),
    scale(alignmentSteering(agent, neighbors, config), config.alignmentWeight),
    scale(cohesionSteering(agent, neighbors, config), config.cohesionWeight),
    scale(orbitSteering(directionToPlayer, agent), config.orbitWeight),
  ]);

  return scale(normalizeOr(steering, directionToPlayer), speed);
}

function playerSteering(
  directionToPlayer: BugFlockVector,
  distanceToPlayer: number,
  config: BugFlockConfig,
): BugFlockVector {
  if (distanceToPlayer < config.playerAvoidRadius) {
    const intensity = 1 + (config.playerAvoidRadius - distanceToPlayer) / config.playerAvoidRadius;
    return scale(directionToPlayer, -config.playerAvoidWeight * intensity);
  }

  if (distanceToPlayer < config.playerPressureMinRadius) {
    return scale(directionToPlayer, -0.35);
  }

  if (distanceToPlayer <= config.playerPressureMaxRadius) {
    return scale(directionToPlayer, 0.3);
  }

  return directionToPlayer;
}

function separationSteering(
  agent: BugFlockAgent,
  neighbors: readonly BugFlockAgent[],
  config: BugFlockConfig,
): BugFlockVector {
  let steering = zero();

  for (const neighbor of neighbors) {
    if (neighbor.id === agent.id && neighbor.type === agent.type) {
      continue;
    }

    const away = subtract(agent, neighbor);
    const distance = length(away);
    if (distance <= 0.001 || distance > config.separationRadius) {
      continue;
    }

    const innerBoost = distance < config.innerSeparationRadius
      ? 1 + (config.innerSeparationRadius - distance) / config.innerSeparationRadius
      : 1;
    const typeBoost = neighbor.type === "hopper" ? 0.75 : 1;
    steering = add(
      steering,
      scale(normalize(away), ((config.separationRadius - distance) / config.separationRadius) * innerBoost * typeBoost),
    );
  }

  return steering;
}

function alignmentSteering(
  agent: BugFlockAgent,
  neighbors: readonly BugFlockAgent[],
  config: BugFlockConfig,
): BugFlockVector {
  const nearbyBugs = neighbors.filter((neighbor) => {
    return neighbor.type === "bug" &&
      neighbor.id !== agent.id &&
      distance(agent, neighbor) <= config.separationRadius * 1.45;
  });

  if (nearbyBugs.length === 0) {
    return zero();
  }

  const averageVelocity = scale(
    addMany(nearbyBugs.map((neighbor) => normalizeOr(neighbor.velocity, seededDirection(neighbor)))),
    1 / nearbyBugs.length,
  );

  return normalizeOr(averageVelocity, zero());
}

function cohesionSteering(
  agent: BugFlockAgent,
  neighbors: readonly BugFlockAgent[],
  config: BugFlockConfig,
): BugFlockVector {
  const nearbyBugs = neighbors.filter((neighbor) => {
    const neighborDistance = distance(agent, neighbor);
    return neighbor.type === "bug" &&
      neighbor.id !== agent.id &&
      neighborDistance > config.separationRadius &&
      neighborDistance <= config.separationRadius * 2.2;
  });

  if (nearbyBugs.length === 0) {
    return zero();
  }

  const center = scale(addMany(nearbyBugs), 1 / nearbyBugs.length);
  return normalizeOr(subtract(center, agent), zero());
}

function orbitSteering(directionToPlayer: BugFlockVector, agent: BugFlockAgent): BugFlockVector {
  const tangent = {
    x: -directionToPlayer.y,
    y: directionToPlayer.x,
  };
  const side = Math.sin(agent.orbitSeed + agent.id * Math.PI) >= 0 ? 1 : -1;
  return scale(tangent, side);
}

function seededDirection(agent: BugFlockAgent): BugFlockVector {
  const angle = agent.orbitSeed + agent.id * 2.399963229728653;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function add(left: BugFlockVector, right: BugFlockVector): BugFlockVector {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function addMany(vectors: readonly BugFlockVector[]): BugFlockVector {
  return vectors.reduce((total, vector) => add(total, vector), zero());
}

function subtract(left: BugFlockVector, right: BugFlockVector): BugFlockVector {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function scale(vector: BugFlockVector, scalar: number): BugFlockVector {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

function distance(left: BugFlockVector, right: BugFlockVector): number {
  return length(subtract(left, right));
}

function length(vector: BugFlockVector): number {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector: BugFlockVector): BugFlockVector {
  return scale(vector, 1 / length(vector));
}

function normalizeOr(vector: BugFlockVector, fallback: BugFlockVector): BugFlockVector {
  const vectorLength = length(vector);
  if (vectorLength > 0.001) {
    return scale(vector, 1 / vectorLength);
  }

  const fallbackLength = length(fallback);
  if (fallbackLength > 0.001) {
    return scale(fallback, 1 / fallbackLength);
  }

  return zero();
}

function zero(): BugFlockVector {
  return {
    x: 0,
    y: 0,
  };
}
