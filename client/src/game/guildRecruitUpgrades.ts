import type { GameState } from "./state";
import type {
  GuildNoticeBoardUpgradeId,
  GuildNoticeBoardUpgradeLevels,
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
export const GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL = 3;

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

export type GuildNoticeBoardUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "max_level"
  | "insufficient_crowns";

export type GuildNoticeBoardUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: GuildNoticeBoardUpgradeId;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: GuildNoticeBoardUpgradeId;
      reason: GuildNoticeBoardUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type GuildNoticeBoardUpgradeStatus = {
  id: GuildNoticeBoardUpgradeId;
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

type GuildNoticeBoardUpgradeDefinition = {
  id: GuildNoticeBoardUpgradeId;
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

export const GUILD_NOTICE_BOARD_UPGRADE_IDS: GuildNoticeBoardUpgradeId[] = [
  "notice_board_slots",
  "notice_board_reward_quality",
  "notice_board_refresh_rate",
  "notice_board_scouts",
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

const GUILD_NOTICE_BOARD_UPGRADE_DEFINITIONS: Record<
  GuildNoticeBoardUpgradeId,
  GuildNoticeBoardUpgradeDefinition
> = {
  notice_board_slots: {
    id: "notice_board_slots",
    displayName: "Quest Slots",
    description: "Shows more Notice Board quests at once.",
    costsByNextLevel: {
      2: 750,
      3: 2000,
    },
    effectTextByLevel: {
      1: "1 posting",
      2: "2 postings",
      3: "3 postings",
    },
  },
  notice_board_reward_quality: {
    id: "notice_board_reward_quality",
    displayName: "Reward Quality",
    description: "Improves Crowns and extra book reward chance.",
    costsByNextLevel: {
      2: 300,
      3: 750,
    },
    effectTextByLevel: {
      1: "100%",
      2: "110%",
      3: "120%",
    },
  },
  notice_board_refresh_rate: {
    id: "notice_board_refresh_rate",
    displayName: "Refresh Rate",
    description: "Reduces the shared Notice Board refresh timer.",
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
  notice_board_scouts: {
    id: "notice_board_scouts",
    displayName: "Scouts",
    description: "Unlocks board-wide rerolls and daily reroll uses.",
    costsByNextLevel: {
      1: 500,
      2: 1000,
      3: 2000,
    },
    effectTextByLevel: {
      0: "Locked",
      1: "1 reroll/day",
      2: "2 rerolls/day",
      3: "3 rerolls/day",
    },
  },
};

export function createInitialGuildUpgradesState(): GuildUpgradesState {
  return {
    recruit: createInitialGuildRecruitUpgradeLevels(),
    noticeBoard: createInitialGuildNoticeBoardUpgradeLevels(),
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
    noticeBoard: sanitizeGuildNoticeBoardUpgradeLevels(guildUpgrades?.noticeBoard),
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
        ...upgrades,
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

export function getGuildNoticeBoardUpgradeStatuses(
  state: GameState,
): GuildNoticeBoardUpgradeStatus[] {
  const upgrades = getGuildUpgradesState(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return GUILD_NOTICE_BOARD_UPGRADE_IDS.map((upgradeId) => {
    const definition = GUILD_NOTICE_BOARD_UPGRADE_DEFINITIONS[upgradeId];
    const level = upgrades.noticeBoard[upgradeId];
    const nextLevel =
      level >= GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.costsByNextLevel[nextLevel] ?? null
      : null;

    return {
      id: upgradeId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel: GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL,
      currentEffect: definition.effectTextByLevel[level],
      nextEffect: nextLevel ? definition.effectTextByLevel[nextLevel] : null,
      nextCostCrowns,
      isLocked: false,
      isMaxLevel: level >= GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL,
      lockReason: null,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseGuildNoticeBoardUpgrade(
  state: GameState,
  upgradeId: GuildNoticeBoardUpgradeId,
): GuildNoticeBoardUpgradePurchaseResult {
  if (!GUILD_NOTICE_BOARD_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      reason: "unknown_upgrade",
      currentLevel: upgradeId === "notice_board_scouts" ? 0 : 1,
      costCrowns: null,
    };
  }

  const upgrades = getGuildUpgradesState(state);
  const currentLevel = upgrades.noticeBoard[upgradeId];

  if (currentLevel >= GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL) {
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
    GUILD_NOTICE_BOARD_UPGRADE_DEFINITIONS[upgradeId].costsByNextLevel[
      nextLevel
    ];

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
        ...upgrades,
        noticeBoard: {
          ...upgrades.noticeBoard,
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

export function getGuildNoticeBoardSlotCount(state?: GameState): number {
  return state ? getGuildUpgradesState(state).noticeBoard.notice_board_slots : 1;
}

export function getGuildNoticeBoardRefreshIntervalMs(state?: GameState): number {
  const level = state
    ? getGuildUpgradesState(state).noticeBoard.notice_board_refresh_rate
    : 1;

  return (181 - level) * 60 * 1000;
}

export function getGuildNoticeBoardRewardPercent(state: GameState): number {
  const level = getGuildUpgradesState(state).noticeBoard
    .notice_board_reward_quality;

  return 90 + level * 10;
}

export function getGuildNoticeBoardDailyRerollLimit(state: GameState): number {
  return getGuildUpgradesState(state).noticeBoard.notice_board_scouts;
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

function createInitialGuildNoticeBoardUpgradeLevels(): GuildNoticeBoardUpgradeLevels {
  return {
    notice_board_slots: 1,
    notice_board_reward_quality: 1,
    notice_board_refresh_rate: 1,
    notice_board_scouts: 0,
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

function sanitizeGuildNoticeBoardUpgradeLevels(
  levels: Partial<GuildNoticeBoardUpgradeLevels> | undefined,
): GuildNoticeBoardUpgradeLevels {
  const defaults = createInitialGuildNoticeBoardUpgradeLevels();

  return Object.fromEntries(
    GUILD_NOTICE_BOARD_UPGRADE_IDS.map((upgradeId) => [
      upgradeId,
      sanitizeUpgradeLevelWithMinimum(
        levels?.[upgradeId],
        defaults[upgradeId],
        upgradeId === "notice_board_scouts" ? 0 : 1,
      ),
    ]),
  ) as GuildNoticeBoardUpgradeLevels;
}

function sanitizeUpgradeLevel(level: number | undefined, fallback: number): number {
  return sanitizeUpgradeLevelWithMinimum(level, fallback, 1);
}

function sanitizeUpgradeLevelWithMinimum(
  level: number | undefined,
  fallback: number,
  minimumLevel: number,
): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.min(
        GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
        Math.max(minimumLevel, Math.floor(level)),
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
