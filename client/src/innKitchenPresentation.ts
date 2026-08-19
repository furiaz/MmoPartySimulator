import {
  getActiveCompanions,
  getActiveInnKitchenMealBuff,
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartiesState,
  getInnKitchenPreference,
  getInnKitchenRecipeDefinition,
  getRestingCompanions,
  isCompanionHubEligibleForInnKitchen,
  type Companion,
  type GameState,
  type InnKitchenMealBuffState,
  type InnKitchenRecipeDefinition,
  type InnKitchenRecipeId,
} from "./game";

export type InnKitchenCompanionRow = {
  companion: Companion;
  locationLabel: string;
  badgeText: string | null;
  activeMeal: InnKitchenMealBuffState | null;
  selectedRecipeId: InnKitchenRecipeId;
  autoCookEnabled: boolean;
  isHubEligible: boolean;
};

export type InnKitchenBulkCookGroup = {
  id: string;
  label: string;
  companionIds: string[];
  isAssigned: boolean;
};

export type InnKitchenRecipeDisplay = {
  recipe: InnKitchenRecipeDefinition;
  costText: string;
  ingredientText: string;
  durationText: string;
  effectText: string;
};

export function getInnKitchenCompanionRows(
  state: GameState,
  nowMs: number,
): InnKitchenCompanionRow[] {
  const seenCompanionIds = new Set<string>();
  const activeRows = getActiveCompanions(state)
    .sort(compareCompanionsByPartyOrder)
    .map((companion) =>
      createRow(state, companion, "Main Party", "\u2605", nowMs),
    );

  for (const row of activeRows) {
    seenCompanionIds.add(row.companion.id);
  }

  const restingCompanionsById = Object.fromEntries(
    getRestingCompanions(state).map((companion) => [companion.id, companion]),
  );
  const fieldTeamRows = getGuildSecondaryPartiesState(state).parties.flatMap(
    (party, partyIndex) => {
      const teamNumber = partyIndex + 1;
      const locationLabel = party.assignment
        ? `Dispatched - ${party.displayName}`
        : party.displayName;

      return party.companionIds
        .filter((companionId): companionId is string => Boolean(companionId))
        .map((companionId) => restingCompanionsById[companionId] ?? null)
        .filter((companion): companion is Companion => Boolean(companion))
        .map((companion) => {
          seenCompanionIds.add(companion.id);
          return createRow(state, companion, locationLabel, String(teamNumber), nowMs);
        });
    },
  );
  const remainingRows = getRestingCompanions(state)
    .filter((companion) => !seenCompanionIds.has(companion.id))
    .sort(compareCompanionsByPartyOrder)
    .map((companion) =>
      createRow(state, companion, "Inn's Reserve", null, nowMs),
    );

  return [...activeRows, ...fieldTeamRows, ...remainingRows];
}

export function getInnKitchenBulkCookGroups(
  state: GameState,
): InnKitchenBulkCookGroup[] {
  const activeCompanionIds = getActiveCompanions(state)
    .sort(compareCompanionsByPartyOrder)
    .map((companion) => companion.id);
  const unlockedPartyCount = getGuildSecondaryPartyCount(state);
  const fieldTeamGroups = getGuildSecondaryPartiesState(state).parties
    .slice(0, unlockedPartyCount)
    .map((party, index) => ({
      id: party.id,
      label: `Cook FT${index + 1}`,
      companionIds: party.companionIds.filter(
        (companionId): companionId is string => Boolean(companionId),
      ),
      isAssigned: Boolean(party.assignment),
    }))
    .filter((group) => group.companionIds.length > 0);

  return [
    {
      id: "main",
      label: "Cook Main",
      companionIds: activeCompanionIds,
      isAssigned: false,
    },
    ...fieldTeamGroups,
  ].filter((group) => group.companionIds.length > 0);
}

export function getInnKitchenRecipeDisplay(
  recipeId: InnKitchenRecipeId,
): InnKitchenRecipeDisplay {
  const recipe = getInnKitchenRecipeDefinition(recipeId);

  return {
    recipe,
    costText: `${recipe.crownCost} Crowns`,
    ingredientText: recipe.ingredientText,
    durationText: formatInnKitchenDuration(recipe.durationMs),
    effectText: `Max HP +${recipe.maxHealthPercent}%`,
  };
}

export function formatInnKitchenDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function createRow(
  state: GameState,
  companion: Companion,
  locationLabel: string,
  badgeText: string | null,
  nowMs: number,
): InnKitchenCompanionRow {
  return {
    companion,
    locationLabel,
    badgeText,
    activeMeal: getActiveInnKitchenMealBuff(state, companion.id, nowMs),
    selectedRecipeId: getInnKitchenPreference(state, companion.id).selectedRecipeId,
    autoCookEnabled: getInnKitchenPreference(state, companion.id).autoCookEnabled,
    isHubEligible: isCompanionHubEligibleForInnKitchen(state, companion.id),
  };
}

function compareCompanionsByPartyOrder(a: Companion, b: Companion): number {
  return a.partyOrder - b.partyOrder || a.id.localeCompare(b.id);
}
