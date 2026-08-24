import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isPartyLeaderNearLivestockKeeper } from "./farm";
import { sanitizeInnKitchenState } from "./innKitchen";
import { LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID } from "./keyItems";
import { isTownServicesUnlocked } from "./townServices";
import type { GameState } from "./state";
import type {
  FarmCropId,
  LivestockCreatureId,
  LivestockOutputId,
  LivestockPlacedCreatureState,
  LivestockPlacementId,
  LivestockPlacementRotation,
  LivestockState,
} from "./types";

export const LIVESTOCK_GRID_WIDTH = 5;
export const LIVESTOCK_GRID_HEIGHT = 3;
export const LIVESTOCK_DUSKHEN_CREATURE_ID =
  "duskhen" satisfies LivestockCreatureId;
export const LIVESTOCK_EGG_OUTPUT_ID = "egg" satisfies LivestockOutputId;
export const LIVESTOCK_DUSKHEN_BASE_OWNED = 2;
export const LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const LIVESTOCK_DUSKHEN_EGG_YIELD = 1;
export const LIVESTOCK_EGG_HOLD_CAP = 20;

export type LivestockCommandFailureReason =
  | "locked_service"
  | "not_near_livestock"
  | "invalid_creature"
  | "invalid_placement"
  | "no_available_creature"
  | "out_of_bounds"
  | "occupied_cell"
  | "nothing_to_collect";

export type LivestockCreatureDefinition = {
  id: LivestockCreatureId;
  displayName: string;
  shortLabel: string;
  footprint: {
    width: number;
    height: number;
  };
  output: {
    id: LivestockOutputId;
    displayName: string;
    intervalMs: number;
    quantity: number;
  };
  feedPerDay: Array<{
    cropId: FarmCropId;
    quantity: number;
  }>;
};

export type LivestockPlacementResult =
  | {
      ok: true;
      state: GameState;
      placement: LivestockPlacedCreatureState;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export type LivestockRemoveResult =
  | {
      ok: true;
      state: GameState;
      removedPlacement: LivestockPlacedCreatureState;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export type LivestockCollectAllResult =
  | {
      ok: true;
      state: GameState;
      collectedByOutputId: Partial<Record<LivestockOutputId, number>>;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export const LIVESTOCK_CREATURE_DEFINITIONS: LivestockCreatureDefinition[] = [
  {
    id: LIVESTOCK_DUSKHEN_CREATURE_ID,
    displayName: "Duskhen",
    shortLabel: "DH",
    footprint: {
      width: 1,
      height: 1,
    },
    output: {
      id: LIVESTOCK_EGG_OUTPUT_ID,
      displayName: "Egg",
      intervalMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
      quantity: LIVESTOCK_DUSKHEN_EGG_YIELD,
    },
    feedPerDay: [
      {
        cropId: "carrot",
        quantity: 1,
      },
    ],
  },
];

export function createInitialLivestockState(nowMs = 0): LivestockState {
  void nowMs;

  return {
    grid: {
      width: LIVESTOCK_GRID_WIDTH,
      height: LIVESTOCK_GRID_HEIGHT,
    },
    ownedCreaturesById: {
      duskhen: LIVESTOCK_DUSKHEN_BASE_OWNED,
    },
    placementsById: {},
    placementSequence: 0,
    holdingQuantitiesByOutputId: {
      egg: 0,
    },
    holdingCapsByOutputId: {
      egg: LIVESTOCK_EGG_HOLD_CAP,
    },
  };
}

export function getLivestockState(state: GameState): LivestockState {
  return sanitizeLivestockState(state.livestock);
}

export function getLivestockCreatureDefinitions(): LivestockCreatureDefinition[] {
  return LIVESTOCK_CREATURE_DEFINITIONS;
}

export function getLivestockCreatureDefinition(
  creatureId: LivestockCreatureId,
): LivestockCreatureDefinition | null {
  return (
    LIVESTOCK_CREATURE_DEFINITIONS.find(
      (definition) => definition.id === creatureId,
    ) ?? null
  );
}

export function sanitizeLivestockState(livestock: unknown): LivestockState {
  const fallback = createInitialLivestockState();

  if (!isRecord(livestock)) {
    return fallback;
  }

  const grid = sanitizeGrid(livestock.grid);
  const ownedCreaturesById = {
    duskhen: Math.max(
      LIVESTOCK_DUSKHEN_BASE_OWNED,
      sanitizeNonNegativeInteger(
        isRecord(livestock.ownedCreaturesById)
          ? livestock.ownedCreaturesById.duskhen
          : undefined,
      ),
    ),
  };
  const holdingCapsByOutputId = {
    egg: Math.max(
      LIVESTOCK_EGG_HOLD_CAP,
      sanitizeNonNegativeInteger(
        isRecord(livestock.holdingCapsByOutputId)
          ? livestock.holdingCapsByOutputId.egg
          : undefined,
      ),
    ),
  };
  const holdingQuantitiesByOutputId = {
    egg: Math.min(
      holdingCapsByOutputId.egg,
      sanitizeNonNegativeInteger(
        isRecord(livestock.holdingQuantitiesByOutputId)
          ? livestock.holdingQuantitiesByOutputId.egg
          : undefined,
      ),
    ),
  };
  const placementsById: LivestockState["placementsById"] = {};
  const rawPlacements = isRecord(livestock.placementsById)
    ? Object.entries(livestock.placementsById)
    : [];
  const placedCounts: Partial<Record<LivestockCreatureId, number>> = {};

  for (const [placementId, rawPlacement] of rawPlacements) {
    const placement = sanitizePlacement(placementId, rawPlacement);
    const definition = placement
      ? getLivestockCreatureDefinition(placement.creatureId)
      : null;

    if (!placement || !definition) {
      continue;
    }

    const placedCount = placedCounts[placement.creatureId] ?? 0;
    const ownedCount = ownedCreaturesById[placement.creatureId] ?? 0;

    if (placedCount >= ownedCount) {
      continue;
    }

    const validation = validatePlacementLocation(
      {
        ...fallback,
        grid,
        ownedCreaturesById,
        placementsById,
      },
      definition,
      placement.x,
      placement.y,
      placement.rotation,
    );

    if (validation) {
      continue;
    }

    placementsById[placement.id] = placement;
    placedCounts[placement.creatureId] = placedCount + 1;
  }

  return {
    grid,
    ownedCreaturesById,
    placementsById,
    placementSequence: Math.max(
      sanitizeNonNegativeInteger(livestock.placementSequence),
      getHighestPlacementSequence(placementsById),
    ),
    holdingQuantitiesByOutputId,
    holdingCapsByOutputId,
  };
}

export function ensureInitialLivestockKeyItems(
  keyItemsById: GameState["keyItemsById"],
): GameState["keyItemsById"] {
  return {
    ...(keyItemsById ?? {}),
    [LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]: Math.max(
      1,
      sanitizeNonNegativeInteger(
        keyItemsById?.[LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID],
      ),
    ),
  };
}

export function settleLivestockState(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  let livestock = sanitizeLivestockState(state.livestock);
  let nextState = setLivestockStateIfChanged(state, livestock);

  for (const placement of Object.values(livestock.placementsById)) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition) {
      continue;
    }

    const outputId = definition.output.id;
    const cap = livestock.holdingCapsByOutputId[outputId] ?? 0;
    const quantityBefore = livestock.holdingQuantitiesByOutputId[outputId] ?? 0;
    const elapsedMs = Math.max(0, nowMs - placement.lastProducedAtMs);

    if (quantityBefore >= cap) {
      if (elapsedMs < definition.output.intervalMs) {
        continue;
      }

      const nextPlacement = {
        ...placement,
        lastProducedAtMs: nowMs,
      };
      livestock = {
        ...livestock,
        placementsById: {
          ...livestock.placementsById,
          [placement.id]: nextPlacement,
        },
      };
      nextState = appendLivestockTelemetry(
        setLivestockStateIfChanged(nextState, livestock),
        "livestock_generation_blocked_cap",
        {
          placement,
          nextPlacement,
          outputId,
          quantityBefore,
          quantityAfter: quantityBefore,
          capacity: cap,
          generatedQuantity: 0,
          result: "blocked_cap",
          reason: "cap_full",
        },
      );
      continue;
    }

    const completedCycles = Math.floor(elapsedMs / definition.output.intervalMs);

    if (completedCycles <= 0) {
      continue;
    }

    const availableSpace = cap - quantityBefore;
    const generatedQuantity = Math.min(
      completedCycles * definition.output.quantity,
      availableSpace,
    );
    const completedGeneratedCycles = Math.ceil(
      generatedQuantity / definition.output.quantity,
    );
    const reachedCap = generatedQuantity >= availableSpace;
    const nextPlacement = {
      ...placement,
      lastProducedAtMs: reachedCap
        ? nowMs
        : placement.lastProducedAtMs +
          completedGeneratedCycles * definition.output.intervalMs,
    };
    const quantityAfter = quantityBefore + generatedQuantity;

    livestock = {
      ...livestock,
      placementsById: {
        ...livestock.placementsById,
        [placement.id]: nextPlacement,
      },
      holdingQuantitiesByOutputId: {
        ...livestock.holdingQuantitiesByOutputId,
        [outputId]: quantityAfter,
      },
    };
    nextState = appendLivestockTelemetry(
      setLivestockStateIfChanged(nextState, livestock),
      "livestock_output_generated",
      {
        placement,
        nextPlacement,
        outputId,
        quantityBefore,
        quantityAfter,
        capacity: cap,
        generatedQuantity,
        result: "success",
      },
    );

    if (reachedCap && completedCycles > completedGeneratedCycles) {
      nextState = appendLivestockTelemetry(
        nextState,
        "livestock_generation_blocked_cap",
        {
          placement,
          nextPlacement,
          outputId,
          quantityBefore,
          quantityAfter,
          capacity: cap,
          generatedQuantity,
          result: "blocked_cap",
          reason: "cap_full",
        },
      );
    }
  }

  return nextState;
}

export function placeLivestockCreature(
  state: GameState,
  creatureId: LivestockCreatureId,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation = "horizontal",
  nowMs = Date.now(),
): LivestockPlacementResult {
  let nextState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(nextState.livestock);
  const definition = getLivestockCreatureDefinition(creatureId);

  nextState = appendLivestockTelemetry(nextState, "livestock_place_attempt", {
    creatureId,
    outputId: definition?.output.id,
    x,
    y,
    rotation,
    result: "attempt",
  });

  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failPlacement(nextState, "livestock_place_failed", actionFailure, {
      creatureId,
      outputId: definition?.output.id,
      x,
      y,
      rotation,
    });
  }

  if (!definition) {
    return failPlacement(nextState, "livestock_place_failed", "invalid_creature", {
      creatureId,
      x,
      y,
      rotation,
    });
  }

  if (getAvailableLivestockCreatureCount(livestock, creatureId) <= 0) {
    return failPlacement(
      nextState,
      "livestock_place_failed",
      "no_available_creature",
      { creatureId, outputId: definition.output.id, x, y, rotation },
    );
  }

  const validationFailure = validatePlacementLocation(
    livestock,
    definition,
    x,
    y,
    rotation,
  );

  if (validationFailure) {
    return failPlacement(nextState, "livestock_place_failed", validationFailure, {
      creatureId,
      outputId: definition.output.id,
      x,
      y,
      rotation,
    });
  }

  const placement: LivestockPlacedCreatureState = {
    id: createPlacementId(livestock, creatureId),
    creatureId,
    x,
    y,
    rotation,
    placedAtMs: nowMs,
    lastProducedAtMs: nowMs,
  };
  const nextLivestock = {
    ...livestock,
    placementSequence: livestock.placementSequence + 1,
    placementsById: {
      ...livestock.placementsById,
      [placement.id]: placement,
    },
  };

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: nextLivestock,
      },
      "livestock_place_succeeded",
      {
        placement,
        outputId: definition.output.id,
        result: "success",
      },
    ),
    placement,
  };
}

export function moveLivestockPlacement(
  state: GameState,
  placementId: LivestockPlacementId,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation = "horizontal",
  nowMs = Date.now(),
): LivestockPlacementResult {
  let nextState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(nextState.livestock);
  const placement = livestock.placementsById[placementId];
  const definition = placement
    ? getLivestockCreatureDefinition(placement.creatureId)
    : null;

  nextState = appendLivestockTelemetry(nextState, "livestock_move_attempt", {
    placement,
    placementId,
    creatureId: placement?.creatureId,
    outputId: definition?.output.id,
    x,
    y,
    rotation,
    result: "attempt",
  });

  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failPlacement(nextState, "livestock_move_failed", actionFailure, {
      placement,
      placementId,
      creatureId: placement?.creatureId,
      outputId: definition?.output.id,
      x,
      y,
      rotation,
    });
  }

  if (!placement || !definition) {
    return failPlacement(
      nextState,
      "livestock_move_failed",
      "invalid_placement",
      { placementId, x, y, rotation },
    );
  }

  const validationFailure = validatePlacementLocation(
    livestock,
    definition,
    x,
    y,
    rotation,
    placementId,
  );

  if (validationFailure) {
    return failPlacement(nextState, "livestock_move_failed", validationFailure, {
      placement,
      placementId,
      creatureId: placement.creatureId,
      outputId: definition.output.id,
      x,
      y,
      rotation,
    });
  }

  const nextPlacement = {
    ...placement,
    x,
    y,
    rotation,
  };
  const nextLivestock = {
    ...livestock,
    placementsById: {
      ...livestock.placementsById,
      [placementId]: nextPlacement,
    },
  };

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: nextLivestock,
      },
      "livestock_move_succeeded",
      {
        placement,
        nextPlacement,
        outputId: definition.output.id,
        result: "success",
      },
    ),
    placement: nextPlacement,
  };
}

export function removeLivestockPlacement(
  state: GameState,
  placementId: LivestockPlacementId,
  nowMs = Date.now(),
): LivestockRemoveResult {
  let nextState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(nextState.livestock);
  const placement = livestock.placementsById[placementId];
  const definition = placement
    ? getLivestockCreatureDefinition(placement.creatureId)
    : null;

  nextState = appendLivestockTelemetry(nextState, "livestock_remove_attempt", {
    placement,
    placementId,
    creatureId: placement?.creatureId,
    outputId: definition?.output.id,
    result: "attempt",
  });

  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failRemove(nextState, actionFailure, placement, definition?.output.id);
  }

  if (!placement || !definition) {
    return failRemove(nextState, "invalid_placement", placement);
  }

  const nextPlacements = { ...livestock.placementsById };
  delete nextPlacements[placementId];

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: {
          ...livestock,
          placementsById: nextPlacements,
        },
      },
      "livestock_remove_succeeded",
      {
        placement,
        outputId: definition.output.id,
        result: "success",
      },
    ),
    removedPlacement: placement,
  };
}

export function collectAllLivestockOutputs(
  state: GameState,
  nowMs = Date.now(),
): LivestockCollectAllResult {
  const livestock = sanitizeLivestockState(state.livestock);
  const collectState = setLivestockStateIfChanged(state, livestock);
  const actionFailure = getLivestockActionFailure(collectState);

  if (actionFailure) {
    return failCollect(collectState, actionFailure);
  }

  const outputsToCollect = Object.entries(
    livestock.holdingQuantitiesByOutputId,
  ).filter(
    (entry): entry is [LivestockOutputId, number] =>
      isLivestockOutputId(entry[0]) && entry[1] > 0,
  );

  if (outputsToCollect.length <= 0) {
    return failCollect(collectState, "nothing_to_collect");
  }

  let kitchen = sanitizeInnKitchenState(
    collectState.innKitchen,
    collectState,
    nowMs,
    { settleHearthFire: false },
  );
  let nextState: GameState = collectState;
  const nextHoldingQuantities = {
    ...livestock.holdingQuantitiesByOutputId,
  };
  const collectedByOutputId: Partial<Record<LivestockOutputId, number>> = {};

  for (const [outputId, quantity] of outputsToCollect) {
    const previousPantryQuantity =
      kitchen.pantry.ingredientQuantitiesById[outputId] ?? 0;
    const nextPantryQuantity = previousPantryQuantity + quantity;
    const unlockedIngredientIds =
      kitchen.pantry.unlockedIngredientIds.includes(outputId)
        ? kitchen.pantry.unlockedIngredientIds
        : [...kitchen.pantry.unlockedIngredientIds, outputId];

    nextHoldingQuantities[outputId] = 0;
    collectedByOutputId[outputId] = quantity;
    kitchen = {
      ...kitchen,
      pantry: {
        unlockedIngredientIds,
        ingredientQuantitiesById: {
          ...kitchen.pantry.ingredientQuantitiesById,
          [outputId]: nextPantryQuantity,
        },
      },
    };
    nextState = appendLivestockTelemetry(
      nextState,
      "livestock_pantry_transfer",
      {
        outputId,
        quantityBefore: previousPantryQuantity,
        quantityAfter: nextPantryQuantity,
        result: "success",
      },
    );
  }

  const nextLivestock = {
    ...livestock,
    holdingQuantitiesByOutputId: nextHoldingQuantities,
  };

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: nextLivestock,
        innKitchen: kitchen,
      },
      "livestock_collect_all_succeeded",
      {
        outputId: LIVESTOCK_EGG_OUTPUT_ID,
        quantityBefore:
          livestock.holdingQuantitiesByOutputId[LIVESTOCK_EGG_OUTPUT_ID] ?? 0,
        quantityAfter: nextHoldingQuantities[LIVESTOCK_EGG_OUTPUT_ID] ?? 0,
        capacity: livestock.holdingCapsByOutputId[LIVESTOCK_EGG_OUTPUT_ID],
        result: "success",
      },
    ),
    collectedByOutputId,
  };
}

export function getLivestockExpectedOutputsPerHour(
  state: Pick<GameState, "livestock">,
): number {
  const livestock = sanitizeLivestockState(state.livestock);

  return Object.values(livestock.placementsById).reduce((total, placement) => {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition) {
      return total;
    }

    return (
      total +
      (60 * 60 * 1000 * definition.output.quantity) /
        definition.output.intervalMs
    );
  }, 0);
}

export function getAvailableLivestockCreatureCount(
  livestock: LivestockState,
  creatureId: LivestockCreatureId,
): number {
  const owned = livestock.ownedCreaturesById[creatureId] ?? 0;
  const placed = Object.values(livestock.placementsById).filter(
    (placement) => placement.creatureId === creatureId,
  ).length;

  return Math.max(0, owned - placed);
}

export function getLivestockFootprintCells(
  definition: LivestockCreatureDefinition,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation,
): Array<{ x: number; y: number }> {
  const width =
    rotation === "vertical"
      ? definition.footprint.height
      : definition.footprint.width;
  const height =
    rotation === "vertical"
      ? definition.footprint.width
      : definition.footprint.height;
  const cells: Array<{ x: number; y: number }> = [];

  for (let offsetY = 0; offsetY < height; offsetY += 1) {
    for (let offsetX = 0; offsetX < width; offsetX += 1) {
      cells.push({ x: x + offsetX, y: y + offsetY });
    }
  }

  return cells;
}

function validatePlacementLocation(
  livestock: LivestockState,
  definition: LivestockCreatureDefinition,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation,
  ignoredPlacementId?: LivestockPlacementId,
): LivestockCommandFailureReason | null {
  const cells = getLivestockFootprintCells(definition, x, y, rotation);

  if (
    cells.some(
      (cell) =>
        cell.x < 0 ||
        cell.y < 0 ||
        cell.x >= livestock.grid.width ||
        cell.y >= livestock.grid.height,
    )
  ) {
    return "out_of_bounds";
  }

  const occupiedCells = new Set<string>();

  for (const placement of Object.values(livestock.placementsById)) {
    if (placement.id === ignoredPlacementId) {
      continue;
    }

    const otherDefinition = getLivestockCreatureDefinition(placement.creatureId);

    if (!otherDefinition) {
      continue;
    }

    for (const cell of getLivestockFootprintCells(
      otherDefinition,
      placement.x,
      placement.y,
      placement.rotation,
    )) {
      occupiedCells.add(getGridCellKey(cell.x, cell.y));
    }
  }

  return cells.some((cell) => occupiedCells.has(getGridCellKey(cell.x, cell.y)))
    ? "occupied_cell"
    : null;
}

function setLivestockStateIfChanged(
  state: GameState,
  livestock: LivestockState,
): GameState {
  if (areLivestockStatesEqual(sanitizeLivestockState(state.livestock), livestock)) {
    return state;
  }

  return {
    ...state,
    livestock,
  };
}

function areLivestockStatesEqual(
  first: LivestockState,
  second: LivestockState,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function getLivestockActionFailure(
  state: GameState,
): LivestockCommandFailureReason | null {
  if (!isTownServicesUnlocked(state)) {
    return "locked_service";
  }

  if (!isPartyLeaderNearLivestockKeeper(state)) {
    return "not_near_livestock";
  }

  return null;
}

function createPlacementId(
  livestock: LivestockState,
  creatureId: LivestockCreatureId,
): LivestockPlacementId {
  let sequence = livestock.placementSequence + 1;
  let placementId = `livestock_${creatureId}_${sequence}`;

  while (livestock.placementsById[placementId]) {
    sequence += 1;
    placementId = `livestock_${creatureId}_${sequence}`;
  }

  return placementId;
}

function sanitizeGrid(grid: unknown): LivestockState["grid"] {
  if (!isRecord(grid)) {
    return {
      width: LIVESTOCK_GRID_WIDTH,
      height: LIVESTOCK_GRID_HEIGHT,
    };
  }

  return {
    width: Math.max(
      LIVESTOCK_GRID_WIDTH,
      sanitizeNonNegativeInteger(grid.width),
    ),
    height: Math.max(
      LIVESTOCK_GRID_HEIGHT,
      sanitizeNonNegativeInteger(grid.height),
    ),
  };
}

function sanitizePlacement(
  fallbackId: string,
  placement: unknown,
): LivestockPlacedCreatureState | null {
  if (!isRecord(placement)) {
    return null;
  }

  const creatureId = placement.creatureId;

  if (creatureId !== LIVESTOCK_DUSKHEN_CREATURE_ID) {
    return null;
  }

  return {
    id:
      typeof placement.id === "string" && placement.id.length > 0
        ? placement.id
        : fallbackId,
    creatureId,
    x: sanitizeNonNegativeInteger(placement.x),
    y: sanitizeNonNegativeInteger(placement.y),
    rotation: sanitizeRotation(placement.rotation),
    placedAtMs: sanitizeNonNegativeInteger(placement.placedAtMs),
    lastProducedAtMs: sanitizeNonNegativeInteger(placement.lastProducedAtMs),
  };
}

function sanitizeRotation(value: unknown): LivestockPlacementRotation {
  return value === "vertical" ? "vertical" : "horizontal";
}

function getHighestPlacementSequence(
  placementsById: LivestockState["placementsById"],
): number {
  return Object.keys(placementsById).reduce((highest, placementId) => {
    const match = placementId.match(/_(\d+)$/);

    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
}

function failPlacement(
  state: GameState,
  type: "livestock_place_failed" | "livestock_move_failed",
  reason: LivestockCommandFailureReason,
  event: {
    placement?: LivestockPlacedCreatureState;
    placementId?: LivestockPlacementId;
    creatureId?: LivestockCreatureId;
    outputId?: LivestockOutputId;
    x?: number;
    y?: number;
    rotation?: LivestockPlacementRotation;
  },
): LivestockPlacementResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, type, {
      ...event,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function failRemove(
  state: GameState,
  reason: LivestockCommandFailureReason,
  placement?: LivestockPlacedCreatureState,
  outputId?: LivestockOutputId,
): LivestockRemoveResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, "livestock_remove_failed", {
      placement,
      outputId,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function failCollect(
  state: GameState,
  reason: LivestockCommandFailureReason,
): LivestockCollectAllResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, "livestock_collect_all_failed", {
      outputId: LIVESTOCK_EGG_OUTPUT_ID,
      quantityBefore:
        sanitizeLivestockState(state.livestock).holdingQuantitiesByOutputId[
          LIVESTOCK_EGG_OUTPUT_ID
        ] ?? 0,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function appendLivestockTelemetry(
  state: GameState,
  type:
    | "livestock_place_attempt"
    | "livestock_place_succeeded"
    | "livestock_place_failed"
    | "livestock_move_attempt"
    | "livestock_move_succeeded"
    | "livestock_move_failed"
    | "livestock_remove_attempt"
    | "livestock_remove_succeeded"
    | "livestock_remove_failed"
    | "livestock_output_generated"
    | "livestock_generation_blocked_cap"
    | "livestock_collect_all_succeeded"
    | "livestock_collect_all_failed"
    | "livestock_pantry_transfer",
  event: {
    placement?: LivestockPlacedCreatureState;
    nextPlacement?: LivestockPlacedCreatureState;
    placementId?: LivestockPlacementId;
    creatureId?: LivestockCreatureId;
    outputId?: LivestockOutputId;
    x?: number;
    y?: number;
    rotation?: LivestockPlacementRotation;
    quantityBefore?: number;
    quantityAfter?: number;
    capacity?: number;
    generatedQuantity?: number;
    result: string;
    reason?: string;
  },
): GameState {
  const placement = event.nextPlacement ?? event.placement;
  const definition = event.creatureId
    ? getLivestockCreatureDefinition(event.creatureId)
    : placement
      ? getLivestockCreatureDefinition(placement.creatureId)
      : null;

  return appendDebugTelemetryEvent(state, {
    type,
    entityId: "__livestock__",
    keyItemId:
      event.creatureId === LIVESTOCK_DUSKHEN_CREATURE_ID ||
      placement?.creatureId === LIVESTOCK_DUSKHEN_CREATURE_ID
        ? LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID
        : undefined,
    livestockCreatureId: event.creatureId ?? placement?.creatureId,
    livestockPlacementId: event.placementId ?? placement?.id,
    livestockOutputId: event.outputId,
    livestockGridX: event.x ?? placement?.x,
    livestockGridY: event.y ?? placement?.y,
    livestockRotation: event.rotation ?? placement?.rotation,
    livestockFootprintWidth: definition?.footprint.width,
    livestockFootprintHeight: definition?.footprint.height,
    livestockQuantityBefore: event.quantityBefore,
    livestockQuantityAfter: event.quantityAfter,
    livestockCapacity: event.capacity,
    livestockGeneratedQuantity: event.generatedQuantity,
    result: event.result,
    reason: event.reason,
  });
}

function isLivestockOutputId(value: string): value is LivestockOutputId {
  return value === LIVESTOCK_EGG_OUTPUT_ID;
}

function getGridCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
