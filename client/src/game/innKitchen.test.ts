import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  INN_KITCHEN_HOUSE_BREAD_COST_CROWNS,
  INN_KITCHEN_HOUSE_BREAD_DURATION_MS,
  INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
  cookInnMealForCompanion,
  createInitialInnKitchenState,
  getActiveInnKitchenMealBuff,
  getInnKitchenRecipes,
  sanitizeInnKitchenState,
} from "./innKitchen";
import { createTestGameState } from "./testState";
import { getCompanionDerivedStatsWithPartyBuffs } from "./stats";
import type { GameState } from "./state";
import type { Companion } from "./types";
import { addCurrencyToWalletState, getCurrencyBalance } from "./wallet";

const NOW_MS = 10_000;

describe("Inn Kitchen", () => {
  it("starts with no active meals and exposes House Bread", () => {
    const state = createTestGameState();

    expect(createInitialInnKitchenState()).toEqual({
      activeMealBuffsByCompanionId: {},
    });
    expect(getInnKitchenRecipes()).toEqual([
      expect.objectContaining({
        id: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        displayName: "House Bread",
        crownCost: INN_KITCHEN_HOUSE_BREAD_COST_CROWNS,
        ingredientText: "None",
      }),
    ]);
    expect(state.innKitchen).toEqual(createInitialInnKitchenState());
  });

  it("cooks House Bread for only the selected companion and charges Crowns", () => {
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
    expect(result.state.innKitchen).toEqual(state.innKitchen);
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
      },
    };

    expect(getActiveInnKitchenMealBuff(state, companion.id, NOW_MS + 2)).toBeNull();
    expect(sanitizeInnKitchenState(state.innKitchen, state, NOW_MS + 2)).toEqual({
      activeMealBuffsByCompanionId: {},
    });
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
});

function createKitchenState(companions: Companion[]): GameState {
  return createTestGameState({
    entities: Object.fromEntries(companions.map((companion) => [companion.id, companion])),
    partyLeaderId: companions[0]?.id ?? "",
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
