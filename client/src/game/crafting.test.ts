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
  toggleInventorySlotLock,
} from "./inventory";
import { createInitialQuestStates } from "./questSystem";
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

  it("requires free inventory space after accounting for consumed inputs", () => {
    let state = createCraftingState({ inventory: createEmptyPartyInventory(3) });
    state = addItems(state, [
      ["softwood", 6],
      ["wolf_pelt", 2],
      ["crafting_string", 3],
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
      kind: "item",
      itemId: "crafting_string",
      quantity: 2,
      displayName: "String",
      ownedQuantity: 1,
      isMet: false,
    });
  });

  it("defines valid recipes for every planned level 1 and level 5 equipment output", () => {
    const expectedRecipeIds = [
      "training_sword",
      "plain_charm",
      "guard_coif",
      "guard_hauberk",
      "guard_legguards",
      "guard_gloves",
      "guard_boots",
      "scout_cap",
      "scout_jacket",
      "scout_trousers",
      "scout_gloves",
      "scout_boots",
      "stalker_mask",
      "stalker_vest",
      "stalker_leggings",
      "stalker_grips",
      "stalker_boots",
      "vanguard_coif",
      "vanguard_hauberk",
      "vanguard_legguards",
      "vanguard_gloves",
      "vanguard_boots",
    ];

    for (const recipeId of expectedRecipeIds) {
      const recipe = getCraftingRecipe(recipeId);

      expect(recipe?.outputItemId).toBe(recipeId);
      expect(recipe?.outputQuantity).toBe(1);
    }
  });

  it("crafts level 5 equipment by consuming one matching level 1 armor piece", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["scout_cap", 1],
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["crafting_string", 3],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

    const status = getCraftingRecipeStatus(state, getCraftingRecipe("stalker_mask")!);
    const equipmentRequirement = status.requirements.find(
      (requirement) => requirement.kind === "equipment",
    );

    expect(equipmentRequirement).toMatchObject({
      displayName: "Any Level 1 Leather Head Armor",
      ownedQuantity: 1,
      isMet: true,
    });

    const result = craftRecipe(state, "stalker_mask");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "scout_cap")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "stalker_mask")).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(10);
  });

  it("rejects previous-equipment requirements with the wrong family, part, or level", () => {
    const cases: Array<[string, ItemId]> = [
      ["wrong family", "guard_coif"],
      ["wrong part", "scout_boots"],
      ["wrong level", "stalker_mask"],
    ];

    for (const [, itemId] of cases) {
      let state = createCraftingState();
      state = addItems(state, [
        [itemId, 1],
        ["softwood", 6],
        ["spider_silk_t1", 2],
        ["crafting_string", 3],
      ]);
      state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

      const result = craftRecipe(state, "stalker_mask");

      expect(result.result).toEqual({
        status: "failed",
        recipeId: "stalker_mask",
        reason: "missing_materials",
      });
      expect(result.state.inventory).toEqual(state.inventory);
      expect(result.state.wallet).toEqual(state.wallet);
    }
  });

  it("does not count equipped or banked gear for previous-equipment requirements", () => {
    let equippedState = createCraftingState();
    const leader = equippedState.entities.leader;

    if (!leader || leader.kind !== "companion") {
      throw new Error("Expected leader companion");
    }

    equippedState = {
      ...equippedState,
      entities: {
        ...equippedState.entities,
        leader: {
          ...leader,
          equipment: {
            ...leader.equipment,
            head: "scout_cap",
          },
        },
      },
    };
    equippedState = addItems(equippedState, [
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["crafting_string", 3],
    ]);
    equippedState = setCurrencyBalanceForDebug(
      equippedState,
      "crowns",
      20,
    ).state;

    expect(craftRecipe(equippedState, "stalker_mask").result).toEqual({
      status: "failed",
      recipeId: "stalker_mask",
      reason: "missing_materials",
    });

    let bankState = createCraftingState();
    bankState = {
      ...bankState,
      bank: {
        capacity: 100,
        slots: [{ itemId: "scout_cap", quantity: 1, slotIndex: 0 }],
        lockedSlotIndices: [],
        autoRoutingMode: "keep_inventory",
      },
    };
    bankState = addItems(bankState, [
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["crafting_string", 3],
    ]);
    bankState = setCurrencyBalanceForDebug(bankState, "crowns", 20).state;

    expect(craftRecipe(bankState, "stalker_mask").result).toEqual({
      status: "failed",
      recipeId: "stalker_mask",
      reason: "missing_materials",
    });
  });

  it("does not count locked equipment or material slots for crafting", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["scout_cap", 1],
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["crafting_string", 3],
    ]);
    state = {
      ...state,
      inventory: toggleInventorySlotLock(state.inventory, 0),
    };
    state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

    const result = craftRecipe(state, "stalker_mask");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "stalker_mask",
      reason: "missing_materials",
    });
    expect(result.state.inventory).toEqual(state.inventory);

    let materialState = createCraftingState();
    materialState = addItems(materialState, [
      ["softwood", 5],
      ["wolf_pelt", 1],
      ["crafting_string", 2],
    ]);
    materialState = {
      ...materialState,
      inventory: toggleInventorySlotLock(materialState.inventory, 0),
    };
    materialState = setCurrencyBalanceForDebug(materialState, "crowns", 10).state;

    const materialResult = craftRecipe(materialState, "training_sword");

    expect(materialResult.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "missing_materials",
    });
    expect(materialResult.state.inventory).toEqual(materialState.inventory);
  });

  it("allows consumed inputs to free the inventory space needed for the output", () => {
    let state = createCraftingState({ inventory: createEmptyPartyInventory(4) });
    state = addItems(state, [
      ["scout_cap", 1],
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["crafting_string", 3],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

    expect(state.inventory.slots).toHaveLength(4);

    const result = craftRecipe(state, "stalker_mask");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "stalker_mask")).toBe(1);
  });

  it("uses the tutorial Plain Charm recipe and records successful craft progress", () => {
    const quests = createInitialQuestStates();
    quests.smiths_first_work = {
      ...quests.smiths_first_work,
      status: "active",
    };
    let state = createCraftingState({ quests });
    state = addItems(state, [
      ["slime_gel_t1", 3],
      ["crafting_string", 1],
      ["iron_nails", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "plain_charm");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "slime_gel_t1")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "crafting_string")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "iron_nails")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "plain_charm")).toBe(1);
    expect(
      result.state.quests.smiths_first_work.objectiveProgress.craft_plain_charm,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
  });
});

function createCraftingState(options: {
  leaderPosition?: { x: number; y: number };
  inventory?: GameState["inventory"];
  quests?: GameState["quests"];
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
    ...(options.quests ? { quests: options.quests } : {}),
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
