import type { GameState } from "./state";
import type {
  InnKitchenUpgradeId,
  InnKitchenUpgradeLevels,
  InnUpgradesState,
} from "./types";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";

export const INN_KITCHEN_HEARTH_CAPACITY_BASE = 10;
export const INN_KITCHEN_HEARTH_CAPACITY_PER_LEVEL = 2;
export const INN_KITCHEN_HEARTH_CAPACITY_MAX_LEVEL = 10;
export const INN_KITCHEN_FIRE_GENERATION_BASE_PER_HOUR = 2;
export const INN_KITCHEN_FIRE_GENERATION_MAX_LEVEL_PER_TIER = 10;
export const INN_KITCHEN_HEARTH_TIER_MAX_LEVEL = 2;
export const INN_KITCHEN_EFFICIENT_COOKING_MAX_LEVEL = 3;
export const INN_KITCHEN_EFFICIENT_COOKING_DISCOUNT_PER_LEVEL = 5;
export const INN_KITCHEN_HEARTH_TIER_ONE_COST_CROWNS = 1000;

export const INN_KITCHEN_UPGRADE_IDS: InnKitchenUpgradeId[] = [
  "hearth_capacity",
  "fire_generation",
  "hearth_tier",
  "efficient_cooking",
];

export type InnKitchenUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "max_level"
  | "insufficient_crowns";

export type InnKitchenUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: InnKitchenUpgradeId;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: InnKitchenUpgradeId;
      reason: InnKitchenUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type InnKitchenUpgradeStatus = {
  id: InnKitchenUpgradeId;
  displayName: string;
  description: string;
  level: number;
  maxLevel: number;
  currentEffect: string;
  nextEffect: string | null;
  nextCostCrowns: number | null;
  isLocked: boolean;
  isMaxLevel: boolean;
  lockReason: string | null;
  canAfford: boolean;
};

type InnKitchenUpgradeDefinition = {
  id: InnKitchenUpgradeId;
  displayName: string;
  description: string;
  maxLevel: number;
  getCostForNextLevel: (
    nextLevel: number,
    upgrades: InnKitchenUpgradeLevels,
  ) => number | null;
  getEffectText: (level: number, upgrades: InnKitchenUpgradeLevels) => string;
};

const INN_KITCHEN_UPGRADE_DEFINITIONS: Record<
  InnKitchenUpgradeId,
  InnKitchenUpgradeDefinition
> = {
  hearth_capacity: {
    id: "hearth_capacity",
    displayName: "Hearth Capacity",
    description: "Increases how much Hearth's Fire the Kitchen can hold.",
    maxLevel: INN_KITCHEN_HEARTH_CAPACITY_MAX_LEVEL,
    getCostForNextLevel: (nextLevel) =>
      nextLevel >= 2 && nextLevel <= INN_KITCHEN_HEARTH_CAPACITY_MAX_LEVEL
        ? (nextLevel - 1) * 100
        : null,
    getEffectText: (level) =>
      `${getInnKitchenHearthCapacityForLevel(level)} Hearth's Fire`,
  },
  fire_generation: {
    id: "fire_generation",
    displayName: "Fire Generation",
    description: "Builds Hearth's Fire faster over time.",
    maxLevel: INN_KITCHEN_FIRE_GENERATION_MAX_LEVEL_PER_TIER,
    getCostForNextLevel: (nextLevel, upgrades) =>
      nextLevel >= 2 &&
      nextLevel <= getInnKitchenFireGenerationLevelCap(upgrades)
        ? (nextLevel - 1) * 100
        : null,
    getEffectText: (level) =>
      `${getInnKitchenFireGenerationPerHourForLevel(level)} Fire/hour`,
  },
  hearth_tier: {
    id: "hearth_tier",
    displayName: "Hearth Tier",
    description: "Unlocks the next Fire Generation band.",
    maxLevel: INN_KITCHEN_HEARTH_TIER_MAX_LEVEL,
    getCostForNextLevel: (nextLevel) =>
      nextLevel === 2 ? INN_KITCHEN_HEARTH_TIER_ONE_COST_CROWNS : null,
    getEffectText: (level) => `Tier ${level}`,
  },
  efficient_cooking: {
    id: "efficient_cooking",
    displayName: "Efficient Cooking",
    description: "Reduces Crown and Hearth's Fire costs when cooking.",
    maxLevel: INN_KITCHEN_EFFICIENT_COOKING_MAX_LEVEL,
    getCostForNextLevel: (nextLevel) =>
      nextLevel >= 1 && nextLevel <= INN_KITCHEN_EFFICIENT_COOKING_MAX_LEVEL
        ? nextLevel * 100
        : null,
    getEffectText: (level) =>
      `${getInnKitchenEfficientCookingDiscountPercentForLevel(level)}% discount`,
  },
};

export function createInitialInnKitchenUpgradeLevels(): InnKitchenUpgradeLevels {
  return {
    hearth_capacity: 1,
    fire_generation: 1,
    hearth_tier: 1,
    efficient_cooking: 0,
  };
}

export function sanitizeInnKitchenUpgradeLevels(
  levels: Partial<InnKitchenUpgradeLevels> | undefined,
): InnKitchenUpgradeLevels {
  const defaults = createInitialInnKitchenUpgradeLevels();
  const hearthTier = sanitizeUpgradeLevel(
    levels?.hearth_tier,
    defaults.hearth_tier,
    1,
    INN_KITCHEN_HEARTH_TIER_MAX_LEVEL,
  );
  const fireGeneration = sanitizeUpgradeLevel(
    levels?.fire_generation,
    defaults.fire_generation,
    1,
    getInnKitchenFireGenerationLevelCap({
      ...defaults,
      hearth_tier: hearthTier,
    }),
  );

  return {
    hearth_capacity: sanitizeUpgradeLevel(
      levels?.hearth_capacity,
      defaults.hearth_capacity,
      1,
      INN_KITCHEN_HEARTH_CAPACITY_MAX_LEVEL,
    ),
    fire_generation: fireGeneration,
    hearth_tier: hearthTier,
    efficient_cooking: sanitizeUpgradeLevel(
      levels?.efficient_cooking,
      defaults.efficient_cooking,
      0,
      INN_KITCHEN_EFFICIENT_COOKING_MAX_LEVEL,
    ),
  };
}

export function getInnKitchenUpgradeStatuses(
  state: GameState,
): InnKitchenUpgradeStatus[] {
  const upgrades = getInnKitchenUpgradeLevels(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return getVisibleInnKitchenUpgradeIds(upgrades).map((upgradeId) => {
    const definition = INN_KITCHEN_UPGRADE_DEFINITIONS[upgradeId];
    const level = upgrades[upgradeId];
    const maxLevel =
      upgradeId === "fire_generation"
        ? getInnKitchenFireGenerationLevelCap(upgrades)
        : definition.maxLevel;
    const nextLevel = level >= maxLevel ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.getCostForNextLevel(nextLevel, upgrades)
      : null;

    return {
      id: upgradeId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel,
      currentEffect: definition.getEffectText(level, upgrades),
      nextEffect: nextLevel ? definition.getEffectText(nextLevel, upgrades) : null,
      nextCostCrowns,
      isLocked: false,
      isMaxLevel: level >= maxLevel,
      lockReason: null,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseInnKitchenUpgrade(
  state: GameState,
  upgradeId: InnKitchenUpgradeId,
): InnKitchenUpgradePurchaseResult {
  const upgrades = getInnKitchenUpgradeLevels(state);

  if (!INN_KITCHEN_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      reason: "unknown_upgrade",
      currentLevel: 0,
      costCrowns: null,
    };
  }

  const definition = INN_KITCHEN_UPGRADE_DEFINITIONS[upgradeId];
  const maxLevel =
    upgradeId === "fire_generation"
      ? getInnKitchenFireGenerationLevelCap(upgrades)
      : definition.maxLevel;
  const currentLevel = upgrades[upgradeId];

  if (currentLevel >= maxLevel) {
    return {
      ok: false,
      state: withSanitizedKitchenUpgrades(state, upgrades),
      upgradeId,
      reason: "max_level",
      currentLevel,
      costCrowns: null,
    };
  }

  const nextLevel = currentLevel + 1;
  const costCrowns = definition.getCostForNextLevel(nextLevel, upgrades);

  if (!costCrowns || !canAfford(state.wallet, "crowns", costCrowns)) {
    return {
      ok: false,
      state: withSanitizedKitchenUpgrades(state, upgrades),
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  const currencyRemoval = removeCurrencyFromWalletState(
    withSanitizedKitchenUpgrades(state, upgrades),
    "crowns",
    costCrowns,
    "inn_upgrade",
  );

  if (currencyRemoval.result.status !== "success") {
    return {
      ok: false,
      state: currencyRemoval.state,
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  return {
    ok: true,
    state: withSanitizedKitchenUpgrades(currencyRemoval.state, {
      ...upgrades,
      [upgradeId]: nextLevel,
    }),
    upgradeId,
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

export function getInnKitchenHearthCapacity(state: GameState): number {
  return getInnKitchenHearthCapacityForLevel(
    getInnKitchenUpgradeLevels(state).hearth_capacity,
  );
}

export function getInnKitchenFireGenerationPerHour(state: GameState): number {
  return getInnKitchenFireGenerationPerHourForLevel(
    getInnKitchenUpgradeLevels(state).fire_generation,
  );
}

export function getInnKitchenEfficientCookingDiscountPercent(
  state: GameState,
): number {
  return getInnKitchenEfficientCookingDiscountPercentForLevel(
    getInnKitchenUpgradeLevels(state).efficient_cooking,
  );
}

export function getInnKitchenHearthCapacityForLevel(level: number): number {
  return (
    INN_KITCHEN_HEARTH_CAPACITY_BASE +
    Math.max(0, Math.floor(level) - 1) * INN_KITCHEN_HEARTH_CAPACITY_PER_LEVEL
  );
}

export function getInnKitchenFireGenerationPerHourForLevel(
  level: number,
): number {
  return INN_KITCHEN_FIRE_GENERATION_BASE_PER_HOUR + Math.max(0, level - 1);
}

export function getInnKitchenEfficientCookingDiscountPercentForLevel(
  level: number,
): number {
  return Math.max(0, Math.floor(level)) *
    INN_KITCHEN_EFFICIENT_COOKING_DISCOUNT_PER_LEVEL;
}

function getInnKitchenUpgradeLevels(state: GameState): InnKitchenUpgradeLevels {
  return state.innUpgrades?.kitchen
    ? sanitizeInnKitchenUpgradeLevels(state.innUpgrades.kitchen)
    : createInitialInnKitchenUpgradeLevels();
}

function getVisibleInnKitchenUpgradeIds(
  upgrades: InnKitchenUpgradeLevels,
): InnKitchenUpgradeId[] {
  if (
    upgrades.fire_generation >= getInnKitchenFireGenerationLevelCap(upgrades) &&
    upgrades.hearth_tier < INN_KITCHEN_HEARTH_TIER_MAX_LEVEL
  ) {
    return ["hearth_capacity", "hearth_tier", "efficient_cooking"];
  }

  return ["hearth_capacity", "fire_generation", "efficient_cooking"];
}

function getInnKitchenFireGenerationLevelCap(
  upgrades: InnKitchenUpgradeLevels,
): number {
  return upgrades.hearth_tier * INN_KITCHEN_FIRE_GENERATION_MAX_LEVEL_PER_TIER;
}

function withSanitizedKitchenUpgrades(
  state: GameState,
  kitchen: InnKitchenUpgradeLevels,
): GameState {
  const innUpgrades: InnUpgradesState = {
    rooms: state.innUpgrades?.rooms ?? { inn_room_count: 1 },
    kitchen,
  };

  return {
    ...state,
    innUpgrades,
  };
}

function sanitizeUpgradeLevel(
  level: number | undefined,
  fallback: number,
  minLevel: number,
  maxLevel: number,
): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.min(maxLevel, Math.max(minLevel, Math.floor(level)))
    : fallback;
}
