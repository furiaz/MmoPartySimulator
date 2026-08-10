import { createEmptyPartyBank } from "./bank";
import { createInitialGuildRecruitState } from "./guildRecruit";
import { createEmptyPartyInventory } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import type { GameState } from "./state";
import { createEmptyPartyWallet } from "./wallet";

export function createTestGameState(
  overrides: Partial<GameState> = {},
): GameState {
  return {
    entities: {},
    restingCompanionsById: {},
    highestCharacterLevelEver: 1,
    guildRecruit: createInitialGuildRecruitState(0),
    inventory: createEmptyPartyInventory(),
    keyItemsById: {},
    bank: createEmptyPartyBank(),
    wallet: createEmptyPartyWallet(),
    autoModeEnabled: false,
    worldTravelTargetMapId: null,
    poiPreferences: {
      stayInMap: false,
      searchScope: "free_travel",
    },
    simulationTick: 0,
    simulationFrame: 0,
    simulationTimeMs: 0,
    simulationDeltaMs: 100,
    partyLeaderId: "",
    partyIntent: null,
    leaderIntent: null,
    quests: createInitialQuestStates(),
    globalPoiIntent: null,
    localPoiTarget: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    combatProjectiles: [],
    newsBroadcasts: [],
    ...overrides,
  };
}
