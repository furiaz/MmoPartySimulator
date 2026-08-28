import { describe, expect, it } from "vitest";
import {
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import { createCompanion } from "./entities";
import {
  AUTO_COMBAT_ON_ARRIVAL_DELAY_MS,
  AUTO_ROUTE_CALM_TIME_MS,
  AUTO_ROUTE_COHESION_DISTANCE,
  AUTO_ROUTE_INTERRUPT_COOLDOWN_MS,
  beginAutoRouteCalmPeriod,
  completeAutoRouteArrival,
  finishAutoRouteCalmPeriod,
  hasAutoRouteResumeCohesion,
  startAutoRoute,
  updateAutoRouteRuntime,
} from "./autoRouteSystem";
import { createTestGameState } from "./testState";

describe("auto route system", () => {
  it("starts only for known destinations with a working next route step", () => {
    const unknownResult = startAutoRoute(
      createTestGameState({
        currentMapId: HUB_MAP_ID,
      }),
      MAP_ONE_ID,
    );

    expect(unknownResult).toMatchObject({
      status: "failed",
      reason: "unknown_destination",
    });

    const knownResult = startAutoRoute(
      createTestGameState({
        currentMapId: HUB_MAP_ID,
        worldDiscovery: {
          visitedMapIds: [MAP_ONE_ID],
          visitedSubzonesByMapId: {},
        },
      }),
      MAP_ONE_ID,
    );

    expect(knownResult.status).toBe("success");
    expect(knownResult.state.worldTravelTargetMapId).toBe(MAP_ONE_ID);
  });

  it("refuses to start when the next needed teleport is not working", () => {
    const result = startAutoRoute(
      createTestGameState({
        currentMapId: MAP_ONE_ID,
        worldDiscovery: {
          visitedMapIds: [MAP_TWO_ID],
          visitedSubzonesByMapId: {},
        },
      }),
      MAP_TWO_ID,
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "blocked_route",
    });
  });

  it("clears route on arrival and enables Auto Combat after 500 ms when requested", () => {
    const arrivedState = completeAutoRouteArrival(
      createTestGameState({
        autoCombatOnArrivalEnabled: true,
        autoModeEnabled: false,
        currentMapId: MAP_ONE_ID,
        simulationTimeMs: 1000,
        worldTravelTargetMapId: MAP_ONE_ID,
      }),
    );

    expect(arrivedState.worldTravelTargetMapId).toBeNull();
    expect(arrivedState.autoModeEnabled).toBe(false);
    expect(arrivedState.autoRoute?.autoCombatEnableAtMs).toBe(
      1000 + AUTO_COMBAT_ON_ARRIVAL_DELAY_MS,
    );

    expect(
      updateAutoRouteRuntime({
        ...arrivedState,
        simulationTimeMs: 1499,
      }).autoModeEnabled,
    ).toBe(false);

    const enabledState = updateAutoRouteRuntime({
      ...arrivedState,
      simulationTimeMs: 1500,
    });

    expect(enabledState.autoModeEnabled).toBe(true);
    expect(enabledState.autoRoute).toBeUndefined();
  });

  it("pauses route movement for calm time and resumes with cooldown after cohesion", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion("follower", { x: 2, y: 0 }, leader.id, "support");
    const state = createTestGameState({
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: {
          ...leader,
          state: "follow",
          currentTargetId: MAP_ONE_ID,
        },
        [follower.id]: {
          ...follower,
          state: "follow",
          currentTargetId: leader.id,
        },
      },
      partyLeaderId: leader.id,
      simulationTimeMs: 2000,
      worldTravelTargetMapId: MAP_ONE_ID,
    });

    const pausedState = beginAutoRouteCalmPeriod(state);

    expect(pausedState.autoRoute?.resumeAfterMs).toBe(
      2000 + AUTO_ROUTE_CALM_TIME_MS,
    );
    expect(pausedState.entities[leader.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
    expect(hasAutoRouteResumeCohesion(pausedState)).toBe(true);

    const resumedState = finishAutoRouteCalmPeriod({
      ...pausedState,
      simulationTimeMs: 3500,
    });

    expect(resumedState.autoRoute?.resumeAfterMs).toBeUndefined();
    expect(resumedState.autoRoute?.interruptCooldownUntilMs).toBe(
      3500 + AUTO_ROUTE_INTERRUPT_COOLDOWN_MS,
    );
  });

  it("requires non-busy party members to be within 180 px before route resume", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const farFollower = createCompanion(
      "follower",
      { x: AUTO_ROUTE_COHESION_DISTANCE + 1, y: 0 },
      leader.id,
      "support",
    );
    const gatheringFollower = {
      ...createCompanion(
        "gatherer",
        { x: AUTO_ROUTE_COHESION_DISTANCE + 10, y: 0 },
        leader.id,
        "gatherer",
      ),
      state: "gather" as const,
    };

    expect(
      hasAutoRouteResumeCohesion(
        createTestGameState({
          entities: {
            [leader.id]: leader,
            [farFollower.id]: farFollower,
            [gatheringFollower.id]: gatheringFollower,
          },
          partyLeaderId: leader.id,
        }),
      ),
    ).toBe(false);

    expect(
      hasAutoRouteResumeCohesion(
        createTestGameState({
          entities: {
            [leader.id]: leader,
            [gatheringFollower.id]: gatheringFollower,
          },
          partyLeaderId: leader.id,
        }),
      ),
    ).toBe(true);
  });
});
