import { describe, expect, it } from "vitest";
import {
  INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
  createInitialGuildSecondaryPartiesState,
  createInitialGuildUpgradesState,
} from "./game";
import { createCompanion } from "./game/entities";
import { createTestGameState } from "./game/testState";
import {
  formatInnKitchenDuration,
  getInnKitchenCompanionRows,
  getInnKitchenRecipeDisplay,
} from "./innKitchenPresentation";

describe("Inn Kitchen presentation", () => {
  it("orders companions by Main Party, Field Teams, then Inn reserve", () => {
    const main = createKitchenCompanion("main", 0);
    const fieldOne = createKitchenCompanion("field-one", 1);
    const fieldTwo = createKitchenCompanion("field-two", 2);
    const reserve = createKitchenCompanion("reserve", 3);
    const guildUpgrades = createInitialGuildUpgradesState();
    guildUpgrades.secondaryParties.secondary_party_count = 2;
    const guildSecondaryParties = createInitialGuildSecondaryPartiesState();
    guildSecondaryParties.parties[0].companionIds[0] = fieldOne.id;
    guildSecondaryParties.parties[1].companionIds[0] = fieldTwo.id;
    const state = createTestGameState({
      entities: {
        [main.id]: main,
      },
      restingCompanionsById: {
        [fieldOne.id]: fieldOne,
        [fieldTwo.id]: fieldTwo,
        [reserve.id]: reserve,
      },
      partyLeaderId: main.id,
      guildUpgrades,
      guildSecondaryParties,
    });

    const rows = getInnKitchenCompanionRows(state, 0);

    expect(rows.map((row) => row.companion.id)).toEqual([
      main.id,
      fieldOne.id,
      fieldTwo.id,
      reserve.id,
    ]);
    expect(rows.map((row) => row.locationLabel)).toEqual([
      "Main Party",
      "Field Team 1",
      "Field Team 2",
      "Inn's Reserve",
    ]);
    expect(rows.map((row) => row.badgeText)).toEqual(["\u2605", "1", "2", null]);
  });

  it("formats House Bread display data", () => {
    expect(getInnKitchenRecipeDisplay(INN_KITCHEN_HOUSE_BREAD_RECIPE_ID)).toMatchObject({
      costText: "30 Crowns",
      ingredientText: "None",
      durationText: "3h",
      effectText: "Max HP +5%",
    });
    expect(formatInnKitchenDuration(90 * 60_000)).toBe("1h 30m");
  });
});

function createKitchenCompanion(id: string, partyOrder: number) {
  return createCompanion(
    id,
    { x: partyOrder, y: 0 },
    "main",
    "none",
    partyOrder,
  );
}
