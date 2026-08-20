import { describe, expect, it } from "vitest";
import { createTestGameState } from "./testState";
import {
  createInitialInnKitchenUpgradeLevels,
  getInnKitchenEfficientCookingDiscountPercent,
  getInnKitchenFireGenerationPerHour,
  getInnKitchenHearthCapacity,
  getInnKitchenUpgradeStatuses,
  purchaseInnKitchenUpgrade,
  sanitizeInnKitchenUpgradeLevels,
} from "./innKitchenUpgrades";
import { addCurrencyToWalletState, getCurrencyBalance } from "./wallet";

describe("Inn Kitchen upgrades", () => {
  it("starts with safe Kitchen upgrade defaults", () => {
    const state = createTestGameState();

    expect(createInitialInnKitchenUpgradeLevels()).toEqual({
      hearth_capacity: 1,
      fire_generation: 1,
      hearth_tier: 1,
      efficient_cooking: 0,
    });
    expect(state.innUpgrades?.kitchen).toEqual(
      createInitialInnKitchenUpgradeLevels(),
    );
    expect(getInnKitchenHearthCapacity(state)).toBe(10);
    expect(getInnKitchenFireGenerationPerHour(state)).toBe(2);
    expect(getInnKitchenEfficientCookingDiscountPercent(state)).toBe(0);
  });

  it("purchases Hearth Capacity and updates the effect", () => {
    const state = withCrowns(createTestGameState(), 100);

    const result = purchaseInnKitchenUpgrade(state, "hearth_capacity");

    expect(result).toMatchObject({
      ok: true,
      previousLevel: 1,
      nextLevel: 2,
      costCrowns: 100,
    });
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(0);
    expect(getInnKitchenHearthCapacity(result.state)).toBe(12);
  });

  it("purchases Efficient Cooking from Lv0", () => {
    const state = withCrowns(createTestGameState(), 100);

    const result = purchaseInnKitchenUpgrade(state, "efficient_cooking");

    expect(result).toMatchObject({
      ok: true,
      previousLevel: 0,
      nextLevel: 1,
      costCrowns: 100,
    });
    expect(getInnKitchenEfficientCookingDiscountPercent(result.state)).toBe(5);
  });

  it("blocks insufficient Crowns and max levels", () => {
    const poor = purchaseInnKitchenUpgrade(
      withCrowns(createTestGameState(), 99),
      "hearth_capacity",
    );

    expect(poor).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
      costCrowns: 100,
    });

    const maxed = purchaseInnKitchenUpgrade(
      {
        ...createTestGameState(),
        innUpgrades: {
          rooms: { inn_room_count: 1 },
          kitchen: {
            hearth_capacity: 10,
            fire_generation: 1,
            hearth_tier: 1,
            efficient_cooking: 0,
          },
        },
      },
      "hearth_capacity",
    );

    expect(maxed).toMatchObject({
      ok: false,
      reason: "max_level",
    });
  });

  it("shows Hearth Tier instead of Fire Generation at the generation cap", () => {
    const state = {
      ...withCrowns(createTestGameState(), 1000),
      innUpgrades: {
        rooms: { inn_room_count: 1 },
        kitchen: {
          hearth_capacity: 1,
          fire_generation: 10,
          hearth_tier: 1,
          efficient_cooking: 0,
        },
      },
    };

    expect(getInnKitchenUpgradeStatuses(state).map((status) => status.id)).toEqual([
      "hearth_capacity",
      "hearth_tier",
      "efficient_cooking",
    ]);

    const result = purchaseInnKitchenUpgrade(state, "hearth_tier");

    expect(result).toMatchObject({
      ok: true,
      previousLevel: 1,
      nextLevel: 2,
      costCrowns: 1000,
    });
    expect(
      getInnKitchenUpgradeStatuses(result.state).map((status) => status.id),
    ).toEqual(["hearth_capacity", "fire_generation", "efficient_cooking"]);
  });

  it("sanitizes old or invalid Kitchen upgrade saves safely", () => {
    expect(
      sanitizeInnKitchenUpgradeLevels({
        hearth_capacity: 999,
        fire_generation: -5,
        hearth_tier: 999,
        efficient_cooking: 999,
      }),
    ).toEqual({
      hearth_capacity: 10,
      fire_generation: 1,
      hearth_tier: 2,
      efficient_cooking: 3,
    });
  });
});

function withCrowns(
  state: ReturnType<typeof createTestGameState>,
  crowns: number,
) {
  return addCurrencyToWalletState(state, "crowns", crowns, "debug").state;
}
