import { describe, expect, it } from "vitest";
import {
  INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
  createInitialGuildSecondaryPartiesState,
  createInitialGuildUpgradesState,
  setInnKitchenAutoCookEnabled,
} from "./game";
import { createCompanion } from "./game/entities";
import { createTestGameState } from "./game/testState";
import {
  formatInnKitchenDuration,
  getInnKitchenBulkCookGroups,
  getInnKitchenCompanionRows,
  getInnKitchenHearthFireDisplay,
  getInnKitchenPantryDisplay,
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
      hearthFireCostText: "1.0 Hearth's Fire",
      ingredientText: "None",
      durationText: "3h",
      effectText: "Max HP +5%",
    });
    expect(formatInnKitchenDuration(90 * 60_000)).toBe("1h 30m");
  });

  it("includes selected recipe and auto-cook row state", () => {
    const companion = createKitchenCompanion("main", 0);
    const state = setInnKitchenAutoCookEnabled(
      createTestGameState({
        entities: {
          [companion.id]: companion,
        },
        partyLeaderId: companion.id,
        currentMapId: "hub",
      }),
      companion.id,
      true,
    );

    expect(getInnKitchenCompanionRows(state, 0)[0]).toMatchObject({
      selectedRecipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      autoCookEnabled: true,
      autoCookRenewThresholdPercent: 0,
      autoCookFailure: null,
      isHubEligible: true,
    });
  });

  it("formats Hearth's Fire and empty Pantry display data", () => {
    const state = createTestGameState();

    expect(getInnKitchenHearthFireDisplay(state, 0)).toMatchObject({
      current: 10,
      capacity: 10,
      generationPerHour: 2,
    });
    expect(getInnKitchenPantryDisplay(state)).toEqual({
      ingredientGroups: [],
      emptyText: "No Pantry ingredients registered yet.",
    });
  });

  it("creates bulk cook groups for Main and unlocked occupied Field Teams", () => {
    const main = createKitchenCompanion("main", 0);
    const fieldOne = createKitchenCompanion("field-one", 1);
    const fieldTwo = createKitchenCompanion("field-two", 2);
    const guildUpgrades = createInitialGuildUpgradesState();
    guildUpgrades.secondaryParties.secondary_party_count = 2;
    const guildSecondaryParties = createInitialGuildSecondaryPartiesState();
    guildSecondaryParties.parties[0].companionIds[0] = fieldOne.id;
    guildSecondaryParties.parties[1].companionIds[0] = fieldTwo.id;
    guildSecondaryParties.parties[1].assignment = {
      status: "assigned",
      mapId: "map-1",
      mapName: "Wilds",
      subzoneId: "test-subzone",
      subzoneName: "Test Subzone",
      assignedAtMs: 0,
      lastSettledAtMs: 0,
      capsAtMs: 1,
      maxDurationMs: 1,
      rewardSeed: 1,
      experienceEfficiency: 0.5,
      dropEfficiency: 0.5,
      preview: {
        rating: "Adequate",
        killsPerHour: 1,
        experiencePerMinute: 1,
        survivabilityPercent: 100,
        expectedDropItemIds: [],
        expectedResourceItemIds: [],
        warnings: [],
      },
      pendingResult: null,
      pendingElapsedMs: 0,
    };
    const state = createTestGameState({
      entities: {
        [main.id]: main,
      },
      restingCompanionsById: {
        [fieldOne.id]: fieldOne,
        [fieldTwo.id]: fieldTwo,
      },
      partyLeaderId: main.id,
      guildUpgrades,
      guildSecondaryParties,
    });

    expect(getInnKitchenBulkCookGroups(state)).toEqual([
      {
        id: "main",
        label: "Cook Main",
        companionIds: [main.id],
        isAssigned: false,
      },
      {
        id: "secondary-party-1",
        label: "Cook FT1",
        companionIds: [fieldOne.id],
        isAssigned: false,
      },
      {
        id: "secondary-party-2",
        label: "Cook FT2",
        companionIds: [fieldTwo.id],
        isAssigned: true,
      },
    ]);
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
