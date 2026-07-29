import {
  addItemToInventoryState,
  getAvailableInventorySlots,
  getInventorySlotIndex,
  getLockedInventorySlotIndices,
  removeItemFromInventorySlotState,
} from "./inventory";
import { ARMOR_FAMILY_LABELS, EQUIPMENT_TYPE_LABELS } from "./equipmentTypes";
import { getItemDefinition } from "./items";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import type { GameState } from "./state";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import type {
  ArmorFamily,
  EquipmentType,
  InventorySlot,
  ItemDefinition,
  ItemId,
  PartyInventory,
} from "./types";

export const SMITH_CRAFTING_INTERACTION_RANGE = 2;

export type CraftingRecipeId =
  | "guard_boots"
  | "training_sword"
  | "guard_coif"
  | "guard_gloves"
  | "guard_hauberk"
  | "guard_legguards"
  | "scout_cap"
  | "scout_boots"
  | "scout_gloves"
  | "scout_jacket"
  | "scout_trousers"
  | "acolyte_hood"
  | "plain_charm"
  | "stalker_boots"
  | "stalker_grips"
  | "stalker_leggings"
  | "stalker_mask"
  | "stalker_vest"
  | "vanguard_boots"
  | "vanguard_coif"
  | "vanguard_gloves"
  | "vanguard_hauberk"
  | "vanguard_legguards";

export type CraftingItemRequirement = {
  kind: "item";
  itemId: ItemId;
  quantity: number;
};

export type CraftingEquipmentRequirement = {
  kind: "equipment";
  equipmentType: EquipmentType;
  armorFamily?: ArmorFamily;
  levelRequirement: number;
  quantity: 1;
};

export type CraftingCost =
  | CraftingItemRequirement
  | CraftingEquipmentRequirement;

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
  displayName: string;
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

const itemCost = (
  itemId: ItemId,
  quantity: number,
): CraftingItemRequirement => ({
  kind: "item",
  itemId,
  quantity,
});

const previousEquipmentCost = (
  equipmentType: EquipmentType,
  armorFamily: ArmorFamily | undefined,
  levelRequirement: number,
): CraftingEquipmentRequirement => ({
  kind: "equipment",
  equipmentType,
  ...(armorFamily ? { armorFamily } : {}),
  levelRequirement,
  quantity: 1,
});

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "training_sword",
    outputItemId: "training_sword",
    outputQuantity: 1,
    costs: [
      itemCost("softwood", 5),
      itemCost("wolf_pelt", 1),
      itemCost("crafting_string", 2),
    ],
    crownCost: 4,
  },
  {
    id: "guard_coif",
    outputItemId: "guard_coif",
    outputQuantity: 1,
    costs: [
      itemCost("copper_ore", 4),
      itemCost("slime_gel_t1", 1),
      itemCost("iron_nails", 2),
    ],
    crownCost: 5,
  },
  {
    id: "guard_hauberk",
    outputItemId: "guard_hauberk",
    outputQuantity: 1,
    costs: [
      itemCost("copper_ore", 6),
      itemCost("slime_gel_t1", 2),
      itemCost("iron_nails", 3),
    ],
    crownCost: 6,
  },
  {
    id: "guard_legguards",
    outputItemId: "guard_legguards",
    outputQuantity: 1,
    costs: [
      itemCost("copper_ore", 5),
      itemCost("crawler_pebble_t1", 1),
      itemCost("iron_nails", 2),
    ],
    crownCost: 5,
  },
  {
    id: "guard_gloves",
    outputItemId: "guard_gloves",
    outputQuantity: 1,
    costs: [
      itemCost("copper_ore", 3),
      itemCost("slime_gel_t1", 1),
      itemCost("iron_nails", 1),
    ],
    crownCost: 4,
  },
  {
    id: "guard_boots",
    outputItemId: "guard_boots",
    outputQuantity: 1,
    costs: [
      itemCost("copper_ore", 3),
      itemCost("crawler_pebble_t1", 1),
      itemCost("iron_nails", 1),
    ],
    crownCost: 4,
  },
  {
    id: "scout_cap",
    outputItemId: "scout_cap",
    outputQuantity: 1,
    costs: [
      itemCost("softwood", 3),
      itemCost("wolf_pelt", 2),
      itemCost("crafting_string", 2),
    ],
    crownCost: 5,
  },
  {
    id: "scout_jacket",
    outputItemId: "scout_jacket",
    outputQuantity: 1,
    costs: [
      itemCost("softwood", 4),
      itemCost("wolf_pelt", 2),
      itemCost("crafting_string", 2),
    ],
    crownCost: 5,
  },
  {
    id: "scout_trousers",
    outputItemId: "scout_trousers",
    outputQuantity: 1,
    costs: [
      itemCost("softwood", 3),
      itemCost("wolf_pelt", 2),
      itemCost("crafting_string", 2),
    ],
    crownCost: 5,
  },
  {
    id: "scout_gloves",
    outputItemId: "scout_gloves",
    outputQuantity: 1,
    costs: [
      itemCost("softwood", 2),
      itemCost("bat_wing_t1", 1),
      itemCost("crafting_string", 1),
    ],
    crownCost: 4,
  },
  {
    id: "scout_boots",
    outputItemId: "scout_boots",
    outputQuantity: 1,
    costs: [
      itemCost("softwood", 2),
      itemCost("wolf_pelt", 1),
      itemCost("crafting_string", 1),
    ],
    crownCost: 4,
  },
  {
    id: "acolyte_hood",
    outputItemId: "acolyte_hood",
    outputQuantity: 1,
    costs: [
      itemCost("field_herb", 4),
      itemCost("spider_silk_t1", 2),
      itemCost("crafting_string", 2),
    ],
    crownCost: 6,
  },
  {
    id: "plain_charm",
    outputItemId: "plain_charm",
    outputQuantity: 1,
    costs: [
      itemCost("copper_ore", 2),
      itemCost("field_herb", 2),
      itemCost("slime_gel_t1", 2),
      itemCost("crafting_string", 1),
    ],
    crownCost: 6,
  },
  {
    id: "stalker_mask",
    outputItemId: "stalker_mask",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("head_armor", "leather", 1),
      itemCost("softwood", 6),
      itemCost("spider_silk_t1", 2),
      itemCost("crafting_string", 3),
    ],
    crownCost: 10,
  },
  {
    id: "stalker_vest",
    outputItemId: "stalker_vest",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("chest_armor", "leather", 1),
      itemCost("softwood", 8),
      itemCost("wolf_pelt", 3),
      itemCost("crafting_string", 4),
    ],
    crownCost: 12,
  },
  {
    id: "stalker_leggings",
    outputItemId: "stalker_leggings",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("legs_armor", "leather", 1),
      itemCost("softwood", 6),
      itemCost("wolf_pelt", 2),
      itemCost("crafting_string", 3),
    ],
    crownCost: 10,
  },
  {
    id: "stalker_grips",
    outputItemId: "stalker_grips",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("gloves_armor", "leather", 1),
      itemCost("softwood", 5),
      itemCost("bat_wing_t1", 2),
      itemCost("crafting_string", 2),
    ],
    crownCost: 8,
  },
  {
    id: "stalker_boots",
    outputItemId: "stalker_boots",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("boots_armor", "leather", 1),
      itemCost("softwood", 5),
      itemCost("wolf_pelt", 1),
      itemCost("crafting_string", 2),
    ],
    crownCost: 8,
  },
  {
    id: "vanguard_coif",
    outputItemId: "vanguard_coif",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("head_armor", "mail", 1),
      itemCost("copper_ore", 8),
      itemCost("goblin_ear_t1", 2),
      itemCost("iron_nails", 3),
    ],
    crownCost: 10,
  },
  {
    id: "vanguard_hauberk",
    outputItemId: "vanguard_hauberk",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("chest_armor", "mail", 1),
      itemCost("copper_ore", 10),
      itemCost("slime_gel_t1", 3),
      itemCost("iron_nails", 4),
    ],
    crownCost: 12,
  },
  {
    id: "vanguard_legguards",
    outputItemId: "vanguard_legguards",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("legs_armor", "mail", 1),
      itemCost("copper_ore", 8),
      itemCost("crawler_pebble_t1", 2),
      itemCost("iron_nails", 3),
    ],
    crownCost: 10,
  },
  {
    id: "vanguard_gloves",
    outputItemId: "vanguard_gloves",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("gloves_armor", "mail", 1),
      itemCost("copper_ore", 6),
      itemCost("goblin_ear_t1", 1),
      itemCost("iron_nails", 2),
    ],
    crownCost: 8,
  },
  {
    id: "vanguard_boots",
    outputItemId: "vanguard_boots",
    outputQuantity: 1,
    costs: [
      previousEquipmentCost("boots_armor", "mail", 1),
      itemCost("copper_ore", 6),
      itemCost("crawler_pebble_t1", 1),
      itemCost("iron_nails", 2),
    ],
    crownCost: 8,
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
  const requirements = recipe.costs.map((cost) =>
    getCraftingRequirementStatus(state.inventory, cost),
  );
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

    return compareCraftingRecipeStatuses(first, second);
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
    const removal = removeCraftingRequirementFromState(nextState, cost);

    if (!removal) {
      return createCraftingFailure(state, recipe.id, "inventory_remove_failed");
    }

    nextState = removal;
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

  const inventoryAfterCosts = removeCraftingRequirementsFromInventory(
    state.inventory,
    recipe.costs,
  );

  if (!inventoryAfterCosts) {
    return false;
  }

  if (!itemDefinition.stackable) {
    return getAvailableInventorySlots(inventoryAfterCosts) >= recipe.outputQuantity;
  }

  const existingStackRoom = inventoryAfterCosts.slots
    .filter((slot) => slot.itemId === itemDefinition.id)
    .reduce(
      (total, slot) => total + Math.max(0, itemDefinition.maxStack - slot.quantity),
      0,
    );
  const newStackRoom = getAvailableInventorySlots(inventoryAfterCosts) *
    itemDefinition.maxStack;

  return existingStackRoom + newStackRoom >= recipe.outputQuantity;
}

function getCraftingRequirementStatus(
  inventory: PartyInventory,
  requirement: CraftingCost,
): CraftingRequirementStatus {
  const ownedQuantity = getOwnedCraftingRequirementQuantity(
    inventory,
    requirement,
  );

  return {
    ...requirement,
    displayName: getCraftingRequirementDisplayName(requirement),
    ownedQuantity,
    isMet: ownedQuantity >= requirement.quantity,
  };
}

function getOwnedCraftingRequirementQuantity(
  inventory: PartyInventory,
  requirement: CraftingCost,
): number {
  return inventory.slots.reduce((total, slot, fallbackIndex) => {
    const slotIndex = getInventorySlotIndex(slot, fallbackIndex);

    if (getLockedInventorySlotIndices(inventory).includes(slotIndex)) {
      return total;
    }

    if (!doesInventorySlotMatchCraftingRequirement(slot, requirement)) {
      return total;
    }

    return total + slot.quantity;
  }, 0);
}

function removeCraftingRequirementsFromInventory(
  inventory: PartyInventory,
  requirements: CraftingCost[],
): PartyInventory | null {
  return requirements.reduce<PartyInventory | null>(
    (nextInventory, requirement) =>
      nextInventory
        ? removeCraftingRequirementFromInventory(nextInventory, requirement)
        : null,
    inventory,
  );
}

function removeCraftingRequirementFromInventory(
  inventory: PartyInventory,
  requirement: CraftingCost,
): PartyInventory | null {
  const lockedSlotIndices = getLockedInventorySlotIndices(inventory);
  const slots = inventory.slots.map((slot) => ({ ...slot }));
  let remainingQuantity = requirement.quantity;

  for (
    let arrayIndex = 0;
    arrayIndex < slots.length && remainingQuantity > 0;
    arrayIndex += 1
  ) {
    const slot = slots[arrayIndex];
    const slotIndex = getInventorySlotIndex(slot, arrayIndex);

    if (
      lockedSlotIndices.includes(slotIndex) ||
      !doesInventorySlotMatchCraftingRequirement(slot, requirement)
    ) {
      continue;
    }

    const removedQuantity = Math.min(slot.quantity, remainingQuantity);
    slots[arrayIndex] = {
      ...slot,
      quantity: slot.quantity - removedQuantity,
    };
    remainingQuantity -= removedQuantity;
  }

  if (remainingQuantity > 0) {
    return null;
  }

  return {
    ...inventory,
    slots: slots.filter((slot) => slot.quantity > 0),
    lockedSlotIndices,
  };
}

function removeCraftingRequirementFromState(
  state: GameState,
  requirement: CraftingCost,
): GameState | null {
  let nextState = state;
  let remainingQuantity = requirement.quantity;

  while (remainingQuantity > 0) {
    const slotIndex = getFirstMatchingCraftingRequirementSlotIndex(
      nextState.inventory,
      requirement,
    );

    if (slotIndex === null) {
      return null;
    }

    const slot = nextState.inventory.slots.find(
      (candidate, fallbackIndex) =>
        getInventorySlotIndex(candidate, fallbackIndex) === slotIndex,
    );

    if (!slot) {
      return null;
    }

    const removalQuantity = Math.min(slot.quantity, remainingQuantity);
    const removal = removeItemFromInventorySlotState(
      nextState,
      slotIndex,
      removalQuantity,
      "crafting",
    );

    if (removal.result.status !== "success") {
      return null;
    }

    nextState = removal.state;
    remainingQuantity -= removalQuantity;
  }

  return nextState;
}

function getFirstMatchingCraftingRequirementSlotIndex(
  inventory: PartyInventory,
  requirement: CraftingCost,
): number | null {
  const lockedSlotIndices = getLockedInventorySlotIndices(inventory);

  for (const [fallbackIndex, slot] of inventory.slots.entries()) {
    const slotIndex = getInventorySlotIndex(slot, fallbackIndex);

    if (
      lockedSlotIndices.includes(slotIndex) ||
      !doesInventorySlotMatchCraftingRequirement(slot, requirement)
    ) {
      continue;
    }

    return slotIndex;
  }

  return null;
}

function doesInventorySlotMatchCraftingRequirement(
  slot: InventorySlot,
  requirement: CraftingCost,
): boolean {
  if (requirement.kind === "item") {
    return slot.itemId === requirement.itemId;
  }

  const itemDefinition = getItemDefinition(slot.itemId);

  if (
    !itemDefinition ||
    itemDefinition.category !== "equipment" ||
    itemDefinition.equipmentType !== requirement.equipmentType ||
    itemDefinition.levelRequirement !== requirement.levelRequirement
  ) {
    return false;
  }

  if (requirement.armorFamily) {
    return itemDefinition.armorFamily === requirement.armorFamily;
  }

  return true;
}

function getCraftingRequirementDisplayName(requirement: CraftingCost): string {
  if (requirement.kind === "item") {
    return getItemDefinition(requirement.itemId).displayName;
  }

  const equipmentTypeLabel = EQUIPMENT_TYPE_LABELS[requirement.equipmentType];
  const armorFamilyLabel = requirement.armorFamily
    ? `${ARMOR_FAMILY_LABELS[requirement.armorFamily]} `
    : "";

  return `Any Level ${requirement.levelRequirement} ${armorFamilyLabel}${equipmentTypeLabel}`;
}

function compareCraftingRecipeStatuses(
  first: CraftingRecipeStatus,
  second: CraftingRecipeStatus,
): number {
  const firstOutput = first.outputItemDefinition;
  const secondOutput = second.outputItemDefinition;

  if (!firstOutput || !secondOutput) {
    return first.recipe.id.localeCompare(second.recipe.id);
  }

  return (
    (firstOutput.levelRequirement ?? 1) - (secondOutput.levelRequirement ?? 1) ||
    getEquipmentKindSortOrder(firstOutput) -
      getEquipmentKindSortOrder(secondOutput) ||
    (firstOutput.equipmentType ?? "").localeCompare(
      secondOutput.equipmentType ?? "",
    ) ||
    (firstOutput.armorFamily ?? "").localeCompare(secondOutput.armorFamily ?? "") ||
    firstOutput.displayName.localeCompare(secondOutput.displayName)
  );
}

function getEquipmentKindSortOrder(itemDefinition: ItemDefinition): number {
  switch (itemDefinition.equipmentKind) {
    case "weapon":
      return 0;
    case "offhand":
      return 1;
    case "armor":
      return 2;
    case "accessory":
      return 3;
    default:
      return 4;
  }
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
