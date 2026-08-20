import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
  createInitialGuildNoticeBoardState,
  getGuildNoticeBoardRerollDisplayState,
  openGuildNoticeBoard,
  recordEnemyDefeatedForGuildNoticeBoard,
  refreshGuildNoticeBoardState,
  rerollGuildNoticeBoard,
  takeGuildNoticeBoardQuest,
} from "./guildNoticeBoard";
import {
  createInitialGuildUpgradesState,
  getGuildNoticeBoardRefreshIntervalMs,
  getGuildNoticeBoardUpgradeStatuses,
  purchaseGuildNoticeBoardUpgrade,
} from "./guildRecruitUpgrades";
import { countInventoryItem } from "./inventory";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Enemy, GuildNoticeBoardQuest } from "./types";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";

const NOW_MS = new Date(2026, 0, 1, 10, 0, 0).getTime();
const NEXT_DAY_MS = new Date(2026, 0, 2, 0, 1, 0).getTime();

describe("guild notice board upgrades", () => {
  it("creates baseline Notice Board upgrades", () => {
    const state = createUpgradeState();

    expect(state.guildUpgrades?.noticeBoard).toMatchObject({
      notice_board_slots: 1,
      notice_board_reward_quality: 1,
      notice_board_refresh_rate: 1,
      notice_board_scouts: 0,
    });
  });

  it("purchases Notice Board upgrades with Crowns and blocks max level", () => {
    let state = createUpgradeState(3_000);
    const purchased = purchaseGuildNoticeBoardUpgrade(
      state,
      "notice_board_slots",
    );

    expect(purchased.ok).toBe(true);
    if (!purchased.ok) {
      return;
    }

    expect(purchased.costCrowns).toBe(750);
    expect(purchased.state.wallet.balancesByCurrencyId.crowns).toBe(2_250);
    expect(purchased.state.guildUpgrades?.noticeBoard.notice_board_slots).toBe(2);

    state = purchaseGuildNoticeBoardUpgrade(
      purchased.state,
      "notice_board_slots",
    ).state;
    const maxed = purchaseGuildNoticeBoardUpgrade(state, "notice_board_slots");

    expect(maxed.ok).toBe(false);
    if (!maxed.ok) {
      expect(maxed.reason).toBe("max_level");
    }
  });

  it("blocks purchases without enough Crowns", () => {
    const result = purchaseGuildNoticeBoardUpgrade(
      createUpgradeState(0),
      "notice_board_reward_quality",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_crowns");
    }
  });

  it("unlocks Scout rerolls and resets uses at local midnight", () => {
    let state = createUpgradeState(1_000);
    expect(getGuildNoticeBoardRerollDisplayState(state, NOW_MS)).toMatchObject({
      isUnlocked: false,
      dailyLimit: 0,
      remaining: 0,
    });

    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_scouts").state;
    const rerolled = rerollGuildNoticeBoard(state, NOW_MS);

    expect(rerolled.ok).toBe(true);
    if (!rerolled.ok) {
      return;
    }

    expect(
      getGuildNoticeBoardRerollDisplayState(rerolled.state, NOW_MS),
    ).toMatchObject({
      isUnlocked: true,
      dailyLimit: 1,
      usedToday: 1,
      remaining: 0,
    });
    expect(
      getGuildNoticeBoardRerollDisplayState(rerolled.state, NEXT_DAY_MS),
    ).toMatchObject({
      usedToday: 0,
      remaining: 1,
    });
  });

  it("rerolls available and done slots but preserves taken slots", () => {
    let state = createUpgradeState(4_000);
    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_slots").state;
    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_slots").state;
    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_scouts").state;
    state = refreshGuildNoticeBoardState(
      state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );
    const taken = takeGuildNoticeBoardQuest(state, NOW_MS, 1);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const doneQuest = {
      ...taken.state.guildNoticeBoard!.slots[2]!,
      status: "done" as const,
      rewardClaimedAtMs: NOW_MS - 1,
    };
    state = {
      ...taken.state,
      guildNoticeBoard: {
        ...taken.state.guildNoticeBoard!,
        slots: [
          taken.state.guildNoticeBoard!.slots[0],
          taken.quest,
          doneQuest,
        ],
      },
    };

    const rerolled = rerollGuildNoticeBoard(state, NOW_MS);

    expect(rerolled.ok).toBe(true);
    if (!rerolled.ok) {
      return;
    }

    expect(rerolled.state.guildNoticeBoard?.slots[0]?.id).not.toBe(
      state.guildNoticeBoard?.slots[0]?.id,
    );
    expect(rerolled.state.guildNoticeBoard?.slots[1]?.id).toBe(taken.quest.id);
    expect(rerolled.state.guildNoticeBoard?.slots[2]?.id).not.toBe(doneQuest.id);
  });

  it("claims unclaimed done rewards before reroll replacement", () => {
    let state = createUpgradeState(2_000);
    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_scouts").state;
    const doneQuest = createDoneQuest(state.guildNoticeBoard!.slots[0]!);
    state = {
      ...state,
      guildNoticeBoard: {
        ...state.guildNoticeBoard!,
        slots: [doneQuest],
      },
    };

    const rerolled = rerollGuildNoticeBoard(state, NOW_MS);

    expect(rerolled.ok).toBe(true);
    expect(rerolled.claimedRewards).toHaveLength(1);
    expect(getCurrencyBalance(rerolled.state.wallet, "crowns")).toBe(1_600);
  });

  it("expands board slots to two and three through upgrades", () => {
    let state = createUpgradeState(3_000);
    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_slots").state;
    state = refreshGuildNoticeBoardState(state, NOW_MS);

    expect(state.guildNoticeBoard?.slots).toHaveLength(2);

    state = purchaseGuildNoticeBoardUpgrade(state, "notice_board_slots").state;
    state = refreshGuildNoticeBoardState(state, NOW_MS);

    expect(state.guildNoticeBoard?.slots).toHaveLength(3);
  });

  it("uses upgraded refresh rate for the next board refresh", () => {
    let state = createUpgradeState(2_000);
    state = purchaseGuildNoticeBoardUpgrade(
      state,
      "notice_board_refresh_rate",
    ).state;
    state = purchaseGuildNoticeBoardUpgrade(
      state,
      "notice_board_refresh_rate",
    ).state;

    const refreshed = refreshGuildNoticeBoardState(
      state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(getGuildNoticeBoardRefreshIntervalMs(refreshed)).toBe(
      178 * 60 * 1000,
    );
    expect(refreshed.guildNoticeBoard?.nextRefreshAtMs).toBe(
      NOW_MS +
        GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS +
        178 * 60 * 1000,
    );
  });

  it("applies reward quality to crowns and item extra chance at claim time", () => {
    let state = createUpgradeState(2_000);
    state = purchaseGuildNoticeBoardUpgrade(
      state,
      "notice_board_reward_quality",
    ).state;
    state = purchaseGuildNoticeBoardUpgrade(
      state,
      "notice_board_reward_quality",
    ).state;
    const doneQuest = {
      ...state.guildNoticeBoard!.slots[0]!,
      sequence: 5,
      status: "done" as const,
      takenAtMs: NOW_MS,
      rewardClaimedAtMs: null,
      objectives: state.guildNoticeBoard!.slots[0]!.objectives.map((objective) => ({
        ...objective,
        currentCount: objective.requiredCount,
      })),
    };
    state = {
      ...state,
      guildNoticeBoard: {
        ...state.guildNoticeBoard!,
        slots: [doneQuest],
      },
    };

    const opened = openGuildNoticeBoard(state, NOW_MS);

    expect(opened.claimedRewards[0]).toMatchObject({
      crowns: 120,
    });
    expect(opened.claimedRewards[0]?.skillBookItemIds).toHaveLength(2);
    expect(
      countInventoryItem(
        opened.state.inventory,
        doneQuest.rewards.skillBookItemId,
      ),
    ).toBe(2);
  });

  it("reports Notice Board upgrade status rows", () => {
    const statuses = getGuildNoticeBoardUpgradeStatuses(createUpgradeState(1_000));

    expect(statuses.map((status) => status.id)).toEqual([
      "notice_board_slots",
      "notice_board_reward_quality",
      "notice_board_refresh_rate",
      "notice_board_scouts",
    ]);
    expect(statuses.find((status) => status.id === "notice_board_scouts"))
      .toMatchObject({
        level: 0,
        nextCostCrowns: 500,
        nextEffect: "1 reroll/day",
      });
  });
});

function createUpgradeState(crowns = 0): GameState {
  const leader = {
    ...createCompanion("companion-1", { x: 10, y: 10 }, "companion-1", "defender", 0),
    state: "idle" as const,
    currentTargetId: null,
    characterLevel: 10,
  };
  const state = createTestGameState({
    entities: {
      [leader.id]: leader,
    },
    partyLeaderId: leader.id,
    highestCharacterLevelEver: 10,
    guildNoticeBoard: createInitialGuildNoticeBoardState(NOW_MS),
    guildUpgrades: createInitialGuildUpgradesState(),
  });

  return setCurrencyBalanceForDebug(state, "crowns", crowns).state;
}

function createDoneQuest(quest: GuildNoticeBoardQuest): GuildNoticeBoardQuest {
  let state = createUpgradeState();
  state = {
    ...state,
    guildNoticeBoard: {
      ...state.guildNoticeBoard!,
      slots: [
        {
          ...quest,
          status: "taken",
          takenAtMs: NOW_MS,
          rewardClaimedAtMs: null,
          objectives: quest.objectives.map((objective) => ({
            ...objective,
            currentCount: objective.requiredCount - 1,
          })),
        },
      ],
    },
  };

  for (const objective of quest.objectives) {
    state = recordEnemyDefeatedForGuildNoticeBoard(
      state,
      createDeadEnemy(objective.enemyTypeId),
    );
  }

  return state.guildNoticeBoard!.slots[0]!;
}

function createDeadEnemy(enemyTypeId: Enemy["enemyTypeId"]): Enemy {
  return {
    ...createEnemy("defeated-enemy", { x: 20, y: 20 }, "passive", {
      enemyTypeId,
      level: 10,
    }),
    state: "dead",
    health: 0,
  };
}
