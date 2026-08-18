import { isCompanionEntity } from "./entityGuards";
import { getRestingCompanions } from "./partySystem";
import type { GameState } from "./state";
import type {
  Companion,
  InnKitchenMealBuffState,
  InnKitchenRecipeId,
  InnKitchenState,
} from "./types";
import { canAfford, removeCurrencyFromWalletState } from "./wallet";

export const INN_KITCHEN_HOUSE_BREAD_RECIPE_ID: InnKitchenRecipeId =
  "house_bread";
export const INN_KITCHEN_HOUSE_BREAD_COST_CROWNS = 30;
export const INN_KITCHEN_HOUSE_BREAD_DURATION_MS = 3 * 60 * 60 * 1000;
export const INN_KITCHEN_HOUSE_BREAD_MAX_HEALTH_PERCENT = 5;

export type InnKitchenRecipeDefinition = {
  id: InnKitchenRecipeId;
  displayName: string;
  description: string;
  crownCost: number;
  ingredientText: string;
  durationMs: number;
  maxHealthPercent: number;
  tier: number;
};

export type InnKitchenCookFailureReason =
  | "invalid_recipe"
  | "missing_companion"
  | "insufficient_crowns";

export type InnKitchenCookResult =
  | {
      ok: true;
      state: GameState;
      recipe: InnKitchenRecipeDefinition;
      companionId: string;
      buff: InnKitchenMealBuffState;
    }
  | {
      ok: false;
      state: GameState;
      reason: InnKitchenCookFailureReason;
    };

export const INN_KITCHEN_RECIPE_DEFINITIONS: Record<
  InnKitchenRecipeId,
  InnKitchenRecipeDefinition
> = {
  house_bread: {
    id: "house_bread",
    displayName: "House Bread",
    description: "Simple Inn bread. Max HP +5%.",
    crownCost: INN_KITCHEN_HOUSE_BREAD_COST_CROWNS,
    ingredientText: "None",
    durationMs: INN_KITCHEN_HOUSE_BREAD_DURATION_MS,
    maxHealthPercent: INN_KITCHEN_HOUSE_BREAD_MAX_HEALTH_PERCENT,
    tier: 1,
  },
};

export function createInitialInnKitchenState(): InnKitchenState {
  return {
    activeMealBuffsByCompanionId: {},
  };
}

export function getInnKitchenState(state: GameState): InnKitchenState {
  return sanitizeInnKitchenState(state.innKitchen, state);
}

export function getInnKitchenRecipes(): InnKitchenRecipeDefinition[] {
  return Object.values(INN_KITCHEN_RECIPE_DEFINITIONS).sort(
    (first, second) =>
      second.tier - first.tier || first.displayName.localeCompare(second.displayName),
  );
}

export function getInnKitchenRecipeDefinition(
  recipeId: InnKitchenRecipeId,
): InnKitchenRecipeDefinition {
  return INN_KITCHEN_RECIPE_DEFINITIONS[recipeId];
}

export function cookInnMealForCompanion(
  state: GameState,
  companionId: string,
  recipeId: InnKitchenRecipeId,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenCookResult {
  const recipe = INN_KITCHEN_RECIPE_DEFINITIONS[recipeId];

  if (!recipe) {
    return {
      ok: false,
      state,
      reason: "invalid_recipe",
    };
  }

  if (!getCompanionById(state, companionId)) {
    return {
      ok: false,
      state,
      reason: "missing_companion",
    };
  }

  if (!canAfford(state.wallet, "crowns", recipe.crownCost)) {
    return {
      ok: false,
      state,
      reason: "insufficient_crowns",
    };
  }

  const payment = removeCurrencyFromWalletState(
    state,
    "crowns",
    recipe.crownCost,
    "inn_kitchen",
  );
  const buff: InnKitchenMealBuffState = {
    recipeId,
    cookedAtMs: nowMs,
    expiresAtMs: nowMs + recipe.durationMs,
  };
  const innKitchen = sanitizeInnKitchenState(payment.state.innKitchen, payment.state);

  return {
    ok: true,
    state: {
      ...payment.state,
      innKitchen: {
        activeMealBuffsByCompanionId: {
          ...innKitchen.activeMealBuffsByCompanionId,
          [companionId]: buff,
        },
      },
    },
    recipe,
    companionId,
    buff,
  };
}

export function getActiveInnKitchenMealBuff(
  state: GameState,
  companionId: string,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenMealBuffState | null {
  const buff = state.innKitchen?.activeMealBuffsByCompanionId?.[companionId];

  if (!buff || buff.expiresAtMs <= nowMs) {
    return null;
  }

  if (!INN_KITCHEN_RECIPE_DEFINITIONS[buff.recipeId]) {
    return null;
  }

  return buff;
}

export function getInnKitchenMaxHealthPercentModifier(
  state: GameState,
  companionId: string,
  nowMs = state.simulationTimeMs ?? Date.now(),
): number {
  const buff = getActiveInnKitchenMealBuff(state, companionId, nowMs);

  if (!buff) {
    return 0;
  }

  return INN_KITCHEN_RECIPE_DEFINITIONS[buff.recipeId].maxHealthPercent;
}

export function sanitizeInnKitchenState(
  innKitchen: unknown,
  state: GameState,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenState {
  if (!isRecord(innKitchen)) {
    return createInitialInnKitchenState();
  }

  const rawBuffs = innKitchen.activeMealBuffsByCompanionId;

  if (!isRecord(rawBuffs)) {
    return createInitialInnKitchenState();
  }

  const validCompanionIds = new Set(
    [
      ...Object.values(state.entities)
        .filter(isCompanionEntity)
        .map((companion) => companion.id),
      ...getRestingCompanions(state).map((companion) => companion.id),
    ],
  );
  const activeMealBuffsByCompanionId: Record<string, InnKitchenMealBuffState> = {};

  for (const [companionId, rawBuff] of Object.entries(rawBuffs)) {
    if (!validCompanionIds.has(companionId) || !isRecord(rawBuff)) {
      continue;
    }

    const recipeId = rawBuff.recipeId;
    const cookedAtMs = rawBuff.cookedAtMs;
    const expiresAtMs = rawBuff.expiresAtMs;

    if (
      typeof recipeId !== "string" ||
      !(recipeId in INN_KITCHEN_RECIPE_DEFINITIONS) ||
      !Number.isFinite(cookedAtMs) ||
      !Number.isFinite(expiresAtMs) ||
      (expiresAtMs as number) <= nowMs
    ) {
      continue;
    }

    activeMealBuffsByCompanionId[companionId] = {
      recipeId: recipeId as InnKitchenRecipeId,
      cookedAtMs: Math.floor(cookedAtMs as number),
      expiresAtMs: Math.floor(expiresAtMs as number),
    };
  }

  return {
    activeMealBuffsByCompanionId,
  };
}

function getCompanionById(state: GameState, companionId: string): Companion | null {
  const entity = state.entities[companionId];

  if (entity && isCompanionEntity(entity)) {
    return entity;
  }

  return state.restingCompanionsById?.[companionId] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
