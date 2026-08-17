import { describe, expect, it } from "vitest";
import { createDebugMap, MAP_ONE_ID } from "./debugMap";
import { createCompanion } from "./entities";
import {
  cancelGuildSecondaryPartyDispatch,
  claimGuildSecondaryPartyDispatch,
  dispatchGuildSecondaryParty,
  getGuildSecondaryPartyDispatchDestinations,
  getGuildSecondaryPartyDispatchPreview,
  refreshGuildSecondaryPartyDispatches,
} from "./guildSecondaryPartyDispatch";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import {
  GUILD_SECONDARY_PARTY_ID,
  moveGuildRosterCompanion,
} from "./guildSecondaryParties";
import { createEmptyPartyInventory } from "./inventory";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Companion, GuildSecondaryPartyDispatchState } from "./types";
import { recordCurrentWorldDiscovery } from "./worldDiscovery";

const NOW_MS = 1_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SHORE_FRINGE_ID = "shore-fringe";

describe("guild field team dispatch", () => {
  it("records visited wild subzones as dispatch destinations", () => {
    const state = recordCurrentWorldDiscovery(createDispatchState());

    expect(getGuildSecondaryPartyDispatchDestinations(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mapId: MAP_ONE_ID,
          subzoneId: SHORE_FRINGE_ID,
        }),
      ]),
    );
  });

  it("hides unvisited destinations and blocks dispatch to them", () => {
    const state = createDispatchState({ visited: false });

    expect(getGuildSecondaryPartyDispatchDestinations(state)).toEqual([]);

    const result = dispatchGuildSecondaryParty(
      state,
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unvisited_destination");
    }
  });

  it("previews an unlocked party against a visited destination", () => {
    const preview = getGuildSecondaryPartyDispatchPreview(
      createDispatchState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }

    expect(preview.estimate.available).toBe(true);
    expect(preview.experienceEfficiency).toBe(0.1);
    expect(preview.dropEfficiency).toBe(0.1);
    expect(preview.maxDurationMs).toBe(ONE_HOUR_MS);
  });

  it("dispatches with a wall-clock end time and locks roster movement", () => {
    const result = dispatchGuildSecondaryParty(
      createDispatchState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const dispatch = result.state.guildSecondaryParties?.parties[0].dispatch;
    expect(dispatch).toMatchObject({
      status: "dispatched",
      mapId: MAP_ONE_ID,
      subzoneId: SHORE_FRINGE_ID,
      startedAtMs: NOW_MS,
      endsAtMs: NOW_MS + ONE_HOUR_MS,
    });

    const moved = moveGuildRosterCompanion(result.state, "secondary", {
      area: "inn_reserve",
      slotIndex: 0,
    });
    expect(moved).toMatchObject({ ok: false, reason: "party_dispatched" });
  });

  it("marks dispatch completed after the end time", () => {
    const dispatched = dispatchGuildSecondaryParty(
      createDispatchState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const refreshed = refreshGuildSecondaryPartyDispatches(
      dispatched.state,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(refreshed.guildSecondaryParties?.parties[0].dispatch?.status).toBe(
      "completed",
    );
  });

  it("claims completed dispatch rewards and frees the party", () => {
    const dispatched = dispatchGuildSecondaryParty(
      createDispatchState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const claimed = claimGuildSecondaryPartyDispatch(
      dispatched.state,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    expect(claimed.state.guildSecondaryParties?.parties[0].dispatch).toBeNull();
    expect(claimed.state.restingCompanionsById?.secondary.characterXp).toBeGreaterThan(0);
  });

  it("shares completed dispatch XP across that Field Team's members", () => {
    const dispatched = dispatchGuildSecondaryParty(
      createDispatchState({ secondaryPartyOneSecondCompanion: true }),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const stateWithPartyXp = withCompletedDispatchResult(dispatched.state, {
      xpGranted: 5,
      loot: [],
      resources: [],
    });
    const claimed = claimGuildSecondaryPartyDispatch(
      stateWithPartyXp,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    expect(claimed.result.xpGranted).toBe(5);
    expect(claimed.state.restingCompanionsById?.secondary.characterXp).toBe(3);
    expect(claimed.state.restingCompanionsById?.["secondary-two"].characterXp).toBe(2);
  });

  it("blocks claim when inventory cannot hold dispatch loot without losing rewards", () => {
    const dispatched = dispatchGuildSecondaryParty(
      createDispatchState({
        inventory: createEmptyPartyInventory(0),
      }),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const stateWithGuaranteedLoot = withDispatchResultLoot(dispatched.state);
    const claimed = claimGuildSecondaryPartyDispatch(
      stateWithGuaranteedLoot,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(claimed.ok).toBe(false);
    if (!claimed.ok) {
      expect(claimed.reason).toBe("inventory_full");
    }
    expect(claimed.state.guildSecondaryParties?.parties[0].dispatch).toBeTruthy();
  });

  it("cancels dispatched rewards and frees the party", () => {
    const dispatched = dispatchGuildSecondaryParty(
      createDispatchState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const canceled = cancelGuildSecondaryPartyDispatch(
      dispatched.state,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + 1000,
    );

    expect(canceled.ok).toBe(true);
    if (!canceled.ok) {
      return;
    }

    expect(canceled.state.guildSecondaryParties?.parties[0].dispatch).toBeNull();
    expect(canceled.state.restingCompanionsById?.secondary.characterXp).toBe(0);
  });

  it("keeps multiple party dispatches independent", () => {
    const state = createDispatchState({
      unlockedPartyCount: 2,
      secondaryPartyTwoCompanion: true,
    });
    const first = dispatchGuildSecondaryParty(
      state,
      "secondary-party-1",
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = dispatchGuildSecondaryParty(
      first.state,
      "secondary-party-2",
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS + 10,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.state.guildSecondaryParties?.parties[0].dispatch?.rewardSeed)
      .not.toBe(second.state.guildSecondaryParties?.parties[1].dispatch?.rewardSeed);
  });

  it("preserves active dispatch state and rolled results through save restore", () => {
    const dispatched = dispatchGuildSecondaryParty(
      createDispatchState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      ONE_HOUR_MS,
      NOW_MS,
    );

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) {
      return;
    }

    const dispatch = dispatched.state.guildSecondaryParties?.parties[0].dispatch;
    const restored = restoreGameStateFromSave(
      createSavedGame(dispatched.state, NOW_MS + 1000),
    );

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildSecondaryParties?.parties[0].dispatch).toEqual(
      dispatch,
    );
  });
});

function createDispatchState({
  inventory = createEmptyPartyInventory(),
  unlockedPartyCount = 1,
  visited = true,
  secondaryPartyOneSecondCompanion = false,
  secondaryPartyTwoCompanion = false,
}: {
  inventory?: GameState["inventory"];
  unlockedPartyCount?: number;
  visited?: boolean;
  secondaryPartyOneSecondCompanion?: boolean;
  secondaryPartyTwoCompanion?: boolean;
} = {}): GameState {
  const leader = createTestCompanion("leader", 0, { x: 14, y: 29 });
  const secondary = createTestCompanion("secondary", 1, { x: 14, y: 29 });
  const secondaryTwo = createTestCompanion("secondary-two", 2, { x: 15, y: 29 });
  const guildUpgrades = createInitialGuildUpgradesState();
  guildUpgrades.secondaryParties.secondary_party_count = unlockedPartyCount;
  const shouldIncludeSecondaryTwo =
    secondaryPartyOneSecondCompanion || secondaryPartyTwoCompanion;

  if (secondaryPartyOneSecondCompanion) {
    guildUpgrades.secondaryParties.parties[
      GUILD_SECONDARY_PARTY_ID
    ].secondary_party_members = 2;
  }

  return createTestGameState({
    entities: {
      leader,
    },
    restingCompanionsById: {
      secondary,
      ...(shouldIncludeSecondaryTwo ? { "secondary-two": secondaryTwo } : {}),
    },
    inventory,
    partyLeaderId: leader.id,
    highestCharacterLevelEver: 10,
    guildUpgrades,
    guildSecondaryParties: {
      parties: [
        {
          id: "secondary-party-1",
          displayName: "Field Team 1",
          companionIds: secondaryPartyOneSecondCompanion
            ? ["secondary", "secondary-two"]
            : ["secondary"],
          dispatch: null,
        },
        {
          id: "secondary-party-2",
          displayName: "Field Team 2",
          companionIds:
            secondaryPartyTwoCompanion && !secondaryPartyOneSecondCompanion
              ? ["secondary-two"]
              : [null],
          dispatch: null,
        },
      ],
    },
    currentMapId: visited ? MAP_ONE_ID : undefined,
    map: visited ? createDebugMap(MAP_ONE_ID) : undefined,
    worldDiscovery: visited
      ? {
          visitedMapIds: [MAP_ONE_ID],
          visitedSubzonesByMapId: {
            [MAP_ONE_ID]: [SHORE_FRINGE_ID],
          },
        }
      : {
          visitedMapIds: [],
          visitedSubzonesByMapId: {},
        },
  });
}

function createTestCompanion(
  id: string,
  partyOrder: number,
  position: { x: number; y: number },
): Companion {
  return {
    ...createCompanion(id, position, "leader", "fighter", partyOrder),
    state: "idle",
    currentTargetId: null,
  };
}

function withDispatchResultLoot(state: GameState): GameState {
  return withCompletedDispatchResult(state, {
    loot: [{ itemId: "training_sword", quantity: 1 }],
  });
}

function withCompletedDispatchResult(
  state: GameState,
  resultOverrides: Partial<GuildSecondaryPartyDispatchState["result"]>,
): GameState {
  const party = state.guildSecondaryParties?.parties[0];
  const dispatch = party?.dispatch;

  if (!party || !dispatch) {
    return state;
  }

  const nextDispatch: GuildSecondaryPartyDispatchState = {
    ...dispatch,
    status: "completed",
    result: {
      ...dispatch.result,
      ...resultOverrides,
    },
  };

  return {
    ...state,
    guildSecondaryParties: {
      parties: state.guildSecondaryParties?.parties.map((candidate) =>
        candidate.id === party.id
          ? {
              ...candidate,
              dispatch: nextDispatch,
            }
          : candidate,
      ) ?? [],
    },
  };
}
