import { describe, expect, it } from "vitest";
import {
  CRAFTING_RECIPES,
  type CraftingRecipe,
  craftRecipe,
  getCraftingRecipe,
  getCraftingRecipeStatus,
  isPartyLeaderNearSmith,
} from "./crafting";
import { createCompanion, createNpc } from "./entities";
import {
  addItemToInventoryState,
  countInventoryItem,
  createEmptyPartyInventory,
} from "./inventory";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { ItemId } from "./types";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";

describe("Smith crafting", () => {
  it("crafts an item near a Smith and consumes exact materials and Crowns", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["wolf_pelt", 1],
      ["crafting_string", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "softwood")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "wolf_pelt")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "crafting_string")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "training_sword")).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(6);
  });

  it("fails without consuming anything when required materials are missing", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["crafting_string", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "missing_materials",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("fails without consuming anything when Crowns are insufficient", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["wolf_pelt", 1],
      ["crafting_string", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 3).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "insufficient_crowns",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("requires free inventory space for crafted equipment before consuming inputs", () => {
    let state = createCraftingState({ inventory: createEmptyPartyInventory(3) });
    state = addItems(state, [
      ["softwood", 5],
      ["wolf_pelt", 1],
      ["crafting_string", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "inventory_full",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("requires the leader to be near a Smith", () => {
    let state = createCraftingState({ leaderPosition: { x: 10, y: 10 } });
    state = addItems(state, [
      ["softwood", 5],
      ["wolf_pelt", 1],
      ["crafting_string", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    expect(isPartyLeaderNearSmith(state)).toBe(false);

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "leader_not_near_smith",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("reports invalid recipe ids safely", () => {
    const state = createCraftingState();

    const result = craftRecipe(state, "missing_recipe");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "missing_recipe",
      reason: "invalid_recipe",
    });
    expect(result.state).toBe(state);
  });

  it("fails safely when a recipe output definition is invalid", () => {
    const state = createCraftingState();
    const brokenRecipe = {
      id: "broken_output",
      outputItemId: "missing_item",
      outputQuantity: 1,
      costs: [],
      crownCost: 0,
    } as unknown as CraftingRecipe;

    CRAFTING_RECIPES.push(brokenRecipe);

    try {
      const result = craftRecipe(state, "broken_output");

      expect(result.result).toEqual({
        status: "failed",
        recipeId: "broken_output",
        reason: "invalid_output",
      });
      expect(result.state).toBe(state);
    } finally {
      CRAFTING_RECIPES.pop();
    }
  });

  it("exposes recipe status for UI requirement display", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["wolf_pelt", 1],
      ["crafting_string", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 4).state;
    const recipe = getCraftingRecipe("training_sword");

    expect(recipe).toBeDefined();

    const status = getCraftingRecipeStatus(state, recipe!);

    expect(status.hasRequiredMaterials).toBe(false);
    expect(status.hasRequiredCrowns).toBe(true);
    expect(status.requirements).toContainEqual({
      itemId: "crafting_string",
      quantity: 2,
      ownedQuantity: 1,
      isMet: false,
    });
  });
});

function createCraftingState(options: {
  leaderPosition?: { x: number; y: number };
  inventory?: GameState["inventory"];
} = {}): GameState {
  const leader = createCompanion(
    "leader",
    options.leaderPosition ?? { x: 0, y: 0 },
    "Leader",
  );
  const smith = createNpc("smith", { x: 1, y: 0 }, "Smith", "smith");

  return createTestGameState({
    entities: {
      [leader.id]: leader,
      [smith.id]: smith,
    },
    partyLeaderId: leader.id,
    ...(options.inventory ? { inventory: options.inventory } : {}),
  });
}

function addItems(
  state: GameState,
  items: Array<[ItemId, number]>,
): GameState {
  return items.reduce(
    (nextState, [itemId, quantity]) =>
      addItemToInventoryState(nextState, itemId, quantity, "debug").state,
    state,
  );
}
