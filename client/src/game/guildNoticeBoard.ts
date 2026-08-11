import { addItemToInventoryState } from "./inventory";
import { getItemDefinition } from "./items";
import type { GameState } from "./state";
import {
  SKILL_BOOK_ITEM_IDS_BY_SKILL_ID,
  isSkillBookItemDefinition,
} from "./skillProgression";
import type {
  Enemy,
  EnemyTypeId,
  GuildNoticeBoardClaimedReward,
  GuildNoticeBoardQuest,
  GuildNoticeBoardQuestObjective,
  GuildNoticeBoardQuestReward,
  GuildNoticeBoardQuestStatus,
  GuildNoticeBoardState,
  SkillBookItemId,
} from "./types";
import { addCurrencyToWalletState } from "./wallet";

export const GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const GUILD_NOTICE_BOARD_SLOT_COUNT = 1;
export const GUILD_NOTICE_BOARD_REWARD_CROWNS = 100;

type GuildNoticeBoardTemplate = {
  title: string;
  targetEnemyTypeIds: EnemyTypeId[];
};

export type GuildNoticeBoardTakeResult =
  | { ok: true; state: GameState; quest: GuildNoticeBoardQuest }
  | { ok: false; state: GameState; reason: "no_available_quest" };

export type GuildNoticeBoardCancelResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: "no_taken_quest" };

export type GuildNoticeBoardOpenResult = {
  state: GameState;
  claimedRewards: GuildNoticeBoardClaimedReward[];
};

const questTemplates: GuildNoticeBoardTemplate[] = [
  {
    title: "Ashwatch Field Orders",
    targetEnemyTypeIds: ["goblin_shaman", "ash_wisp"],
  },
  {
    title: "Shaman Watch Culling",
    targetEnemyTypeIds: ["ash_wisp", "goblin_shaman"],
  },
];

const allSkillBookItemIds = Object.values(
  SKILL_BOOK_ITEM_IDS_BY_SKILL_ID,
).filter((itemId): itemId is SkillBookItemId =>
  isSkillBookItemDefinition(getItemDefinition(itemId)),
);

export function createInitialGuildNoticeBoardState(
  nowMs = Date.now(),
): GuildNoticeBoardState {
  return {
    slots: [createGuildNoticeBoardQuest(1, nowMs)],
    nextRefreshAtMs: nowMs + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    questSequence: 1,
    hasSeenCurrentRefresh: false,
  };
}

export function getGuildNoticeBoardState(
  state: GameState,
  nowMs = Date.now(),
): GuildNoticeBoardState {
  return refreshGuildNoticeBoardState(state, nowMs).guildNoticeBoard ??
    createInitialGuildNoticeBoardState(nowMs);
}

export function refreshGuildNoticeBoardState(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const hadGuildNoticeBoard = Boolean(state.guildNoticeBoard);
  const board = sanitizeGuildNoticeBoardState(state.guildNoticeBoard, nowMs);

  if (board.nextRefreshAtMs > nowMs) {
    return hadGuildNoticeBoard ? { ...state, guildNoticeBoard: board } : state;
  }

  let sequence = board.questSequence;
  let changedSlot = false;
  const slots = board.slots.map((slot) => {
    if (!canRefreshSlot(slot)) {
      return slot;
    }

    sequence += 1;
    changedSlot = true;
    return createGuildNoticeBoardQuest(sequence, nowMs);
  });

  const nextBoard: GuildNoticeBoardState = {
    slots,
    nextRefreshAtMs: nowMs + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    questSequence: Math.max(sequence, board.questSequence),
    hasSeenCurrentRefresh: changedSlot ? false : board.hasSeenCurrentRefresh,
  };

  return {
    ...state,
    guildNoticeBoard: nextBoard,
  };
}

export function openGuildNoticeBoard(
  state: GameState,
  nowMs = Date.now(),
): GuildNoticeBoardOpenResult {
  let nextState = refreshGuildNoticeBoardState(state, nowMs);
  let board = getGuildNoticeBoardState(nextState, nowMs);
  const claimedRewards: GuildNoticeBoardClaimedReward[] = [];
  const slots: Array<GuildNoticeBoardQuest | null> = [];

  for (const slot of board.slots) {
    if (!slot || slot.status !== "done" || slot.rewardClaimedAtMs !== null) {
      slots.push(slot);
      continue;
    }

    const rewardResult = grantGuildNoticeBoardReward(
      nextState,
      slot.title,
      slot.rewards,
    );
    nextState = rewardResult.state;
    claimedRewards.push(rewardResult.claimedReward);
    slots.push({
      ...slot,
      rewardClaimedAtMs: nowMs,
    });
  }

  board = {
    ...board,
    slots,
    hasSeenCurrentRefresh: true,
  };

  return {
    state: {
      ...nextState,
      guildNoticeBoard: board,
    },
    claimedRewards,
  };
}

export function takeGuildNoticeBoardQuest(
  state: GameState,
  nowMs = Date.now(),
): GuildNoticeBoardTakeResult {
  const refreshedState = refreshGuildNoticeBoardState(state, nowMs);
  const board = getGuildNoticeBoardState(refreshedState, nowMs);
  const slotIndex = board.slots.findIndex(
    (slot) => slot?.status === "available",
  );

  if (slotIndex < 0) {
    return { ok: false, state: refreshedState, reason: "no_available_quest" };
  }

  const slot = board.slots[slotIndex];

  if (!slot) {
    return { ok: false, state: refreshedState, reason: "no_available_quest" };
  }

  const quest: GuildNoticeBoardQuest = {
    ...slot,
    status: "taken",
    takenAtMs: nowMs,
    levelAnchor: null,
    levelRange: null,
  };
  const slots = [...board.slots];
  slots[slotIndex] = quest;

  return {
    ok: true,
    state: {
      ...refreshedState,
      guildNoticeBoard: {
        ...board,
        slots,
        hasSeenCurrentRefresh: true,
      },
    },
    quest,
  };
}

export function cancelGuildNoticeBoardQuest(
  state: GameState,
  nowMs = Date.now(),
): GuildNoticeBoardCancelResult {
  const refreshedState = refreshGuildNoticeBoardState(state, nowMs);
  const board = getGuildNoticeBoardState(refreshedState, nowMs);
  const slotIndex = board.slots.findIndex((slot) => slot?.status === "taken");

  if (slotIndex < 0) {
    return { ok: false, state: refreshedState, reason: "no_taken_quest" };
  }

  const slots = [...board.slots];
  slots[slotIndex] = null;

  return {
    ok: true,
    state: {
      ...refreshedState,
      guildNoticeBoard: {
        ...board,
        slots,
      },
    },
  };
}

export function recordEnemyDefeatedForGuildNoticeBoard(
  state: GameState,
  defeatedEnemy: Enemy,
): GameState {
  if (defeatedEnemy.state !== "dead" || !defeatedEnemy.enemyTypeId) {
    return state;
  }

  const defeatedEnemyTypeId = defeatedEnemy.enemyTypeId;
  const board = sanitizeGuildNoticeBoardState(state.guildNoticeBoard);
  let changed = false;
  const slots = board.slots.map((slot) => {
    if (!slot || slot.status !== "taken") {
      return slot;
    }

    let progressed = false;
    const objectives = slot.objectives.map((objective) => {
      const nextObjective = updateObjectiveForEnemy(
        objective,
        defeatedEnemyTypeId,
      );
      progressed = progressed || nextObjective !== objective;
      return nextObjective;
    });

    if (!progressed) {
      return slot;
    }

    const status: GuildNoticeBoardQuestStatus = areObjectivesComplete(objectives)
      ? "done"
      : slot.status;

    changed = true;
    return {
      ...slot,
      status,
      objectives,
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    guildNoticeBoard: {
      ...board,
      slots,
      hasSeenCurrentRefresh: false,
    },
  };
}

export function shouldShowGuildNoticeBoardSign(
  state: GameState,
  nowMs = Date.now(),
): boolean {
  const board = getGuildNoticeBoardState(state, nowMs);
  return board.slots.some((slot) => {
    if (!slot) {
      return false;
    }

    if (slot.status === "done" && slot.rewardClaimedAtMs === null) {
      return true;
    }

    return slot.status === "available" && !board.hasSeenCurrentRefresh;
  });
}

export function sanitizeGuildNoticeBoardState(
  guildNoticeBoard: GuildNoticeBoardState | undefined,
  nowMs = Date.now(),
): GuildNoticeBoardState {
  if (!guildNoticeBoard) {
    return createInitialGuildNoticeBoardState(nowMs);
  }

  const questSequence = sanitizeSequence(guildNoticeBoard.questSequence);
  const slots = Array.from({ length: GUILD_NOTICE_BOARD_SLOT_COUNT }, (_, index) =>
    sanitizeGuildNoticeBoardQuest(
      guildNoticeBoard.slots?.[index],
      Math.max(1, questSequence),
      nowMs,
    ),
  );

  return {
    slots,
    nextRefreshAtMs: sanitizeTimestamp(
      guildNoticeBoard.nextRefreshAtMs,
      nowMs + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    ),
    questSequence,
    hasSeenCurrentRefresh: Boolean(guildNoticeBoard.hasSeenCurrentRefresh),
  };
}

function createGuildNoticeBoardQuest(
  sequence: number,
  nowMs: number,
): GuildNoticeBoardQuest {
  const template = questTemplates[(sequence - 1) % questTemplates.length];

  return {
    id: `guild-notice-board-quest-${sequence}`,
    title: template.title,
    sequence,
    status: "available",
    generatedAtMs: nowMs,
    takenAtMs: null,
    levelAnchor: null,
    levelRange: null,
    objectives: template.targetEnemyTypeIds.map((enemyTypeId) => ({
      id: `defeat-${enemyTypeId}`,
      enemyTypeId,
      requiredCount: 50,
      currentCount: 0,
    })),
    rewards: createGuildNoticeBoardReward(sequence),
    rewardClaimedAtMs: null,
  };
}

function createGuildNoticeBoardReward(
  sequence: number,
): GuildNoticeBoardQuestReward {
  return {
    crowns: GUILD_NOTICE_BOARD_REWARD_CROWNS,
    skillBookItemId:
      allSkillBookItemIds[(sequence - 1) % allSkillBookItemIds.length] ??
      "throw_rock_skill_book",
  };
}

function sanitizeGuildNoticeBoardQuest(
  quest: GuildNoticeBoardQuest | null | undefined,
  fallbackSequence: number,
  nowMs: number,
): GuildNoticeBoardQuest | null {
  if (!quest) {
    return null;
  }

  const fallbackQuest = createGuildNoticeBoardQuest(fallbackSequence, nowMs);
  const status = sanitizeQuestStatus(quest.status);
  const objectives = sanitizeObjectives(quest.objectives, fallbackQuest.objectives);
  const reward = sanitizeReward(quest.rewards, fallbackQuest.rewards);
  return {
    ...fallbackQuest,
    id: typeof quest.id === "string" && quest.id ? quest.id : fallbackQuest.id,
    title:
      typeof quest.title === "string" && quest.title
        ? quest.title
        : fallbackQuest.title,
    sequence: sanitizeSequence(quest.sequence),
    status,
    generatedAtMs: sanitizeTimestamp(quest.generatedAtMs, nowMs),
    takenAtMs:
      status === "available" ? null : sanitizeNullableTimestamp(quest.takenAtMs),
    levelAnchor: null,
    levelRange: null,
    objectives,
    rewards: reward,
    rewardClaimedAtMs: sanitizeNullableTimestamp(quest.rewardClaimedAtMs),
  };
}

function sanitizeObjectives(
  objectives: GuildNoticeBoardQuestObjective[] | undefined,
  fallbackObjectives: GuildNoticeBoardQuestObjective[],
): GuildNoticeBoardQuestObjective[] {
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return fallbackObjectives;
  }

  return fallbackObjectives.map((fallbackObjective) => {
    const savedObjective = objectives.find(
      (objective) => objective.id === fallbackObjective.id,
    );

    return {
      ...fallbackObjective,
      currentCount: Math.min(
        fallbackObjective.requiredCount,
        Math.max(0, Math.floor(savedObjective?.currentCount ?? 0)),
      ),
    };
  });
}

function sanitizeReward(
  reward: GuildNoticeBoardQuestReward | undefined,
  fallbackReward: GuildNoticeBoardQuestReward,
): GuildNoticeBoardQuestReward {
  const skillBookItemId = reward?.skillBookItemId;
  return {
    crowns:
      Number.isFinite(reward?.crowns)
        ? Math.max(0, Math.floor(reward?.crowns ?? 0))
        : fallbackReward.crowns,
    skillBookItemId:
      skillBookItemId && allSkillBookItemIds.includes(skillBookItemId)
        ? skillBookItemId
        : fallbackReward.skillBookItemId,
  };
}

function updateObjectiveForEnemy(
  objective: GuildNoticeBoardQuestObjective,
  enemyTypeId: EnemyTypeId,
): GuildNoticeBoardQuestObjective {
  if (
    objective.enemyTypeId !== enemyTypeId ||
    objective.currentCount >= objective.requiredCount
  ) {
    return objective;
  }

  return {
    ...objective,
    currentCount: Math.min(objective.requiredCount, objective.currentCount + 1),
  };
}

function areObjectivesComplete(
  objectives: GuildNoticeBoardQuestObjective[],
): boolean {
  return objectives.every(
    (objective) => objective.currentCount >= objective.requiredCount,
  );
}

function grantGuildNoticeBoardReward(
  state: GameState,
  questTitle: string,
  reward: GuildNoticeBoardQuestReward,
): { state: GameState; claimedReward: GuildNoticeBoardClaimedReward } {
  let nextState = addCurrencyToWalletState(
    state,
    "crowns",
    reward.crowns,
    "quest_reward",
  ).state;
  nextState = addItemToInventoryState(
    nextState,
    reward.skillBookItemId,
    1,
    "quest_reward",
  ).state;

  return {
    state: nextState,
    claimedReward: {
      questTitle,
      crowns: reward.crowns,
      skillBookItemId: reward.skillBookItemId,
    },
  };
}

function canRefreshSlot(slot: GuildNoticeBoardQuest | null): boolean {
  return (
    slot === null ||
    slot.status === "available" ||
    (slot.status === "done" && slot.rewardClaimedAtMs !== null)
  );
}

function sanitizeQuestStatus(
  status: GuildNoticeBoardQuestStatus | undefined,
): GuildNoticeBoardQuestStatus {
  return status === "taken" || status === "done" ? status : "available";
}

function sanitizeSequence(sequence: number | undefined): number {
  return Number.isFinite(sequence) ? Math.max(1, Math.floor(sequence ?? 1)) : 1;
}

function sanitizeTimestamp(timestamp: number | undefined, fallback: number): number {
  return Number.isFinite(timestamp) ? Math.max(0, timestamp ?? fallback) : fallback;
}

function sanitizeNullableTimestamp(timestamp: number | null | undefined): number | null {
  return Number.isFinite(timestamp) ? Math.max(0, timestamp ?? 0) : null;
}
