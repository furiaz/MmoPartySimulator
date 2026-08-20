import { describe, expect, it } from "vitest";
import {
  createInitialInnUpgradesState,
  getInnRoomCapacity,
  getInnRoomUpgradeStatuses,
  purchaseInnRoomUpgrade,
  sanitizeInnUpgradesState,
} from "./innRoomUpgrades";
import {
  createSavedGame,
  restoreGameStateFromSave,
} from "./saveGame";
import { createTestGameState } from "./testState";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";

const NOW_MS = 1_000_000;

describe("inn room upgrades", () => {
  it("defaults missing saves to level 1 and four rooms", () => {
    const state = createTestGameState({
      innUpgrades: undefined,
    });

    expect(sanitizeInnUpgradesState(undefined)).toEqual(
      createInitialInnUpgradesState(),
    );
    expect(getInnRoomCapacity(state)).toBe(4);
  });

  it("purchases the next room level and charges Crowns", () => {
    const state = setCurrencyBalanceForDebug(
      createTestGameState(),
      "crowns",
      100,
    ).state;

    const result = purchaseInnRoomUpgrade(state, "inn_room_count");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.previousLevel).toBe(1);
    expect(result.nextLevel).toBe(2);
    expect(result.costCrowns).toBe(100);
    expect(result.state.innUpgrades?.rooms.inn_room_count).toBe(2);
    expect(getInnRoomCapacity(result.state)).toBe(5);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(0);
  });

  it("blocks room purchases without enough Crowns", () => {
    const state = setCurrencyBalanceForDebug(
      createTestGameState(),
      "crowns",
      99,
    ).state;

    const result = purchaseInnRoomUpgrade(state, "inn_room_count");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toBe("insufficient_crowns");
    expect(result.costCrowns).toBe(100);
    expect(result.state.innUpgrades?.rooms.inn_room_count).toBe(1);
  });

  it("increases capacity by one room per level", () => {
    const state = createTestGameState({
      innUpgrades: {
        ...createInitialInnUpgradesState(),
        rooms: {
          inn_room_count: 4,
        },
      },
    });
    const [status] = getInnRoomUpgradeStatuses(state);

    expect(status).toMatchObject({
      level: 4,
      currentEffect: "7 rooms",
      nextEffect: "8 rooms",
      nextCostCrowns: 400,
    });
    expect(getInnRoomCapacity(state)).toBe(7);
  });

  it("blocks purchases at level 5", () => {
    const state = setCurrencyBalanceForDebug(
      createTestGameState({
        innUpgrades: {
          ...createInitialInnUpgradesState(),
          rooms: {
            inn_room_count: 5,
          },
        },
      }),
      "crowns",
      9999,
    ).state;

    const result = purchaseInnRoomUpgrade(state, "inn_room_count");
    const [status] = getInnRoomUpgradeStatuses(state);

    expect(status.isMaxLevel).toBe(true);
    expect(status.nextCostCrowns).toBeNull();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toBe("max_level");
    expect(getInnRoomCapacity(result.state)).toBe(8);
  });

  it("preserves Inn upgrades through save and restore", () => {
    const state = createTestGameState({
      innUpgrades: {
        ...createInitialInnUpgradesState(),
        rooms: {
          inn_room_count: 3,
        },
      },
    });
    const restored = restoreGameStateFromSave(createSavedGame(state, NOW_MS));

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.innUpgrades?.rooms.inn_room_count).toBe(3);
    expect(getInnRoomCapacity(restored.state)).toBe(6);
  });
});
