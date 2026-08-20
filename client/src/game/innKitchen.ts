import { isCompanionEntity } from "./entityGuards";
import { HUB_MAP_ID, HUB_TWO_MAP_ID } from "./debugMap";
import { getRestingCompanions } from "./partySystem";
import { getGuildSecondaryPartiesState } from "./guildSecondaryParties";
import {
  getInnKitchenEfficientCookingDiscountPercent,
  getInnKitchenFireGenerationPerHour,
  getInnKitchenHearthCapacity,
} from "./innKitchenUpgrades";
import type { GameState } from "./state";
import type {
  Companion,
  InnKitchenAutoCookFailureState,
  InnKitchenCompanionPreferenceState,
  InnKitchenHearthFireState,
  InnKitchenMealBuffState,
  InnKitchenPantryState,
  InnKitchenRecipeId,
  InnKitchenState,
} from "./types";
import {
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";

export const INN_KITCHEN_HOUSE_BREAD_RECIPE_ID: InnKitchenRecipeId =
  "house_bread";
export const INN_KITCHEN_HOUSE_BREAD_COST_CROWNS = 30;
export const INN_KITCHEN_HOUSE_BREAD_COST_HEARTH_FIRE = 1;
export const INN_KITCHEN_HOUSE_BREAD_DURATION_MS = 3 * 60 * 60 * 1000;
export const INN_KITCHEN_HOUSE_BREAD_MAX_HEALTH_PERCENT = 5;
export const INN_KITCHEN_HEARTH_FIRE_TOOLTIP =
  "Burning, Burning with desire. This is used to heat Recipes.";
export const INN_KITCHEN_DEFAULT_AUTO_COOK_RENEW_THRESHOLD_PERCENT = 0;

export type InnKitchenRecipeIngredientCost = {
  ingredientId: string;
  quantity: number;
};

export type InnKitchenRecipeDefinition = {
  id: InnKitchenRecipeId;
  displayName: string;
  description: string;
  crownCost: number;
  hearthFireCost: number;
  ingredientCosts: InnKitchenRecipeIngredientCost[];
  durationMs: number;
  maxHealthPercent: number;
  tier: number;
};

export type InnKitchenCookFailureReason =
  | "invalid_recipe"
  | "missing_companion"
  | "insufficient_crowns"
  | "insufficient_hearth_fire";

export type InnKitchenRecipeEffectiveCost = {
  crownCost: number;
  hearthFireCost: number;
  ingredientCosts: InnKitchenRecipeIngredientCost[];
};

export type InnKitchenHearthFireDisplayState = InnKitchenHearthFireState & {
  capacity: number;
  generationPerHour: number;
  tooltip: string;
};

export type InnKitchenCookResult =
  | {
      ok: true;
      state: GameState;
      recipe: InnKitchenRecipeDefinition;
      companionId: string;
      buff: InnKitchenMealBuffState;
      cost: InnKitchenRecipeEffectiveCost;
    }
  | {
      ok: false;
      state: GameState;
      reason: InnKitchenCookFailureReason;
      missingCrowns?: number;
      missingHearthFire?: number;
      cost?: InnKitchenRecipeEffectiveCost;
    };

export type InnKitchenBulkCookResult =
  | {
      ok: true;
      state: GameState;
      companionIds: string[];
      totalCostCrowns: number;
      totalCostHearthFire: number;
    }
  | {
      ok: false;
      state: GameState;
      reason: InnKitchenCookFailureReason | "empty_target_list";
      missingCrowns?: number;
      missingHearthFire?: number;
      totalCostCrowns?: number;
      totalCostHearthFire?: number;
    };

export type InnKitchenAutoCookResult = {
  state: GameState;
  renewedCompanionIds: string[];
  disabledCompanionIds: string[];
  failedCompanionIds: string[];
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
    hearthFireCost: INN_KITCHEN_HOUSE_BREAD_COST_HEARTH_FIRE,
    ingredientCosts: [],
    durationMs: INN_KITCHEN_HOUSE_BREAD_DURATION_MS,
    maxHealthPercent: INN_KITCHEN_HOUSE_BREAD_MAX_HEALTH_PERCENT,
    tier: 1,
  },
};

export function createInitialInnKitchenState(): InnKitchenState {
  return {
    activeMealBuffsByCompanionId: {},
    preferencesByCompanionId: {},
    hearthFire: {
      current: 10,
      lastUpdatedAtMs: 0,
    },
    pantry: {
      unlockedIngredientIds: [],
      ingredientQuantitiesById: {},
    },
    autoCookFailuresByCompanionId: {},
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

export function getInnKitchenRecipeEffectiveCost(
  state: GameState,
  recipeId: InnKitchenRecipeId,
): InnKitchenRecipeEffectiveCost {
  const recipe = getInnKitchenRecipeDefinition(recipeId);
  const discountPercent = getInnKitchenEfficientCookingDiscountPercent(state);
  const multiplier = Math.max(0, 1 - discountPercent / 100);

  return {
    crownCost:
      recipe.crownCost > 0 ? Math.ceil(recipe.crownCost * multiplier) : 0,
    hearthFireCost:
      recipe.hearthFireCost > 0
        ? roundHearthFireCost(recipe.hearthFireCost * multiplier)
        : 0,
    ingredientCosts: recipe.ingredientCosts,
  };
}

export function getInnKitchenHearthFireDisplayState(
  state: GameState,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenHearthFireDisplayState {
  const settled = settleInnKitchenHearthFire(state, nowMs);
  const hearthFire = settled.innKitchen?.hearthFire ??
    createInitialInnKitchenState().hearthFire;

  return {
    ...hearthFire,
    capacity: getInnKitchenHearthCapacity(settled),
    generationPerHour: getInnKitchenFireGenerationPerHour(settled),
    tooltip: INN_KITCHEN_HEARTH_FIRE_TOOLTIP,
  };
}

export function settleInnKitchenHearthFire(
  state: GameState,
  nowMs = state.simulationTimeMs ?? Date.now(),
): GameState {
  const innKitchen = sanitizeInnKitchenState(state.innKitchen, state, nowMs);

  return {
    ...state,
    innKitchen,
  };
}

export function cookInnMealForCompanion(
  state: GameState,
  companionId: string,
  recipeId: InnKitchenRecipeId,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenCookResult {
  const settledState = settleInnKitchenHearthFire(state, nowMs);
  const recipe = INN_KITCHEN_RECIPE_DEFINITIONS[recipeId];

  if (!recipe) {
    return {
      ok: false,
      state: settledState,
      reason: "invalid_recipe",
    };
  }

  if (!getCompanionById(settledState, companionId)) {
    return {
      ok: false,
      state: settledState,
      reason: "missing_companion",
    };
  }

  const cost = getInnKitchenRecipeEffectiveCost(settledState, recipeId);
  const missingCrowns = getMissingCrowns(settledState, cost.crownCost);
  const missingHearthFire = getMissingHearthFire(
    settledState,
    cost.hearthFireCost,
  );

  if (missingCrowns > 0 || missingHearthFire > 0) {
    return {
      ok: false,
      state: settledState,
      reason: missingCrowns > 0 ? "insufficient_crowns" : "insufficient_hearth_fire",
      missingCrowns,
      missingHearthFire,
      cost,
    };
  }

  const payment =
    cost.crownCost > 0
      ? removeCurrencyFromWalletState(
          settledState,
          "crowns",
          cost.crownCost,
          "inn_kitchen",
        )
      : { state: settledState };
  const firePayment = removeHearthFireFromKitchenState(
    payment.state,
    cost.hearthFireCost,
    nowMs,
  );
  const buff: InnKitchenMealBuffState = {
    recipeId,
    cookedAtMs: nowMs,
    expiresAtMs: nowMs + recipe.durationMs,
  };
  const innKitchen = sanitizeInnKitchenState(
    firePayment.state.innKitchen,
    firePayment.state,
    nowMs,
  );
  const autoCookFailuresByCompanionId = {
    ...innKitchen.autoCookFailuresByCompanionId,
  };
  delete autoCookFailuresByCompanionId[companionId];

  return {
    ok: true,
    state: {
      ...firePayment.state,
      innKitchen: {
        activeMealBuffsByCompanionId: {
          ...innKitchen.activeMealBuffsByCompanionId,
          [companionId]: buff,
        },
        preferencesByCompanionId: innKitchen.preferencesByCompanionId,
        hearthFire: innKitchen.hearthFire,
        pantry: innKitchen.pantry,
        autoCookFailuresByCompanionId,
      },
    },
    recipe,
    companionId,
    buff,
    cost,
  };
}

export function bulkCookInnMealsForCompanions(
  state: GameState,
  companionIds: string[],
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenBulkCookResult {
  const settledState = settleInnKitchenHearthFire(state, nowMs);
  const uniqueCompanionIds = Array.from(new Set(companionIds));

  if (uniqueCompanionIds.length <= 0) {
    return {
      ok: false,
      state: settledState,
      reason: "empty_target_list",
    };
  }

  const recipes = uniqueCompanionIds.map((companionId) => {
    const companion = getCompanionById(settledState, companionId);

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
      state: settledState,
      reason: "missing_companion",
    };
  }

  const costs = recipes.map((recipe) =>
    recipe ? getInnKitchenRecipeEffectiveCost(settledState, recipe.id) : null,
  );
  const totalCostCrowns = costs.reduce(
    (totalCost, cost) => totalCost + (cost?.crownCost ?? 0),
    0,
  );
  const totalCostHearthFire = roundHearthFireCost(
    costs.reduce(
      (totalCost, cost) => totalCost + (cost?.hearthFireCost ?? 0),
      0,
    ),
  );
  const missingCrowns = getMissingCrowns(settledState, totalCostCrowns);
  const missingHearthFire = getMissingHearthFire(
    settledState,
    totalCostHearthFire,
  );

  if (missingCrowns > 0 || missingHearthFire > 0) {
    return {
      ok: false,
      state: settledState,
      reason: missingCrowns > 0 ? "insufficient_crowns" : "insufficient_hearth_fire",
      missingCrowns,
      missingHearthFire,
      totalCostCrowns,
      totalCostHearthFire,
    };
  }

  const payment =
    totalCostCrowns > 0
      ? removeCurrencyFromWalletState(
          settledState,
          "crowns",
          totalCostCrowns,
          "inn_kitchen",
        )
      : { state: settledState };
  const firePayment = removeHearthFireFromKitchenState(
    payment.state,
    totalCostHearthFire,
    nowMs,
  );
  const innKitchen = sanitizeInnKitchenState(
    firePayment.state.innKitchen,
    firePayment.state,
    nowMs,
  );
  const activeMealBuffsByCompanionId = {
    ...innKitchen.activeMealBuffsByCompanionId,
  };
  const autoCookFailuresByCompanionId = {
    ...innKitchen.autoCookFailuresByCompanionId,
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
    delete autoCookFailuresByCompanionId[companionId];
  });

  return {
    ok: true,
    state: {
      ...firePayment.state,
      innKitchen: {
        activeMealBuffsByCompanionId,
        preferencesByCompanionId: innKitchen.preferencesByCompanionId,
        hearthFire: innKitchen.hearthFire,
        pantry: innKitchen.pantry,
        autoCookFailuresByCompanionId,
      },
    },
    companionIds: uniqueCompanionIds,
    totalCostCrowns,
    totalCostHearthFire,
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
      autoCookRenewThresholdPercent:
        INN_KITCHEN_DEFAULT_AUTO_COOK_RENEW_THRESHOLD_PERCENT,
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

export function setInnKitchenAutoCookRenewThresholdPercent(
  state: GameState,
  companionId: string,
  autoCookRenewThresholdPercent: number,
): GameState {
  if (!getCompanionById(state, companionId)) {
    return state;
  }

  return setInnKitchenPreference(state, companionId, {
    ...getInnKitchenPreference(state, companionId),
    autoCookRenewThresholdPercent: sanitizePercent(
      autoCookRenewThresholdPercent,
      INN_KITCHEN_DEFAULT_AUTO_COOK_RENEW_THRESHOLD_PERCENT,
    ),
  });
}

export function processInnKitchenAutoCook(
  state: GameState,
  nowMs = state.simulationTimeMs ?? Date.now(),
): InnKitchenAutoCookResult {
  let nextState: GameState = settleInnKitchenHearthFire(state, nowMs);
  const renewedCompanionIds: string[] = [];
  const disabledCompanionIds: string[] = [];
  const failedCompanionIds: string[] = [];
  const preferences = Object.entries(
    sanitizeInnKitchenState(nextState.innKitchen, nextState, nowMs)
      .preferencesByCompanionId,
  ).sort(([firstId], [secondId]) => firstId.localeCompare(secondId));

  for (const [companionId, preference] of preferences) {
    const storedBuff = getStoredInnKitchenMealBuff(nextState, companionId);
    const recipe = getInnKitchenRecipeDefinition(preference.selectedRecipeId);

    if (
      !preference.autoCookEnabled ||
      !isCompanionHubEligibleForInnKitchen(nextState, companionId) ||
      !shouldRenewInnKitchenMeal(storedBuff, recipe, preference, nowMs)
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

    if (
      cooked.reason === "insufficient_crowns" ||
      cooked.reason === "insufficient_hearth_fire"
    ) {
      nextState = setInnKitchenAutoCookFailure(cooked.state, companionId, {
        recipeId: preference.selectedRecipeId,
        failedAtMs: nowMs,
        missingCrowns: cooked.missingCrowns ?? 0,
        missingHearthFire: cooked.missingHearthFire ?? 0,
      });
      failedCompanionIds.push(companionId);
    } else {
      nextState = cooked.state;
    }
  }

  return {
    state: nextState,
    renewedCompanionIds,
    disabledCompanionIds,
    failedCompanionIds,
  };
}

export function getInnKitchenAutoCookFailure(
  state: GameState,
  companionId: string,
): InnKitchenAutoCookFailureState | null {
  return (
    sanitizeInnKitchenState(state.innKitchen, state)
      .autoCookFailuresByCompanionId[companionId] ?? null
  );
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
  options: { settleHearthFire?: boolean } = {},
): InnKitchenState {
  if (!isRecord(innKitchen)) {
    const initialState = createInitialInnKitchenState();

    return options.settleHearthFire === false
      ? initialState
      : settleSanitizedInnKitchenState(initialState, state, nowMs);
  }

  const rawBuffs = innKitchen.activeMealBuffsByCompanionId;
  const rawPreferences = innKitchen.preferencesByCompanionId;
  const rawHearthFire = innKitchen.hearthFire;
  const rawPantry = innKitchen.pantry;
  const rawFailures = innKitchen.autoCookFailuresByCompanionId;

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
  const autoCookFailuresByCompanionId: Record<
    string,
    InnKitchenAutoCookFailureState
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
        autoCookRenewThresholdPercent: sanitizePercent(
          rawPreference.autoCookRenewThresholdPercent,
          INN_KITCHEN_DEFAULT_AUTO_COOK_RENEW_THRESHOLD_PERCENT,
        ),
      };
    }
  }

  if (isRecord(rawFailures)) {
    for (const [companionId, rawFailure] of Object.entries(rawFailures)) {
      if (!validCompanionIds.has(companionId) || !isRecord(rawFailure)) {
        continue;
      }

      const recipeId = rawFailure.recipeId;
      const failedAtMs = rawFailure.failedAtMs;

      if (
        typeof recipeId !== "string" ||
        !(recipeId in INN_KITCHEN_RECIPE_DEFINITIONS) ||
        !Number.isFinite(failedAtMs)
      ) {
        continue;
      }

      autoCookFailuresByCompanionId[companionId] = {
        recipeId: recipeId as InnKitchenRecipeId,
        failedAtMs: Math.floor(failedAtMs as number),
        missingCrowns: sanitizeNonNegativeNumber(rawFailure.missingCrowns),
        missingHearthFire: sanitizeNonNegativeNumber(
          rawFailure.missingHearthFire,
        ),
      };
    }
  }

  const sanitizedState = {
    activeMealBuffsByCompanionId,
    preferencesByCompanionId,
    hearthFire: sanitizeInnKitchenHearthFireState(rawHearthFire, state, nowMs),
    pantry: sanitizeInnKitchenPantryState(rawPantry),
    autoCookFailuresByCompanionId,
  };

  return options.settleHearthFire === false
    ? sanitizedState
    : settleSanitizedInnKitchenState(sanitizedState, state, nowMs);
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
      hearthFire: innKitchen.hearthFire,
      pantry: innKitchen.pantry,
      autoCookFailuresByCompanionId: innKitchen.autoCookFailuresByCompanionId,
    },
  };
}

function setInnKitchenAutoCookFailure(
  state: GameState,
  companionId: string,
  failure: InnKitchenAutoCookFailureState,
): GameState {
  const innKitchen = sanitizeInnKitchenState(state.innKitchen, state);

  return {
    ...state,
    innKitchen: {
      ...innKitchen,
      autoCookFailuresByCompanionId: {
        ...innKitchen.autoCookFailuresByCompanionId,
        [companionId]: failure,
      },
    },
  };
}

function removeHearthFireFromKitchenState(
  state: GameState,
  amount: number,
  nowMs: number,
): { state: GameState; ok: boolean } {
  const settledState = settleInnKitchenHearthFire(state, nowMs);
  const innKitchen = sanitizeInnKitchenState(
    settledState.innKitchen,
    settledState,
    nowMs,
  );

  if (amount <= 0) {
    return {
      state: settledState,
      ok: true,
    };
  }

  if (innKitchen.hearthFire.current + 0.0001 < amount) {
    return {
      state: settledState,
      ok: false,
    };
  }

  return {
    state: {
      ...settledState,
      innKitchen: {
        ...innKitchen,
        hearthFire: {
          current: roundHearthFireAmount(innKitchen.hearthFire.current - amount),
          lastUpdatedAtMs: nowMs,
        },
      },
    },
    ok: true,
  };
}

function settleSanitizedInnKitchenState(
  innKitchen: InnKitchenState,
  state: GameState,
  nowMs: number,
): InnKitchenState {
  const capacity = getInnKitchenHearthCapacity({
    ...state,
    innKitchen,
  });
  const generationPerHour = getInnKitchenFireGenerationPerHour({
    ...state,
    innKitchen,
  });
  const elapsedMs = Math.max(0, nowMs - innKitchen.hearthFire.lastUpdatedAtMs);
  const regeneratedAmount = (elapsedMs / 3_600_000) * generationPerHour;
  const current = Math.min(
    capacity,
    innKitchen.hearthFire.current + regeneratedAmount,
  );
  const lastUpdatedAtMs =
    nowMs >= innKitchen.hearthFire.lastUpdatedAtMs
      ? nowMs
      : innKitchen.hearthFire.lastUpdatedAtMs;

  return {
    ...innKitchen,
    hearthFire: {
      current: roundHearthFireAmount(current),
      lastUpdatedAtMs,
    },
  };
}

function sanitizeInnKitchenHearthFireState(
  rawHearthFire: unknown,
  state: GameState,
  nowMs: number,
): InnKitchenHearthFireState {
  const capacity = getInnKitchenHearthCapacity(state);

  if (!isRecord(rawHearthFire)) {
    return {
      current: capacity,
      lastUpdatedAtMs: nowMs,
    };
  }

  return {
    current: Math.min(
      capacity,
      roundHearthFireAmount(
        sanitizeNonNegativeNumber(rawHearthFire.current, capacity),
      ),
    ),
    lastUpdatedAtMs: Number.isFinite(rawHearthFire.lastUpdatedAtMs)
      ? Math.floor(rawHearthFire.lastUpdatedAtMs as number)
      : nowMs,
  };
}

function sanitizeInnKitchenPantryState(rawPantry: unknown): InnKitchenPantryState {
  if (!isRecord(rawPantry)) {
    return {
      unlockedIngredientIds: [],
      ingredientQuantitiesById: {},
    };
  }

  const unlockedIngredientIds = Array.isArray(rawPantry.unlockedIngredientIds)
    ? Array.from(
        new Set(
          rawPantry.unlockedIngredientIds.filter(
            (ingredientId): ingredientId is string =>
              typeof ingredientId === "string" && ingredientId.length > 0,
          ),
        ),
      )
    : [];
  const ingredientQuantitiesById: Record<string, number> = {};

  if (isRecord(rawPantry.ingredientQuantitiesById)) {
    for (const [ingredientId, quantity] of Object.entries(
      rawPantry.ingredientQuantitiesById,
    )) {
      if (typeof ingredientId !== "string" || ingredientId.length <= 0) {
        continue;
      }

      ingredientQuantitiesById[ingredientId] = sanitizeNonNegativeNumber(quantity);
    }
  }

  return {
    unlockedIngredientIds,
    ingredientQuantitiesById,
  };
}

function shouldRenewInnKitchenMeal(
  buff: InnKitchenMealBuffState | null,
  recipe: InnKitchenRecipeDefinition,
  preference: InnKitchenCompanionPreferenceState,
  nowMs: number,
): boolean {
  if (!buff || buff.expiresAtMs <= nowMs) {
    return true;
  }

  const thresholdPercent = sanitizePercent(
    preference.autoCookRenewThresholdPercent,
    INN_KITCHEN_DEFAULT_AUTO_COOK_RENEW_THRESHOLD_PERCENT,
  );
  const remainingMs = Math.max(0, buff.expiresAtMs - nowMs);
  const thresholdMs = recipe.durationMs * (thresholdPercent / 100);

  return remainingMs <= thresholdMs;
}

function getMissingCrowns(state: GameState, costCrowns: number): number {
  return Math.max(0, costCrowns - getCurrencyBalance(state.wallet, "crowns"));
}

function getMissingHearthFire(
  state: GameState,
  costHearthFire: number,
): number {
  const current = state.innKitchen?.hearthFire.current ?? 0;

  return roundHearthFireCost(Math.max(0, costHearthFire - current));
}

function roundHearthFireAmount(value: number): number {
  return Math.max(0, Math.floor((value + 0.0001) * 10) / 10);
}

function roundHearthFireCost(value: number): number {
  return Math.max(0, Math.ceil((value - 0.0001) * 10) / 10);
}

function sanitizePercent(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.floor(value)))
    : fallback;
}

function sanitizeNonNegativeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
