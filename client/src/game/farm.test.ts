import { describe, expect, it } from "vitest";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createCompanion, createNpc } from "./entities";
import {
  FARM_CARROT_BASE_HOLD_CAP,
  FARM_CARROT_FIELD_ID,
  FARM_CARROT_GROWTH_MS,
  getFarmFieldGenerationIntervalMs,
  getFarmFieldHoldCap,
  getFarmUpgradeCostCrowns,
  createInitialFarmState,
  harvestAllFarmCrops,
  purchaseFarmFieldUpgrade,
  sanitizeFarmState,
  settleFarmState,
} from "./farm";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { FarmFieldUpgradeId, FarmFieldUpgradeLevels } from "./types";
import { addCurrencyToWalletState } from "./wallet";

const NOW_MS = 1_000_000;

describe("Farm upgrades", () => {
  it("initializes and migrates old level saves into upgrade tracks", () => {
    const initial = createInitialFarmState();
    const sanitized = sanitizeFarmState({
      fieldsById: {
        carrot_field: {
          id: "carrot_field",
          cropId: "carrot",
          level: 1,
          heldQuantity: 4,
          lastGeneratedAtMs: 12,
        },
      },
    });

    expect(initial.fieldsById.carrot_field).toMatchObject({
      id: "carrot_field",
      cropId: "carrot",
      upgradeLevels: {
        speed: 0,
        cap: 1,
        fertilizer: 0,
      },
      heldQuantity: 0,
    });
    expect(sanitized.fieldsById.carrot_field).toMatchObject({
      upgradeLevels: {
        speed: 1,
        cap: 1,
        fertilizer: 0,
      },
      heldQuantity: 4,
      lastGeneratedAtMs: 12,
    });
  });

  it("does not produce while speed is level 0", () => {
    const state = createFarmState({
      farm: createInitialFarmState(0),
    });

    const settled = settleFarmState(state, FARM_CARROT_GROWTH_MS * 3);

    expect(settled.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
  });

  it("keeps speed level 1 at the 20 minute baseline", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });

    const oneCycle = settleFarmState(state, FARM_CARROT_GROWTH_MS);
    const capped = settleFarmState(state, FARM_CARROT_GROWTH_MS * 60);

    expect(oneCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
    expect(capped.farm?.fieldsById.carrot_field.heldQuantity).toBe(
      FARM_CARROT_BASE_HOLD_CAP,
    );
  });

  it("reduces generation interval through speed level 5", () => {
    const field = createFarmField({
      upgradeLevels: { speed: 5, cap: 1, fertilizer: 0 },
    });
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: { fieldsById: { carrot_field: field } },
    });
    const interval = getFarmFieldGenerationIntervalMs(field);

    const beforeCycle = settleFarmState(state, interval - 1);
    const afterCycle = settleFarmState(state, interval);

    expect(interval).toBe(Math.round(FARM_CARROT_GROWTH_MS / 1.2));
    expect(beforeCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(afterCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
  });

  it("uses Harvest Cap levels 1 through 5 as 20 to 36", () => {
    expect(
      [1, 2, 3, 4, 5].map((cap) =>
        getFarmFieldHoldCap(
          createFarmField({ upgradeLevels: { speed: 1, cap, fertilizer: 0 } }),
        ),
      ),
    ).toEqual([20, 24, 28, 32, 36]);
  });

  it("rolls fertilizer double crops and clamps at the cap", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      heldQuantity: 35,
      upgradeLevels: { speed: 1, cap: 5, fertilizer: 3 },
    });

    const settled = settleFarmState(
      state,
      FARM_CARROT_GROWTH_MS,
      () => 0,
    );

    expect(settled.farm?.fieldsById.carrot_field.heldQuantity).toBe(36);
  });

  it("does not store hidden overflow after reaching the holding cap", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      heldQuantity: FARM_CARROT_BASE_HOLD_CAP,
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });

    const capped = settleFarmState(state, FARM_CARROT_GROWTH_MS * 4);
    const harvested = harvestAllFarmCrops(capped, FARM_CARROT_GROWTH_MS * 4);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    const beforeFreshCycle = settleFarmState(
      harvested.state,
      FARM_CARROT_GROWTH_MS * 5 - 1,
    );
    const afterFreshCycle = settleFarmState(
      harvested.state,
      FARM_CARROT_GROWTH_MS * 5,
    );

    expect(beforeFreshCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(afterFreshCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
  });

  it("purchases each upgrade, spends Crowns, and updates only that track", () => {
    const state = createFarmState({ azureTrialCompleted: true, crowns: 900 });
    const speed = purchaseFarmFieldUpgrade(
      state,
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );

    expect(speed.ok).toBe(true);
    if (!speed.ok) {
      return;
    }

    const cap = purchaseFarmFieldUpgrade(
      speed.state,
      FARM_CARROT_FIELD_ID,
      "cap",
      NOW_MS,
    );
    expect(cap.ok).toBe(true);
    if (!cap.ok) {
      return;
    }

    const fertilizer = purchaseFarmFieldUpgrade(
      cap.state,
      FARM_CARROT_FIELD_ID,
      "fertilizer",
      NOW_MS,
    );

    expect(fertilizer.ok).toBe(true);
    if (!fertilizer.ok) {
      return;
    }

    expect(fertilizer.state.farm?.fieldsById.carrot_field.upgradeLevels).toEqual(
      {
        speed: 1,
        cap: 2,
        fertilizer: 1,
      },
    );
    expect(fertilizer.state.wallet.balancesByCurrencyId.crowns).toBe(500);
    expect(getFarmUpgradeCostCrowns(0)).toBe(100);
    expect(getFarmUpgradeCostCrowns(1)).toBe(200);
  });

  it("fails upgrade commands while locked, away, underfunded, maxed, or invalid", () => {
    const locked = purchaseFarmFieldUpgrade(
      createFarmState(),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const away = purchaseFarmFieldUpgrade(
      createFarmState({
        azureTrialCompleted: true,
        leaderPosition: { x: 0, y: 0 },
      }),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const underfunded = purchaseFarmFieldUpgrade(
      createFarmState({ azureTrialCompleted: true }),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const maxed = purchaseFarmFieldUpgrade(
      createFarmState({
        azureTrialCompleted: true,
        crowns: 500,
        upgradeLevels: { speed: 5, cap: 1, fertilizer: 0 },
      }),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const invalidUpgrade = purchaseFarmFieldUpgrade(
      createFarmState({ azureTrialCompleted: true, crowns: 500 }),
      FARM_CARROT_FIELD_ID,
      "missing" as FarmFieldUpgradeId,
      NOW_MS,
    );

    expect(locked).toMatchObject({ ok: false, reason: "locked_service" });
    expect(away).toMatchObject({ ok: false, reason: "not_near_farmer" });
    expect(underfunded).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
    });
    expect(maxed).toMatchObject({ ok: false, reason: "max_level" });
    expect(invalidUpgrade).toMatchObject({
      ok: false,
      reason: "invalid_upgrade",
    });
  });

  it("harvests all held carrots into the Inn Kitchen Pantry without inventory clutter", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      heldQuantity: 3,
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });

    const harvested = harvestAllFarmCrops(state, NOW_MS);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    expect(harvested.harvestedByCropId.carrot).toBe(3);
    expect(harvested.state.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(
      harvested.state.innKitchen?.pantry.unlockedIngredientIds,
    ).toContain("carrot");
    expect(
      harvested.state.innKitchen?.pantry.ingredientQuantitiesById.carrot,
    ).toBe(3);
    expect(
      harvested.state.inventory.slots.some(
        (slot) => String(slot.itemId) === "carrot",
      ),
    ).toBe(false);
  });

  it("records Farm upgrade telemetry while debug recording is active", () => {
    const state = startDebugTelemetryRecording(
      createFarmState({ azureTrialCompleted: true, crowns: 100 }),
    );

    const upgraded = purchaseFarmFieldUpgrade(
      state,
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );

    expect(upgraded.state.debugTelemetry?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "farm_upgrade_attempt",
        "farm_upgrade_succeeded",
      ]),
    );
    expect(upgraded.state.debugTelemetry?.events.at(-1)).toMatchObject({
      farmFieldId: "carrot_field",
      farmCropId: "carrot",
      farmUpgradeId: "speed",
      previousFarmUpgradeLevel: 0,
      nextFarmUpgradeLevel: 1,
      crownCost: 100,
      farmSpeedMultiplier: 1,
    });
  });
});

function createFarmState({
  azureTrialCompleted = false,
  crowns = 0,
  heldQuantity = 0,
  leaderPosition = { x: 10, y: 10 },
  upgradeLevels = { speed: 0, cap: 1, fertilizer: 0 },
  farm = {
    fieldsById: {
      carrot_field: createFarmField({ heldQuantity, upgradeLevels }),
    },
  },
}: {
  azureTrialCompleted?: boolean;
  crowns?: number;
  heldQuantity?: number;
  leaderPosition?: { x: number; y: number };
  upgradeLevels?: FarmFieldUpgradeLevels;
  farm?: GameState["farm"];
} = {}): GameState {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const farmer = createNpc("farmer", { x: 11, y: 10 }, "Farmer", "farmer");
  const state = createTestGameState({
    partyLeaderId: leader.id,
    entities: {
      [leader.id]: leader,
      [farmer.id]: farmer,
    },
    farm,
    quests: {
      ...createTestGameState().quests,
      azure_trial: {
        ...createTestGameState().quests.azure_trial,
        status: azureTrialCompleted ? "completed" : "available",
      },
    },
  });

  return crowns > 0
    ? addCurrencyToWalletState(state, "crowns", crowns, "debug").state
    : state;
}

function createFarmField({
  heldQuantity = 0,
  lastGeneratedAtMs = 0,
  upgradeLevels,
}: {
  heldQuantity?: number;
  lastGeneratedAtMs?: number;
  upgradeLevels: FarmFieldUpgradeLevels;
}) {
  return {
    id: "carrot_field" as const,
    cropId: "carrot" as const,
    heldQuantity,
    lastGeneratedAtMs,
    upgradeLevels,
  };
}
