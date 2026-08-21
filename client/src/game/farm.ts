import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { sanitizeInnKitchenState } from "./innKitchen";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import type { GameState } from "./state";
import type {
  FarmCropId,
  FarmFieldId,
  FarmFieldState,
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
export const FARM_CARROT_HOLD_CAP = 20;
export const FARM_CARROT_LEVEL_ONE_COST_CROWNS = 50;
export const FARM_CARROT_MAX_MVP_LEVEL = 1;

export type FarmCommandFailureReason =
  | "locked_service"
  | "not_near_farmer"
  | "insufficient_crowns"
  | "max_level"
  | "invalid_field"
  | "nothing_to_harvest";

export type FarmUpgradeResult =
  | {
      ok: true;
      state: GameState;
      field: FarmFieldState;
      costCrowns: number;
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
): GameState {
  const farm = sanitizeFarmState(state.farm);
  const field = farm.fieldsById[FARM_CARROT_FIELD_ID];

  if (field.level < 1) {
    return setFarmStateIfChanged(state, farm);
  }

  const elapsedMs = Math.max(0, nowMs - field.lastGeneratedAtMs);

  if (field.heldQuantity >= FARM_CARROT_HOLD_CAP) {
    if (elapsedMs < FARM_CARROT_GROWTH_MS) {
      return setFarmStateIfChanged(state, farm);
    }

    const blockedField = {
      ...field,
      heldQuantity: FARM_CARROT_HOLD_CAP,
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
      result: "blocked_cap",
      reason: "cap_full",
    });
  }

  const completedCycles = Math.floor(elapsedMs / FARM_CARROT_GROWTH_MS);

  if (completedCycles <= 0) {
    return setFarmStateIfChanged(state, farm);
  }

  const availableSpace = FARM_CARROT_HOLD_CAP - field.heldQuantity;
  const generatedQuantity = Math.min(
    availableSpace,
    completedCycles * FARM_CARROT_YIELD,
  );
  const reachedCap = generatedQuantity >= availableSpace;
  const nextField = {
    ...field,
    heldQuantity: Math.min(
      FARM_CARROT_HOLD_CAP,
      field.heldQuantity + generatedQuantity,
    ),
    lastGeneratedAtMs: reachedCap
      ? nowMs
      : field.lastGeneratedAtMs +
        Math.floor(generatedQuantity / FARM_CARROT_YIELD) *
          FARM_CARROT_GROWTH_MS,
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
      result: "success",
    });
  }

  if (reachedCap && completedCycles * FARM_CARROT_YIELD > availableSpace) {
    nextState = appendFarmTelemetry(nextState, "farm_generation_blocked_cap", {
      field,
      nextField,
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      result: "blocked_cap",
      reason: "cap_full",
    });
  }

  return nextState;
}

export function upgradeFarmFieldToLevelOne(
  state: GameState,
  fieldId: FarmFieldId,
  nowMs = Date.now(),
): FarmUpgradeResult {
  let settledState = settleFarmState(state, nowMs);
  const farm = sanitizeFarmState(settledState.farm);
  const field = farm.fieldsById[fieldId];

  settledState = appendFarmTelemetry(settledState, "farm_upgrade_attempt", {
    field: field ?? createInitialCarrotField(nowMs),
    quantityBefore: field?.heldQuantity ?? 0,
    quantityAfter: field?.heldQuantity ?? 0,
    previousLevel: field?.level ?? 0,
    nextLevel: Math.min((field?.level ?? 0) + 1, FARM_CARROT_MAX_MVP_LEVEL),
    costCrowns: FARM_CARROT_LEVEL_ONE_COST_CROWNS,
    result: "attempt",
  });

  const failure = getFarmCommandFailure(settledState, field);

  if (failure) {
    return failUpgrade(settledState, field, failure);
  }

  if (field.level >= FARM_CARROT_MAX_MVP_LEVEL) {
    return failUpgrade(settledState, field, "max_level");
  }

  const crownBalance = getCurrencyBalance(settledState.wallet, "crowns");

  if (crownBalance < FARM_CARROT_LEVEL_ONE_COST_CROWNS) {
    return failUpgrade(settledState, field, "insufficient_crowns", {
      missingCrowns: FARM_CARROT_LEVEL_ONE_COST_CROWNS - crownBalance,
    });
  }

  const payment = removeCurrencyFromWalletState(
    settledState,
    "crowns",
    FARM_CARROT_LEVEL_ONE_COST_CROWNS,
    "farm_upgrade",
  );
  const nextField: FarmFieldState = {
    ...field,
    level: 1,
    lastGeneratedAtMs: nowMs,
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
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      previousLevel: field.level,
      nextLevel: nextField.level,
      costCrowns: FARM_CARROT_LEVEL_ONE_COST_CROWNS,
      result: "success",
    },
  );

  return {
    ok: true,
    state: nextState,
    field: nextField,
    costCrowns: FARM_CARROT_LEVEL_ONE_COST_CROWNS,
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
    level: 0,
    heldQuantity: 0,
    lastGeneratedAtMs: nowMs,
  };
}

function sanitizeCarrotField(rawField: unknown): FarmFieldState {
  if (!isRecord(rawField)) {
    return createInitialCarrotField(0);
  }

  return {
    id: FARM_CARROT_FIELD_ID,
    cropId: FARM_CARROT_CROP_ID,
    level: Math.min(
      FARM_CARROT_MAX_MVP_LEVEL,
      sanitizeNonNegativeInteger(rawField.level),
    ),
    heldQuantity: Math.min(
      FARM_CARROT_HOLD_CAP,
      sanitizeNonNegativeInteger(rawField.heldQuantity),
    ),
    lastGeneratedAtMs: sanitizeNonNegativeInteger(rawField.lastGeneratedAtMs),
  };
}

function setFarmStateIfChanged(state: GameState, farm: FarmState): GameState {
  const currentField = state.farm?.fieldsById?.[FARM_CARROT_FIELD_ID];
  const nextField = farm.fieldsById[FARM_CARROT_FIELD_ID];

  if (
    currentField?.id === nextField.id &&
    currentField.cropId === nextField.cropId &&
    currentField.level === nextField.level &&
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
  reason: FarmCommandFailureReason,
  extra: { missingCrowns?: number } = {},
): FarmUpgradeResult {
  return {
    ok: false,
    state: appendFarmTelemetry(state, "farm_upgrade_failed", {
      field: field ?? createInitialCarrotField(0),
      quantityBefore: field?.heldQuantity ?? 0,
      quantityAfter: field?.heldQuantity ?? 0,
      previousLevel: field?.level ?? 0,
      nextLevel: field?.level ?? 0,
      costCrowns: FARM_CARROT_LEVEL_ONE_COST_CROWNS,
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
    quantityBefore: number;
    quantityAfter: number;
    previousLevel?: number;
    nextLevel?: number;
    costCrowns?: number;
    result: string;
    reason?: string;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    type,
    entityId: "__farm__",
    farmFieldId: event.field.id,
    farmCropId: event.field.cropId,
    cropQuantityBefore: event.quantityBefore,
    cropQuantityAfter: event.quantityAfter,
    cropCapacity: FARM_CARROT_HOLD_CAP,
    previousFarmFieldLevel: event.previousLevel ?? event.field.level,
    nextFarmFieldLevel:
      event.nextLevel ?? event.nextField?.level ?? event.field.level,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
