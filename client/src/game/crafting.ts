import {
  addItemToInventoryState,
  getAvailableInventorySlots,
  getInventorySlotIndex,
  getLockedInventorySlotIndices,
  removeItemFromInventorySlotState,
} from "./inventory";
import { FIRST_CLASS_IDS } from "./classes";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  ARMOR_FAMILY_LABELS,
  CLASS_EQUIPMENT_PROFILES,
  EQUIPMENT_TYPE_LABELS,
} from "./equipmentTypes";
import { getItemDefinition, getItemDisplayName } from "./items";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import { recordCraftedItemForQuests } from "./questProgressionHooks";
import type { GameState } from "./state";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import type {
  ArmorFamily,
  DebugCraftingConsumedItemTelemetryRow,
  DebugCraftingRequirementTelemetryRow,
  EquipmentItemId,
  EquipmentType,
  InventorySlot,
  ItemDefinition,
  ItemId,
  PartyInventory,
} from "./types";

export const SMITH_CRAFTING_INTERACTION_RANGE = 2;

export type CraftingRecipeId = EquipmentItemId;

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

type ArmorPieceKey = "head" | "chest" | "legs" | "gloves" | "boots";

type ArmorSetRecipeIds = Record<ArmorPieceKey, CraftingRecipeId>;

const CLASS_UPGRADE_EQUIPMENT_TYPE_ORDER: EquipmentType[] = [
  ...CLASS_EQUIPMENT_PROFILES.beginner.mainHand,
  ...FIRST_CLASS_IDS.flatMap((classId) => [
    ...CLASS_EQUIPMENT_PROFILES[classId].mainHand,
    ...CLASS_EQUIPMENT_PROFILES[classId].offhand,
  ]),
];

const EQUIPMENT_TYPE_SORT_ORDER = new Map<EquipmentType, number>(
  CLASS_UPGRADE_EQUIPMENT_TYPE_ORDER.map((equipmentType, index) => [
    equipmentType,
    index,
  ]),
);

const ARMOR_FAMILY_SORT_ORDER: Record<ArmorFamily, number> = {
  cloth: 0,
  leather: 1,
  mail: 2,
  plate: 3,
};

const ARMOR_SLOT_SORT_ORDER: Record<ArmorPieceKey, number> = {
  head: 0,
  chest: 1,
  legs: 2,
  gloves: 3,
  boots: 4,
};

const ARMOR_PIECE_EQUIPMENT_TYPES: Record<ArmorPieceKey, EquipmentType> = {
  head: "head_armor",
  chest: "chest_armor",
  legs: "legs_armor",
  gloves: "gloves_armor",
  boots: "boots_armor",
};

const LEVEL_10_ARMOR_COSTS: Record<
  ArmorPieceKey,
  {
    mainQuantity: number;
    commonQuantity: number;
    rareQuantity: number;
    supplyQuantity: number;
    crownCost: number;
  }
> = {
  head: {
    mainQuantity: 12,
    commonQuantity: 5,
    rareQuantity: 1,
    supplyQuantity: 4,
    crownCost: 16,
  },
  chest: {
    mainQuantity: 22,
    commonQuantity: 10,
    rareQuantity: 2,
    supplyQuantity: 5,
    crownCost: 28,
  },
  legs: {
    mainQuantity: 16,
    commonQuantity: 7,
    rareQuantity: 2,
    supplyQuantity: 4,
    crownCost: 22,
  },
  gloves: {
    mainQuantity: 12,
    commonQuantity: 5,
    rareQuantity: 1,
    supplyQuantity: 4,
    crownCost: 16,
  },
  boots: {
    mainQuantity: 12,
    commonQuantity: 5,
    rareQuantity: 1,
    supplyQuantity: 4,
    crownCost: 16,
  },
};

function equipmentRecipe(
  id: CraftingRecipeId,
  costs: CraftingCost[],
  crownCost: number,
): CraftingRecipe {
  return {
    id,
    outputItemId: id,
    outputQuantity: 1,
    costs,
    crownCost,
  };
}

function createLevel10ArmorSetRecipes(
  ids: ArmorSetRecipeIds,
  mainItemId: ItemId,
  commonDropItemId: ItemId,
  rareDropItemId: ItemId,
  supplyItemId: ItemId,
): CraftingRecipe[] {
  return (Object.keys(ids) as ArmorPieceKey[]).map((piece) => {
    const cost = LEVEL_10_ARMOR_COSTS[piece];

    return equipmentRecipe(
      ids[piece],
      [
        itemCost(mainItemId, cost.mainQuantity),
        itemCost(commonDropItemId, cost.commonQuantity),
        itemCost(rareDropItemId, cost.rareQuantity),
        itemCost(supplyItemId, cost.supplyQuantity),
      ],
      cost.crownCost,
    );
  });
}

function createLevel15ArmorRecipe(
  id: CraftingRecipeId,
  armorFamily: ArmorFamily,
  piece: ArmorPieceKey,
  costs: CraftingCost[],
  crownCost: number,
): CraftingRecipe {
  return equipmentRecipe(
    id,
    [
      previousEquipmentCost(
        ARMOR_PIECE_EQUIPMENT_TYPES[piece],
        armorFamily,
        10,
      ),
      ...costs,
    ],
    crownCost,
  );
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  equipmentRecipe(
    "training_sword",
    [
      itemCost("softwood", 5),
      itemCost("slime_gel_t1", 2),
      itemCost("crafting_string", 1),
    ],
    4,
  ),
  equipmentRecipe(
    "plain_charm",
    [
      itemCost("copper_ore", 2),
      itemCost("field_herb", 2),
      itemCost("slime_gel_t1", 3),
      itemCost("crafting_string", 1),
    ],
    6,
  ),
  equipmentRecipe(
    "guard_coif",
    [
      itemCost("copper_ore", 4),
      itemCost("slime_gel_t1", 1),
      itemCost("iron_nails", 2),
    ],
    5,
  ),
  equipmentRecipe(
    "guard_hauberk",
    [
      itemCost("copper_ore", 6),
      itemCost("slime_gel_t1", 2),
      itemCost("iron_nails", 3),
    ],
    6,
  ),
  equipmentRecipe(
    "guard_legguards",
    [
      itemCost("copper_ore", 5),
      itemCost("slime_core_t1", 1),
      itemCost("iron_nails", 2),
    ],
    5,
  ),
  equipmentRecipe(
    "guard_gloves",
    [
      itemCost("copper_ore", 3),
      itemCost("slime_gel_t1", 1),
      itemCost("iron_nails", 1),
    ],
    4,
  ),
  equipmentRecipe(
    "guard_boots",
    [
      itemCost("copper_ore", 3),
      itemCost("slime_gel_t1", 1),
      itemCost("iron_nails", 1),
    ],
    4,
  ),
  equipmentRecipe(
    "scout_cap",
    [
      itemCost("softwood", 3),
      itemCost("bat_wing_t1", 1),
      itemCost("crafting_string", 2),
    ],
    5,
  ),
  equipmentRecipe(
    "scout_jacket",
    [
      itemCost("softwood", 5),
      itemCost("spider_silk_t1", 2),
      itemCost("crafting_string", 2),
    ],
    6,
  ),
  equipmentRecipe(
    "scout_trousers",
    [
      itemCost("softwood", 4),
      itemCost("spider_silk_t1", 1),
      itemCost("crafting_string", 2),
    ],
    5,
  ),
  equipmentRecipe(
    "scout_gloves",
    [
      itemCost("softwood", 2),
      itemCost("bat_wing_t1", 1),
      itemCost("crafting_string", 1),
    ],
    4,
  ),
  equipmentRecipe(
    "scout_boots",
    [
      itemCost("softwood", 2),
      itemCost("bat_wing_t1", 1),
      itemCost("crafting_string", 1),
    ],
    4,
  ),
  equipmentRecipe(
    "stalker_mask",
    [
      previousEquipmentCost("head_armor", "leather", 1),
      itemCost("softwood", 6),
      itemCost("spider_silk_t1", 2),
      itemCost("wolf_pelt", 1),
      itemCost("crafting_string", 3),
    ],
    10,
  ),
  equipmentRecipe(
    "stalker_vest",
    [
      previousEquipmentCost("chest_armor", "leather", 1),
      itemCost("softwood", 8),
      itemCost("wolf_pelt", 3),
      itemCost("crafting_string", 4),
    ],
    12,
  ),
  equipmentRecipe(
    "stalker_leggings",
    [
      previousEquipmentCost("legs_armor", "leather", 1),
      itemCost("softwood", 6),
      itemCost("wolf_pelt", 2),
      itemCost("crafting_string", 3),
    ],
    10,
  ),
  equipmentRecipe(
    "stalker_grips",
    [
      previousEquipmentCost("gloves_armor", "leather", 1),
      itemCost("softwood", 5),
      itemCost("bat_wing_t1", 2),
      itemCost("crafting_string", 2),
    ],
    8,
  ),
  equipmentRecipe(
    "stalker_boots",
    [
      previousEquipmentCost("boots_armor", "leather", 1),
      itemCost("softwood", 5),
      itemCost("wolf_pelt", 1),
      itemCost("crafting_string", 2),
    ],
    8,
  ),
  equipmentRecipe(
    "vanguard_coif",
    [
      previousEquipmentCost("head_armor", "mail", 1),
      itemCost("copper_ore", 8),
      itemCost("goblin_ear_t1", 2),
      itemCost("iron_nails", 3),
    ],
    10,
  ),
  equipmentRecipe(
    "vanguard_hauberk",
    [
      previousEquipmentCost("chest_armor", "mail", 1),
      itemCost("copper_ore", 10),
      itemCost("slime_gel_t1", 3),
      itemCost("iron_nails", 4),
    ],
    12,
  ),
  equipmentRecipe(
    "vanguard_legguards",
    [
      previousEquipmentCost("legs_armor", "mail", 1),
      itemCost("copper_ore", 8),
      itemCost("imp_horn_chip_t1", 2),
      itemCost("iron_nails", 3),
    ],
    10,
  ),
  equipmentRecipe(
    "vanguard_gloves",
    [
      previousEquipmentCost("gloves_armor", "mail", 1),
      itemCost("copper_ore", 6),
      itemCost("goblin_ear_t1", 1),
      itemCost("iron_nails", 2),
    ],
    8,
  ),
  equipmentRecipe(
    "vanguard_boots",
    [
      previousEquipmentCost("boots_armor", "mail", 1),
      itemCost("copper_ore", 6),
      itemCost("imp_horn_chip_t1", 1),
      itemCost("iron_nails", 2),
    ],
    8,
  ),
  equipmentRecipe(
    "iron_sword",
    [
      itemCost("iron_ore", 14),
      itemCost("goblin_ear_t2", 5),
      itemCost("wisp_ash_t2", 2),
      itemCost("iron_nails", 4),
    ],
    20,
  ),
  equipmentRecipe(
    "guard_mace",
    [
      itemCost("iron_ore", 12),
      itemCost("orc_hide", 3),
      itemCost("goblin_ear_t2", 4),
      itemCost("iron_nails", 4),
    ],
    20,
  ),
  equipmentRecipe(
    "claw_gauntlets",
    [
      itemCost("hardwood", 16),
      itemCost("orc_hide", 4),
      itemCost("wisp_ash_t2", 3),
      itemCost("crafting_string", 5),
    ],
    26,
  ),
  equipmentRecipe(
    "thorn_whip",
    [
      itemCost("redleaf_herb", 10),
      itemCost("wisp_ash_t2", 5),
      itemCost("orc_tusk", 1),
      itemCost("crafting_string", 4),
    ],
    22,
  ),
  equipmentRecipe(
    "short_bow",
    [
      itemCost("hardwood", 18),
      itemCost("goblin_ear_t2", 5),
      itemCost("crafting_string", 6),
    ],
    26,
  ),
  equipmentRecipe(
    "apprentice_orb",
    [
      itemCost("redleaf_herb", 14),
      itemCost("wisp_ash_t2", 5),
      itemCost("wisp_ember_t2", 1),
      itemCost("crafting_string", 4),
    ],
    24,
  ),
  equipmentRecipe(
    "rune_lantern",
    [
      itemCost("iron_ore", 8),
      itemCost("redleaf_herb", 10),
      itemCost("wisp_ember_t2", 1),
      itemCost("iron_nails", 3),
    ],
    24,
  ),
  equipmentRecipe(
    "holy_mace",
    [
      itemCost("iron_ore", 10),
      itemCost("redleaf_herb", 8),
      itemCost("goblin_tooth_t2", 1),
      itemCost("iron_nails", 3),
    ],
    22,
  ),
  equipmentRecipe(
    "wooden_shield",
    [
      itemCost("hardwood", 12),
      itemCost("iron_ore", 8),
      itemCost("orc_hide", 3),
      itemCost("iron_nails", 5),
    ],
    24,
  ),
  equipmentRecipe(
    "simple_talisman",
    [
      itemCost("redleaf_herb", 10),
      itemCost("goblin_tooth_t2", 1),
      itemCost("wisp_ash_t2", 3),
      itemCost("crafting_string", 3),
    ],
    20,
  ),
  equipmentRecipe(
    "holy_lantern",
    [
      itemCost("redleaf_herb", 12),
      itemCost("wisp_ash_t2", 4),
      itemCost("wisp_ember_t2", 1),
      itemCost("iron_nails", 2),
    ],
    22,
  ),
  equipmentRecipe(
    "sacrificial_dagger",
    [
      itemCost("iron_ore", 8),
      itemCost("orc_tusk", 1),
      itemCost("wisp_ash_t2", 3),
      itemCost("crafting_string", 3),
    ],
    20,
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "acolyte_hood",
      chest: "acolyte_robe",
      legs: "acolyte_pants",
      gloves: "acolyte_wraps",
      boots: "acolyte_sandals",
    },
    "redleaf_herb",
    "wisp_ash_t2",
    "wisp_ember_t2",
    "crafting_string",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "scholar_hood",
      chest: "scholar_robe",
      legs: "scholar_pants",
      gloves: "scholar_gloves",
      boots: "scholar_sandals",
    },
    "redleaf_herb",
    "goblin_ear_t2",
    "goblin_tooth_t2",
    "crafting_string",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "trailrunner_cap",
      chest: "trailrunner_jacket",
      legs: "trailrunner_trousers",
      gloves: "trailrunner_gloves",
      boots: "trailrunner_boots",
    },
    "hardwood",
    "orc_hide",
    "orc_tusk",
    "crafting_string",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "ravager_mask",
      chest: "ravager_vest",
      legs: "ravager_leggings",
      gloves: "ravager_grips",
      boots: "ravager_boots",
    },
    "hardwood",
    "wisp_ash_t2",
    "wisp_ember_t2",
    "crafting_string",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "wardmail_coif",
      chest: "wardmail_hauberk",
      legs: "wardmail_legguards",
      gloves: "wardmail_gloves",
      boots: "wardmail_boots",
    },
    "iron_ore",
    "goblin_ear_t2",
    "goblin_tooth_t2",
    "iron_nails",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "ironmarch_coif",
      chest: "ironmarch_hauberk",
      legs: "ironmarch_legguards",
      gloves: "ironmarch_gloves",
      boots: "ironmarch_boots",
    },
    "iron_ore",
    "orc_hide",
    "orc_tusk",
    "iron_nails",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "bulwark_helm",
      chest: "bulwark_cuirass",
      legs: "bulwark_greaves",
      gloves: "bulwark_gauntlets",
      boots: "bulwark_sabatons",
    },
    "iron_ore",
    "orc_hide",
    "orc_tusk",
    "iron_nails",
  ),
  ...createLevel10ArmorSetRecipes(
    {
      head: "warplate_helm",
      chest: "warplate_cuirass",
      legs: "warplate_greaves",
      gloves: "warplate_gauntlets",
      boots: "warplate_sabatons",
    },
    "iron_ore",
    "wisp_ash_t2",
    "wisp_ember_t2",
    "iron_nails",
  ),
  equipmentRecipe(
    "steel_sword",
    [
      previousEquipmentCost("one_handed_sword", undefined, 10),
      itemCost("iron_ore", 20),
      itemCost("crawler_plate_t2", 2),
      itemCost("wolf_fang_t2", 2),
      itemCost("iron_nails", 6),
    ],
    34,
  ),
  equipmentRecipe(
    "bastion_mace",
    [
      previousEquipmentCost("one_handed_mace", undefined, 10),
      itemCost("iron_ore", 18),
      itemCost("crawler_pebble_t2", 8),
      itemCost("imp_tail_t2", 2),
      itemCost("iron_nails", 6),
    ],
    34,
  ),
  equipmentRecipe(
    "steel_claws",
    [
      previousEquipmentCost("claw_gauntlets", undefined, 10),
      itemCost("hardwood", 24),
      itemCost("wolf_pelt_t2", 8),
      itemCost("wolf_fang_t2", 2),
      itemCost("crafting_string", 7),
    ],
    40,
  ),
  equipmentRecipe(
    "barbed_whip",
    [
      previousEquipmentCost("thorn_whip", undefined, 10),
      itemCost("redleaf_herb", 18),
      itemCost("imp_tail_t2", 3),
      itemCost("wolf_fang_t2", 2),
      itemCost("crafting_string", 6),
    ],
    36,
  ),
  equipmentRecipe(
    "reinforced_bow",
    [
      previousEquipmentCost("bow", undefined, 10),
      itemCost("hardwood", 26),
      itemCost("wolf_pelt_t2", 10),
      itemCost("crawler_plate_t2", 2),
      itemCost("crafting_string", 8),
    ],
    42,
  ),
  equipmentRecipe(
    "adept_orb",
    [
      previousEquipmentCost("orb", undefined, 10),
      itemCost("redleaf_herb", 22),
      itemCost("imp_horn_chip_t2", 8),
      itemCost("imp_tail_t2", 2),
      itemCost("crafting_string", 6),
    ],
    38,
  ),
  equipmentRecipe(
    "etched_rune_lantern",
    [
      previousEquipmentCost("rune_lantern", undefined, 10),
      itemCost("redleaf_herb", 18),
      itemCost("iron_ore", 8),
      itemCost("crawler_plate_t2", 2),
      itemCost("iron_nails", 5),
    ],
    38,
  ),
  equipmentRecipe(
    "sanctified_mace",
    [
      previousEquipmentCost("holy_mace", undefined, 10),
      itemCost("iron_ore", 14),
      itemCost("redleaf_herb", 12),
      itemCost("imp_tail_t2", 2),
      itemCost("iron_nails", 5),
    ],
    36,
  ),
  equipmentRecipe(
    "reinforced_shield",
    [
      previousEquipmentCost("shield", undefined, 10),
      itemCost("iron_ore", 20),
      itemCost("hardwood", 10),
      itemCost("crawler_plate_t2", 3),
      itemCost("iron_nails", 8),
    ],
    42,
  ),
  equipmentRecipe(
    "warded_talisman",
    [
      previousEquipmentCost("talisman", undefined, 10),
      itemCost("redleaf_herb", 18),
      itemCost("imp_tail_t2", 2),
      itemCost("crawler_plate_t2", 1),
      itemCost("crafting_string", 5),
    ],
    34,
  ),
  equipmentRecipe(
    "bright_lantern",
    [
      previousEquipmentCost("holy_lantern", undefined, 10),
      itemCost("redleaf_herb", 20),
      itemCost("imp_horn_chip_t2", 8),
      itemCost("wolf_fang_t2", 1),
      itemCost("iron_nails", 4),
    ],
    36,
  ),
  equipmentRecipe(
    "ritual_dagger",
    [
      previousEquipmentCost("sacrificial_dagger", undefined, 10),
      itemCost("iron_ore", 12),
      itemCost("redleaf_herb", 10),
      itemCost("imp_tail_t2", 2),
      itemCost("crafting_string", 5),
    ],
    34,
  ),
  createLevel15ArmorRecipe(
    "blessed_hood",
    "cloth",
    "head",
    [
      itemCost("redleaf_herb", 14),
      itemCost("imp_horn_chip_t2", 5),
      itemCost("imp_tail_t2", 1),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "blessed_robe",
    "cloth",
    "chest",
    [
      itemCost("redleaf_herb", 24),
      itemCost("imp_horn_chip_t2", 10),
      itemCost("imp_tail_t2", 2),
      itemCost("crafting_string", 7),
    ],
    44,
  ),
  createLevel15ArmorRecipe(
    "blessed_pants",
    "cloth",
    "legs",
    [
      itemCost("redleaf_herb", 18),
      itemCost("imp_horn_chip_t2", 7),
      itemCost("imp_tail_t2", 2),
      itemCost("crafting_string", 6),
    ],
    36,
  ),
  createLevel15ArmorRecipe(
    "blessed_wraps",
    "cloth",
    "gloves",
    [
      itemCost("redleaf_herb", 15),
      itemCost("imp_horn_chip_t2", 5),
      itemCost("imp_tail_t2", 1),
      itemCost("crafting_string", 5),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "blessed_sandals",
    "cloth",
    "boots",
    [
      itemCost("redleaf_herb", 14),
      itemCost("imp_horn_chip_t2", 5),
      itemCost("wolf_pelt_t2", 2),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "adept_hood",
    "cloth",
    "head",
    [
      itemCost("redleaf_herb", 14),
      itemCost("imp_horn_chip_t2", 4),
      itemCost("crawler_pebble_t2", 3),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "adept_robe",
    "cloth",
    "chest",
    [
      itemCost("redleaf_herb", 24),
      itemCost("imp_horn_chip_t2", 8),
      itemCost("crawler_plate_t2", 2),
      itemCost("crafting_string", 7),
    ],
    44,
  ),
  createLevel15ArmorRecipe(
    "adept_pants",
    "cloth",
    "legs",
    [
      itemCost("redleaf_herb", 18),
      itemCost("crawler_pebble_t2", 7),
      itemCost("imp_tail_t2", 2),
      itemCost("crafting_string", 6),
    ],
    36,
  ),
  createLevel15ArmorRecipe(
    "adept_gloves",
    "cloth",
    "gloves",
    [
      itemCost("redleaf_herb", 15),
      itemCost("imp_horn_chip_t2", 5),
      itemCost("crawler_plate_t2", 1),
      itemCost("crafting_string", 5),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "adept_sandals",
    "cloth",
    "boots",
    [
      itemCost("redleaf_herb", 14),
      itemCost("wolf_pelt_t2", 5),
      itemCost("imp_tail_t2", 1),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "pathfinder_cap",
    "leather",
    "head",
    [
      itemCost("hardwood", 14),
      itemCost("wolf_pelt_t2", 5),
      itemCost("wolf_fang_t2", 1),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "pathfinder_jacket",
    "leather",
    "chest",
    [
      itemCost("hardwood", 24),
      itemCost("wolf_pelt_t2", 10),
      itemCost("wolf_fang_t2", 2),
      itemCost("crafting_string", 7),
    ],
    44,
  ),
  createLevel15ArmorRecipe(
    "pathfinder_trousers",
    "leather",
    "legs",
    [
      itemCost("hardwood", 18),
      itemCost("wolf_pelt_t2", 7),
      itemCost("wolf_fang_t2", 2),
      itemCost("crafting_string", 6),
    ],
    36,
  ),
  createLevel15ArmorRecipe(
    "pathfinder_gloves",
    "leather",
    "gloves",
    [
      itemCost("hardwood", 15),
      itemCost("wolf_pelt_t2", 4),
      itemCost("crawler_plate_t2", 1),
      itemCost("crafting_string", 5),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "pathfinder_boots",
    "leather",
    "boots",
    [
      itemCost("hardwood", 14),
      itemCost("wolf_pelt_t2", 5),
      itemCost("imp_tail_t2", 1),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "striker_mask",
    "leather",
    "head",
    [
      itemCost("hardwood", 14),
      itemCost("wolf_pelt_t2", 4),
      itemCost("wolf_fang_t2", 1),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "striker_vest",
    "leather",
    "chest",
    [
      itemCost("hardwood", 24),
      itemCost("wolf_pelt_t2", 8),
      itemCost("wolf_fang_t2", 3),
      itemCost("crafting_string", 7),
    ],
    44,
  ),
  createLevel15ArmorRecipe(
    "striker_leggings",
    "leather",
    "legs",
    [
      itemCost("hardwood", 18),
      itemCost("wolf_pelt_t2", 6),
      itemCost("wolf_fang_t2", 2),
      itemCost("crafting_string", 6),
    ],
    36,
  ),
  createLevel15ArmorRecipe(
    "striker_grips",
    "leather",
    "gloves",
    [
      itemCost("hardwood", 15),
      itemCost("wolf_fang_t2", 2),
      itemCost("imp_tail_t2", 1),
      itemCost("crafting_string", 5),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "striker_boots",
    "leather",
    "boots",
    [
      itemCost("hardwood", 14),
      itemCost("wolf_pelt_t2", 5),
      itemCost("wolf_fang_t2", 1),
      itemCost("crafting_string", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "sentinel_coif",
    "mail",
    "head",
    [
      itemCost("iron_ore", 14),
      itemCost("crawler_pebble_t2", 5),
      itemCost("crawler_plate_t2", 1),
      itemCost("iron_nails", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "sentinel_hauberk",
    "mail",
    "chest",
    [
      itemCost("iron_ore", 24),
      itemCost("crawler_pebble_t2", 10),
      itemCost("crawler_plate_t2", 2),
      itemCost("iron_nails", 7),
    ],
    44,
  ),
  createLevel15ArmorRecipe(
    "sentinel_legguards",
    "mail",
    "legs",
    [
      itemCost("iron_ore", 18),
      itemCost("crawler_pebble_t2", 7),
      itemCost("crawler_plate_t2", 2),
      itemCost("iron_nails", 6),
    ],
    36,
  ),
  createLevel15ArmorRecipe(
    "sentinel_gloves",
    "mail",
    "gloves",
    [
      itemCost("iron_ore", 15),
      itemCost("crawler_pebble_t2", 5),
      itemCost("crawler_plate_t2", 1),
      itemCost("iron_nails", 5),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "sentinel_boots",
    "mail",
    "boots",
    [
      itemCost("iron_ore", 14),
      itemCost("crawler_pebble_t2", 5),
      itemCost("orc_hide", 2),
      itemCost("iron_nails", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "marshal_coif",
    "mail",
    "head",
    [
      itemCost("iron_ore", 14),
      itemCost("crawler_pebble_t2", 4),
      itemCost("wolf_fang_t2", 1),
      itemCost("iron_nails", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "marshal_hauberk",
    "mail",
    "chest",
    [
      itemCost("iron_ore", 24),
      itemCost("crawler_pebble_t2", 8),
      itemCost("wolf_fang_t2", 3),
      itemCost("iron_nails", 7),
    ],
    44,
  ),
  createLevel15ArmorRecipe(
    "marshal_legguards",
    "mail",
    "legs",
    [
      itemCost("iron_ore", 18),
      itemCost("crawler_pebble_t2", 6),
      itemCost("wolf_fang_t2", 2),
      itemCost("iron_nails", 6),
    ],
    36,
  ),
  createLevel15ArmorRecipe(
    "marshal_gloves",
    "mail",
    "gloves",
    [
      itemCost("iron_ore", 15),
      itemCost("crawler_plate_t2", 1),
      itemCost("wolf_fang_t2", 2),
      itemCost("iron_nails", 5),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "marshal_boots",
    "mail",
    "boots",
    [
      itemCost("iron_ore", 14),
      itemCost("crawler_pebble_t2", 4),
      itemCost("wolf_pelt_t2", 3),
      itemCost("iron_nails", 5),
    ],
    30,
  ),
  createLevel15ArmorRecipe(
    "bastion_helm",
    "plate",
    "head",
    [
      itemCost("iron_ore", 16),
      itemCost("crawler_pebble_t2", 5),
      itemCost("crawler_plate_t2", 1),
      itemCost("iron_nails", 6),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "bastion_cuirass",
    "plate",
    "chest",
    [
      itemCost("iron_ore", 28),
      itemCost("crawler_pebble_t2", 10),
      itemCost("crawler_plate_t2", 3),
      itemCost("iron_nails", 8),
    ],
    46,
  ),
  createLevel15ArmorRecipe(
    "bastion_greaves",
    "plate",
    "legs",
    [
      itemCost("iron_ore", 20),
      itemCost("crawler_pebble_t2", 8),
      itemCost("crawler_plate_t2", 2),
      itemCost("iron_nails", 7),
    ],
    38,
  ),
  createLevel15ArmorRecipe(
    "bastion_gauntlets",
    "plate",
    "gloves",
    [
      itemCost("iron_ore", 16),
      itemCost("crawler_pebble_t2", 5),
      itemCost("crawler_plate_t2", 1),
      itemCost("iron_nails", 6),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "bastion_sabatons",
    "plate",
    "boots",
    [
      itemCost("iron_ore", 16),
      itemCost("crawler_pebble_t2", 5),
      itemCost("orc_hide", 3),
      itemCost("iron_nails", 6),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "breaker_helm",
    "plate",
    "head",
    [
      itemCost("iron_ore", 16),
      itemCost("crawler_pebble_t2", 4),
      itemCost("wolf_fang_t2", 1),
      itemCost("iron_nails", 6),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "breaker_cuirass",
    "plate",
    "chest",
    [
      itemCost("iron_ore", 28),
      itemCost("crawler_pebble_t2", 8),
      itemCost("wolf_fang_t2", 3),
      itemCost("iron_nails", 8),
    ],
    46,
  ),
  createLevel15ArmorRecipe(
    "breaker_greaves",
    "plate",
    "legs",
    [
      itemCost("iron_ore", 20),
      itemCost("crawler_pebble_t2", 6),
      itemCost("wolf_fang_t2", 2),
      itemCost("iron_nails", 7),
    ],
    38,
  ),
  createLevel15ArmorRecipe(
    "breaker_gauntlets",
    "plate",
    "gloves",
    [
      itemCost("iron_ore", 16),
      itemCost("crawler_plate_t2", 1),
      itemCost("wolf_fang_t2", 2),
      itemCost("iron_nails", 6),
    ],
    32,
  ),
  createLevel15ArmorRecipe(
    "breaker_sabatons",
    "plate",
    "boots",
    [
      itemCost("iron_ore", 16),
      itemCost("crawler_pebble_t2", 4),
      itemCost("wolf_pelt_t2", 3),
      itemCost("iron_nails", 6),
    ],
    32,
  ),
];

export function getCraftingRecipes(): CraftingRecipe[] {
  return CRAFTING_RECIPES;
}

export function getCraftingRecipeOutputItemIds(): ItemId[] {
  return Array.from(new Set(CRAFTING_RECIPES.map((recipe) => recipe.outputItemId)));
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
    const failedState = appendCraftingFailedTelemetry(
      state,
      recipeId,
      "invalid_recipe",
    );

    return {
      state: failedState,
      result: {
        status: "failed",
        recipeId,
        reason: "invalid_recipe",
      },
    };
  }

  const status = getCraftingRecipeStatus(state, recipe);
  const attemptedState = appendCraftingAttemptTelemetry(state, recipe, status);

  if (!status.outputItemDefinition) {
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "invalid_output",
      recipe,
      status,
    );
  }

  if (!status.isLeaderNearSmith) {
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "leader_not_near_smith",
      recipe,
      status,
    );
  }

  if (!status.hasRequiredMaterials) {
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "missing_materials",
      recipe,
      status,
    );
  }

  if (!status.hasRequiredCrowns) {
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "insufficient_crowns",
      recipe,
      status,
    );
  }

  if (!status.hasInventorySpace) {
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "inventory_full",
      recipe,
      status,
    );
  }

  const consumedCraftingItems = getConsumedCraftingItemsForTelemetry(
    state.inventory,
    recipe.costs,
  );
  let nextState = attemptedState;

  for (const cost of recipe.costs) {
    const removal = removeCraftingRequirementFromState(nextState, cost);

    if (!removal) {
      return createCraftingFailure(
        attemptedState,
        recipe.id,
        "inventory_remove_failed",
        recipe,
        status,
      );
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
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "currency_remove_failed",
      recipe,
      status,
    );
  }

  const inventoryAdd = addItemToInventoryState(
    currencyRemoval.state,
    recipe.outputItemId,
    recipe.outputQuantity,
    "crafting",
  );

  if (inventoryAdd.result.status !== "success") {
    return createCraftingFailure(
      attemptedState,
      recipe.id,
      "inventory_add_failed",
      recipe,
      status,
    );
  }

  const craftedState = appendCraftingSucceededTelemetry(
    recordCraftedItemForQuests(
    inventoryAdd.state,
    recipe.outputItemId,
    recipe.outputQuantity,
    ),
    recipe,
    status,
    consumedCraftingItems,
    previousCrowns,
    currencyRemoval.result.newBalance,
    state,
  );

  return {
    state: craftedState,
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
    return getItemDisplayName(requirement.itemId);
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
    getEquipmentKindSortOrder(firstOutput) - getEquipmentKindSortOrder(secondOutput) ||
    getEquipmentTypeSortOrder(firstOutput) - getEquipmentTypeSortOrder(secondOutput) ||
    (firstOutput.levelRequirement ?? 1) - (secondOutput.levelRequirement ?? 1) ||
    getArmorFamilySortOrder(firstOutput) - getArmorFamilySortOrder(secondOutput) ||
    getArmorSetSortKey(firstOutput).localeCompare(getArmorSetSortKey(secondOutput)) ||
    getArmorSlotSortOrder(firstOutput) - getArmorSlotSortOrder(secondOutput) ||
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

function getEquipmentTypeSortOrder(itemDefinition: ItemDefinition): number {
  if (
    itemDefinition.equipmentKind === "weapon" ||
    itemDefinition.equipmentKind === "offhand"
  ) {
    if (!itemDefinition.equipmentType) {
      return 999;
    }

    return EQUIPMENT_TYPE_SORT_ORDER.get(itemDefinition.equipmentType) ?? 999;
  }

  return 0;
}

function getArmorFamilySortOrder(itemDefinition: ItemDefinition): number {
  if (itemDefinition.equipmentKind !== "armor" || !itemDefinition.armorFamily) {
    return 0;
  }

  return ARMOR_FAMILY_SORT_ORDER[itemDefinition.armorFamily];
}

function getArmorSetSortKey(itemDefinition: ItemDefinition): string {
  if (itemDefinition.equipmentKind !== "armor") {
    return "";
  }

  return itemDefinition.displayName.split(" ")[0] ?? itemDefinition.displayName;
}

function getArmorSlotSortOrder(itemDefinition: ItemDefinition): number {
  if (itemDefinition.equipmentKind !== "armor") {
    return 0;
  }

  switch (itemDefinition.equipmentSlot) {
    case "head":
      return ARMOR_SLOT_SORT_ORDER.head;
    case "chest":
      return ARMOR_SLOT_SORT_ORDER.chest;
    case "legs":
      return ARMOR_SLOT_SORT_ORDER.legs;
    case "gloves":
      return ARMOR_SLOT_SORT_ORDER.gloves;
    case "boots":
      return ARMOR_SLOT_SORT_ORDER.boots;
    default:
      return 999;
  }
}

function appendCraftingAttemptTelemetry(
  state: GameState,
  recipe: CraftingRecipe,
  status: CraftingRecipeStatus,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: "craft_attempted",
    entityId: getCraftingTelemetryEntityId(state),
    craftingRecipeId: recipe.id,
    outputItemId: recipe.outputItemId,
    outputQuantity: recipe.outputQuantity,
    craftingRequirements: getCraftingRequirementsForTelemetry(status),
    crownCost: recipe.crownCost,
    previousCurrencyBalance: status.crownBalance,
    nextCurrencyBalance: status.crownBalance,
    inventoryUsedSlots: state.inventory.slots.length,
    inventoryCapacity: state.inventory.capacity,
    inventoryFreeSlotsBefore: getAvailableInventorySlots(state.inventory),
    inventoryFreeSlotsAfter: getAvailableInventorySlots(state.inventory),
  });
}

function appendCraftingFailedTelemetry(
  state: GameState,
  recipeId: string,
  reason: CraftingFailureReason,
  recipe?: CraftingRecipe,
  status?: CraftingRecipeStatus,
): GameState {
  const crownBalance = getCurrencyBalance(state.wallet, "crowns");

  return appendDebugTelemetryEvent(state, {
    type: "craft_failed",
    entityId: getCraftingTelemetryEntityId(state),
    craftingRecipeId: recipeId,
    outputItemId: recipe?.outputItemId,
    outputQuantity: recipe?.outputQuantity,
    craftingFailureReason: reason,
    craftingRequirements: status
      ? getCraftingRequirementsForTelemetry(status)
      : undefined,
    crownCost: recipe?.crownCost,
    previousCurrencyBalance: status?.crownBalance ?? crownBalance,
    nextCurrencyBalance: status?.crownBalance ?? crownBalance,
    inventoryUsedSlots: state.inventory.slots.length,
    inventoryCapacity: state.inventory.capacity,
    inventoryFreeSlotsBefore: getAvailableInventorySlots(state.inventory),
    inventoryFreeSlotsAfter: getAvailableInventorySlots(state.inventory),
  });
}

function appendCraftingSucceededTelemetry(
  state: GameState,
  recipe: CraftingRecipe,
  status: CraftingRecipeStatus,
  consumedCraftingItems: DebugCraftingConsumedItemTelemetryRow[],
  previousCrowns: number,
  nextCrowns: number,
  previousState: GameState,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: "craft_succeeded",
    entityId: getCraftingTelemetryEntityId(previousState),
    craftingRecipeId: recipe.id,
    outputItemId: recipe.outputItemId,
    outputQuantity: recipe.outputQuantity,
    craftingRequirements: getCraftingRequirementsForTelemetry(status),
    consumedCraftingItems,
    crownCost: recipe.crownCost,
    previousCurrencyBalance: previousCrowns,
    nextCurrencyBalance: nextCrowns,
    inventoryUsedSlots: state.inventory.slots.length,
    inventoryCapacity: state.inventory.capacity,
    inventoryFreeSlotsBefore: getAvailableInventorySlots(previousState.inventory),
    inventoryFreeSlotsAfter: getAvailableInventorySlots(state.inventory),
  });
}

function getCraftingRequirementsForTelemetry(
  status: CraftingRecipeStatus,
): DebugCraftingRequirementTelemetryRow[] {
  return status.requirements.map((requirement) => ({
    kind: requirement.kind,
    ...(requirement.kind === "item"
      ? { itemId: requirement.itemId }
      : {
          equipmentType: requirement.equipmentType,
          armorFamily: requirement.armorFamily,
          levelRequirement: requirement.levelRequirement,
        }),
    displayName: requirement.displayName,
    ownedQuantity: requirement.ownedQuantity,
    requiredQuantity: requirement.quantity,
    isMet: requirement.isMet,
  }));
}

function getConsumedCraftingItemsForTelemetry(
  inventory: PartyInventory,
  requirements: CraftingCost[],
): DebugCraftingConsumedItemTelemetryRow[] {
  const lockedSlotIndices = getLockedInventorySlotIndices(inventory);
  const rows: DebugCraftingConsumedItemTelemetryRow[] = [];
  const remainingSlots = inventory.slots.map((slot) => ({ ...slot }));

  for (const requirement of requirements) {
    let remainingQuantity = requirement.quantity;

    for (
      let arrayIndex = 0;
      arrayIndex < remainingSlots.length && remainingQuantity > 0;
      arrayIndex += 1
    ) {
      const slot = remainingSlots[arrayIndex];
      const slotIndex = getInventorySlotIndex(slot, arrayIndex);

      if (
        lockedSlotIndices.includes(slotIndex) ||
        !doesInventorySlotMatchCraftingRequirement(slot, requirement)
      ) {
        continue;
      }

      const quantity = Math.min(slot.quantity, remainingQuantity);
      const itemDefinition = getItemDefinition(slot.itemId);
      rows.push({
        kind: requirement.kind,
        itemId: slot.itemId,
        itemDisplayName: getItemDisplayName(slot.itemId),
        quantity,
        ...(requirement.kind === "equipment"
          ? {
              equipmentType: requirement.equipmentType,
              armorFamily: requirement.armorFamily ?? itemDefinition.armorFamily,
              levelRequirement:
                requirement.levelRequirement ?? itemDefinition.levelRequirement,
            }
          : {}),
      });
      remainingSlots[arrayIndex] = {
        ...slot,
        quantity: slot.quantity - quantity,
      };
      remainingQuantity -= quantity;
    }
  }

  return rows;
}

function getCraftingTelemetryEntityId(state: GameState): string {
  return getPartyLeader(state)?.id ?? state.partyLeaderId ?? "crafting";
}

function createCraftingFailure(
  state: GameState,
  recipeId: CraftingRecipeId,
  reason: CraftingFailureReason,
  recipe?: CraftingRecipe,
  status?: CraftingRecipeStatus,
): { state: GameState; result: CraftingResult } {
  const failedState = appendCraftingFailedTelemetry(
    state,
    recipeId,
    reason,
    recipe,
    status,
  );

  return {
    state: failedState,
    result: {
      status: "failed",
      recipeId,
      reason,
    },
  };
}
