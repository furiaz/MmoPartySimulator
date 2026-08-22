import { describe, expect, it } from "vitest";
import { FARM_CARROT_GROWTH_MS } from "./game";
import { getFarmDisplay } from "./farmPresentation";
import { createTestGameState } from "./game/testState";

describe("farm presentation", () => {
  it("shows locked carrot holding and upgrade state", () => {
    const display = getFarmDisplay(createTestGameState(), 1_000);

    expect(display.isUnlocked).toBe(false);
    expect(display.totalCropsPerHourText).toBe("0");
    expect(display.livestockProductionPerHourText).toBe("0");
    expect(display.field.holdText).toBe("Carrots 0/20");
    expect(display.field.productionText).toBe("Production inactive");
    expect(display.field.harvestActionText).toBe("Requires proximity");
    expect(display.field.canHarvest).toBe(false);
    expect(display.field.speedText).toBe("0%");
    expect(display.field.multiCropText).toBe("0%");
    expect(display.field.generationPerHourText).toBe("0");
    expect(display.field.speedTooltip).toBe("Faster Generation Lv 0/5");
    expect(display.field.multiCropTooltip).toBe("Fertilizer Lv 0/3");
    expect(display.field.holdingTooltip).toBe("Harvest Cap Lv 1/5");
    expect(display.field.upgrades.map((upgrade) => upgrade.id)).toEqual([
      "speed",
      "cap",
      "fertilizer",
    ]);
    expect(display.field.upgrades[0]).toMatchObject({
      displayName: "Faster Generation",
      level: 0,
      maxLevel: 5,
      costCrowns: 100,
      canPurchase: false,
      actionText: "Requires proximity",
      currentEffectText: "Inactive",
      nextEffectText: "100% speed",
    });
  });

  it("shows active crop production, cap, and expected crop rate", () => {
    const state = createTestGameState({
      farm: {
        fieldsById: {
          carrot_field: {
            id: "carrot_field",
            cropId: "carrot",
            upgradeLevels: {
              speed: 3,
              cap: 2,
              fertilizer: 2,
            },
            heldQuantity: 4,
            lastGeneratedAtMs: 0,
          },
        },
      },
    });

    const display = getFarmDisplay(state, FARM_CARROT_GROWTH_MS / 2);

    expect(display.field.holdText).toBe("Carrots 4/24");
    expect(display.field.productionText).toBe("Next carrot in 8:11");
    expect(display.field.speedText).toBe("110%");
    expect(display.field.multiCropText).toBe("2%");
    expect(display.field.generationPerHourText).toBe("3.37");
    expect(display.totalCropsPerHourText).toBe("3.37");
    expect(display.field.generationPerHourTooltip).toBe(
      "Based on Faster Generation Lv 3/5 and Fertilizer Lv 2/3",
    );
  });
});
