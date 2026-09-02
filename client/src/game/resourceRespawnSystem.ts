import {
  MAP_FIVE_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_SEVEN_ID,
  MAP_SIX_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  mapFiveResourceStartData,
  mapFourResourceStartData,
  mapOneResourceStartData,
  mapSevenResourceStartData,
  mapSixResourceStartData,
  mapThreeResourceStartData,
  mapTwoResourceStartData,
  type ResourceStartData,
} from "./debugMap";
import { createResource, isResourceEntity } from "./entities";
import { updateEntity, type GameState } from "./state";
import type { DebugMapId, ResourceEntity } from "./types";

export const RESOURCE_RESPAWN_DELAY_MS = 30_000;

const resourceStartDataByMapId: Partial<Record<DebugMapId, ResourceStartData[]>> = {
  [MAP_ONE_ID]: mapOneResourceStartData,
  [MAP_TWO_ID]: mapTwoResourceStartData,
  [MAP_THREE_ID]: mapThreeResourceStartData,
  [MAP_FOUR_ID]: mapFourResourceStartData,
  [MAP_FIVE_ID]: mapFiveResourceStartData,
  [MAP_SIX_ID]: mapSixResourceStartData,
  [MAP_SEVEN_ID]: mapSevenResourceStartData,
};

export function updateResourceRespawnSystem(
  state: GameState,
  nowMs: number,
): GameState {
  const resourceStartDataById = getResourceStartDataById(
    state.currentMapId ?? state.map?.id,
  );

  if (resourceStartDataById.size === 0) {
    return state;
  }

  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isResourceEntity(entity)) {
      continue;
    }

    const resourceStartData = resourceStartDataById.get(entity.id);

    if (!resourceStartData) {
      continue;
    }

    if (!entity.isDepleted) {
      if (entity.depletedAtMs !== undefined) {
        nextState = updateEntity(nextState, clearDepletedAt(entity));
      }
      continue;
    }

    if (entity.depletedAtMs === undefined) {
      nextState = updateEntity(nextState, {
        ...entity,
        depletedAtMs: nowMs,
      });
      continue;
    }

    if (nowMs - entity.depletedAtMs < RESOURCE_RESPAWN_DELAY_MS) {
      continue;
    }

    nextState = updateEntity(
      nextState,
      createResource(resourceStartData.id, resourceStartData.position, {
        resourceType: resourceStartData.resourceType,
        tier: resourceStartData.tier,
      }),
    );
  }

  return nextState;
}

function getResourceStartDataById(
  mapId: DebugMapId | undefined,
): Map<string, ResourceStartData> {
  return new Map(
    (mapId ? resourceStartDataByMapId[mapId] : undefined)?.map((resource) => [
      resource.id,
      resource,
    ]) ?? [],
  );
}

function clearDepletedAt(resource: ResourceEntity): ResourceEntity {
  const { depletedAtMs: _depletedAtMs, ...activeResource } = resource;

  return activeResource;
}
