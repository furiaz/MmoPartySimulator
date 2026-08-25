import { describe, expect, it } from "vitest";
import { createCompanion, createNpc } from "./entities";
import {
  collectAllLivestockOutputs,
  createInitialLivestockState,
  feedHungryLivestockNow,
  LIVESTOCK_DUSKHEN_CREATURE_ID,
  LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
  LIVESTOCK_DUSKHEN_FEED_PER_DAY,
  LIVESTOCK_EGG_HOLD_CAP,
  moveLivestockPlacement,
  placeLivestockCreature,
  removeLivestockPlacement,
  sanitizeLivestockState,
  settleLivestockState,
} from "./livestock";
import { LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID } from "./keyItems";
import { sanitizeGameStateForSave } from "./saveGame";
import { createTestGameState } from "./testState";
import type {
  LivestockPlacedCreatureState,
  LivestockState,
  Position,
} from "./types";

const NOW_MS = 1_000_000;

describe("Livestock MVP", () => {
  it("initializes two owned unplaced Duskhens on a 5x3 grid", () => {
    const state = createLivestockTestState();

    expect(state.livestock).toMatchObject({
      grid: { width: 5, height: 3 },
      ownedCreaturesById: { duskhen: 2 },
      placementsById: {},
      holdingQuantitiesByOutputId: { egg: 0 },
      holdingCapsByOutputId: { egg: 20 },
    });
    expect(state.keyItemsById?.[LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]).toBe(1);
  });

  it("sanitizes missing and invalid Livestock state safely", () => {
    const missing = sanitizeLivestockState(undefined);
    const invalid = sanitizeLivestockState({
      grid: { width: -5, height: 1 },
      ownedCreaturesById: { duskhen: 1 },
      placementSequence: 0,
      placementsById: {
        invalid: {
          id: "invalid",
          creatureId: "duskhen",
          x: 99,
          y: 99,
          rotation: "horizontal",
          placedAtMs: 0,
          lastProducedAtMs: 0,
        },
      },
      holdingQuantitiesByOutputId: { egg: 99 },
      holdingCapsByOutputId: { egg: 2 },
    });

    expect(missing.grid).toEqual({ width: 5, height: 3 });
    expect(missing.ownedCreaturesById.duskhen).toBe(2);
    expect(invalid.grid).toEqual({ width: 5, height: 3 });
    expect(invalid.ownedCreaturesById.duskhen).toBe(2);
    expect(invalid.placementsById).toEqual({});
    expect(invalid.holdingQuantitiesByOutputId.egg).toBe(
      LIVESTOCK_EGG_HOLD_CAP,
    );
  });

  it("places Duskhens and rejects locked, far, occupied, out-of-bounds, and unavailable placement", () => {
    const locked = placeLivestockCreature(
      createLivestockTestState({ azureTrialCompleted: false }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );
    const far = placeLivestockCreature(
      createLivestockTestState({ leaderPosition: { x: 0, y: 0 } }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );
    let state = createLivestockTestState();
    const first = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    state = first.state;
    const occupied = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );
    const second = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      1,
      0,
      "horizontal",
      NOW_MS,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    state = second.state;
    const unavailable = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      2,
      0,
      "horizontal",
      NOW_MS,
    );
    const outOfBounds = placeLivestockCreature(
      createLivestockTestState(),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      5,
      0,
      "horizontal",
      NOW_MS,
    );

    expect(locked).toMatchObject({ ok: false, reason: "locked_service" });
    expect(far).toMatchObject({ ok: false, reason: "not_near_livestock" });
    expect(occupied).toMatchObject({ ok: false, reason: "occupied_cell" });
    expect(unavailable).toMatchObject({
      ok: false,
      reason: "no_available_creature",
    });
    expect(outOfBounds).toMatchObject({ ok: false, reason: "out_of_bounds" });
  });

  it("consumes prorated Pantry carrots on placement and rejects insufficient feed", () => {
    const midday = new Date(2026, 0, 1, 12).getTime();
    const placed = placeLivestockCreature(
      createLivestockTestState({ pantryCarrots: 10 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      midday,
    );
    const insufficient = placeLivestockCreature(
      createLivestockTestState({ pantryCarrots: 4 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      midday,
    );
    const freeLatePlacement = placeLivestockCreature(
      createLivestockTestState({ pantryCarrots: 0 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      new Date(2026, 0, 1, 23, 59).getTime(),
    );

    expect(placed.ok).toBe(true);
    if (placed.ok) {
      expect(
        placed.state.innKitchen?.pantry.ingredientQuantitiesById.carrot,
      ).toBe(5);
    }
    expect(insufficient).toMatchObject({
      ok: false,
      reason: "insufficient_feed",
    });
    expect(freeLatePlacement.ok).toBe(true);
  });

  it("moves while preserving timers and re-places removed Duskhens with a fresh timer", () => {
    const placement = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 100,
    });
    const state = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementSequence: 1,
        placementsById: {
          [placement.id]: placement,
        },
      },
    });
    const moved = moveLivestockPlacement(
      state,
      placement.id,
      2,
      1,
      "horizontal",
      200,
    );

    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      return;
    }

    expect(moved.placement).toMatchObject({
      x: 2,
      y: 1,
      lastProducedAtMs: 100,
    });

    const removed = removeLivestockPlacement(moved.state, placement.id, 300);
    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      return;
    }

    const rePlaced = placeLivestockCreature(
      removed.state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      3,
      1,
      "horizontal",
      400,
    );
    expect(rePlaced.ok).toBe(true);
    if (!rePlaced.ok) {
      return;
    }

    expect(rePlaced.placement.lastProducedAtMs).toBe(400);
  });

  it("produces staggered Eggs, catches up, and clamps at the shared holding cap", () => {
    const first = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 0,
    });
    const second = createPlacedDuskhen({
      id: "livestock_duskhen_2",
      x: 1,
      y: 0,
      lastProducedAtMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
    });
    const state = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementSequence: 2,
        placementsById: {
          [first.id]: first,
          [second.id]: second,
        },
      },
    });
    const oneReady = settleLivestockState(
      state,
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
    );
    const bothReady = settleLivestockState(
      oneReady,
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS +
        LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
    );

    expect(oneReady.livestock?.holdingQuantitiesByOutputId.egg).toBe(1);
    expect(bothReady.livestock?.holdingQuantitiesByOutputId.egg).toBe(2);
    expect(
      bothReady.livestock?.placementsById[first.id].lastProducedAtMs,
    ).toBe(LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS);
    expect(
      bothReady.livestock?.placementsById[second.id].lastProducedAtMs,
    ).toBe(
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS +
        LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
    );

    const capped = settleLivestockState(
      createLivestockTestState({
        livestock: {
          ...createInitialLivestockState(),
          placementsById: {
            [first.id]: first,
          },
          holdingQuantitiesByOutputId: { egg: 19 },
        },
      }),
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS * 5,
    );

    expect(capped.livestock?.holdingQuantitiesByOutputId.egg).toBe(20);
  });

  it("feeds placed animals at midnight in placement order and marks unfed animals hungry", () => {
    const start = new Date(2026, 0, 1, 0).getTime();
    const first = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: start,
    });
    const second = createPlacedDuskhen({
      id: "livestock_duskhen_2",
      x: 1,
      y: 0,
      lastProducedAtMs: start,
    });
    const fed = settleLivestockState(
      createLivestockTestState({
        pantryCarrots: LIVESTOCK_DUSKHEN_FEED_PER_DAY,
        livestock: {
          ...createInitialLivestockState(start),
          placementSequence: 2,
          lastFeedDayStartMs: start,
          placementsById: {
            [first.id]: first,
            [second.id]: second,
          },
        },
      }),
      new Date(2026, 0, 2, 0, 1).getTime(),
    );

    expect(fed.livestock?.placementsById[first.id].isHungry).toBeUndefined();
    expect(fed.livestock?.placementsById[second.id].isHungry).toBe(true);
    expect(fed.innKitchen?.pantry.ingredientQuantitiesById.carrot).toBe(0);
  });

  it("pauses hungry production and resumes remaining timer after Feed Now", () => {
    const start = new Date(2026, 0, 1, 0).getTime();
    const beforeMidnight = new Date(2026, 0, 1, 22).getTime();
    const afterMidnight = new Date(2026, 0, 2, 0, 1).getTime();
    const afterFeed = new Date(2026, 0, 2, 12).getTime();
    const placed = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: beforeMidnight,
    });
    const hungry = settleLivestockState(
      createLivestockTestState({
        pantryCarrots: 0,
        livestock: {
          ...createInitialLivestockState(start),
          placementSequence: 1,
          lastFeedDayStartMs: start,
          placementsById: {
            [placed.id]: placed,
          },
        },
      }),
      afterMidnight,
    );
    const hungryPlacement = hungry.livestock?.placementsById[placed.id];

    expect(hungryPlacement?.isHungry).toBe(true);
    expect(hungryPlacement?.pausedProductionRemainingMs).toBe(
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS - 2 * 60 * 60 * 1000,
    );

    const stillPaused = settleLivestockState(
      {
        ...hungry,
        innKitchen: {
          ...hungry.innKitchen!,
          pantry: {
            ...hungry.innKitchen!.pantry,
            ingredientQuantitiesById: {
              ...hungry.innKitchen!.pantry.ingredientQuantitiesById,
              carrot: 5,
            },
          },
        },
      },
      afterFeed,
    );

    expect(stillPaused.livestock?.holdingQuantitiesByOutputId.egg).toBe(0);

    const fed = feedHungryLivestockNow(stillPaused, afterFeed);
    expect(fed.ok).toBe(true);
    if (!fed.ok) {
      return;
    }

    const resumedOneHourLater = settleLivestockState(
      fed.state,
      afterFeed + 60 * 60 * 1000,
    );
    expect(
      resumedOneHourLater.livestock?.placementsById[placed.id].isHungry,
    ).not.toBe(true);
    expect(resumedOneHourLater.livestock?.holdingQuantitiesByOutputId.egg).toBe(1);
  });

  it("Feed Now fails when no animals are hungry", () => {
    const fed = feedHungryLivestockNow(createLivestockTestState(), NOW_MS);

    expect(fed).toMatchObject({ ok: false, reason: "no_hungry_animals" });
  });

  it("collects held Eggs into Pantry without generating first, resetting timers, or creating inventory clutter", () => {
    const placement = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 0,
    });
    const state = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementsById: {
          [placement.id]: placement,
        },
        holdingQuantitiesByOutputId: { egg: 1 },
      },
    });

    const collected = collectAllLivestockOutputs(
      state,
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
    );

    expect(collected.ok).toBe(true);
    if (!collected.ok) {
      return;
    }

    expect(collected.collectedByOutputId.egg).toBe(1);
    expect(collected.state.livestock?.holdingQuantitiesByOutputId.egg).toBe(0);
    expect(
      collected.state.livestock?.placementsById[placement.id].lastProducedAtMs,
    ).toBe(0);
    expect(
      collected.state.innKitchen?.pantry.unlockedIngredientIds,
    ).toContain("egg");
    expect(
      collected.state.innKitchen?.pantry.ingredientQuantitiesById.egg,
    ).toBe(1);
    expect(
      collected.state.inventory.slots.some((slot) => String(slot.itemId) === "egg"),
    ).toBe(false);
  });

  it("preserves Livestock through save sanitization and restores the Duskhen discovery key item", () => {
    const placement = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 0,
    });
    const sanitized = sanitizeGameStateForSave(
      createLivestockTestState({
        keyItemsById: {},
        livestock: {
          ...createInitialLivestockState(),
          placementSequence: 1,
          placementsById: {
            [placement.id]: placement,
          },
          holdingQuantitiesByOutputId: { egg: 4 },
        },
      }),
    );

    expect(sanitized.livestock?.placementsById[placement.id]).toMatchObject({
      creatureId: "duskhen",
      x: 0,
      y: 0,
    });
    expect(sanitized.livestock?.holdingQuantitiesByOutputId.egg).toBe(4);
    expect(
      sanitized.keyItemsById?.[LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID],
    ).toBe(1);
  });
});

function createLivestockTestState({
  azureTrialCompleted = true,
  leaderPosition = { x: 10, y: 10 },
  livestock = createInitialLivestockState(),
  keyItemsById,
  pantryCarrots = 100,
}: {
  azureTrialCompleted?: boolean;
  leaderPosition?: Position;
  livestock?: LivestockState;
  keyItemsById?: Partial<Record<string, number>>;
  pantryCarrots?: number;
} = {}) {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const keeper = createNpc(
    "livestock",
    { x: 11, y: 10 },
    "Livestock",
    "livestock_keeper",
  );
  const baseState = createTestGameState();
  const baseQuests = baseState.quests;
  const baseKitchen = baseState.innKitchen!;

  return createTestGameState({
    partyLeaderId: leader.id,
    entities: {
      [leader.id]: leader,
      [keeper.id]: keeper,
    },
    livestock,
    keyItemsById:
      keyItemsById === undefined
        ? {
            [LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]: 1,
          }
        : keyItemsById,
    quests: {
      ...baseQuests,
      azure_trial: {
        ...baseQuests.azure_trial,
        status: azureTrialCompleted ? "completed" : "available",
      },
    },
    innKitchen: {
      ...baseKitchen,
      pantry: {
        ...baseKitchen.pantry,
        unlockedIngredientIds: baseKitchen.pantry.unlockedIngredientIds.includes(
          "carrot",
        )
          ? baseKitchen.pantry.unlockedIngredientIds
          : [...baseKitchen.pantry.unlockedIngredientIds, "carrot"],
        ingredientQuantitiesById: {
          ...baseKitchen.pantry.ingredientQuantitiesById,
          carrot: pantryCarrots,
        },
      },
    },
  });
}

function createPlacedDuskhen({
  id,
  x,
  y,
  lastProducedAtMs,
}: {
  id: string;
  x: number;
  y: number;
  lastProducedAtMs: number;
}): LivestockPlacedCreatureState {
  return {
    id,
    creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
    x,
    y,
    rotation: "horizontal",
    placedAtMs: lastProducedAtMs,
    lastProducedAtMs,
  };
}
