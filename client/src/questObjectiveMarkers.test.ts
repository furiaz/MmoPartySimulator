import { describe, expect, it } from "vitest";
import {
  createInitialGameState,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  type DebugMapId,
  type GameState,
  type QuestId,
} from "./game";
import { getQuestObjectiveMarkers } from "./questObjectiveMarkers";

function createStateWithActiveQuest({
  completedObjectiveIds = [],
  currentMapId,
  questId,
}: {
  completedObjectiveIds?: string[];
  currentMapId: DebugMapId;
  questId: QuestId;
}): GameState {
  const state = createInitialGameState();
  const completedIds = new Set(completedObjectiveIds);
  const quest = state.quests[questId];
  const objectiveProgress = Object.fromEntries(
    Object.entries(quest.objectiveProgress).map(([objectiveId, progress]) => [
      objectiveId,
      {
        ...progress,
        completed: completedIds.has(objectiveId),
        currentCount: completedIds.has(objectiveId)
          ? Math.max(1, progress.currentCount)
          : progress.currentCount,
      },
    ]),
  );

  return {
    ...state,
    currentMapId,
    quests: {
      ...state.quests,
      [questId]: {
        ...quest,
        status: "active",
        objectiveProgress,
      },
    },
  };
}

describe("quest objective markers", () => {
  it("shows the Hold the Field Cache defense marker on the cache map", () => {
    const state = createStateWithActiveQuest({
      currentMapId: MAP_TWO_ID,
      questId: "hold_the_field_cache",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([
      {
        id: "hold_the_field_cache:defend_old_grove_cache",
        position: { x: 100, y: 25 },
      },
    ]);
  });

  it("keeps existing inspect objective markers", () => {
    const state = createStateWithActiveQuest({
      currentMapId: MAP_ONE_ID,
      questId: "clear_the_shore",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([
      {
        id: "clear_the_shore:inspect_shore_fringe_marker",
        position: { x: 50, y: 29 },
      },
    ]);
  });

  it("shows only the current incomplete sequential objective marker", () => {
    const state = createStateWithActiveQuest({
      currentMapId: MAP_TWO_ID,
      questId: "rescue_the_grove_runner",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([
      {
        id: "rescue_the_grove_runner:reach_grove_runner",
        position: { x: 78, y: 25 },
      },
    ]);
  });

  it("does not skip ahead when the current sequential objective has its own visible NPC", () => {
    const state = createStateWithActiveQuest({
      completedObjectiveIds: ["reach_grove_runner"],
      currentMapId: MAP_TWO_ID,
      questId: "rescue_the_grove_runner",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([]);
  });

  it("shows the repair marker after earlier sequential objectives complete", () => {
    const state = createStateWithActiveQuest({
      completedObjectiveIds: ["reach_grove_runner", "rescue_grove_runner"],
      currentMapId: MAP_TWO_ID,
      questId: "rescue_the_grove_runner",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([
      {
        id: "rescue_the_grove_runner:repair_old_grove_cache",
        position: { x: 100, y: 25 },
      },
    ]);
  });

  it("shows escort objective markers at their destination", () => {
    const state = createStateWithActiveQuest({
      currentMapId: MAP_TWO_ID,
      questId: "open_wolf_causeway",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([
      {
        id: "open_wolf_causeway:escort_causeway_worker",
        position: { x: 154, y: 29 },
      },
    ]);
  });

  it("filters markers to the current map", () => {
    const state = createStateWithActiveQuest({
      currentMapId: MAP_ONE_ID,
      questId: "hold_the_field_cache",
    });

    expect(getQuestObjectiveMarkers(state)).toEqual([]);
  });

  it("does not add markers for enemies, resources, elites, chests, or route unlocks", () => {
    const dropObjectiveState = createStateWithActiveQuest({
      currentMapId: MAP_ONE_ID,
      questId: "stolen_field_supplies",
    });
    const eliteObjectiveState = createStateWithActiveQuest({
      completedObjectiveIds: ["escort_causeway_worker", "defend_wolf_causeway"],
      currentMapId: MAP_TWO_ID,
      questId: "open_wolf_causeway",
    });
    const routeUnlockState = createStateWithActiveQuest({
      completedObjectiveIds: [
        "escort_causeway_worker",
        "defend_wolf_causeway",
        "defeat_causeway_elite",
      ],
      currentMapId: MAP_TWO_ID,
      questId: "open_wolf_causeway",
    });
    const dungeonChestState = createStateWithActiveQuest({
      completedObjectiveIds: ["enter_slimeward_floor_one", "defeat_azure_mass"],
      currentMapId: MAP_THREE_ID,
      questId: "azure_trial",
    });

    expect(getQuestObjectiveMarkers(dropObjectiveState)).toEqual([]);
    expect(getQuestObjectiveMarkers(eliteObjectiveState)).toEqual([]);
    expect(getQuestObjectiveMarkers(routeUnlockState)).toEqual([]);
    expect(getQuestObjectiveMarkers(dungeonChestState)).toEqual([]);
  });
});
