import type { GameState } from "./state";

export const TOWN_SERVICES_UNLOCK_QUEST_ID = "azure_trial";

export function isTownServicesUnlocked(state: GameState): boolean {
  return state.quests[TOWN_SERVICES_UNLOCK_QUEST_ID]?.status === "completed";
}

export function getTownServicesLockedMessage(state: GameState): string | null {
  return isTownServicesUnlocked(state)
    ? null
    : "Complete The Azure Trial to unlock town services.";
}
