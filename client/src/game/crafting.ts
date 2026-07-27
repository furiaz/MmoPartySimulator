import {
  addItemToInventoryState,
  countInventoryItem,
  getAvailableInventorySlots,
  removeItemFromInventoryState,
} from "./inventory";
import { getItemDefinition } from "./items";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import type { GameState } from "./state";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import type { ItemDefinition, ItemId } from "./types";

export const SMITH_CRAFTING_INTERACTION_RANGE = 2;

export type CraftingRecipeId =
  | "training_sword"
  | "guard_coif"
  | "scout_cap"
  | "acolyte_hood"
  | "plain_charm";

export type CraftingCost = {
  itemId: ItemId;
  quantity: number;
};

export type CraftingRecipe = {
  id: CraftingRecipeId;
  outputItemId: ItemId;
  outputQuantity: number;
  costs: CraftingCost[];
  crownCost: number;
  professionLevelRequirement?: number;
  unlockRequirement?: string;
};

export type CraftingFailureReason =
  | "invalid_recipe"
  | "invalid_output"
  | "leader_not_near_smith"
  | "missing_materials"
  | "insufficient_crowns"
  | "inventory_full"
  | "inventory_remove_failed"
  | "currency_remove_failed"
  | "inventory_add_failed";

export type CraftingRequirementStatus = CraftingCost & {
  ownedQuantity: number;
  isMet: boolean;
};

export type CraftingRecipeStatus = {
  recipe: CraftingRecipe;
  outputItemDefinition: ItemDefinition | undefined;
  requirements: CraftingRequirementStatus[];
  crownBalance: number;
  hasRequiredMaterials: boolean;
  hasRequiredCrowns: boolean;
  hasInventorySpace: boolean;
  isLeaderNearSmith: boolean;
  canCraft: boolean;
};

export type CraftingResult =
  | {
      status: "success";
      recipeId: CraftingRecipeId;
      outputItemId: ItemId;
      outputQuantity: number;
      displayName: string;
      crownCost: number;
      previousCrowns: number;
      newCrowns: number;
    }
  | {
      status: "failed";
      recipeId: string;
      reason: CraftingFailureReason;
    };

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "training_sword",
    outputItemId: "training_sword",
    outputQuantity: 1,
    costs: [
      { itemId: "softwood", quantity: 5 },
      { itemId: "wolf_pelt", quantity: 1 },
      { itemId: "crafting_string", quantity: 2 },
    ],
    crownCost: 4,
  },
  {
    id: "guard_coif",
    outputItemId: "guard_coif",
    outputQuantity: 1,
    costs: [
      { itemId: "copper_ore", quantity: 4 },
      { itemId: "slime_gel_t1", quantity: 1 },
      { itemId: "iron_nails", quantity: 2 },
    ],
    crownCost: 5,
  },
  {
    id: "scout_cap",
    outputItemId: "scout_cap",
    outputQuantity: 1,
    costs: [
      { itemId: "softwood", quantity: 3 },
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "crafting_string", quantity: 2 },
    ],
    crownCost: 5,
  },
  {
    id: "acolyte_hood",
    outputItemId: "acolyte_hood",
    outputQuantity: 1,
    costs: [
      { itemId: "field_herb", quantity: 4 },
      { itemId: "spider_silk_t1", quantity: 2 },
      { itemId: "crafting_string", quantity: 2 },
    ],
    crownCost: 6,
  },
  {
    id: "plain_charm",
    outputItemId: "plain_charm",
    outputQuantity: 1,
    costs: [
      { itemId: "copper_ore", quantity: 2 },
      { itemId: "field_herb", quantity: 2 },
      { itemId: "slime_core_t1", quantity: 1 },
      { itemId: "crafting_string", quantity: 1 },
    ],
    crownCost: 6,
  },
];

export function getCraftingRecipes(): CraftingRecipe[] {
  return CRAFTING_RECIPES;
}

export function getCraftingRecipe(
  recipeId: string,
): CraftingRecipe | undefined {
  return CRAFTING_RECIPES.find((recipe) => recipe.id === recipeId);
}

export function getCraftingRecipeStatus(
  state: GameState,
  recipe: CraftingRecipe,
): CraftingRecipeStatus {
  const outputItemDefinition = getItemDefinition(recipe.outputItemId);
  const requirements = recipe.costs.map((cost) => {
    const ownedQuantity = countInventoryItem(state.inventory, cost.itemId);

    return {
      ...cost,
      ownedQuantity,
      isMet: ownedQuantity >= cost.quantity,
    };
  });
  const crownBalance = getCurrencyBalance(state.wallet, "crowns");
  const hasRequiredMaterials = requirements.every((requirement) => requirement.isMet);
  const hasRequiredCrowns = canAfford(state.wallet, "crowns", recipe.crownCost);
  const hasInventorySpace =
    Boolean(outputItemDefinition) &&
    canInventoryAcceptCraftingOutput(state, recipe, outputItemDefinition);
  const isLeaderNearSmith = isPartyLeaderNearSmith(state);

  return {
    recipe,
    outputItemDefinition,
    requirements,
    crownBalance,
    hasRequiredMaterials,
    hasRequiredCrowns,
    hasInventorySpace,
    isLeaderNearSmith,
    canCraft:
      Boolean(outputItemDefinition) &&
      hasRequiredMaterials &&
      hasRequiredCrowns &&
      hasInventorySpace &&
      isLeaderNearSmith,
  };
}

export function getSortedCraftingRecipeStatuses(
  state: GameState,
): CraftingRecipeStatus[] {
  return CRAFTING_RECIPES.map((recipe) =>
    getCraftingRecipeStatus(state, recipe),
  ).sort((first, second) => {
    if (first.canCraft !== second.canCraft) {
      return first.canCraft ? -1 : 1;
    }

    return first.recipe.id.localeCompare(second.recipe.id);
  });
}

export function craftRecipe(
  state: GameState,
  recipeId: string,
): { state: GameState; result: CraftingResult } {
  const recipe = getCraftingRecipe(recipeId);

  if (!recipe) {
    return {
      state,
      result: {
        status: "failed",
        recipeId,
        reason: "invalid_recipe",
      },
    };
  }

  const status = getCraftingRecipeStatus(state, recipe);

  if (!status.outputItemDefinition) {
    return createCraftingFailure(state, recipe.id, "invalid_output");
  }

  if (!status.isLeaderNearSmith) {
    return createCraftingFailure(state, recipe.id, "leader_not_near_smith");
  }

  if (!status.hasRequiredMaterials) {
    return createCraftingFailure(state, recipe.id, "missing_materials");
  }

  if (!status.hasRequiredCrowns) {
    return createCraftingFailure(state, recipe.id, "insufficient_crowns");
  }

  if (!status.hasInventorySpace) {
    return createCraftingFailure(state, recipe.id, "inventory_full");
  }

  let nextState = state;

  for (const cost of recipe.costs) {
    const removal = removeItemFromInventoryState(
      nextState,
      cost.itemId,
      cost.quantity,
      "crafting",
    );

    if (removal.result.status !== "success") {
      return createCraftingFailure(state, recipe.id, "inventory_remove_failed");
    }

    nextState = removal.state;
  }

  const previousCrowns = getCurrencyBalance(state.wallet, "crowns");
  const currencyRemoval = removeCurrencyFromWalletState(
    nextState,
    "crowns",
    recipe.crownCost,
    "crafting",
  );

  if (currencyRemoval.result.status !== "success") {
    return createCraftingFailure(state, recipe.id, "currency_remove_failed");
  }

  const inventoryAdd = addItemToInventoryState(
    currencyRemoval.state,
    recipe.outputItemId,
    recipe.outputQuantity,
    "crafting",
  );

  if (inventoryAdd.result.status !== "success") {
    return createCraftingFailure(state, recipe.id, "inventory_add_failed");
  }

  return {
    state: inventoryAdd.state,
    result: {
      status: "success",
      recipeId: recipe.id,
      outputItemId: recipe.outputItemId,
      outputQuantity: recipe.outputQuantity,
      displayName: status.outputItemDefinition.displayName,
      crownCost: recipe.crownCost,
      previousCrowns,
      newCrowns: currencyRemoval.result.newBalance,
    },
  };
}

export function isPartyLeaderNearSmith(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "npc" &&
      entity.npcRole === "smith" &&
      getEuclideanDistance(leader.position, entity.position) <=
        SMITH_CRAFTING_INTERACTION_RANGE,
  );
}

function canInventoryAcceptCraftingOutput(
  state: GameState,
  recipe: CraftingRecipe,
  itemDefinition: ItemDefinition,
): boolean {
  if (recipe.outputQuantity <= 0) {
    return false;
  }

  if (!itemDefinition.stackable) {
    return getAvailableInventorySlots(state.inventory) >= recipe.outputQuantity;
  }

  const existingStackRoom = state.inventory.slots
    .filter((slot) => slot.itemId === itemDefinition.id)
    .reduce(
      (total, slot) => total + Math.max(0, itemDefinition.maxStack - slot.quantity),
      0,
    );
  const newStackRoom = getAvailableInventorySlots(state.inventory) * itemDefinition.maxStack;

  return existingStackRoom + newStackRoom >= recipe.outputQuantity;
}

function createCraftingFailure(
  state: GameState,
  recipeId: CraftingRecipeId,
  reason: CraftingFailureReason,
): { state: GameState; result: CraftingResult } {
  return {
    state,
    result: {
      status: "failed",
      recipeId,
      reason,
    },
  };
}
