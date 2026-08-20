import type { GameState } from "./state";
import type {
  InnRoomUpgradeId,
  InnRoomUpgradeLevels,
  InnUpgradesState,
} from "./types";
import {
  createInitialInnKitchenUpgradeLevels,
  sanitizeInnKitchenUpgradeLevels,
} from "./innKitchenUpgrades";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";

export const INN_ROOM_BASE_CAPACITY = 4;
export const INN_ROOM_COUNT_MAX_LEVEL = 5;

export const INN_ROOM_UPGRADE_IDS: InnRoomUpgradeId[] = [
  "inn_room_count",
];

export type InnRoomUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "max_level"
  | "insufficient_crowns";

export type InnRoomUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: InnRoomUpgradeId;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: InnRoomUpgradeId;
      reason: InnRoomUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type InnRoomUpgradeStatus = {
  id: InnRoomUpgradeId;
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

type InnRoomUpgradeDefinition = {
  id: InnRoomUpgradeId;
  displayName: string;
  description: string;
  getCostForNextLevel: (nextLevel: number) => number | null;
  getEffectText: (level: number) => string;
};

const INN_ROOM_UPGRADE_DEFINITIONS: Record<
  InnRoomUpgradeId,
  InnRoomUpgradeDefinition
> = {
  inn_room_count: {
    id: "inn_room_count",
    displayName: "Number of Rooms",
    description: "Adds more Inn rooms for recruited companions.",
    getCostForNextLevel: (nextLevel) =>
      nextLevel >= 2 && nextLevel <= INN_ROOM_COUNT_MAX_LEVEL
        ? (nextLevel - 1) * 100
        : null,
    getEffectText: (level) => `${getInnRoomCapacityForLevel(level)} rooms`,
  },
};

export function createInitialInnUpgradesState(): InnUpgradesState {
  return {
    rooms: createInitialInnRoomUpgradeLevels(),
    kitchen: createInitialInnKitchenUpgradeLevels(),
  };
}

export function getInnUpgradesState(state: GameState): InnUpgradesState {
  return sanitizeInnUpgradesState(state.innUpgrades);
}

export function sanitizeInnUpgradesState(
  innUpgrades: Partial<InnUpgradesState> | undefined,
): InnUpgradesState {
  return {
    rooms: sanitizeInnRoomUpgradeLevels(innUpgrades?.rooms),
    kitchen: sanitizeInnKitchenUpgradeLevels(innUpgrades?.kitchen),
  };
}

export function getInnRoomCapacity(state?: GameState): number {
  return state
    ? getInnRoomCapacityForLevel(getInnUpgradesState(state).rooms.inn_room_count)
    : INN_ROOM_BASE_CAPACITY;
}

export function getInnRoomUpgradeStatuses(
  state: GameState,
): InnRoomUpgradeStatus[] {
  const upgrades = getInnUpgradesState(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return INN_ROOM_UPGRADE_IDS.map((upgradeId) => {
    const definition = INN_ROOM_UPGRADE_DEFINITIONS[upgradeId];
    const level = upgrades.rooms[upgradeId];
    const nextLevel = level >= INN_ROOM_COUNT_MAX_LEVEL ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.getCostForNextLevel(nextLevel)
      : null;

    return {
      id: upgradeId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel: INN_ROOM_COUNT_MAX_LEVEL,
      currentEffect: definition.getEffectText(level),
      nextEffect: nextLevel ? definition.getEffectText(nextLevel) : null,
      nextCostCrowns,
      isLocked: false,
      isMaxLevel: level >= INN_ROOM_COUNT_MAX_LEVEL,
      lockReason: null,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseInnRoomUpgrade(
  state: GameState,
  upgradeId: InnRoomUpgradeId,
): InnRoomUpgradePurchaseResult {
  if (!INN_ROOM_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      reason: "unknown_upgrade",
      currentLevel: 1,
      costCrowns: null,
    };
  }

  const upgrades = getInnUpgradesState(state);
  const currentLevel = upgrades.rooms[upgradeId];

  if (currentLevel >= INN_ROOM_COUNT_MAX_LEVEL) {
    return {
      ok: false,
      state: {
        ...state,
        innUpgrades: upgrades,
      },
      upgradeId,
      reason: "max_level",
      currentLevel,
      costCrowns: null,
    };
  }

  const nextLevel = currentLevel + 1;
  const costCrowns =
    INN_ROOM_UPGRADE_DEFINITIONS[upgradeId].getCostForNextLevel(nextLevel);

  if (!costCrowns || !canAfford(state.wallet, "crowns", costCrowns)) {
    return {
      ok: false,
      state: {
        ...state,
        innUpgrades: upgrades,
      },
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  const currencyRemoval = removeCurrencyFromWalletState(
    {
      ...state,
      innUpgrades: upgrades,
    },
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
    state: {
      ...currencyRemoval.state,
      innUpgrades: {
        ...upgrades,
        rooms: {
          ...upgrades.rooms,
          [upgradeId]: nextLevel,
        },
      },
    },
    upgradeId,
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

function createInitialInnRoomUpgradeLevels(): InnRoomUpgradeLevels {
  return {
    inn_room_count: 1,
  };
}

function sanitizeInnRoomUpgradeLevels(
  levels: Partial<InnRoomUpgradeLevels> | undefined,
): InnRoomUpgradeLevels {
  const defaults = createInitialInnRoomUpgradeLevels();

  return {
    inn_room_count: sanitizeUpgradeLevel(
      levels?.inn_room_count,
      defaults.inn_room_count,
    ),
  };
}

function sanitizeUpgradeLevel(level: number | undefined, fallback: number): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.min(INN_ROOM_COUNT_MAX_LEVEL, Math.max(1, Math.floor(level)))
    : fallback;
}

function getInnRoomCapacityForLevel(level: number): number {
  return INN_ROOM_BASE_CAPACITY + Math.max(1, Math.floor(level)) - 1;
}
