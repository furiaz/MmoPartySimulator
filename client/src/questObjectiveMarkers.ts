import {
  getActiveQuest,
  getFirstIncompleteObjective,
  QUEST_DEFINITIONS,
  type GameState,
  type Position,
  type QuestObjectiveDefinition,
  type QuestObjectiveType,
} from "./game";

const QUEST_OBJECTIVE_MARKER_TYPES = new Set<QuestObjectiveType>([
  "inspect_poi",
  "reach_poi",
  "repair_poi",
  "defend_area",
  "guide_npc_to_poi",
]);

export type QuestObjectiveMarker = {
  id: string;
  position: Position;
};

export function getQuestObjectiveMarkers(
  state: GameState,
): QuestObjectiveMarker[] {
  const activeQuest = getActiveQuest(state);

  if (!activeQuest || activeQuest.status !== "active") {
    return [];
  }

  const definition = QUEST_DEFINITIONS[activeQuest.questId];

  if (definition.sourceType !== "npc") {
    return [];
  }

  const objectives =
    definition.objectiveFlow === "sequential"
      ? [getFirstIncompleteObjective(state, activeQuest.questId)].filter(
          (objective): objective is QuestObjectiveDefinition => Boolean(objective),
        )
      : definition.objectives.filter(
          (objective) =>
            !activeQuest.objectiveProgress[objective.id]?.completed,
        );

  return objectives
    .filter((objective) =>
      shouldShowQuestObjectiveMarker(state, objective),
    )
    .map((objective) => ({
      id: `${activeQuest.questId}:${objective.id}`,
      position: objective.targetPosition!,
    }));
}

function shouldShowQuestObjectiveMarker(
  state: GameState,
  objective: QuestObjectiveDefinition,
): boolean {
  return (
    QUEST_OBJECTIVE_MARKER_TYPES.has(objective.type) &&
    objective.targetMapId === state.currentMapId &&
    Boolean(objective.targetPosition)
  );
}
