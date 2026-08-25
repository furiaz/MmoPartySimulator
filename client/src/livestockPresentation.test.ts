import { describe, expect, it } from "vitest";
import { createCompanion, createNpc } from "./game/entities";
import {
  createInitialLivestockState,
  LIVESTOCK_DUSKHEN_CREATURE_ID,
  LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
} from "./game/livestock";
import { createTestGameState } from "./game/testState";
import { getLivestockDisplay } from "./livestockPresentation";
import type { GameState, Position } from "./game";

describe("livestock presentation", () => {
  it("shows the MVP grid, Duskhen counts, feed, yield, and held Eggs", () => {
    const display = getLivestockDisplay(createLivestockPresentationState(), 0);

    expect(display.width).toBe(5);
    expect(display.height).toBe(3);
    expect(display.cells).toHaveLength(15);
    expect(display.totalOutputPerHourText).toBe("0");
    expect(display.totalFeedText).toBe("No feed needed");
    expect(display.outputs[0]).toMatchObject({
      outputId: "egg",
      holdText: "Eggs 0/20",
    });
    expect(display.creatures[0]).toMatchObject({
      creatureId: "duskhen",
      displayName: "Duskhen",
      ownedCount: 2,
      placedCount: 0,
      availableCount: 2,
      footprintText: "1x1",
      feedText: "Carrot 10/day",
      yieldText: "Egg 1 / 3h",
      canHoldForPlacement: true,
    });
    expect(display.pantryFeedText).toBe("Pantry Carrots 0");
    expect(display.feedingStatusText).toBe("Fed 0 / Hungry 0");
    expect(display.canFeedNow).toBe(false);
  });

  it("shows occupied grid cells and aggregate feed/output for placed Duskhens", () => {
    const display = getLivestockDisplay(
      createLivestockPresentationState({
        livestock: {
          ...createInitialLivestockState(),
          placementSequence: 2,
          placementsById: {
            livestock_duskhen_1: {
              id: "livestock_duskhen_1",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 0,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
            },
            livestock_duskhen_2: {
              id: "livestock_duskhen_2",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 1,
              y: 0,
              rotation: "horizontal",
              placedAtMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
              lastProducedAtMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
            },
          },
          holdingQuantitiesByOutputId: { egg: 7 },
        },
      }),
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
    );

    expect(display.cells.slice(0, 2)).toMatchObject([
      { x: 0, y: 0, label: "DH", placementId: "livestock_duskhen_1" },
      { x: 1, y: 0, label: "DH", placementId: "livestock_duskhen_2" },
    ]);
    expect(display.creatures[0]).toMatchObject({
      placedCount: 2,
      availableCount: 0,
      expectedOutputPerHourText: "0.67",
      canHoldForPlacement: false,
    });
    expect(display.totalFeedText).toBe("Carrots 20/day");
    expect(display.totalOutputPerHourText).toBe("0.67");
    expect(display.outputs[0].holdText).toBe("Eggs 7/20");
    expect(display.canCollect).toBe(true);
  });

  it("shows hungry grid cells and disables their expected output", () => {
    const display = getLivestockDisplay(
      createLivestockPresentationState({
        livestock: {
          ...createInitialLivestockState(),
          placementSequence: 1,
          placementsById: {
            livestock_duskhen_1: {
              id: "livestock_duskhen_1",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 0,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
              isHungry: true,
              hungrySinceMs: 1,
              pausedProductionRemainingMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
            },
          },
        },
      }),
      1,
    );

    expect(display.cells[0]).toMatchObject({
      placementId: "livestock_duskhen_1",
      isHungry: true,
    });
    expect(display.creatures[0]).toMatchObject({
      placedCount: 1,
      fedCount: 0,
      hungryCount: 1,
      expectedOutputPerHourText: "0",
    });
    expect(display.totalOutputPerHourText).toBe("0");
    expect(display.feedNowActionText).toBe("1 hungry");
    expect(display.canFeedNow).toBe(true);
  });

  it("allows browsing while locked or far but disables execution actions", () => {
    const locked = getLivestockDisplay(
      createLivestockPresentationState({ azureTrialCompleted: false }),
      0,
    );
    const far = getLivestockDisplay(
      createLivestockPresentationState({ leaderPosition: { x: 0, y: 0 } }),
      0,
    );

    expect(locked.isUnlocked).toBe(false);
    expect(locked.creatures[0].canHoldForPlacement).toBe(false);
    expect(locked.collectActionText).toBe("Requires proximity");
    expect(far.isNearLivestockKeeper).toBe(false);
    expect(far.creatures[0].canHoldForPlacement).toBe(false);
  });
});

function createLivestockPresentationState({
  azureTrialCompleted = true,
  leaderPosition = { x: 10, y: 10 },
  livestock = createInitialLivestockState(),
}: {
  azureTrialCompleted?: boolean;
  leaderPosition?: Position;
  livestock?: GameState["livestock"];
} = {}) {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const keeper = createNpc(
    "livestock",
    { x: 11, y: 10 },
    "Livestock",
    "livestock_keeper",
  );
  const baseQuests = createTestGameState().quests;

  return createTestGameState({
    partyLeaderId: leader.id,
    entities: {
      [leader.id]: leader,
      [keeper.id]: keeper,
    },
    livestock,
    quests: {
      ...baseQuests,
      azure_trial: {
        ...baseQuests.azure_trial,
        status: azureTrialCompleted ? "completed" : "available",
      },
    },
  });
}
