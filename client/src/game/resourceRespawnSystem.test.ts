import { describe, expect, it } from "vitest";
import { createResource } from "./entities";
import {
  RESOURCE_RESPAWN_DELAY_MS,
  updateResourceRespawnSystem,
} from "./resourceRespawnSystem";
import { createTestGameState } from "./testState";
import {
  MAP_ONE_ID,
  mapOneResourceStartData,
} from "./debugMap";

describe("resource respawn system", () => {
  it("keeps authored depleted resource nodes depleted before the respawn delay", () => {
    const resourceStartData = mapOneResourceStartData[0];
    const resource = {
      ...createResource(resourceStartData.id, resourceStartData.position, {
        resourceType: resourceStartData.resourceType,
        tier: resourceStartData.tier,
      }),
      durability: 0,
      quantity: 0,
      isDepleted: true,
      depletedAtMs: 1000,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      entities: {
        [resource.id]: resource,
      },
    });

    const nextState = updateResourceRespawnSystem(
      state,
      1000 + RESOURCE_RESPAWN_DELAY_MS - 1,
    );

    expect(nextState.entities[resource.id]).toMatchObject({
      durability: 0,
      quantity: 0,
      isDepleted: true,
      depletedAtMs: 1000,
    });
  });

  it("respawns authored depleted resource nodes with full durability and quantity after 30 seconds", () => {
    const resourceStartData = mapOneResourceStartData[0];
    const resource = {
      ...createResource(resourceStartData.id, { x: 1, y: 1 }, {
        resourceType: resourceStartData.resourceType,
        tier: resourceStartData.tier,
      }),
      durability: 0,
      quantity: 0,
      isDepleted: true,
      depletedAtMs: 1000,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      entities: {
        [resource.id]: resource,
      },
    });

    const nextState = updateResourceRespawnSystem(
      state,
      1000 + RESOURCE_RESPAWN_DELAY_MS,
    );

    expect(nextState.entities[resource.id]).toMatchObject({
      id: resourceStartData.id,
      kind: "resource",
      resourceType: resourceStartData.resourceType,
      tier: resourceStartData.tier ?? 1,
      position: resourceStartData.position,
      durability: 5,
      maxDurability: 5,
      quantity: 3,
      isDepleted: false,
    });
    expect("depletedAtMs" in nextState.entities[resource.id]).toBe(false);
  });

  it("starts the respawn timer for legacy depleted authored resources without a timestamp", () => {
    const resourceStartData = mapOneResourceStartData[0];
    const resource = {
      ...createResource(resourceStartData.id, resourceStartData.position, {
        resourceType: resourceStartData.resourceType,
        tier: resourceStartData.tier,
      }),
      durability: 0,
      quantity: 0,
      isDepleted: true,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      entities: {
        [resource.id]: resource,
      },
    });

    const nextState = updateResourceRespawnSystem(state, 5000);

    expect(nextState.entities[resource.id]).toMatchObject({
      durability: 0,
      quantity: 0,
      isDepleted: true,
      depletedAtMs: 5000,
    });
  });

  it("does not respawn non-authored temporary resources", () => {
    const resource = {
      ...createResource("temporary-resource", { x: 1, y: 1 }),
      durability: 0,
      quantity: 0,
      isDepleted: true,
      depletedAtMs: 1000,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      entities: {
        [resource.id]: resource,
      },
    });

    const nextState = updateResourceRespawnSystem(
      state,
      1000 + RESOURCE_RESPAWN_DELAY_MS,
    );

    expect(nextState.entities[resource.id]).toEqual(resource);
  });
});
