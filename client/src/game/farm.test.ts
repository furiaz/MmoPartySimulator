import { describe, expect, it } from "vitest";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createCompanion, createNpc } from "./entities";
import {
  FARM_CARROT_FIELD_ID,
  FARM_CARROT_GROWTH_MS,
  FARM_CARROT_HOLD_CAP,
  FARM_CARROT_LEVEL_ONE_COST_CROWNS,
  createInitialFarmState,
  harvestAllFarmCrops,
  sanitizeFarmState,
  settleFarmState,
  upgradeFarmFieldToLevelOne,
} from "./farm";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import { addCurrencyToWalletState } from "./wallet";

const NOW_MS = 1_000_000;

describe("Farm MVP", () => {
  it("initializes and sanitizes old saves as a level 0 carrot field", () => {
    const initial = createInitialFarmState();
    const sanitized = sanitizeFarmState(undefined);

    expect(initial.fieldsById.carrot_field).toMatchObject({
      id: "carrot_field",
      cropId: "carrot",
      level: 0,
      heldQuantity: 0,
    });
    expect(sanitized).toEqual(initial);
  });

  it("does not produce while the carrot field is level 0", () => {
    const state = createFarmState({
      farm: createInitialFarmState(0),
    });

    const settled = settleFarmState(state, FARM_CARROT_GROWTH_MS * 3);

    expect(settled.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
  });

  it("generates carrots after 20 minutes and catches up to the cap", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: {
        fieldsById: {
          carrot_field: {
            id: "carrot_field",
            cropId: "carrot",
            level: 1,
            heldQuantity: 0,
            lastGeneratedAtMs: 0,
          },
        },
      },
    });

    const oneCycle = settleFarmState(state, FARM_CARROT_GROWTH_MS);
    const capped = settleFarmState(state, FARM_CARROT_GROWTH_MS * 60);

    expect(oneCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
    expect(capped.farm?.fieldsById.carrot_field.heldQuantity).toBe(
      FARM_CARROT_HOLD_CAP,
    );
  });

  it("does not store hidden overflow after reaching the holding cap", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: {
        fieldsById: {
          carrot_field: {
            id: "carrot_field",
            cropId: "carrot",
            level: 1,
            heldQuantity: FARM_CARROT_HOLD_CAP,
            lastGeneratedAtMs: 0,
          },
        },
      },
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

  it("upgrades the carrot field after The Azure Trial and spends Crowns", () => {
    const state = addCurrencyToWalletState(
      createFarmState({ azureTrialCompleted: true }),
      "crowns",
      FARM_CARROT_LEVEL_ONE_COST_CROWNS,
      "debug",
    ).state;

    const upgraded = upgradeFarmFieldToLevelOne(
      state,
      FARM_CARROT_FIELD_ID,
      NOW_MS,
    );

    expect(upgraded.ok).toBe(true);
    expect(upgraded.state.farm?.fieldsById.carrot_field.level).toBe(1);
    expect(upgraded.state.farm?.fieldsById.carrot_field.lastGeneratedAtMs).toBe(
      NOW_MS,
    );
    expect(upgraded.state.wallet.balancesByCurrencyId.crowns).toBe(0);
  });

  it("fails Farm commands while locked, away, underfunded, maxed, or empty", () => {
    const locked = upgradeFarmFieldToLevelOne(
      createFarmState(),
      FARM_CARROT_FIELD_ID,
      NOW_MS,
    );
    const away = upgradeFarmFieldToLevelOne(
      createFarmState({ azureTrialCompleted: true, leaderPosition: { x: 0, y: 0 } }),
      FARM_CARROT_FIELD_ID,
      NOW_MS,
    );
    const underfunded = upgradeFarmFieldToLevelOne(
      createFarmState({ azureTrialCompleted: true }),
      FARM_CARROT_FIELD_ID,
      NOW_MS,
    );
    const maxed = upgradeFarmFieldToLevelOne(
      createFarmState({
        azureTrialCompleted: true,
        crowns: 500,
        fieldLevel: 1,
      }),
      FARM_CARROT_FIELD_ID,
      NOW_MS,
    );
    const emptyHarvest = harvestAllFarmCrops(
      createFarmState({ azureTrialCompleted: true, fieldLevel: 1 }),
      NOW_MS,
    );

    expect(locked).toMatchObject({ ok: false, reason: "locked_service" });
    expect(away).toMatchObject({ ok: false, reason: "not_near_farmer" });
    expect(underfunded).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
    });
    expect(maxed).toMatchObject({ ok: false, reason: "max_level" });
    expect(emptyHarvest).toMatchObject({
      ok: false,
      reason: "nothing_to_harvest",
    });
  });

  it("harvests all held carrots into the Inn Kitchen Pantry without inventory clutter", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      fieldLevel: 1,
      heldQuantity: 3,
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

  it("records Farm telemetry while debug recording is active", () => {
    const state = startDebugTelemetryRecording(
      addCurrencyToWalletState(
        createFarmState({ azureTrialCompleted: true }),
        "crowns",
        FARM_CARROT_LEVEL_ONE_COST_CROWNS,
        "debug",
      ).state,
    );

    const upgraded = upgradeFarmFieldToLevelOne(
      state,
      FARM_CARROT_FIELD_ID,
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
      previousFarmFieldLevel: 0,
      nextFarmFieldLevel: 1,
      crownCost: FARM_CARROT_LEVEL_ONE_COST_CROWNS,
    });
  });
});

function createFarmState({
  azureTrialCompleted = false,
  crowns = 0,
  fieldLevel = 0,
  heldQuantity = 0,
  leaderPosition = { x: 10, y: 10 },
  farm = {
    fieldsById: {
      carrot_field: {
        id: "carrot_field",
        cropId: "carrot",
        level: fieldLevel,
        heldQuantity,
        lastGeneratedAtMs: 0,
      },
    },
  },
}: {
  azureTrialCompleted?: boolean;
  crowns?: number;
  fieldLevel?: number;
  heldQuantity?: number;
  leaderPosition?: { x: number; y: number };
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
