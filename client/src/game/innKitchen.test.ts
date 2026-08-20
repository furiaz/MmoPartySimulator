import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  INN_KITCHEN_HOUSE_BREAD_COST_CROWNS,
  INN_KITCHEN_HOUSE_BREAD_COST_HEARTH_FIRE,
  INN_KITCHEN_HOUSE_BREAD_DURATION_MS,
  INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
  bulkCookInnMealsForCompanions,
  cookInnMealForCompanion,
  createInitialInnKitchenState,
  getActiveInnKitchenMealBuff,
  getInnKitchenAutoCookFailure,
  getInnKitchenHearthFireDisplayState,
  getInnKitchenPreference,
  getInnKitchenRecipes,
  processInnKitchenAutoCook,
  sanitizeInnKitchenState,
  setInnKitchenAutoCookEnabled,
  setInnKitchenAutoCookRenewThresholdPercent,
  setInnKitchenSelectedRecipe,
} from "./innKitchen";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import { createInitialGuildSecondaryPartiesState } from "./guildSecondaryParties";
import { createTestGameState } from "./testState";
import { getCompanionDerivedStatsWithPartyBuffs } from "./stats";
import type { GameState } from "./state";
import type { Companion } from "./types";
import { HUB_MAP_ID, MAP_ONE_ID } from "./debugMap";
import { addCurrencyToWalletState, getCurrencyBalance } from "./wallet";

const NOW_MS = 10_000;

describe("Inn Kitchen", () => {
  it("starts with no active meals and exposes House Bread", () => {
    const state = createTestGameState();

    expect(createInitialInnKitchenState()).toEqual({
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
    });
    expect(getInnKitchenRecipes()).toEqual([
      expect.objectContaining({
        id: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        displayName: "House Bread",
        crownCost: INN_KITCHEN_HOUSE_BREAD_COST_CROWNS,
        hearthFireCost: INN_KITCHEN_HOUSE_BREAD_COST_HEARTH_FIRE,
        ingredientCosts: [],
      }),
    ]);
    expect(state.innKitchen).toEqual(createInitialInnKitchenState());
  });

  it("saves selected recipe and auto-cook preferences per companion", () => {
    const companion = createKitchenCompanion("first", 0);
    const selected = setInnKitchenSelectedRecipe(
      createKitchenState([companion]),
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
    );
    const toggled = setInnKitchenAutoCookEnabled(selected, companion.id, true);

    expect(getInnKitchenPreference(toggled, companion.id)).toEqual({
      selectedRecipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      autoCookEnabled: true,
      autoCookRenewThresholdPercent: 0,
    });
  });

  it("cooks House Bread for only the selected companion and charges Crowns and Fire", () => {
    const first = createKitchenCompanion("first", 0);
    const second = createKitchenCompanion("second", 1);
    const state = withCrowns(createKitchenState([first, second]), 100);

    const result = cookInnMealForCompanion(
      state,
      first.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );

    expect(result.ok).toBe(true);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(70);
    expect(result.state.innKitchen?.hearthFire.current).toBe(9);
    expect(getActiveInnKitchenMealBuff(result.state, first.id, NOW_MS)).toEqual(
      expect.objectContaining({
        recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        cookedAtMs: NOW_MS,
        expiresAtMs: NOW_MS + INN_KITCHEN_HOUSE_BREAD_DURATION_MS,
      }),
    );
    expect(getActiveInnKitchenMealBuff(result.state, second.id, NOW_MS)).toBeNull();
  });

  it("blocks cooking when Crowns are insufficient", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = withCrowns(createKitchenState([companion]), 29);

    const result = cookInnMealForCompanion(
      state,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
    });
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(29);
    expect(getActiveInnKitchenMealBuff(result.state, companion.id, NOW_MS)).toBeNull();
    expect(result.state.innKitchen?.hearthFire.current).toBe(10);
  });

  it("refreshes the timer when the same recipe is cooked again", () => {
    const companion = createKitchenCompanion("first", 0);
    const firstCook = cookInnMealForCompanion(
      withCrowns(createKitchenState([companion]), 100),
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(firstCook.ok).toBe(true);

    const secondCook = cookInnMealForCompanion(
      firstCook.state,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS + 5_000,
    );

    expect(secondCook.ok).toBe(true);
    expect(getActiveInnKitchenMealBuff(secondCook.state, companion.id, NOW_MS + 5_000)).toEqual(
      expect.objectContaining({
        cookedAtMs: NOW_MS + 5_000,
        expiresAtMs: NOW_MS + 5_000 + INN_KITCHEN_HOUSE_BREAD_DURATION_MS,
      }),
    );
  });

  it("cleans expired meals safely", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = {
      ...createKitchenState([companion]),
      innKitchen: {
        activeMealBuffsByCompanionId: {
          [companion.id]: {
            recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
            cookedAtMs: NOW_MS,
            expiresAtMs: NOW_MS + 1,
          },
        },
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
      },
    };

    expect(getActiveInnKitchenMealBuff(state, companion.id, NOW_MS + 2)).toBeNull();
    expect(
      sanitizeInnKitchenState(state.innKitchen, state, NOW_MS + 2)
        .activeMealBuffsByCompanionId,
    ).toEqual({});
  });

  it("increases only the selected companion's state-aware max HP", () => {
    const first = createKitchenCompanion("first", 0);
    const second = createKitchenCompanion("second", 1);
    const state = withCrowns(createKitchenState([first, second]), 100);
    const firstBaseMaxHealth = getCompanionDerivedStatsWithPartyBuffs(
      state,
      first,
    ).maxHealth;
    const secondBaseMaxHealth = getCompanionDerivedStatsWithPartyBuffs(
      state,
      second,
    ).maxHealth;

    const result = cookInnMealForCompanion(
      state,
      first.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(result.ok).toBe(true);

    expect(
      getCompanionDerivedStatsWithPartyBuffs(result.state, first).maxHealth,
    ).toBeGreaterThan(firstBaseMaxHealth);
    expect(
      getCompanionDerivedStatsWithPartyBuffs(result.state, second).maxHealth,
    ).toBe(secondBaseMaxHealth);
  });

  it("does not touch old equipped food or consumable food buffs", () => {
    const companion = {
      ...createKitchenCompanion("first", 0),
      consumables: {
        ...createKitchenCompanion("first", 0).consumables,
        foodItemId: "hearty_trail_rations",
      },
      consumableBuffs: {
        ...createKitchenCompanion("first", 0).consumableBuffs,
        food: {
          itemId: "hearty_trail_rations",
          kind: "food",
          expiresAt: 100_000,
          primaryStatModifiers: { constitution: 1 },
          statModifiers: {},
        },
      },
    } satisfies Companion;
    const state = withCrowns(createKitchenState([companion]), 100);

    const result = cookInnMealForCompanion(
      state,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );

    expect(result.ok).toBe(true);
    expect((result.state.entities[companion.id] as Companion).consumables).toEqual(
      companion.consumables,
    );
    expect(
      (result.state.entities[companion.id] as Companion).consumableBuffs,
    ).toEqual(companion.consumableBuffs);
  });

  it("auto-cooks expired meals for eligible hub companions", () => {
    const companion = createKitchenCompanion("first", 0);
    const cooked = cookInnMealForCompanion(
      withCrowns(createKitchenState([companion], HUB_MAP_ID), 100),
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(cooked.ok).toBe(true);
    const state = setInnKitchenAutoCookEnabled(cooked.state, companion.id, true);
    const renewAtMs = NOW_MS + INN_KITCHEN_HOUSE_BREAD_DURATION_MS + 1;

    const result = processInnKitchenAutoCook(state, renewAtMs);

    expect(result.renewedCompanionIds).toEqual([companion.id]);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(40);
    expect(
      getActiveInnKitchenMealBuff(result.state, companion.id, renewAtMs),
    ).toMatchObject({
      recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      cookedAtMs: renewAtMs,
    });
  });

  it("auto-cooks companions with no active meal when enabled and eligible", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = setInnKitchenAutoCookEnabled(
      withCrowns(createKitchenState([companion], HUB_MAP_ID), 100),
      companion.id,
      true,
    );

    const result = processInnKitchenAutoCook(state, NOW_MS + 1);

    expect(result.renewedCompanionIds).toEqual([companion.id]);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(70);
    expect(
      getActiveInnKitchenMealBuff(result.state, companion.id, NOW_MS + 1),
    ).not.toBeNull();
  });

  it("does not auto-cook active party companions outside hubs", () => {
    const companion = createKitchenCompanion("first", 0);
    const cooked = cookInnMealForCompanion(
      withCrowns(createKitchenState([companion], MAP_ONE_ID), 100),
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(cooked.ok).toBe(true);
    const state = setInnKitchenAutoCookEnabled(cooked.state, companion.id, true);
    const renewAtMs = NOW_MS + INN_KITCHEN_HOUSE_BREAD_DURATION_MS + 1;

    const result = processInnKitchenAutoCook(state, renewAtMs);

    expect(result.renewedCompanionIds).toEqual([]);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(70);
    expect(getActiveInnKitchenMealBuff(result.state, companion.id, renewAtMs)).toBeNull();
  });

  it("does not auto-cook assigned Field Team companions", () => {
    const companion = createKitchenCompanion("field", 0);
    const guildUpgrades = createInitialGuildUpgradesState();
    guildUpgrades.secondaryParties.secondary_party_count = 1;
    const guildSecondaryParties = createInitialGuildSecondaryPartiesState();
    guildSecondaryParties.parties[0].companionIds[0] = companion.id;
    guildSecondaryParties.parties[0].assignment = createAssignment();
    const cooked = cookInnMealForCompanion(
      withCrowns(
        createTestGameState({
          entities: {},
          restingCompanionsById: {
            [companion.id]: companion,
          },
          partyLeaderId: "",
          currentMapId: HUB_MAP_ID,
          simulationTimeMs: NOW_MS,
          guildUpgrades,
          guildSecondaryParties,
        }),
        100,
      ),
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(cooked.ok).toBe(true);
    const state = setInnKitchenAutoCookEnabled(cooked.state, companion.id, true);
    const renewAtMs = NOW_MS + INN_KITCHEN_HOUSE_BREAD_DURATION_MS + 1;

    const result = processInnKitchenAutoCook(state, renewAtMs);

    expect(result.renewedCompanionIds).toEqual([]);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(70);
  });

  it("keeps auto-cook on and records failure when renewal cannot be paid", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = {
      ...setInnKitchenAutoCookEnabled(
        withCrowns(createKitchenState([companion], HUB_MAP_ID), 29),
        companion.id,
        true,
      ),
      innKitchen: {
        activeMealBuffsByCompanionId: {
          [companion.id]: {
            recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
            cookedAtMs: NOW_MS - INN_KITCHEN_HOUSE_BREAD_DURATION_MS - 1,
            expiresAtMs: NOW_MS - 1,
          },
        },
        preferencesByCompanionId: {
          [companion.id]: {
            selectedRecipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
            autoCookEnabled: true,
            autoCookRenewThresholdPercent: 0,
          },
        },
        hearthFire: {
          current: 10,
          lastUpdatedAtMs: NOW_MS,
        },
        pantry: {
          unlockedIngredientIds: [],
          ingredientQuantitiesById: {},
        },
        autoCookFailuresByCompanionId: {},
      },
    };

    const result = processInnKitchenAutoCook(state, NOW_MS + 1);

    expect(result.disabledCompanionIds).toEqual([]);
    expect(result.failedCompanionIds).toEqual([companion.id]);
    expect(getInnKitchenPreference(result.state, companion.id).autoCookEnabled).toBe(
      true,
    );
    expect(getInnKitchenAutoCookFailure(result.state, companion.id)).toMatchObject({
      missingCrowns: 1,
      missingHearthFire: 0,
    });
    expect(getActiveInnKitchenMealBuff(result.state, companion.id, NOW_MS + 1)).toBeNull();
  });

  it("bulk cooks each selected companion all-or-nothing", () => {
    const first = createKitchenCompanion("first", 0);
    const second = createKitchenCompanion("second", 1);
    const state = withCrowns(createKitchenState([first, second]), 60);

    const result = bulkCookInnMealsForCompanions(
      state,
      [first.id, second.id],
      NOW_MS,
    );

    expect(result.ok).toBe(true);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(0);
    expect(result.state.innKitchen?.hearthFire.current).toBe(8);
    expect(getActiveInnKitchenMealBuff(result.state, first.id, NOW_MS)).not.toBeNull();
    expect(getActiveInnKitchenMealBuff(result.state, second.id, NOW_MS)).not.toBeNull();
  });

  it("bulk cooking reports missing Crowns without mutating meals", () => {
    const first = createKitchenCompanion("first", 0);
    const second = createKitchenCompanion("second", 1);
    const state = withCrowns(createKitchenState([first, second]), 59);

    const result = bulkCookInnMealsForCompanions(
      state,
      [first.id, second.id],
      NOW_MS,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
      missingCrowns: 1,
    });
    expect(getActiveInnKitchenMealBuff(result.state, first.id, NOW_MS)).toBeNull();
    expect(getActiveInnKitchenMealBuff(result.state, second.id, NOW_MS)).toBeNull();
  });

  it("regenerates Hearth's Fire over elapsed time", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = {
      ...createKitchenState([companion]),
      innKitchen: {
        ...createInitialInnKitchenState(),
        hearthFire: {
          current: 0,
          lastUpdatedAtMs: NOW_MS,
        },
      },
    };

    expect(
      getInnKitchenHearthFireDisplayState(state, NOW_MS + 90 * 60_000),
    ).toMatchObject({
      current: 3,
      capacity: 10,
      generationPerHour: 2,
    });
  });

  it("blocks cooking when Hearth's Fire is insufficient", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = {
      ...withCrowns(createKitchenState([companion]), 100),
      innKitchen: {
        ...createInitialInnKitchenState(),
        hearthFire: {
          current: 0.5,
          lastUpdatedAtMs: NOW_MS,
        },
      },
    };

    const result = cookInnMealForCompanion(
      state,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "insufficient_hearth_fire",
      missingHearthFire: 0.5,
    });
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(100);
  });

  it("efficient cooking discounts Crowns and Hearth's Fire", () => {
    const companion = createKitchenCompanion("first", 0);
    const state = {
      ...withCrowns(createKitchenState([companion]), 100),
      innUpgrades: {
        rooms: { inn_room_count: 1 },
        kitchen: {
          hearth_capacity: 1,
          fire_generation: 1,
          hearth_tier: 1,
          efficient_cooking: 3,
        },
      },
    };

    const result = cookInnMealForCompanion(
      state,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );

    expect(result).toMatchObject({
      ok: true,
      cost: {
        crownCost: 26,
        hearthFireCost: 0.9,
      },
    });
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(74);
    expect(result.state.innKitchen?.hearthFire.current).toBe(9.1);
  });

  it("auto-cooks before expiry when threshold is reached", () => {
    const companion = createKitchenCompanion("first", 0);
    const cooked = cookInnMealForCompanion(
      withCrowns(createKitchenState([companion], HUB_MAP_ID), 100),
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(cooked.ok).toBe(true);
    const state = setInnKitchenAutoCookRenewThresholdPercent(
      setInnKitchenAutoCookEnabled(cooked.state, companion.id, true),
      companion.id,
      50,
    );
    const renewAtMs = NOW_MS + INN_KITCHEN_HOUSE_BREAD_DURATION_MS / 2;

    const result = processInnKitchenAutoCook(state, renewAtMs);

    expect(result.renewedCompanionIds).toEqual([companion.id]);
    expect(
      getActiveInnKitchenMealBuff(result.state, companion.id, renewAtMs),
    ).toMatchObject({
      cookedAtMs: renewAtMs,
    });
  });

  it("does not move Hearth's Fire timestamps backwards during preference updates", () => {
    const companion = createKitchenCompanion("first", 0);
    const state: GameState = {
      ...createKitchenState([companion]),
      simulationTimeMs: 0,
      innKitchen: {
        ...createInitialInnKitchenState(),
        hearthFire: {
          current: 4,
          lastUpdatedAtMs: NOW_MS,
        },
      },
    };

    const updated = setInnKitchenSelectedRecipe(
      state,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
    );

    expect(updated.innKitchen?.hearthFire).toEqual({
      current: 4,
      lastUpdatedAtMs: NOW_MS,
    });
  });
});

function createKitchenState(
  companions: Companion[],
  currentMapId = HUB_MAP_ID,
): GameState {
  return createTestGameState({
    entities: Object.fromEntries(companions.map((companion) => [companion.id, companion])),
    partyLeaderId: companions[0]?.id ?? "",
    currentMapId,
    simulationTimeMs: NOW_MS,
  });
}

function createKitchenCompanion(id: string, partyOrder: number): Companion {
  return createCompanion(
    id,
    { x: partyOrder, y: 0 },
    "first",
    "none",
    partyOrder,
  );
}

function withCrowns(state: GameState, crowns: number): GameState {
  return addCurrencyToWalletState(state, "crowns", crowns, "debug").state;
}

function createAssignment() {
  return {
    status: "assigned" as const,
    mapId: MAP_ONE_ID,
    mapName: "Wilds",
    subzoneId: "test-subzone",
    subzoneName: "Test Subzone",
    assignedAtMs: NOW_MS,
    lastSettledAtMs: NOW_MS,
    capsAtMs: NOW_MS + 1_000,
    maxDurationMs: 1_000,
    rewardSeed: 1,
    experienceEfficiency: 0.5,
    dropEfficiency: 0.5,
    preview: {
      rating: "Adequate",
      killsPerHour: 1,
      experiencePerMinute: 1,
      survivabilityPercent: 100,
      expectedDropItemIds: [],
      expectedResourceItemIds: [],
      warnings: [],
    },
    pendingResult: null,
    pendingElapsedMs: 0,
  };
}
