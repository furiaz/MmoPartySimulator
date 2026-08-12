import {
  debugMapDefinitions,
  MAP_FIVE_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_SEVEN_ID,
  MAP_SIX_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import { getSubzoneAtPosition } from "./subzoneSystem";
import type { GameState } from "./state";
import type { DebugMapId, WorldDiscoveryState, ZoneSubzone } from "./types";

export const DISPATCH_WILD_MAP_IDS: DebugMapId[] = [
  MAP_ONE_ID,
  MAP_TWO_ID,
  MAP_THREE_ID,
  MAP_FOUR_ID,
  MAP_FIVE_ID,
  MAP_SIX_ID,
  MAP_SEVEN_ID,
];

export type DispatchDestination = {
  mapId: DebugMapId;
  mapName: string;
  subzoneId: string;
  subzoneName: string;
  subzone: ZoneSubzone;
};

export function createInitialWorldDiscoveryState(
  state?: Pick<GameState, "currentMapId" | "map" | "partyLeaderId" | "entities">,
): WorldDiscoveryState {
  return recordCurrentSubzoneVisited(
    {
      visitedMapIds: [],
      visitedSubzonesByMapId: {},
    },
    state,
  );
}

export function sanitizeWorldDiscoveryState(
  worldDiscovery: WorldDiscoveryState | undefined,
  state?: Pick<GameState, "currentMapId" | "map" | "partyLeaderId" | "entities">,
): WorldDiscoveryState {
  const visitedMapIds = new Set<DebugMapId>();
  const visitedSubzonesByMapId: WorldDiscoveryState["visitedSubzonesByMapId"] = {};

  for (const mapId of worldDiscovery?.visitedMapIds ?? []) {
    if (isDispatchWildMapId(mapId)) {
      visitedMapIds.add(mapId);
    }
  }

  for (const [mapId, subzoneIds] of Object.entries(
    worldDiscovery?.visitedSubzonesByMapId ?? {},
  )) {
    if (!isDispatchWildMapId(mapId)) {
      continue;
    }

    const validSubzoneIds = new Set(
      debugMapDefinitions[mapId].subzones
        ?.filter(isDispatchSubzone)
        .map((subzone) => subzone.id) ?? [],
    );
    const sanitizedSubzoneIds = [...new Set(subzoneIds ?? [])].filter((subzoneId) =>
      validSubzoneIds.has(subzoneId),
    );

    if (sanitizedSubzoneIds.length > 0) {
      visitedMapIds.add(mapId);
      visitedSubzonesByMapId[mapId] = sanitizedSubzoneIds;
    }
  }

  return recordCurrentSubzoneVisited(
    {
      visitedMapIds: [...visitedMapIds],
      visitedSubzonesByMapId,
    },
    state,
  );
}

export function recordCurrentWorldDiscovery(state: GameState): GameState {
  return {
    ...state,
    worldDiscovery: sanitizeWorldDiscoveryState(state.worldDiscovery, state),
  };
}

export function getDispatchDestinations(state: GameState): DispatchDestination[] {
  const discovery = sanitizeWorldDiscoveryState(state.worldDiscovery, state);

  return DISPATCH_WILD_MAP_IDS.flatMap((mapId) => {
    const subzoneIds = new Set(discovery.visitedSubzonesByMapId[mapId] ?? []);
    const definition = debugMapDefinitions[mapId];

    return (definition.subzones ?? [])
      .filter((subzone) => subzoneIds.has(subzone.id) && isDispatchSubzone(subzone))
      .map((subzone) => ({
        mapId,
        mapName: definition.displayName,
        subzoneId: subzone.id,
        subzoneName: subzone.displayName,
        subzone,
      }));
  });
}

export function getDispatchDestination(
  mapId: DebugMapId,
  subzoneId: string,
): DispatchDestination | null {
  if (!isDispatchWildMapId(mapId)) {
    return null;
  }

  const definition = debugMapDefinitions[mapId];
  const subzone = definition.subzones?.find(
    (candidate) => candidate.id === subzoneId && isDispatchSubzone(candidate),
  );

  if (!subzone) {
    return null;
  }

  return {
    mapId,
    mapName: definition.displayName,
    subzoneId: subzone.id,
    subzoneName: subzone.displayName,
    subzone,
  };
}

export function isDispatchSubzone(subzone: ZoneSubzone): boolean {
  return subzone.enemyTypeIds.length > 0;
}

function recordCurrentSubzoneVisited(
  worldDiscovery: WorldDiscoveryState,
  state?: Pick<GameState, "currentMapId" | "map" | "partyLeaderId" | "entities">,
): WorldDiscoveryState {
  if (!state?.currentMapId || !isDispatchWildMapId(state.currentMapId) || !state.map) {
    return worldDiscovery;
  }

  const leader = state.entities[state.partyLeaderId];
  const subzone = leader?.kind === "companion"
    ? getSubzoneAtPosition(state.map, leader.position)
    : null;

  if (!subzone || !isDispatchSubzone(subzone)) {
    return worldDiscovery;
  }

  const visitedMapIds = new Set(worldDiscovery.visitedMapIds);
  const visitedSubzoneIds = new Set(
    worldDiscovery.visitedSubzonesByMapId[state.currentMapId] ?? [],
  );

  visitedMapIds.add(state.currentMapId);
  visitedSubzoneIds.add(subzone.id);

  return {
    visitedMapIds: [...visitedMapIds],
    visitedSubzonesByMapId: {
      ...worldDiscovery.visitedSubzonesByMapId,
      [state.currentMapId]: [...visitedSubzoneIds],
    },
  };
}

function isDispatchWildMapId(mapId: string): mapId is DebugMapId {
  return DISPATCH_WILD_MAP_IDS.includes(mapId as DebugMapId);
}
