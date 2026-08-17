import { estimateAfkCombatForParty } from "./afkCombatEstimate";
import { createDebugMap } from "./debugMap";
import {
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartyDispatchDurationMs,
  getGuildSecondaryPartyDropEfficiency,
  getGuildSecondaryPartyExperienceEfficiency,
} from "./guildRecruitUpgrades";
import { getGuildSecondaryPartiesState } from "./guildSecondaryParties";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinitionForResourceType } from "./items";
import { grantCharacterXpToCompanion } from "./leveling";
import { recordHighestCharacterLevelEver } from "./partySystem";
import type { GameState } from "./state";
import type {
  Companion,
  DebugMapId,
  GuildSecondaryParty,
  GuildSecondaryPartyDispatchLoot,
  GuildSecondaryPartyDispatchResult,
  InventorySlot,
  ItemId,
} from "./types";
import {
  getDispatchDestination,
  getDispatchDestinations,
  type DispatchDestination,
} from "./worldDiscovery";

export const GUILD_SECONDARY_PARTY_DISPATCH_VARIANCE = 0.15;

export type GuildSecondaryPartyDispatchFailureReason =
  | "unknown_party"
  | "locked_party"
  | "empty_party"
  | "already_dispatched"
  | "unknown_destination"
  | "unvisited_destination"
  | "invalid_duration"
  | "estimate_unavailable";

export type GuildSecondaryPartyDispatchResultType =
  | {
      ok: true;
      state: GameState;
      partyId: string;
    }
  | {
      ok: false;
      state: GameState;
      partyId: string;
      reason: GuildSecondaryPartyDispatchFailureReason;
    };

export type GuildSecondaryPartyClaimFailureReason =
  | "unknown_party"
  | "not_completed"
  | "inventory_full";

export type GuildSecondaryPartyClaimResult =
  | {
      ok: true;
      state: GameState;
      partyId: string;
      result: GuildSecondaryPartyDispatchResult;
    }
  | {
      ok: false;
      state: GameState;
      partyId: string;
      reason: GuildSecondaryPartyClaimFailureReason;
      result: GuildSecondaryPartyDispatchResult | null;
    };

export type GuildSecondaryPartyCancelResult =
  | {
      ok: true;
      state: GameState;
      partyId: string;
    }
  | {
      ok: false;
      state: GameState;
      partyId: string;
      reason: "unknown_party" | "not_dispatched";
    };

export type GuildSecondaryPartyDispatchPreviewResult =
  | {
      ok: true;
      destination: DispatchDestination;
      estimate: Extract<ReturnType<typeof estimateAfkCombatForParty>, { available: true }>;
      experienceEfficiency: number;
      dropEfficiency: number;
      maxDurationMs: number;
    }
  | {
      ok: false;
      reason:
        | "unknown_party"
        | "locked_party"
        | "empty_party"
        | "unknown_destination"
        | "unvisited_destination"
        | "estimate_unavailable";
      message: string;
    };

export function getGuildSecondaryPartyDispatchDestinations(
  state: GameState,
): DispatchDestination[] {
  return getDispatchDestinations(state);
}

export function getGuildSecondaryPartyDispatchPreview(
  state: GameState,
  partyId: string,
  mapId: DebugMapId,
  subzoneId: string,
): GuildSecondaryPartyDispatchPreviewResult {
  const party = getGuildSecondaryPartiesState(state).parties.find(
    (candidate) => candidate.id === partyId,
  );

  if (!party) {
    return { ok: false, reason: "unknown_party", message: "Unknown Field Team." };
  }

  if (!isPartyUnlocked(state, partyId)) {
    return { ok: false, reason: "locked_party", message: "Unlock this Field Team first." };
  }

  const companions = getSecondaryPartyCompanions(state, party);

  if (companions.length === 0) {
    return { ok: false, reason: "empty_party", message: "Assign at least one companion." };
  }

  const destination = getDispatchDestination(mapId, subzoneId);

  if (!destination) {
    return { ok: false, reason: "unknown_destination", message: "Unknown destination." };
  }

  if (
    !getDispatchDestinations(state).some(
      (candidate) =>
        candidate.mapId === mapId && candidate.subzoneId === subzoneId,
    )
  ) {
    return { ok: false, reason: "unvisited_destination", message: "Visit this subzone first." };
  }

  const map = createDebugMap(mapId);
  const estimate = estimateAfkCombatForParty({
    state,
    map,
    subzone: destination.subzone,
    companions,
  });

  if (!estimate.available) {
    return { ok: false, reason: "estimate_unavailable", message: estimate.message };
  }

  return {
    ok: true,
    destination,
    estimate,
    experienceEfficiency: getGuildSecondaryPartyExperienceEfficiency(state, partyId),
    dropEfficiency: getGuildSecondaryPartyDropEfficiency(state, partyId),
    maxDurationMs: getGuildSecondaryPartyDispatchDurationMs(state, partyId),
  };
}

export function refreshGuildSecondaryPartyDispatches(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const secondaryParties = getGuildSecondaryPartiesState(state);
  const parties = secondaryParties.parties.map((party) => {
    if (
      party.dispatch?.status === "dispatched" &&
      nowMs >= party.dispatch.endsAtMs
    ) {
      return {
        ...party,
        dispatch: {
          ...party.dispatch,
          status: "completed" as const,
        },
      };
    }

    return party;
  });

  return {
    ...state,
    guildSecondaryParties: {
      parties,
    },
  };
}

export function dispatchGuildSecondaryParty(
  state: GameState,
  partyId: string,
  mapId: DebugMapId,
  subzoneId: string,
  durationMs: number,
  nowMs = Date.now(),
): GuildSecondaryPartyDispatchResultType {
  const refreshedState = refreshGuildSecondaryPartyDispatches(state, nowMs);
  const secondaryParties = getGuildSecondaryPartiesState(refreshedState);
  const party = secondaryParties.parties.find((candidate) => candidate.id === partyId);

  if (!party) {
    return { ok: false, state: refreshedState, partyId, reason: "unknown_party" };
  }

  if (party.dispatch) {
    return { ok: false, state: refreshedState, partyId, reason: "already_dispatched" };
  }

  const companions = getSecondaryPartyCompanions(refreshedState, party);

  if (companions.length === 0) {
    return { ok: false, state: refreshedState, partyId, reason: "empty_party" };
  }

  if (!isPartyUnlocked(refreshedState, partyId)) {
    return { ok: false, state: refreshedState, partyId, reason: "locked_party" };
  }

  const maxDurationMs = getGuildSecondaryPartyDispatchDurationMs(
    refreshedState,
    partyId,
  );

  if (
    durationMs <= 0 ||
    durationMs > maxDurationMs ||
    durationMs % (30 * 60 * 1000) !== 0
  ) {
    return { ok: false, state: refreshedState, partyId, reason: "invalid_duration" };
  }

  const destination = getDispatchDestination(mapId, subzoneId);

  if (!destination) {
    return { ok: false, state: refreshedState, partyId, reason: "unknown_destination" };
  }

  if (
    !getDispatchDestinations(refreshedState).some(
      (candidate) =>
        candidate.mapId === mapId && candidate.subzoneId === subzoneId,
    )
  ) {
    return { ok: false, state: refreshedState, partyId, reason: "unvisited_destination" };
  }

  const map = createDebugMap(mapId);
  const estimate = estimateAfkCombatForParty({
    state: refreshedState,
    map,
    subzone: destination.subzone,
    companions,
  });

  if (!estimate.available) {
    return { ok: false, state: refreshedState, partyId, reason: "estimate_unavailable" };
  }

  const rewardSeed = createDispatchSeed(partyId, mapId, subzoneId, nowMs);
  const experienceEfficiency = getGuildSecondaryPartyExperienceEfficiency(
    refreshedState,
    partyId,
  );
  const dropEfficiency = getGuildSecondaryPartyDropEfficiency(
    refreshedState,
    partyId,
  );
  const result = rollDispatchResult({
    destination,
    durationMs,
    dropEfficiency,
    experienceEfficiency,
    rewardSeed,
    estimate,
  });
  const nextParty: GuildSecondaryParty = {
    ...party,
    dispatch: {
      status: "dispatched",
      mapId,
      mapName: destination.mapName,
      subzoneId,
      subzoneName: destination.subzoneName,
      startedAtMs: nowMs,
      endsAtMs: nowMs + durationMs,
      durationMs,
      rewardSeed,
      experienceEfficiency,
      dropEfficiency,
      preview: {
        rating: estimate.rating,
        killsPerHour: estimate.killsPerHour,
        experiencePerMinute: estimate.experiencePerMinute,
        survivabilityPercent: estimate.survivabilityPercent,
        expectedDropItemIds: estimate.estimatedDropsPerHour.map((drop) => drop.itemId),
        expectedResourceItemIds: getDestinationResourceItemIds(destination),
        warnings: estimate.warnings,
      },
      result,
    },
  };

  return {
    ok: true,
    state: replaceSecondaryParty(refreshedState, nextParty),
    partyId,
  };
}

export function claimGuildSecondaryPartyDispatch(
  state: GameState,
  partyId: string,
  nowMs = Date.now(),
): GuildSecondaryPartyClaimResult {
  const refreshedState = refreshGuildSecondaryPartyDispatches(state, nowMs);
  const party = getGuildSecondaryPartiesState(refreshedState).parties.find(
    (candidate) => candidate.id === partyId,
  );

  if (!party) {
    return { ok: false, state: refreshedState, partyId, reason: "unknown_party", result: null };
  }

  if (!party.dispatch || party.dispatch.status !== "completed") {
    return {
      ok: false,
      state: refreshedState,
      partyId,
      reason: "not_completed",
      result: party.dispatch?.result ?? null,
    };
  }

  const allLoot = mergeDispatchLoot([
    ...party.dispatch.result.resources,
    ...party.dispatch.result.loot,
  ]);

  if (!canCollectDispatchLoot(refreshedState, allLoot)) {
    return {
      ok: false,
      state: refreshedState,
      partyId,
      reason: "inventory_full",
      result: party.dispatch.result,
    };
  }

  let nextState = refreshedState;

  for (const loot of allLoot) {
    nextState = addItemToInventoryState(
      nextState,
      loot.itemId,
      loot.quantity,
      "combat_loot",
    ).state;
  }

  nextState = grantDispatchXp(
    nextState,
    getSecondaryPartyCompanions(nextState, party),
    party.dispatch.result.xpGranted,
  );
  nextState = replaceSecondaryParty(nextState, {
    ...party,
    dispatch: null,
  });

  return {
    ok: true,
    state: nextState,
    partyId,
    result: party.dispatch.result,
  };
}

export function cancelGuildSecondaryPartyDispatch(
  state: GameState,
  partyId: string,
  nowMs = Date.now(),
): GuildSecondaryPartyCancelResult {
  const refreshedState = refreshGuildSecondaryPartyDispatches(state, nowMs);
  const party = getGuildSecondaryPartiesState(refreshedState).parties.find(
    (candidate) => candidate.id === partyId,
  );

  if (!party) {
    return { ok: false, state: refreshedState, partyId, reason: "unknown_party" };
  }

  if (!party.dispatch) {
    return { ok: false, state: refreshedState, partyId, reason: "not_dispatched" };
  }

  return {
    ok: true,
    state: replaceSecondaryParty(refreshedState, {
      ...party,
      dispatch: null,
    }),
    partyId,
  };
}

function rollDispatchResult({
  destination,
  durationMs,
  dropEfficiency,
  experienceEfficiency,
  rewardSeed,
  estimate,
}: {
  destination: DispatchDestination;
  durationMs: number;
  dropEfficiency: number;
  experienceEfficiency: number;
  rewardSeed: number;
  estimate: Extract<ReturnType<typeof estimateAfkCombatForParty>, { available: true }>;
}): GuildSecondaryPartyDispatchResult {
  const variance = getDispatchVarianceMultiplier(rewardSeed);
  const durationHours = durationMs / (60 * 60 * 1000);
  const durationMinutes = durationMs / (60 * 1000);
  const enemyKills = Math.floor(estimate.killsPerHour * durationHours * variance);
  const xpGranted = Math.floor(
    estimate.experiencePerMinute *
      durationMinutes *
      experienceEfficiency *
      variance,
  );
  const loot = mergeDispatchLoot(
    estimate.estimatedDropsPerHour.map((drop) => ({
      itemId: drop.itemId,
      quantity: Math.floor(drop.quantityPerHour * durationHours * dropEfficiency * variance),
    })),
  );
  const resourceCount = Math.floor(
    estimate.resourceEstimatePerMinute *
      durationMinutes *
      dropEfficiency *
      variance,
  );
  const resources = getDispatchResourceLoot(destination, resourceCount);

  return {
    enemyKills,
    xpGranted,
    loot,
    resources,
  };
}

function getSecondaryPartyCompanions(
  state: GameState,
  party: GuildSecondaryParty,
): Companion[] {
  return party.companionIds
    .map((companionId) =>
      companionId ? state.restingCompanionsById?.[companionId] : undefined,
    )
    .filter((companion): companion is Companion => Boolean(companion));
}

function isPartyUnlocked(state: GameState, partyId: string): boolean {
  const parties = getGuildSecondaryPartiesState(state).parties;
  const index = parties.findIndex((party) => party.id === partyId);

  return index >= 0 && index < getGuildSecondaryPartyCount(state);
}

function replaceSecondaryParty(state: GameState, nextParty: GuildSecondaryParty): GameState {
  const secondaryParties = getGuildSecondaryPartiesState(state);

  return {
    ...state,
    guildSecondaryParties: {
      parties: secondaryParties.parties.map((party) =>
        party.id === nextParty.id ? nextParty : party,
      ),
    },
  };
}

function getDispatchResourceLoot(
  destination: DispatchDestination,
  quantity: number,
): GuildSecondaryPartyDispatchLoot[] {
  if (quantity <= 0 || destination.subzone.resourceLocations.length === 0) {
    return [];
  }

  const loot: GuildSecondaryPartyDispatchLoot[] = [];

  for (let index = 0; index < quantity; index += 1) {
    const resourceLocation =
      destination.subzone.resourceLocations[
        index % destination.subzone.resourceLocations.length
      ];
    const itemDefinition = getItemDefinitionForResourceType(
      resourceLocation.resourceType,
      resourceLocation.tier ?? 1,
    );

    loot.push({ itemId: itemDefinition.id, quantity: 1 });
  }

  return mergeDispatchLoot(loot);
}

function getDestinationResourceItemIds(destination: DispatchDestination): ItemId[] {
  return [
    ...new Set(
      destination.subzone.resourceLocations.map(
        (resourceLocation) =>
          getItemDefinitionForResourceType(
            resourceLocation.resourceType,
            resourceLocation.tier ?? 1,
          ).id,
      ),
    ),
  ];
}

function canCollectDispatchLoot(
  state: GameState,
  loot: GuildSecondaryPartyDispatchLoot[],
): boolean {
  let nextState = state;

  for (const item of loot) {
    const result = addItemToInventoryState(
      nextState,
      item.itemId,
      item.quantity,
      "combat_loot",
    );

    if (result.result.overflowQuantity > 0) {
      return false;
    }

    nextState = result.state;
  }

  return true;
}

function grantDispatchXp(
  state: GameState,
  companions: Companion[],
  xpAmount: number,
): GameState {
  if (xpAmount <= 0) {
    return state;
  }

  const livingCompanions = companions.filter(
    (companion) => companion.state !== "dead",
  );

  if (livingCompanions.length === 0) {
    return state;
  }

  const baseXpShare = Math.floor(xpAmount / livingCompanions.length);
  const remainderXp = xpAmount % livingCompanions.length;
  let nextState = state;

  for (const [index, companion] of livingCompanions.entries()) {
    const companionXpAmount = baseXpShare + (index < remainderXp ? 1 : 0);

    if (companionXpAmount <= 0) {
      continue;
    }

    const updatedCompanion = grantCharacterXpToCompanion(
      companion,
      companionXpAmount,
    );

    nextState = {
      ...nextState,
      restingCompanionsById: {
        ...nextState.restingCompanionsById,
        [companion.id]: updatedCompanion,
      },
    };
    nextState = recordHighestCharacterLevelEver(
      nextState,
      updatedCompanion.characterLevel,
    );
  }

  return nextState;
}

function mergeDispatchLoot(
  loot: Array<GuildSecondaryPartyDispatchLoot | InventorySlot>,
): GuildSecondaryPartyDispatchLoot[] {
  const quantityByItemId = new Map<ItemId, number>();

  for (const item of loot) {
    if (item.quantity <= 0) {
      continue;
    }

    quantityByItemId.set(
      item.itemId,
      (quantityByItemId.get(item.itemId) ?? 0) + item.quantity,
    );
  }

  return [...quantityByItemId.entries()].map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));
}

function createDispatchSeed(
  partyId: string,
  mapId: string,
  subzoneId: string,
  nowMs: number,
): number {
  const input = `${partyId}:${mapId}:${subzoneId}:${Math.floor(nowMs)}`;
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getDispatchVarianceMultiplier(seed: number): number {
  const random = seededRandom(seed);

  return 1 - GUILD_SECONDARY_PARTY_DISPATCH_VARIANCE +
    random * GUILD_SECONDARY_PARTY_DISPATCH_VARIANCE * 2;
}

function seededRandom(seed: number): number {
  let value = seed || 1;

  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;

  return ((value >>> 0) % 100000) / 100000;
}
