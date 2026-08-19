import { describe, expect, it } from "vitest";
import {
  createCompanion,
  createInitialGuildUpgradesState,
  createInitialInnUpgradesState,
  getGuildCompanionCapacity,
  MAP_ONE_ID,
  SKILL_DEFINITIONS,
  type Companion,
  type GuildSecondaryPartyAssignmentState,
} from "./game";
import { createTestGameState } from "./game/testState";
import {
  getInnRoomOverview,
  getInnRoomSkillGroups,
} from "./innRoomsPresentation";

describe("inn rooms presentation", () => {
  it("marks active, Inn reserve, Field Team, and assigned Field Team companions", () => {
    const state = createRoomsState();
    const overview = getInnRoomOverview(state);

    expect(getCard(overview, "leader")).toMatchObject({
      visualState: "active",
      badgeText: "\u2605",
      statusLabel: "Active Party",
    });
    expect(getCard(overview, "reserve")).toMatchObject({
      visualState: "inn",
      badgeText: null,
      statusLabel: "Available",
    });
    expect(getCard(overview, "field")).toMatchObject({
      visualState: "field_team",
      badgeText: "1",
      statusLabel: "Field Team 1",
    });
    expect(getCard(overview, "assigned")).toMatchObject({
      visualState: "assigned_field_team",
      badgeText: "2",
      statusLabel: "Assigned - Field Team 2",
    });
  });

  it("adds empty rooms up to capacity", () => {
    const state = createRoomsState({
      reserveIds: [],
      fieldTeamIds: [],
      assignedFieldTeamIds: [],
    });
    const overview = getInnRoomOverview(state);

    expect(overview.occupiedRooms).toBe(1);
    expect(overview.capacity).toBe(getGuildCompanionCapacity(state));
    expect(overview.isOverCapacity).toBe(false);
    expect(overview.cards.filter((card) => card.kind === "empty")).toHaveLength(
      Math.max(0, overview.capacity - 1),
    );
  });

  it("shows all companions when over capacity", () => {
    const state = createRoomsState({
      reserveIds: ["reserve", "reserve-two", "reserve-three"],
      fieldTeamIds: ["field"],
      assignedFieldTeamIds: ["assigned"],
    });
    const overview = getInnRoomOverview(state);

    expect(overview.occupiedRooms).toBe(6);
    expect(overview.isOverCapacity).toBe(overview.occupiedRooms > overview.capacity);
    expect(overview.cards.filter((card) => card.kind === "companion")).toHaveLength(6);
    expect(overview.cards.filter((card) => card.kind === "empty")).toHaveLength(0);
  });

  it("adds empty rooms up to upgraded room capacity", () => {
    const innUpgrades = createInitialInnUpgradesState();
    innUpgrades.rooms.inn_room_count = 3;
    const state = createRoomsState({
      reserveIds: [],
      fieldTeamIds: [],
      assignedFieldTeamIds: [],
      innUpgrades,
    });
    const overview = getInnRoomOverview(state);

    expect(overview.capacity).toBe(6);
    expect(overview.occupiedRooms).toBe(1);
    expect(overview.cards.filter((card) => card.kind === "empty")).toHaveLength(5);
  });

  it("groups known skills by class and marks active skills as enabled", () => {
    const beginnerSkill = Object.values(SKILL_DEFINITIONS).find(
      (skill) => skill.classId === "beginner",
    );

    if (!beginnerSkill) {
      throw new Error("Expected at least one Beginner skill.");
    }

    const companion: Companion = {
      ...createRoomsCompanion("blade", 0, "blade"),
      skillProgression: {
        ranksBySkillId: {
          [beginnerSkill.id]: 2,
        },
        legacyEnabledSkillIds: [],
      },
    };
    const groups = getInnRoomSkillGroups(companion);
    const bladeGroup = groups.find((group) => group.classId === "blade");
    const beginnerGroup = groups.find((group) => group.classId === "beginner");

    expect(bladeGroup?.skills.some((skill) => skill.enabled)).toBe(true);
    expect(beginnerGroup?.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: beginnerSkill.id,
          rank: 2,
          enabled: false,
        }),
      ]),
    );
  });
});

function createRoomsState({
  reserveIds = ["reserve"],
  fieldTeamIds = ["field"],
  assignedFieldTeamIds = ["assigned"],
  innUpgrades = createInitialInnUpgradesState(),
}: {
  reserveIds?: string[];
  fieldTeamIds?: string[];
  assignedFieldTeamIds?: string[];
  innUpgrades?: ReturnType<typeof createInitialInnUpgradesState>;
} = {}) {
  const leader = createRoomsCompanion("leader", 0);
  const reserveCompanions = Object.fromEntries(
    reserveIds.map((id, index) => [id, createRoomsCompanion(id, index + 1)]),
  );
  const fieldTeamCompanions = Object.fromEntries(
    fieldTeamIds.map((id, index) => [id, createRoomsCompanion(id, index + 10)]),
  );
  const assignedCompanions = Object.fromEntries(
    assignedFieldTeamIds.map((id, index) => [
      id,
      createRoomsCompanion(id, index + 20),
    ]),
  );
  const guildUpgrades = createInitialGuildUpgradesState();
  guildUpgrades.secondaryParties.secondary_party_count = 2;

  return createTestGameState({
    entities: {
      leader,
    },
    restingCompanionsById: {
      ...reserveCompanions,
      ...fieldTeamCompanions,
      ...assignedCompanions,
    },
    partyLeaderId: leader.id,
    guildUpgrades,
    innUpgrades,
    guildSecondaryParties: {
      parties: [
        {
          id: "secondary-party-1",
          displayName: "Field Team 1",
          companionIds: fieldTeamIds,
          assignment: null,
        },
        {
          id: "secondary-party-2",
          displayName: "Field Team 2",
          companionIds: assignedFieldTeamIds,
          assignment:
            assignedFieldTeamIds.length > 0
              ? createAssignedAssignment()
              : null,
        },
      ],
    },
  });
}

function createRoomsCompanion(
  id: string,
  partyOrder: number,
  classId: Companion["classId"] = "beginner",
): Companion {
  return {
    ...createCompanion(id, { x: 10 + partyOrder, y: 10 }, "leader", "none", partyOrder, classId),
    state: "idle",
    currentTargetId: null,
  };
}

function createAssignedAssignment(): GuildSecondaryPartyAssignmentState {
  return {
    status: "assigned",
    mapId: MAP_ONE_ID,
    mapName: "Test Map",
    subzoneId: "test-subzone",
    subzoneName: "Test Subzone",
    assignedAtMs: 0,
    lastSettledAtMs: 0,
    capsAtMs: 1000,
    maxDurationMs: 1000,
    rewardSeed: 1,
    experienceEfficiency: 0.5,
    dropEfficiency: 0.5,
    preview: {
      rating: "Adequate",
      killsPerHour: 0,
      experiencePerMinute: 0,
      survivabilityPercent: 100,
      expectedDropItemIds: [],
      expectedResourceItemIds: [],
      warnings: [],
    },
    pendingResult: null,
    pendingElapsedMs: 0,
  };
}

function getCard(
  overview: ReturnType<typeof getInnRoomOverview>,
  companionId: string,
) {
  const card = overview.cards.find(
    (candidate) =>
      candidate.kind === "companion" && candidate.companion.id === companionId,
  );

  if (!card || card.kind !== "companion") {
    throw new Error(`Missing room card for ${companionId}`);
  }

  return card;
}
