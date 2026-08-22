import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { sanitizeInnKitchenState } from "./innKitchen";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import type { GameState } from "./state";
import type {
  FarmCropId,
  FarmFieldId,
  FarmFieldState,
  FarmFieldUpgradeId,
  FarmFieldUpgradeLevels,
  FarmState,
  NpcEntity,
} from "./types";
import { isTownServicesUnlocked } from "./townServices";
import {
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";

export const FARM_INTERACTION_RANGE = 4;
export const FARM_CARROT_CROP_ID: FarmCropId = "carrot";
export const FARM_CARROT_FIELD_ID: FarmFieldId = "carrot_field";
export const FARM_CARROT_GROWTH_MS = 20 * 60 * 1000;
export const FARM_CARROT_YIELD = 1;
export const FARM_CARROT_BASE_HOLD_CAP = 20;
export const FARM_FIELD_UPGRADE_IDS: FarmFieldUpgradeId[] = [
  "speed",
  "cap",
  "fertilizer",
];
export const FARM_SPEED_MAX_LEVEL = 5;
export const FARM_CAP_MAX_LEVEL = 5;
export const FARM_FERTILIZER_MAX_LEVEL = 3;
export const FARM_SPEED_BONUS_PER_LEVEL_AFTER_BASE = 0.05;
export const FARM_CAP_BONUS_PER_LEVEL_AFTER_BASE = 0.2;
export const FARM_FERTILIZER_DOUBLE_CROP_CHANCE_PERCENT_PER_LEVEL = 1;

export type FarmCommandFailureReason =
  | "locked_service"
  | "not_near_farmer"
  | "insufficient_crowns"
  | "max_level"
  | "invalid_field"
  | "invalid_upgrade"
  | "nothing_to_harvest";

export type FarmUpgradeResult =
  | {
      ok: true;
      state: GameState;
      field: FarmFieldState;
      upgradeId: FarmFieldUpgradeId;
      costCrowns: number;
      previousLevel: number;
      nextLevel: number;
    }
  | {
      ok: false;
      state: GameState;
      reason: FarmCommandFailureReason;
      missingCrowns?: number;
    };

export type FarmHarvestAllResult =
  | {
      ok: true;
      state: GameState;
      harvestedByCropId: Record<FarmCropId, number>;
    }
  | {
      ok: false;
      state: GameState;
      reason: FarmCommandFailureReason;
    };

type FarmUpgradeDefinition = {
  id: FarmFieldUpgradeId;
  displayName: string;
  maxLevel: number;
};

export const FARM_FIELD_UPGRADE_DEFINITIONS: Record<
  FarmFieldUpgradeId,
  FarmUpgradeDefinition
> = {
  speed: {
    id: "speed",
    displayName: "Faster Generation",
    maxLevel: FARM_SPEED_MAX_LEVEL,
  },
  cap: {
    id: "cap",
    displayName: "Harvest Cap",
    maxLevel: FARM_CAP_MAX_LEVEL,
  },
  fertilizer: {
    id: "fertilizer",
    displayName: "Fertilizer",
    maxLevel: FARM_FERTILIZER_MAX_LEVEL,
  },
};

export function createInitialFarmState(nowMs = 0): FarmState {
  return {
    fieldsById: {
      [FARM_CARROT_FIELD_ID]: createInitialCarrotField(nowMs),
    },
  };
}

export function getFarmState(state: GameState): FarmState {
  return sanitizeFarmState(state.farm);
}

export function sanitizeFarmState(farm: unknown): FarmState {
  if (!isRecord(farm) || !isRecord(farm.fieldsById)) {
    return createInitialFarmState();
  }

  return {
    fieldsById: {
      [FARM_CARROT_FIELD_ID]: sanitizeCarrotField(
        farm.fieldsById[FARM_CARROT_FIELD_ID],
      ),
    },
  };
}

export function settleFarmState(
  state: GameState,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  const farm = sanitizeFarmState(state.farm);
  const field = farm.fieldsById[FARM_CARROT_FIELD_ID];

  if (field.upgradeLevels.speed < 1) {
    return setFarmStateIfChanged(state, farm);
  }

  const holdCap = getFarmFieldHoldCap(field);
  const generationIntervalMs = getFarmFieldGenerationIntervalMs(field);
  const elapsedMs = Math.max(0, nowMs - field.lastGeneratedAtMs);

  if (field.heldQuantity >= holdCap) {
    if (elapsedMs < generationIntervalMs) {
      return setFarmStateIfChanged(state, farm);
    }

    const blockedField = {
      ...field,
      heldQuantity: holdCap,
      lastGeneratedAtMs: nowMs,
    };
    const nextState = setFarmStateIfChanged(state, {
      fieldsById: {
        ...farm.fieldsById,
        [FARM_CARROT_FIELD_ID]: blockedField,
      },
    });

    return appendFarmTelemetry(nextState, "farm_generation_blocked_cap", {
      field,
      nextField: blockedField,
      quantityBefore: field.heldQuantity,
      quantityAfter: blockedField.heldQuantity,
      generatedQuantity: 0,
      doubleCropRolls: 0,
      result: "blocked_cap",
      reason: "cap_full",
    });
  }

  const completedCycles = Math.floor(elapsedMs / generationIntervalMs);

  if (completedCycles <= 0) {
    return setFarmStateIfChanged(state, farm);
  }

  const availableSpace = holdCap - field.heldQuantity;
  const fertilizerChance =
    getFarmFertilizerDoubleCropChancePercent(field) / 100;
  let generatedQuantity = 0;
  let completedGeneratedCycles = 0;
  let doubleCropRolls = 0;

  for (
    let cycle = 0;
    cycle < completedCycles && generatedQuantity < availableSpace;
    cycle += 1
  ) {
    let cycleQuantity = FARM_CARROT_YIELD;

    if (fertilizerChance > 0 && random() < fertilizerChance) {
      cycleQuantity += FARM_CARROT_YIELD;
      doubleCropRolls += 1;
    }

    generatedQuantity += Math.min(
      cycleQuantity,
      availableSpace - generatedQuantity,
    );
    completedGeneratedCycles += 1;
  }

  const reachedCap = generatedQuantity >= availableSpace;
  const nextField = {
    ...field,
    heldQuantity: Math.min(holdCap, field.heldQuantity + generatedQuantity),
    lastGeneratedAtMs: reachedCap
      ? nowMs
      : field.lastGeneratedAtMs +
        completedGeneratedCycles * generationIntervalMs,
  };
  let nextState = setFarmStateIfChanged(state, {
    fieldsById: {
      ...farm.fieldsById,
      [FARM_CARROT_FIELD_ID]: nextField,
    },
  });

  if (generatedQuantity > 0) {
    nextState = appendFarmTelemetry(nextState, "farm_crop_generated", {
      field,
      nextField,
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      generatedQuantity,
      doubleCropRolls,
      result: "success",
    });
  }

  if (reachedCap && completedCycles > completedGeneratedCycles) {
    nextState = appendFarmTelemetry(nextState, "farm_generation_blocked_cap", {
      field,
      nextField,
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      generatedQuantity,
      doubleCropRolls,
      result: "blocked_cap",
      reason: "cap_full",
    });
  }

  return nextState;
}

export function purchaseFarmFieldUpgrade(
  state: GameState,
  fieldId: FarmFieldId,
  upgradeId: FarmFieldUpgradeId,
  nowMs = Date.now(),
): FarmUpgradeResult {
  let settledState = settleFarmState(state, nowMs);
  const farm = sanitizeFarmState(settledState.farm);
  const field = farm.fieldsById[fieldId];
  const upgradeDefinition = FARM_FIELD_UPGRADE_DEFINITIONS[upgradeId];
  const currentLevel = field?.upgradeLevels[upgradeId] ?? 0;
  const costCrowns = getFarmUpgradeCostCrowns(currentLevel);

  settledState = appendFarmTelemetry(settledState, "farm_upgrade_attempt", {
    field: field ?? createInitialCarrotField(nowMs),
    upgradeId,
    quantityBefore: field?.heldQuantity ?? 0,
    quantityAfter: field?.heldQuantity ?? 0,
    previousUpgradeLevel: currentLevel,
    nextUpgradeLevel: upgradeDefinition
      ? Math.min(currentLevel + 1, upgradeDefinition.maxLevel)
      : currentLevel,
    costCrowns,
    result: "attempt",
  });

  const failure = getFarmCommandFailure(settledState, field);

  if (failure) {
    return failUpgrade(settledState, field, upgradeId, failure, costCrowns);
  }

  if (!upgradeDefinition) {
    return failUpgrade(
      settledState,
      field,
      upgradeId,
      "invalid_upgrade",
      costCrowns,
    );
  }

  if (currentLevel >= upgradeDefinition.maxLevel) {
    return failUpgrade(settledState, field, upgradeId, "max_level", costCrowns);
  }

  const crownBalance = getCurrencyBalance(settledState.wallet, "crowns");

  if (crownBalance < costCrowns) {
    return failUpgrade(
      settledState,
      field,
      upgradeId,
      "insufficient_crowns",
      costCrowns,
      { missingCrowns: costCrowns - crownBalance },
    );
  }

  const payment = removeCurrencyFromWalletState(
    settledState,
    "crowns",
    costCrowns,
    "farm_upgrade",
  );
  const nextField: FarmFieldState = {
    ...field,
    upgradeLevels: {
      ...field.upgradeLevels,
      [upgradeId]: currentLevel + 1,
    },
    lastGeneratedAtMs:
      upgradeId === "speed" && currentLevel === 0
        ? nowMs
        : field.lastGeneratedAtMs,
  };
  const nextState = appendFarmTelemetry(
    {
      ...payment.state,
      farm: {
        fieldsById: {
          ...farm.fieldsById,
          [fieldId]: nextField,
        },
      },
    },
    "farm_upgrade_succeeded",
    {
      field,
      nextField,
      upgradeId,
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      previousUpgradeLevel: currentLevel,
      nextUpgradeLevel: nextField.upgradeLevels[upgradeId],
      costCrowns,
      result: "success",
    },
  );

  return {
    ok: true,
    state: nextState,
    field: nextField,
    upgradeId,
    costCrowns,
    previousLevel: currentLevel,
    nextLevel: nextField.upgradeLevels[upgradeId],
  };
}

export function harvestAllFarmCrops(
  state: GameState,
  nowMs = Date.now(),
): FarmHarvestAllResult {
  const settledState = settleFarmState(state, nowMs);
  const farm = sanitizeFarmState(settledState.farm);
  const field = farm.fieldsById[FARM_CARROT_FIELD_ID];
  const failure = getFarmCommandFailure(settledState, field);

  if (failure) {
    return failHarvest(settledState, field, failure);
  }

  if (field.heldQuantity <= 0) {
    return failHarvest(settledState, field, "nothing_to_harvest");
  }

  const quantity = field.heldQuantity;
  const nextField = {
    ...field,
    heldQuantity: 0,
    lastGeneratedAtMs: nowMs,
  };
  const nextFarm = {
    fieldsById: {
      ...farm.fieldsById,
      [FARM_CARROT_FIELD_ID]: nextField,
    },
  };
  const kitchen = sanitizeInnKitchenState(
    settledState.innKitchen,
    settledState,
    nowMs,
    { settleHearthFire: false },
  );
  const nextPantryQuantity =
    (kitchen.pantry.ingredientQuantitiesById[FARM_CARROT_CROP_ID] ?? 0) +
    quantity;
  const unlockedIngredientIds = kitchen.pantry.unlockedIngredientIds.includes(
    FARM_CARROT_CROP_ID,
  )
    ? kitchen.pantry.unlockedIngredientIds
    : [...kitchen.pantry.unlockedIngredientIds, FARM_CARROT_CROP_ID];
  let nextState: GameState = {
    ...settledState,
    farm: nextFarm,
    innKitchen: {
      ...kitchen,
      pantry: {
        unlockedIngredientIds,
        ingredientQuantitiesById: {
          ...kitchen.pantry.ingredientQuantitiesById,
          [FARM_CARROT_CROP_ID]: nextPantryQuantity,
        },
      },
    },
  };

  nextState = appendFarmTelemetry(nextState, "farm_harvest_all_succeeded", {
    field,
    nextField,
    quantityBefore: field.heldQuantity,
    quantityAfter: nextField.heldQuantity,
    result: "success",
  });
  nextState = appendFarmTelemetry(nextState, "farm_pantry_transfer", {
    field,
    nextField,
    quantityBefore:
      kitchen.pantry.ingredientQuantitiesById[FARM_CARROT_CROP_ID] ?? 0,
    quantityAfter: nextPantryQuantity,
    result: "success",
  });

  return {
    ok: true,
    state: nextState,
    harvestedByCropId: {
      [FARM_CARROT_CROP_ID]: quantity,
    },
  };
}

export function getFarmFieldHoldCap(field: FarmFieldState): number {
  return Math.round(
    FARM_CARROT_BASE_HOLD_CAP *
      (1 +
        Math.max(0, field.upgradeLevels.cap - 1) *
          FARM_CAP_BONUS_PER_LEVEL_AFTER_BASE),
  );
}

export function getFarmFieldGenerationIntervalMs(
  field: FarmFieldState,
): number {
  if (field.upgradeLevels.speed <= 0) {
    return FARM_CARROT_GROWTH_MS;
  }

  return Math.round(FARM_CARROT_GROWTH_MS / getFarmSpeedMultiplier(field));
}

export function getFarmExpectedCropsPerHour(field: FarmFieldState): number {
  if (field.upgradeLevels.speed <= 0) {
    return 0;
  }

  const baseCyclesPerHour =
    (60 * 60 * 1000) / getFarmFieldGenerationIntervalMs(field);
  const expectedYield =
    FARM_CARROT_YIELD *
    (1 + getFarmFertilizerDoubleCropChancePercent(field) / 100);

  return baseCyclesPerHour * expectedYield;
}

export function getFarmFertilizerDoubleCropChancePercent(
  field: FarmFieldState,
): number {
  return (
    field.upgradeLevels.fertilizer *
    FARM_FERTILIZER_DOUBLE_CROP_CHANCE_PERCENT_PER_LEVEL
  );
}

export function getFarmSpeedMultiplier(field: FarmFieldState): number {
  if (field.upgradeLevels.speed <= 0) {
    return 0;
  }

  return (
    1 +
    Math.max(0, field.upgradeLevels.speed - 1) *
      FARM_SPEED_BONUS_PER_LEVEL_AFTER_BASE
  );
}

export function getFarmUpgradeCostCrowns(currentLevel: number): number {
  return 100 * (currentLevel + 1);
}

export function isFarmerNpc(
  entity: unknown,
): entity is NpcEntity & { npcRole: "farmer" } {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "kind" in entity &&
    entity.kind === "npc" &&
    "npcRole" in entity &&
    entity.npcRole === "farmer"
  );
}

export function isLivestockKeeperNpc(
  entity: unknown,
): entity is NpcEntity & { npcRole: "livestock_keeper" } {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "kind" in entity &&
    entity.kind === "npc" &&
    "npcRole" in entity &&
    entity.npcRole === "livestock_keeper"
  );
}

export function isPartyLeaderNearFarmer(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isFarmerNpc(entity) &&
      getEuclideanDistance(leader.position, entity.position) <=
        FARM_INTERACTION_RANGE,
  );
}

export function isPartyLeaderNearLivestockKeeper(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isLivestockKeeperNpc(entity) &&
      getEuclideanDistance(leader.position, entity.position) <=
        FARM_INTERACTION_RANGE,
  );
}

function createInitialCarrotField(nowMs: number): FarmFieldState {
  return {
    id: FARM_CARROT_FIELD_ID,
    cropId: FARM_CARROT_CROP_ID,
    upgradeLevels: createInitialFarmFieldUpgradeLevels(),
    heldQuantity: 0,
    lastGeneratedAtMs: nowMs,
  };
}

function createInitialFarmFieldUpgradeLevels(): FarmFieldUpgradeLevels {
  return {
    speed: 0,
    cap: 1,
    fertilizer: 0,
  };
}

function sanitizeCarrotField(rawField: unknown): FarmFieldState {
  if (!isRecord(rawField)) {
    return createInitialCarrotField(0);
  }

  const legacyLevel = sanitizeNonNegativeInteger(rawField.level);
  const rawUpgradeLevels = isRecord(rawField.upgradeLevels)
    ? rawField.upgradeLevels
    : {};
  const upgradeLevels: FarmFieldUpgradeLevels = {
    speed: clampInteger(
      sanitizeNonNegativeInteger(rawUpgradeLevels.speed ?? legacyLevel),
      0,
      FARM_SPEED_MAX_LEVEL,
    ),
    cap: clampInteger(
      sanitizeNonNegativeInteger(rawUpgradeLevels.cap ?? 1),
      1,
      FARM_CAP_MAX_LEVEL,
    ),
    fertilizer: clampInteger(
      sanitizeNonNegativeInteger(rawUpgradeLevels.fertilizer ?? 0),
      0,
      FARM_FERTILIZER_MAX_LEVEL,
    ),
  };
  const field: FarmFieldState = {
    id: FARM_CARROT_FIELD_ID,
    cropId: FARM_CARROT_CROP_ID,
    upgradeLevels,
    heldQuantity: sanitizeNonNegativeInteger(rawField.heldQuantity),
    lastGeneratedAtMs: sanitizeNonNegativeInteger(rawField.lastGeneratedAtMs),
  };

  return {
    ...field,
    heldQuantity: Math.min(getFarmFieldHoldCap(field), field.heldQuantity),
  };
}

function setFarmStateIfChanged(state: GameState, farm: FarmState): GameState {
  const currentField = state.farm?.fieldsById?.[FARM_CARROT_FIELD_ID];
  const nextField = farm.fieldsById[FARM_CARROT_FIELD_ID];

  if (
    currentField?.id === nextField.id &&
    currentField.cropId === nextField.cropId &&
    currentField.upgradeLevels?.speed === nextField.upgradeLevels.speed &&
    currentField.upgradeLevels?.cap === nextField.upgradeLevels.cap &&
    currentField.upgradeLevels?.fertilizer ===
      nextField.upgradeLevels.fertilizer &&
    currentField.heldQuantity === nextField.heldQuantity &&
    currentField.lastGeneratedAtMs === nextField.lastGeneratedAtMs
  ) {
    return state;
  }

  return {
    ...state,
    farm,
  };
}

function getFarmCommandFailure(
  state: GameState,
  field: FarmFieldState | undefined,
): FarmCommandFailureReason | null {
  if (!field || field.id !== FARM_CARROT_FIELD_ID) {
    return "invalid_field";
  }

  if (!isTownServicesUnlocked(state)) {
    return "locked_service";
  }

  if (!isPartyLeaderNearFarmer(state)) {
    return "not_near_farmer";
  }

  return null;
}

function failUpgrade(
  state: GameState,
  field: FarmFieldState | undefined,
  upgradeId: FarmFieldUpgradeId,
  reason: FarmCommandFailureReason,
  costCrowns: number,
  extra: { missingCrowns?: number } = {},
): FarmUpgradeResult {
  const fallbackField = field ?? createInitialCarrotField(0);
  const currentLevel = fallbackField.upgradeLevels[upgradeId] ?? 0;

  return {
    ok: false,
    state: appendFarmTelemetry(state, "farm_upgrade_failed", {
      field: fallbackField,
      upgradeId,
      quantityBefore: fallbackField.heldQuantity,
      quantityAfter: fallbackField.heldQuantity,
      previousUpgradeLevel: currentLevel,
      nextUpgradeLevel: currentLevel,
      costCrowns,
      result: "failed",
      reason,
    }),
    reason,
    ...extra,
  };
}

function failHarvest(
  state: GameState,
  field: FarmFieldState,
  reason: FarmCommandFailureReason,
): FarmHarvestAllResult {
  return {
    ok: false,
    state: appendFarmTelemetry(state, "farm_harvest_all_failed", {
      field,
      quantityBefore: field.heldQuantity,
      quantityAfter: field.heldQuantity,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function appendFarmTelemetry(
  state: GameState,
  type:
    | "farm_upgrade_attempt"
    | "farm_upgrade_succeeded"
    | "farm_upgrade_failed"
    | "farm_crop_generated"
    | "farm_generation_blocked_cap"
    | "farm_harvest_all_succeeded"
    | "farm_harvest_all_failed"
    | "farm_pantry_transfer",
  event: {
    field: FarmFieldState;
    nextField?: FarmFieldState;
    upgradeId?: FarmFieldUpgradeId;
    quantityBefore: number;
    quantityAfter: number;
    previousUpgradeLevel?: number;
    nextUpgradeLevel?: number;
    costCrowns?: number;
    generatedQuantity?: number;
    doubleCropRolls?: number;
    result: string;
    reason?: string;
  },
): GameState {
  const telemetryField = event.nextField ?? event.field;

  return appendDebugTelemetryEvent(state, {
    type,
    entityId: "__farm__",
    farmFieldId: event.field.id,
    farmCropId: event.field.cropId,
    farmUpgradeId: event.upgradeId,
    cropQuantityBefore: event.quantityBefore,
    cropQuantityAfter: event.quantityAfter,
    cropCapacity: getFarmFieldHoldCap(telemetryField),
    previousFarmFieldLevel: event.field.upgradeLevels.speed,
    nextFarmFieldLevel: telemetryField.upgradeLevels.speed,
    previousFarmUpgradeLevel: event.previousUpgradeLevel,
    nextFarmUpgradeLevel: event.nextUpgradeLevel,
    farmSpeedMultiplier: getFarmSpeedMultiplier(telemetryField),
    farmFertilizerDoubleCropChancePercent:
      getFarmFertilizerDoubleCropChancePercent(telemetryField),
    farmGeneratedQuantity: event.generatedQuantity,
    farmDoubleCropRolls: event.doubleCropRolls,
    crownCost: event.costCrowns,
    result: event.result,
    reason: event.reason,
  });
}

function sanitizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
