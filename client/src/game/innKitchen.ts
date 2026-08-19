import { isCompanionEntity } from "./entityGuards";
import { HUB_MAP_ID, HUB_TWO_MAP_ID } from "./debugMap";
import { getRestingCompanions } from "./partySystem";
import { getGuildSecondaryPartiesState } from "./guildSecondaryParties";
import type { GameState } from "./state";
import type {
  Companion,
  InnKitchenCompanionPreferenceState,
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

export type InnKitchenBulkCookResult =
  | {
      ok: true;
      state: GameState;
      companionIds: string[];
      totalCostCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      reason: InnKitchenCookFailureReason | "empty_target_list";
      missingCrowns?: number;
      totalCostCrowns?: number;
    };

export type InnKitchenAutoCookResult = {
  state: GameState;
  renewedCompanionIds: string[];
  disabledCompanionIds: string[];
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
    preferencesByCompanionId: {},
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
        preferencesByCompanionId: innKitchen.preferencesByCompanionId,
      },
    },
    recipe,
    companionId,
    buff,
  };
}

export function bulkCookInnMealsForCompanions(
  state: GameState,
  companionIds: string[],
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenBulkCookResult {
  const uniqueCompanionIds = Array.from(new Set(companionIds));

  if (uniqueCompanionIds.length <= 0) {
    return {
      ok: false,
      state,
      reason: "empty_target_list",
    };
  }

  const recipes = uniqueCompanionIds.map((companionId) => {
    const companion = getCompanionById(state, companionId);

    if (!companion) {
      return null;
    }

    return getInnKitchenRecipeDefinition(
      getInnKitchenSelectedRecipeId(state, companionId),
    );
  });

  if (recipes.some((recipe) => !recipe)) {
    return {
      ok: false,
      state,
      reason: "missing_companion",
    };
  }

  const totalCostCrowns = recipes.reduce(
    (totalCost, recipe) => totalCost + (recipe?.crownCost ?? 0),
    0,
  );

  if (!canAfford(state.wallet, "crowns", totalCostCrowns)) {
    return {
      ok: false,
      state,
      reason: "insufficient_crowns",
      missingCrowns:
        totalCostCrowns - (state.wallet.balancesByCurrencyId.crowns ?? 0),
      totalCostCrowns,
    };
  }

  const payment = removeCurrencyFromWalletState(
    state,
    "crowns",
    totalCostCrowns,
    "inn_kitchen",
  );
  const innKitchen = sanitizeInnKitchenState(payment.state.innKitchen, payment.state);
  const activeMealBuffsByCompanionId = {
    ...innKitchen.activeMealBuffsByCompanionId,
  };

  uniqueCompanionIds.forEach((companionId, index) => {
    const recipe = recipes[index];

    if (!recipe) {
      return;
    }

    activeMealBuffsByCompanionId[companionId] = {
      recipeId: recipe.id,
      cookedAtMs: nowMs,
      expiresAtMs: nowMs + recipe.durationMs,
    };
  });

  return {
    ok: true,
    state: {
      ...payment.state,
      innKitchen: {
        activeMealBuffsByCompanionId,
        preferencesByCompanionId: innKitchen.preferencesByCompanionId,
      },
    },
    companionIds: uniqueCompanionIds,
    totalCostCrowns,
  };
}

export function getInnKitchenPreference(
  state: GameState,
  companionId: string,
): InnKitchenCompanionPreferenceState {
  return (
    sanitizeInnKitchenState(state.innKitchen, state).preferencesByCompanionId[
      companionId
    ] ?? {
      selectedRecipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      autoCookEnabled: false,
    }
  );
}

export function getInnKitchenSelectedRecipeId(
  state: GameState,
  companionId: string,
): InnKitchenRecipeId {
  return getInnKitchenPreference(state, companionId).selectedRecipeId;
}

export function setInnKitchenSelectedRecipe(
  state: GameState,
  companionId: string,
  recipeId: InnKitchenRecipeId,
): GameState {
  if (
    !getCompanionById(state, companionId) ||
    !INN_KITCHEN_RECIPE_DEFINITIONS[recipeId]
  ) {
    return state;
  }

  return setInnKitchenPreference(state, companionId, {
    ...getInnKitchenPreference(state, companionId),
    selectedRecipeId: recipeId,
  });
}

export function setInnKitchenAutoCookEnabled(
  state: GameState,
  companionId: string,
  autoCookEnabled: boolean,
): GameState {
  if (!getCompanionById(state, companionId)) {
    return state;
  }

  return setInnKitchenPreference(state, companionId, {
    ...getInnKitchenPreference(state, companionId),
    autoCookEnabled,
  });
}

export function processInnKitchenAutoCook(
  state: GameState,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenAutoCookResult {
  let nextState: GameState = state;
  const renewedCompanionIds: string[] = [];
  const disabledCompanionIds: string[] = [];
  const preferences = Object.entries(
    sanitizeInnKitchenState(state.innKitchen, state, nowMs)
      .preferencesByCompanionId,
  ).sort(([firstId], [secondId]) => firstId.localeCompare(secondId));

  for (const [companionId, preference] of preferences) {
    const storedBuff = getStoredInnKitchenMealBuff(nextState, companionId);

    if (
      !preference.autoCookEnabled ||
      !isCompanionHubEligibleForInnKitchen(nextState, companionId) ||
      !storedBuff ||
      storedBuff.expiresAtMs > nowMs
    ) {
      continue;
    }

    const cooked = cookInnMealForCompanion(
      nextState,
      companionId,
      preference.selectedRecipeId,
      nowMs,
    );

    if (cooked.ok) {
      nextState = cooked.state;
      renewedCompanionIds.push(companionId);
      continue;
    }

    if (cooked.reason === "insufficient_crowns") {
      nextState = setInnKitchenAutoCookEnabled(cooked.state, companionId, false);
      disabledCompanionIds.push(companionId);
    } else {
      nextState = cooked.state;
    }
  }

  return {
    state: nextState,
    renewedCompanionIds,
    disabledCompanionIds,
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
  const rawPreferences = innKitchen.preferencesByCompanionId;

  const validCompanionIds = new Set(
    [
      ...Object.values(state.entities)
        .filter(isCompanionEntity)
        .map((companion) => companion.id),
      ...getRestingCompanions(state).map((companion) => companion.id),
    ],
  );
  const activeMealBuffsByCompanionId: Record<string, InnKitchenMealBuffState> = {};
  const preferencesByCompanionId: Record<
    string,
    InnKitchenCompanionPreferenceState
  > = {};

  if (isRecord(rawBuffs)) {
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
  }

  if (isRecord(rawPreferences)) {
    for (const [companionId, rawPreference] of Object.entries(rawPreferences)) {
      if (!validCompanionIds.has(companionId) || !isRecord(rawPreference)) {
        continue;
      }

      const selectedRecipeId = rawPreference.selectedRecipeId;

      preferencesByCompanionId[companionId] = {
        selectedRecipeId:
          typeof selectedRecipeId === "string" &&
          selectedRecipeId in INN_KITCHEN_RECIPE_DEFINITIONS
            ? (selectedRecipeId as InnKitchenRecipeId)
            : INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        autoCookEnabled: rawPreference.autoCookEnabled === true,
      };
    }
  }


  return {
    activeMealBuffsByCompanionId,
    preferencesByCompanionId,
  };
}

export function isCompanionHubEligibleForInnKitchen(
  state: GameState,
  companionId: string,
): boolean {
  const activeCompanion = state.entities[companionId];

  if (activeCompanion && isCompanionEntity(activeCompanion)) {
    return state.currentMapId === HUB_MAP_ID || state.currentMapId === HUB_TWO_MAP_ID;
  }

  const restingCompanion = state.restingCompanionsById?.[companionId];

  if (!restingCompanion) {
    return false;
  }

  const fieldParty = getGuildSecondaryPartiesState(state).parties.find((party) =>
    party.companionIds.includes(companionId),
  );

  return !fieldParty?.assignment;
}

function getCompanionById(state: GameState, companionId: string): Companion | null {
  const entity = state.entities[companionId];

  if (entity && isCompanionEntity(entity)) {
    return entity;
  }

  return state.restingCompanionsById?.[companionId] ?? null;
}

function getStoredInnKitchenMealBuff(
  state: GameState,
  companionId: string,
): InnKitchenMealBuffState | null {
  const buff = state.innKitchen?.activeMealBuffsByCompanionId?.[companionId];

  if (!isRecord(buff)) {
    return null;
  }

  if (
    typeof buff.recipeId !== "string" ||
    !(buff.recipeId in INN_KITCHEN_RECIPE_DEFINITIONS) ||
    !Number.isFinite(buff.cookedAtMs) ||
    !Number.isFinite(buff.expiresAtMs)
  ) {
    return null;
  }

  return {
    recipeId: buff.recipeId as InnKitchenRecipeId,
    cookedAtMs: Math.floor(buff.cookedAtMs as number),
    expiresAtMs: Math.floor(buff.expiresAtMs as number),
  };
}

function setInnKitchenPreference(
  state: GameState,
  companionId: string,
  preference: InnKitchenCompanionPreferenceState,
): GameState {
  const innKitchen = sanitizeInnKitchenState(state.innKitchen, state);

  return {
    ...state,
    innKitchen: {
      activeMealBuffsByCompanionId: innKitchen.activeMealBuffsByCompanionId,
      preferencesByCompanionId: {
        ...innKitchen.preferencesByCompanionId,
        [companionId]: preference,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
