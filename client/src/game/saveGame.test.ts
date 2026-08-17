import { describe, expect, it } from "vitest";
import {
  createDebugMap,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_ONE_ID,
  SLIMEWARD_FLOOR_ONE_ID,
} from "./debugMap";
import { createDebugTelemetryState } from "./debugTelemetry";
import { createCompanion, createResource } from "./entities";
import {
  createInitialGuildNoticeBoardState,
  GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
} from "./guildNoticeBoard";
import {
  createInitialGuildRecruitState,
  GUILD_RECRUIT_REFRESH_INTERVAL_MS,
} from "./guildRecruit";
import {
  GUILD_SECONDARY_PARTY_ID,
  createInitialGuildSecondaryPartiesState,
} from "./guildSecondaryParties";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import { addItemToInventoryState, countInventoryItem } from "./inventory";
import { getPartySizeLimit } from "./leveling";
import { moveCompanionToRestingReserve } from "./partySystem";
import { createInitialQuestStates } from "./questSystem";
import {
  applyOfflineFarmingProgress,
  claimPendingOfflineFarmingLoot,
  createSavedGame,
  MAX_OFFLINE_FARMING_MS,
  restoreGameStateFromSave,
  sanitizeGameStateForSave,
  validateSavedGame,
} from "./saveGame";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, GameEntity, PartyMemberRole } from "./types";

const NOW_MS = 1_000_000;

describe("save game serialization", () => {
  it("validates v1 saves and rejects malformed saves", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(state, NOW_MS);

    expect(validateSavedGame(save).ok).toBe(true);
    expect(validateSavedGame({ ...save, saveVersion: 999 }).ok).toBe(false);
    expect(validateSavedGame({ ...save, state: { ...save.state, entities: null } }).ok).toBe(false);
  });

  it("restores deterministic map data and clears transient runtime state", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(
      {
        ...state,
        activeTeleport: {
          id: "test",
          position: { x: 1, y: 1 },
          range: 2,
          sourceMapId: MAP_ONE_ID,
          targetMapId: "map-2",
          triggeredBy: "player",
        },
        combatFeedbackEvents: [
          {
            id: "feedback",
            type: "damage",
            entityId: "companion-1",
            text: "1",
            createdAt: NOW_MS,
            expiresAt: NOW_MS + 1000,
          },
        ],
        movementPathsByEntityId: {
          "companion-1": {
            targetKey: "1,1",
            waypoints: [{ x: 1, y: 1 }],
          },
        },
        companionAoeChannelsByCasterId: {
          "companion-1": {
            id: "shockwave",
            abilityId: "shield_shockwave",
            casterId: "companion-1",
            shape: {
              type: "circle",
              center: { x: 14, y: 29 },
              radius: 2,
            },
            visualIntent: "partyOffensive",
            damageType: "physical",
            powerMultiplier: 0.5,
            bindDurationMs: 1000,
            startedAt: NOW_MS,
            channelEndsAt: NOW_MS + 200,
          },
        },
        debugTelemetry: {
          ...createDebugTelemetryState(),
          isRecording: true,
          startedAt: NOW_MS,
        },
      },
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(save.offlineFarmingBlockedReason).toContain("active travel");
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.map?.id).toBe(MAP_ONE_ID);
    expect(restored.state.activeTeleport).toBeNull();
    expect(restored.state.combatFeedbackEvents).toEqual([]);
    expect(restored.state.movementPathsByEntityId).toEqual({});
    expect(restored.state.companionAoeChannelsByCasterId).toEqual({});
    expect(restored.state.debugTelemetry).toBeUndefined();
  });

  it("keeps persistent party, inventory, wallet, quests, map, and resources", () => {
    let state = createWildState("fighter");
    state = addItemToInventoryState(state, "softwood", 2, "debug").state;

    const save = createSavedGame(state, NOW_MS);

    expect(save.state.currentMapId).toBe(MAP_ONE_ID);
    expect(save.state.entities["companion-1"]).toMatchObject({
      kind: "companion",
      role: "defender",
      characterLevel: 1,
    });
    expect(save.state.inventory.slots.some((slot) => slot.itemId === "softwood")).toBe(true);
    expect(save.state.wallet).toEqual(state.wallet);
    expect(save.state.quests).toEqual(state.quests);
    expect(
      Object.values(save.state.entities).some(
        (entity) => entity.kind === "resource" && entity.resourceType === "wood",
      ),
    ).toBe(true);
  });

  it("preserves resting companions and highest-ever level through save restore", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      state: "idle",
      currentTargetId: null,
    };
    const veteran: Companion = {
      ...createCompanion("companion-2", { x: 16, y: 29 }, "companion-1", "fighter", 1),
      characterLevel: 50,
      characterXp: 12,
      state: "attack",
      currentTargetId: "enemy-1",
      commandPriority: "direct",
      consumableBuffs: {
        flask: null,
        food: {
          itemId: "hearty_trail_rations",
          kind: "food",
          expiresAt: NOW_MS + 1_000,
        },
      },
    };
    const activeState = createTestGameState({
      entities: {
        [leader.id]: leader,
        [veteran.id]: veteran,
      },
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      partyLeaderId: leader.id,
    });
    const restingState = moveCompanionToRestingReserve(activeState, veteran.id);
    const save = createSavedGame(restingState, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restingState.entities[veteran.id]).toBeUndefined();
    expect(restingState.restingCompanionsById?.[veteran.id]).toMatchObject({
      id: veteran.id,
      characterLevel: 50,
      state: "idle",
      currentTargetId: null,
      commandPriority: "autonomous",
    });
    expect(save.state.highestCharacterLevelEver).toBe(50);
    expect(save.state.restingCompanionsById?.[veteran.id]?.consumableBuffs).toEqual({
      flask: null,
      food: null,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.entities[veteran.id]).toBeUndefined();
    expect(restored.state.restingCompanionsById?.[veteran.id]).toMatchObject({
      id: veteran.id,
      characterLevel: 50,
      characterXp: 12,
    });
    expect(restored.state.highestCharacterLevelEver).toBe(50);
    expect(getPartySizeLimit(restored.state)).toBe(4);
  });

  it("preserves Guild recruit candidate, timer, and sequence through save restore", () => {
    const guildRecruit = {
      ...createInitialGuildRecruitState(NOW_MS),
      recruitSequence: 7,
      candidates: [
        {
          id: "guild-recruit-candidate-7",
          classId: "beginner" as const,
          characterLevel: 1,
          role: "none" as const,
          generatedAtMs: NOW_MS,
          sequence: 7,
          equipmentItemIds: ["training_sword" as const],
          startingSkillRanksBySkillId: {
            first_aid: 2,
          },
        },
      ],
      nextRefreshAtMs: NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    };
    const save = createSavedGame(
      createTestGameState({
        guildRecruit,
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildRecruit).toEqual(guildRecruit);
  });

  it("preserves Guild Notice Board quest, timer, and sequence through save restore", () => {
    const guildNoticeBoard = {
      ...createInitialGuildNoticeBoardState(NOW_MS),
      questSequence: 5,
      hasSeenCurrentRefresh: true,
      nextRefreshAtMs: NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
      slots: [
        {
          ...createInitialGuildNoticeBoardState(NOW_MS).slots[0]!,
          id: "guild-notice-board-quest-5",
          sequence: 5,
          status: "taken" as const,
          takenAtMs: NOW_MS,
          levelAnchor: null,
          levelRange: null,
          objectives: [
            {
              id: "defeat-goblin_shaman",
              enemyTypeId: "goblin_shaman" as const,
              requiredCount: 50,
              currentCount: 12,
            },
            {
              id: "defeat-ash_wisp",
              enemyTypeId: "ash_wisp" as const,
              requiredCount: 50,
              currentCount: 7,
            },
          ],
        },
      ],
    };
    const save = createSavedGame(
      createTestGameState({
        guildNoticeBoard,
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildNoticeBoard).toEqual(guildNoticeBoard);
  });

  it("preserves Guild Field Team assignment through save restore", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      state: "idle",
      currentTargetId: null,
    };
    const secondaryCompanion: Companion = {
      ...createCompanion("companion-2", { x: 15, y: 29 }, "companion-1", "fighter", 1),
      state: "idle",
      currentTargetId: null,
    };
    const guildSecondaryParties = {
      parties: [
        {
          id: GUILD_SECONDARY_PARTY_ID,
          displayName: "Field Team 1",
          companionIds: [secondaryCompanion.id],
          assignment: null,
        },
      ],
    };
    const guildUpgrades = createInitialGuildUpgradesState();
    guildUpgrades.secondaryParties.secondary_party_count = 1;
    const save = createSavedGame(
      createTestGameState({
        entities: {
          [leader.id]: leader,
        },
        restingCompanionsById: {
          [secondaryCompanion.id]: secondaryCompanion,
        },
        partyLeaderId: leader.id,
        guildUpgrades,
        guildSecondaryParties,
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildSecondaryParties?.parties[0].companionIds).toEqual([
      secondaryCompanion.id,
    ]);
    expect(restored.state.restingCompanionsById?.[secondaryCompanion.id]).toMatchObject({
      id: secondaryCompanion.id,
      state: "idle",
      currentTargetId: null,
    });
  });

  it("restores old quest saves around the inserted Smithy quest without relocking progress", () => {
    const progressedQuests = createInitialQuestStates();
    progressedQuests.outfit_the_expedition = {
      ...progressedQuests.outfit_the_expedition,
      status: "completed",
    };
    progressedQuests.stolen_field_supplies = {
      ...progressedQuests.stolen_field_supplies,
      status: "active",
    };
    const progressedSave = createSavedGame(
      {
        ...createTestGameState(),
        quests: progressedQuests,
      },
      NOW_MS,
    );
    delete (progressedSave.state.quests as Partial<
      typeof progressedSave.state.quests
    >).smiths_first_work;

    const progressedRestore = restoreGameStateFromSave(progressedSave);

    expect(progressedRestore.ok).toBe(true);
    if (progressedRestore.ok) {
      expect(progressedRestore.state.quests.smiths_first_work.status).toBe(
        "completed",
      );
      expect(progressedRestore.state.quests.stolen_field_supplies.status).toBe(
        "active",
      );
    }

    const tutorialQuests = createInitialQuestStates();
    tutorialQuests.outfit_the_expedition = {
      ...tutorialQuests.outfit_the_expedition,
      status: "completed",
    };
    const tutorialSave = createSavedGame(
      {
        ...createTestGameState(),
        quests: tutorialQuests,
      },
      NOW_MS,
    );
    delete (tutorialSave.state.quests as Partial<typeof tutorialSave.state.quests>)
      .smiths_first_work;

    const tutorialRestore = restoreGameStateFromSave(tutorialSave);

    expect(tutorialRestore.ok).toBe(true);
    if (tutorialRestore.ok) {
      expect(tutorialRestore.state.quests.smiths_first_work.status).toBe(
        "available",
      );
      expect(
        tutorialRestore.state.quests.smiths_first_work.objectiveProgress
          .craft_plain_charm,
      ).toMatchObject({
        currentCount: 0,
        completed: false,
      });
    }
  });

  it("restores Forward Bastion saves with deterministic map data", () => {
    const state = sanitizeGameStateForSave({
      ...createTestGameState(),
      currentMapId: HUB_TWO_MAP_ID,
      map: createDebugMap(HUB_TWO_MAP_ID),
    });
    const save = createSavedGame(state, NOW_MS);

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.currentMapId).toBe(HUB_TWO_MAP_ID);
    expect(restored.state.map?.id).toBe(HUB_TWO_MAP_ID);
    expect(restored.state.map?.displayName).toBe("Forward Bastion");
  });

  it("defaults missing roster foundation fields on older saves", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      characterLevel: 30,
      state: "idle",
      currentTargetId: null,
    };
    const save = createSavedGame(
      createTestGameState({
        entities: {
          [leader.id]: leader,
        },
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        partyLeaderId: leader.id,
      }),
      NOW_MS,
    );
    delete (save.state as Partial<GameState>).restingCompanionsById;
    delete (save.state as Partial<GameState>).highestCharacterLevelEver;
    delete (save.state as Partial<GameState>).guildRecruit;
    delete (save.state as Partial<GameState>).guildUpgrades;
    delete (save.state as Partial<GameState>).guildNoticeBoard;
    delete (save.state as Partial<GameState>).guildSecondaryParties;
    delete (save.state as Partial<GameState>).worldDiscovery;

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.restingCompanionsById).toEqual({});
    expect(restored.state.highestCharacterLevelEver).toBe(30);
    expect(getPartySizeLimit(restored.state)).toBe(4);
    expect(restored.state.guildRecruit?.candidates[0]).toMatchObject({
      id: "guild-recruit-candidate-1",
      classId: "beginner",
      characterLevel: 1,
      role: "none",
      sequence: 1,
    });
    expect(restored.state.guildRecruit?.recruitSequence).toBe(1);
    expect(restored.state.guildUpgrades?.recruit.recruit_slots).toBe(1);
    expect(restored.state.guildNoticeBoard?.slots[0]).toMatchObject({
      id: "guild-notice-board-quest-1",
      status: "available",
      sequence: 1,
    });
    expect(restored.state.guildNoticeBoard?.hasSeenCurrentRefresh).toBe(false);
    expect(restored.state.guildSecondaryParties).toEqual(
      createInitialGuildSecondaryPartiesState(),
    );
    expect(restored.state.guildUpgrades?.secondaryParties.secondary_party_count).toBe(0);
    expect(restored.state.worldDiscovery).toEqual({
      visitedMapIds: [],
      visitedSubzonesByMapId: {},
    });
    expect(restored.state.entities["hub-guild-coordinator"]).toMatchObject({
      kind: "npc",
      displayName: "Guild Coordinator",
      npcRole: "guild_coordinator",
    });
    expect(restored.state.entities["hub-tavern-keeper"]).toMatchObject({
      kind: "npc",
      displayName: "Inn Keeper",
      npcRole: "tavern_keeper",
    });
  });
});

describe("offline farming", () => {
  it("caps offline progress at thirty minutes", () => {
    const state = createWildState("fighter");
    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS * 10,
      NOW_MS,
    );

    expect(result.summary.creditedMs).toBe(MAX_OFFLINE_FARMING_MS);
    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.enemyKills).toBeLessThanOrEqual(960);
  });

  it("skips hub, dungeon, transition, recovery, chest, invalid, and defeated states", () => {
    const hub = createTestGameState();
    expect(getSkipReason(hub)).toContain("wild zones");

    const dungeon = {
      ...hub,
      currentMapId: SLIMEWARD_FLOOR_ONE_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_ONE_ID),
    };
    expect(getSkipReason(dungeon)).toContain("wild zones");

    const transition = {
      ...createWildState("fighter"),
      activeTeleport: {
        id: "test",
        position: { x: 1, y: 1 },
        range: 2,
        sourceMapId: MAP_ONE_ID,
        targetMapId: "map-2" as const,
        triggeredBy: "player" as const,
      },
    };
    expect(getSkipReason(transition)).toContain("paused");

    const recovery = {
      ...createWildState("fighter"),
      resurrectionChannelsByHelperId: {
        "companion-1": { helperId: "companion-1", targetId: "companion-2" },
      },
    };
    expect(getSkipReason(recovery)).toContain("paused");

    const chest = {
      ...createWildState("fighter"),
      slimewardDungeon: {
        chest: {
          id: "chest",
          exitTeleportId: "exit",
          status: "opened" as const,
          position: { x: 1, y: 1 },
          isUiOpen: true,
          rolledLoot: [],
          collectedLoot: [],
          pendingLoot: [],
          inventoryFull: false,
        },
      },
    };
    expect(getSkipReason(chest)).toContain("paused");

    const defeated = {
      ...createWildState("fighter"),
      entities: Object.fromEntries(
        (Object.entries(createWildState("fighter").entities) as [string, GameEntity][]).map(([id, entity]) => [
          id,
          entity.kind === "companion" ? { ...entity, state: "dead" } : entity,
        ]),
      ),
    } as GameState;
    expect(getSkipReason(defeated)).toContain("leader");
  });

  it("uses roles so Defender plus Gatherer earns more resources", () => {
    const fighterResult = applyOfflineFarmingProgress(
      createWildState("fighter"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const gathererResult = applyOfflineFarmingProgress(
      createWildState("gatherer"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(fighterResult.summary.enemyKills).toBeGreaterThan(0);
    expect(gathererResult.summary.enemyKills).toBeGreaterThan(0);
    expect(totalResources(fighterResult.summary.resourcesAdded)).toBeLessThan(
      totalResources(gathererResult.summary.resourcesAdded),
    );
  });

  it("grants estimator-based monster drops with offline rewards", () => {
    const result = applyOfflineFarmingProgress(
      createWildState("fighter"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.lootAdded.length).toBeGreaterThan(0);
    expect(
      result.summary.lootAdded.some((loot) => loot.itemId === "slime_gel_t1"),
    ).toBe(true);
    expect(countInventoryItem(result.state.inventory, "slime_gel_t1")).toBeGreaterThan(0);
  });

  it("keeps overflow offline loot pending without blocking XP", () => {
    let state = createWildState("gatherer");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.xpGranted).toBeGreaterThan(0);
    expect(result.summary.resourcesAdded).toEqual([]);
    expect(result.summary.pendingLoot.length).toBeGreaterThan(0);
    expect(result.state.pendingOfflineFarmingLoot?.pendingLoot.length).toBeGreaterThan(0);
  });

  it("claims pending offline loot after inventory space is available", () => {
    let state = createWildState("fighter");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const withSpace = {
      ...result.state,
      inventory: {
        ...result.state.inventory,
        slots: [],
      },
    };
    const claimed = claimPendingOfflineFarmingLoot(withSpace, NOW_MS + 1);

    expect(claimed.summary.lootAdded.length).toBeGreaterThan(0);
    expect(claimed.summary.pendingLoot).toEqual([]);
    expect(claimed.state.pendingOfflineFarmingLoot).toBeNull();
  });

  it("preserves pending offline loot through save and restore", () => {
    let state = createWildState("fighter");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const save = createSavedGame(result.state, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.pendingOfflineFarmingLoot?.pendingLoot.length).toBeGreaterThan(0);
  });
});

function createWildState(secondRole: PartyMemberRole): GameState {
  const map = createDebugMap(MAP_ONE_ID);
  const leader: Companion = {
    ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
    state: "idle",
    currentTargetId: null,
  };
  const second: Companion = {
    ...createCompanion("companion-2", { x: 16, y: 29 }, "companion-1", secondRole, 1),
    state: "follow",
    currentTargetId: "companion-1",
  };
  const baseState = createTestGameState();
  const resourceEntities = Object.fromEntries(
    map.subzones
      ?.flatMap((subzone) => subzone.resourceLocations ?? [])
      .map((resourceLocation) => [
        resourceLocation.id,
        createResource(resourceLocation.id, resourceLocation.position, {
          resourceType: resourceLocation.resourceType,
          tier: resourceLocation.tier ?? 1,
        }),
      ]) ?? [],
  );

  return sanitizeGameStateForSave({
    ...baseState,
    entities: {
      "companion-1": leader,
      "companion-2": second,
      ...resourceEntities,
    },
    currentMapId: MAP_ONE_ID,
    map,
    partyLeaderId: leader.id,
  });
}

function getSkipReason(state: GameState): string {
  return applyOfflineFarmingProgress(state, NOW_MS - MAX_OFFLINE_FARMING_MS, NOW_MS)
    .summary.skippedReason ?? "";
}

function totalResources(resources: { quantity: number }[]): number {
  return resources.reduce((total, resource) => total + resource.quantity, 0);
}
