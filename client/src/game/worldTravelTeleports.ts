import {
  debugMapDefinitions,
  HUB_MAP_ID,
  hubHealingFountains,
  SLIMEWARD_CAMP_ID,
  slimewardCampDungeonEntranceArrivalPositions,
} from "./debugMap";
import { hasKeyItem } from "./keyItems";
import type { GameState } from "./state";
import type { DebugMapId, KeyItemId, Position } from "./types";

export type WorldTravelTeleportUnlock = {
  targetMapId: DebugMapId;
  requiredKeyItemId: KeyItemId;
  acquisitionHint: string;
  arrivalPositions: Position[];
};

export type WorldTravelTeleportStatus = WorldTravelTeleportUnlock & {
  isCurrentMap: boolean;
  isUnlocked: boolean;
  canTeleport: boolean;
};

const harborFountainPosition = hubHealingFountains[0]?.position ?? { x: 55, y: 32 };

export const WORLD_TRAVEL_TELEPORT_UNLOCKS: Partial<
  Record<DebugMapId, WorldTravelTeleportUnlock>
> = {
  [HUB_MAP_ID]: {
    targetMapId: HUB_MAP_ID,
    requiredKeyItemId: "teleport_echo_harbor_union_bastion",
    acquisitionHint: "T1 Crafting",
    arrivalPositions: createArrivalCluster(harborFountainPosition),
  },
  [SLIMEWARD_CAMP_ID]: {
    targetMapId: SLIMEWARD_CAMP_ID,
    requiredKeyItemId: "teleport_echo_slimeward_camp",
    acquisitionHint: "Slimeward Drop",
    arrivalPositions: slimewardCampDungeonEntranceArrivalPositions,
  },
};

export function getWorldTravelTeleportStatus(
  state: Pick<GameState, "currentMapId" | "keyItemsById">,
  targetMapId: DebugMapId,
): WorldTravelTeleportStatus | null {
  const unlock = WORLD_TRAVEL_TELEPORT_UNLOCKS[targetMapId];

  if (!unlock || !debugMapDefinitions[targetMapId]) {
    return null;
  }

  const isCurrentMap = state.currentMapId === targetMapId;
  const isUnlocked = hasKeyItem(state, unlock.requiredKeyItemId);

  return {
    ...unlock,
    isCurrentMap,
    isUnlocked,
    canTeleport: isUnlocked && !isCurrentMap,
  };
}

function createArrivalCluster(position: Position): Position[] {
  return [
    { x: position.x, y: position.y + 2 },
    { x: position.x + 1, y: position.y + 2 },
    { x: position.x, y: position.y + 3 },
    { x: position.x + 1, y: position.y + 3 },
  ];
}
