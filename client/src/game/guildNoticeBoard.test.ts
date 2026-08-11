import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
  createInitialGuildNoticeBoardState,
  cancelGuildNoticeBoardQuest,
  openGuildNoticeBoard,
  recordEnemyDefeatedForGuildNoticeBoard,
  refreshGuildNoticeBoardState,
  shouldShowGuildNoticeBoardSign,
  takeGuildNoticeBoardQuest,
} from "./guildNoticeBoard";
import { countInventoryItem } from "./inventory";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Enemy, GuildNoticeBoardQuest } from "./types";
import { getCurrencyBalance } from "./wallet";

const NOW_MS = 1_000_000;

describe("guild notice board", () => {
  it("creates one available quest in the initial board state", () => {
    const board = createInitialGuildNoticeBoardState(NOW_MS);

    expect(board.slots).toHaveLength(1);
    expect(board.slots[0]).toMatchObject({
      id: "guild-notice-board-quest-1",
      status: "available",
      objectives: [
        { enemyTypeId: "goblin_shaman", requiredCount: 50, currentCount: 0 },
        { enemyTypeId: "ash_wisp", requiredCount: 50, currentCount: 0 },
      ],
    });
    expect(board.hasSeenCurrentRefresh).toBe(false);
  });

  it("opening the board marks the current refresh seen", () => {
    const state = createNoticeBoardState();

    expect(shouldShowGuildNoticeBoardSign(state, NOW_MS)).toBe(true);

    const opened = openGuildNoticeBoard(state, NOW_MS);

    expect(opened.state.guildNoticeBoard?.hasSeenCurrentRefresh).toBe(true);
    expect(shouldShowGuildNoticeBoardSign(opened.state, NOW_MS)).toBe(false);
  });

  it("refreshes an ignored available quest after three hours", () => {
    const state = createNoticeBoardState();
    const refreshed = refreshGuildNoticeBoardState(
      state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildNoticeBoard?.slots[0]).toMatchObject({
      id: "guild-notice-board-quest-2",
      status: "available",
      sequence: 2,
    });
    expect(refreshed.guildNoticeBoard?.hasSeenCurrentRefresh).toBe(false);
  });

  it("keeps a taken quest when the refresh timer expires", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const refreshed = refreshGuildNoticeBoardState(
      taken.state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildNoticeBoard?.slots[0]).toMatchObject({
      id: taken.quest.id,
      status: "taken",
      sequence: taken.quest.sequence,
    });
  });

  it("cancels a taken board quest", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const canceled = cancelGuildNoticeBoardQuest(taken.state, NOW_MS);

    expect(canceled.ok).toBe(true);
    expect(canceled.state.guildNoticeBoard?.slots[0]).toBeNull();
  });

  it("does not count kills before the quest is taken", () => {
    const state = createNoticeBoardState();
    const enemy = createDeadEnemy("goblin_shaman", 10);
    const progressed = recordEnemyDefeatedForGuildNoticeBoard(state, enemy);

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0].currentCount).toBe(0);
  });

  it("counts matching monster kills after taking the quest", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    expect(taken.quest.levelAnchor).toBeNull();
    expect(taken.quest.levelRange).toBeNull();

    const progressed = recordEnemyDefeatedForGuildNoticeBoard(
      taken.state,
      createDeadEnemy("goblin_shaman", 10),
    );

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0]).toMatchObject({
      enemyTypeId: "goblin_shaman",
      currentCount: 1,
    });
  });

  it("ignores wrong monsters but counts matching monsters at any level", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    let progressed = recordEnemyDefeatedForGuildNoticeBoard(
      taken.state,
      createDeadEnemy("mossling", 10),
    );
    expect(progressed.guildNoticeBoard?.slots[0]?.objectives).toEqual(
      taken.quest.objectives,
    );

    progressed = recordEnemyDefeatedForGuildNoticeBoard(
      progressed,
      createDeadEnemy("goblin_shaman", 99),
    );

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0]).toMatchObject({
      enemyTypeId: "goblin_shaman",
      currentCount: 1,
    });
  });

  it("marks the quest done and claims rewards on board interaction", () => {
    const almostDone = createAlmostDoneQuestState();
    let completed = recordEnemyDefeatedForGuildNoticeBoard(
      almostDone,
      createDeadEnemy("goblin_shaman", 10),
    );
    completed = recordEnemyDefeatedForGuildNoticeBoard(
      completed,
      createDeadEnemy("ash_wisp", 11),
    );
    const completedQuest = completed.guildNoticeBoard?.slots[0];

    expect(completedQuest?.status).toBe("done");
    expect(completedQuest?.rewardClaimedAtMs).toBeNull();

    const opened = openGuildNoticeBoard(completed, NOW_MS);
    const reward = completedQuest?.rewards;

    expect(opened.claimedRewards).toHaveLength(1);
    expect(getCurrencyBalance(opened.state.wallet, "crowns")).toBe(100);
    expect(
      reward ? countInventoryItem(opened.state.inventory, reward.skillBookItemId) : 0,
    ).toBe(1);
    expect(opened.state.guildNoticeBoard?.slots[0]?.rewardClaimedAtMs).toBe(NOW_MS);
  });

  it("refreshes a claimed done quest into a different quest", () => {
    const almostDone = createAlmostDoneQuestState();
    let completed = recordEnemyDefeatedForGuildNoticeBoard(
      almostDone,
      createDeadEnemy("goblin_shaman", 10),
    );
    completed = recordEnemyDefeatedForGuildNoticeBoard(
      completed,
      createDeadEnemy("ash_wisp", 11),
    );
    const opened = openGuildNoticeBoard(completed, NOW_MS);
    const refreshed = refreshGuildNoticeBoardState(
      opened.state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildNoticeBoard?.slots[0]).toMatchObject({
      id: "guild-notice-board-quest-2",
      status: "available",
      title: "Shaman Watch Culling",
    });
  });
});

function createNoticeBoardState(): GameState {
  const leader = {
    ...createCompanion("leader", { x: 10, y: 10 }, "leader", "defender", 0),
    characterLevel: 10,
  };

  return createTestGameState({
    entities: {
      [leader.id]: leader,
    },
    partyLeaderId: leader.id,
    guildNoticeBoard: createInitialGuildNoticeBoardState(NOW_MS),
  });
}

function createAlmostDoneQuestState(): GameState {
  const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

  if (!taken.ok) {
    throw new Error("Expected Notice Board quest to be takeable");
  }

  return {
    ...taken.state,
    guildNoticeBoard: {
      ...taken.state.guildNoticeBoard!,
      slots: [createAlmostDoneQuest(taken.quest)],
    },
  };
}

function createAlmostDoneQuest(
  quest: GuildNoticeBoardQuest,
): GuildNoticeBoardQuest {
  return {
    ...quest,
    objectives: quest.objectives.map((objective) => ({
      ...objective,
      currentCount: objective.requiredCount - 1,
    })),
  };
}

function createDeadEnemy(enemyTypeId: Enemy["enemyTypeId"], level: number): Enemy {
  return {
    ...createEnemy("defeated-enemy", { x: 20, y: 20 }, "passive", {
      enemyTypeId,
      level,
    }),
    state: "dead",
    health: 0,
  };
}
