import { describe, expect, it } from "vitest";
import { FARM_CARROT_GROWTH_MS } from "./game";
import { getFarmDisplay } from "./farmPresentation";
import { createTestGameState } from "./game/testState";

describe("farm presentation", () => {
  it("shows locked level 0 carrot holding state", () => {
    const display = getFarmDisplay(createTestGameState(), 1_000);

    expect(display.isUnlocked).toBe(false);
    expect(display.field.holdText).toBe("Carrots 0/20");
    expect(display.field.productionText).toBe("Production inactive");
    expect(display.field.upgradeActionText).toBe("Requires proximity");
    expect(display.field.harvestActionText).toBe("Requires proximity");
    expect(display.field.canUpgrade).toBe(false);
  });

  it("shows the next carrot timer for an active field", () => {
    const state = createTestGameState({
      farm: {
        fieldsById: {
          carrot_field: {
            id: "carrot_field",
            cropId: "carrot",
            level: 1,
            heldQuantity: 4,
            lastGeneratedAtMs: 0,
          },
        },
      },
    });

    const display = getFarmDisplay(state, FARM_CARROT_GROWTH_MS / 2);

    expect(display.field.holdText).toBe("Carrots 4/20");
    expect(display.field.productionText).toBe("Next carrot in 10:00");
  });
});
