import type { GameState } from "./state";
import type {
  GuildRecruitUpgradeId,
  GuildRecruitUpgradeLevels,
  GuildUpgradesState,
} from "./types";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";

export const GUILD_RECRUIT_UPGRADE_MAX_LEVEL = 3;

export type GuildRecruitUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "max_level"
  | "locked"
  | "insufficient_crowns";

export type GuildRecruitUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: GuildRecruitUpgradeId;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: GuildRecruitUpgradeId;
      reason: GuildRecruitUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type GuildRecruitUpgradeStatus = {
  id: GuildRecruitUpgradeId;
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

type GuildRecruitUpgradeDefinition = {
  id: GuildRecruitUpgradeId;
  displayName: string;
  description: string;
  costsByNextLevel: Partial<Record<number, number>>;
  effectTextByLevel: Record<number, string>;
};

export const GUILD_RECRUIT_UPGRADE_IDS: GuildRecruitUpgradeId[] = [
  "recruit_slots",
  "recruit_max_level",
  "recruit_min_level",
  "recruit_refresh_rate",
  "recruit_equipment_chance",
  "recruit_skill_chance",
];

const GUILD_RECRUIT_UPGRADE_DEFINITIONS: Record<
  GuildRecruitUpgradeId,
  GuildRecruitUpgradeDefinition
> = {
  recruit_slots: {
    id: "recruit_slots",
    displayName: "Recruit Slots",
    description: "Show more recruit candidates at once.",
    costsByNextLevel: {
      2: 500,
      3: 1500,
    },
    effectTextByLevel: {
      1: "1 candidate",
      2: "2 candidates",
      3: "3 candidates",
    },
  },
  recruit_max_level: {
    id: "recruit_max_level",
    displayName: "Recruit Max Level",
    description: "Raises the highest level a recruit can arrive at.",
    costsByNextLevel: {
      2: 150,
      3: 300,
    },
    effectTextByLevel: {
      1: "Max Lv 1",
      2: "Max Lv 2",
      3: "Max Lv 3",
    },
  },
  recruit_min_level: {
    id: "recruit_min_level",
    displayName: "Recruit Min Level",
    description: "Raises the lowest level a recruit can arrive at.",
    costsByNextLevel: {
      2: 300,
      3: 450,
    },
    effectTextByLevel: {
      1: "Min Lv 1",
      2: "Min Lv 2",
      3: "Min Lv 3",
    },
  },
  recruit_refresh_rate: {
    id: "recruit_refresh_rate",
    displayName: "Refresh Rate",
    description: "Reduces the shared recruit refresh timer.",
    costsByNextLevel: {
      2: 100,
      3: 200,
    },
    effectTextByLevel: {
      1: "180 min",
      2: "179 min",
      3: "178 min",
    },
  },
  recruit_equipment_chance: {
    id: "recruit_equipment_chance",
    displayName: "Recruit Equipment Chance",
    description: "Improves the chance recruits arrive with equipment.",
    costsByNextLevel: {
      2: 250,
      3: 500,
    },
    effectTextByLevel: {
      1: "50%",
      2: "100%",
      3: "150%",
    },
  },
  recruit_skill_chance: {
    id: "recruit_skill_chance",
    displayName: "Recruit Skill Chance",
    description: "Improves the chance recruits arrive with boosted Beginner skills.",
    costsByNextLevel: {
      2: 250,
      3: 500,
    },
    effectTextByLevel: {
      1: "50%",
      2: "100%",
      3: "150%",
    },
  },
};

export function createInitialGuildUpgradesState(): GuildUpgradesState {
  return {
    recruit: createInitialGuildRecruitUpgradeLevels(),
  };
}

export function getGuildUpgradesState(state: GameState): GuildUpgradesState {
  return sanitizeGuildUpgradesState(state.guildUpgrades);
}

export function sanitizeGuildUpgradesState(
  guildUpgrades: GuildUpgradesState | undefined,
): GuildUpgradesState {
  return {
    recruit: sanitizeGuildRecruitUpgradeLevels(guildUpgrades?.recruit),
  };
}

export function getGuildRecruitUpgradeStatuses(
  state: GameState,
): GuildRecruitUpgradeStatus[] {
  const upgrades = getGuildUpgradesState(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return GUILD_RECRUIT_UPGRADE_IDS.map((upgradeId) => {
    const definition = GUILD_RECRUIT_UPGRADE_DEFINITIONS[upgradeId];
    const level = upgrades.recruit[upgradeId];
    const nextLevel =
      level >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.costsByNextLevel[nextLevel] ?? null
      : null;
    const lockReason = getGuildRecruitUpgradeLockReason(upgrades, upgradeId);

    return {
      id: upgradeId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel: GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
      currentEffect: definition.effectTextByLevel[level],
      nextEffect: nextLevel ? definition.effectTextByLevel[nextLevel] : null,
      nextCostCrowns,
      isLocked: Boolean(lockReason),
      isMaxLevel: level >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
      lockReason,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseGuildRecruitUpgrade(
  state: GameState,
  upgradeId: GuildRecruitUpgradeId,
): GuildRecruitUpgradePurchaseResult {
  if (!GUILD_RECRUIT_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      reason: "unknown_upgrade",
      currentLevel: 1,
      costCrowns: null,
    };
  }

  const upgrades = getGuildUpgradesState(state);
  const currentLevel = upgrades.recruit[upgradeId];
  const lockReason = getGuildRecruitUpgradeLockReason(upgrades, upgradeId);

  if (lockReason) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "locked",
      currentLevel,
      costCrowns: null,
    };
  }

  if (currentLevel >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "max_level",
      currentLevel,
      costCrowns: null,
    };
  }

  const nextLevel = currentLevel + 1;
  const costCrowns =
    GUILD_RECRUIT_UPGRADE_DEFINITIONS[upgradeId].costsByNextLevel[nextLevel];

  if (!costCrowns || !canAfford(state.wallet, "crowns", costCrowns)) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns: costCrowns ?? null,
    };
  }

  const currencyRemoval = removeCurrencyFromWalletState(
    {
      ...state,
      guildUpgrades: upgrades,
    },
    "crowns",
    costCrowns,
    "guild_upgrade",
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
      guildUpgrades: {
        recruit: {
          ...upgrades.recruit,
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

export function getGuildRecruitSlotCount(state: GameState): number {
  return getGuildUpgradesState(state).recruit.recruit_slots;
}

export function getGuildRecruitLevelRange(state: GameState): {
  min: number;
  max: number;
} {
  const upgrades = getGuildUpgradesState(state).recruit;
  const max = upgrades.recruit_max_level;
  const min =
    upgrades.recruit_max_level >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL
      ? Math.min(upgrades.recruit_min_level, max)
      : 1;

  return {
    min,
    max,
  };
}

export function getGuildRecruitRefreshIntervalMs(state: GameState): number {
  const level = getGuildUpgradesState(state).recruit.recruit_refresh_rate;

  return (181 - level) * 60 * 1000;
}

export function getGuildRecruitEquipmentChancePercent(state: GameState): number {
  return getGuildUpgradesState(state).recruit.recruit_equipment_chance * 50;
}

export function getGuildRecruitSkillChancePercent(state: GameState): number {
  return getGuildUpgradesState(state).recruit.recruit_skill_chance * 50;
}

function createInitialGuildRecruitUpgradeLevels(): GuildRecruitUpgradeLevels {
  return {
    recruit_slots: 1,
    recruit_max_level: 1,
    recruit_min_level: 1,
    recruit_refresh_rate: 1,
    recruit_equipment_chance: 1,
    recruit_skill_chance: 1,
  };
}

function sanitizeGuildRecruitUpgradeLevels(
  levels: Partial<GuildRecruitUpgradeLevels> | undefined,
): GuildRecruitUpgradeLevels {
  const defaults = createInitialGuildRecruitUpgradeLevels();

  return Object.fromEntries(
    GUILD_RECRUIT_UPGRADE_IDS.map((upgradeId) => [
      upgradeId,
      sanitizeUpgradeLevel(levels?.[upgradeId], defaults[upgradeId]),
    ]),
  ) as GuildRecruitUpgradeLevels;
}

function sanitizeUpgradeLevel(level: number | undefined, fallback: number): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.min(
        GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
        Math.max(1, Math.floor(level)),
      )
    : fallback;
}

function getGuildRecruitUpgradeLockReason(
  upgrades: GuildUpgradesState,
  upgradeId: GuildRecruitUpgradeId,
): string | null {
  if (
    upgradeId === "recruit_min_level" &&
    upgrades.recruit.recruit_max_level < GUILD_RECRUIT_UPGRADE_MAX_LEVEL
  ) {
    return "Requires Recruit Max Level Lv 3";
  }

  return null;
}
