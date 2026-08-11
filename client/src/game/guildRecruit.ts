import { createCompanion } from "./entities";
import {
  GUILD_INN_COMPANION_CAPACITY,
  getTotalRosterCompanionCount,
} from "./guildSecondaryParties";
import { getPartySizeLimit } from "./leveling";
import {
  getActiveCompanions,
  getPartyLeader,
  getRestingCompanions,
  recordHighestCharacterLevelEver,
} from "./partySystem";
import { addEntity, type GameState } from "./state";
import type {
  ClassId,
  Companion,
  GuildRecruitCandidate,
  GuildRecruitState,
  PartyMemberRole,
  Position,
} from "./types";

export const GUILD_RECRUIT_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const GUILD_RECRUIT_RESERVE_CAPACITY = GUILD_INN_COMPANION_CAPACITY;

export type GuildRecruitDestination =
  | "active_party"
  | "tavern_reserve"
  | "blocked_full";

export type GuildRecruitResult =
  | {
      ok: true;
      destination: Exclude<GuildRecruitDestination, "blocked_full">;
      companion: Companion;
      state: GameState;
    }
  | {
      ok: false;
      reason: "no_candidate" | "roster_full";
      state: GameState;
    };

export function createInitialGuildRecruitState(
  nowMs = Date.now(),
): GuildRecruitState {
  return {
    candidate: createGuildRecruitCandidate(1, nowMs),
    nextRefreshAtMs: nowMs + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    recruitSequence: 1,
  };
}

export function getGuildRecruitState(
  state: GameState,
  nowMs = Date.now(),
): GuildRecruitState {
  return refreshGuildRecruitState(state, nowMs).guildRecruit ??
    createInitialGuildRecruitState(nowMs);
}

export function refreshGuildRecruitState(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const hadGuildRecruit = Boolean(state.guildRecruit);
  const guildRecruit = sanitizeGuildRecruitState(state.guildRecruit, nowMs);

  if (guildRecruit.nextRefreshAtMs > nowMs) {
    return hadGuildRecruit
      ? state
      : {
          ...state,
          guildRecruit,
        };
  }

  const nextSequence = getAvailableRecruitSequence(
    state,
    Math.max(1, guildRecruit.recruitSequence + 1),
  );
  const nextGuildRecruit: GuildRecruitState = {
    candidate: createGuildRecruitCandidate(nextSequence, nowMs),
    nextRefreshAtMs: nowMs + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    recruitSequence: nextSequence,
  };

  return {
    ...state,
    guildRecruit: nextGuildRecruit,
  };
}

export function recruitGuildCandidate(
  state: GameState,
  nowMs = Date.now(),
): GuildRecruitResult {
  const refreshedState = refreshGuildRecruitState(state, nowMs);
  const guildRecruit = getGuildRecruitState(refreshedState, nowMs);
  const candidate = guildRecruit.candidate;

  if (!candidate) {
    return {
      ok: false,
      reason: "no_candidate",
      state: refreshedState,
    };
  }

  const destination = getGuildRecruitDestination(refreshedState);

  if (destination === "blocked_full") {
    return {
      ok: false,
      reason: "roster_full",
      state: refreshedState,
    };
  }

  const recruitSequence = getAvailableRecruitSequence(
    refreshedState,
    candidate.sequence,
  );
  const companion = createCompanionFromRecruitCandidate(
    refreshedState,
    {
      ...candidate,
      sequence: recruitSequence,
    },
  );
  const restingCompanion: Companion = {
    ...companion,
    state: "idle",
    currentTargetId: null,
  };
  const nextGuildRecruit: GuildRecruitState = {
    ...guildRecruit,
    recruitSequence,
    candidate: null,
    nextRefreshAtMs: nowMs + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
  };
  const routedState =
    destination === "active_party"
      ? addEntity(refreshedState, companion)
      : {
          ...refreshedState,
          restingCompanionsById: {
            ...(refreshedState.restingCompanionsById ?? {}),
            [companion.id]: restingCompanion,
          },
        };

  return {
    ok: true,
    destination,
    companion,
    state: recordHighestCharacterLevelEver(
      {
        ...routedState,
        guildRecruit: nextGuildRecruit,
      },
      companion.characterLevel,
    ),
  };
}

export function getGuildRecruitDestination(
  state: GameState,
): GuildRecruitDestination {
  if (getTotalRosterCompanionCount(state) >= GUILD_INN_COMPANION_CAPACITY) {
    return "blocked_full";
  }

  if (getActiveCompanions(state).length < getPartySizeLimit(state)) {
    return "active_party";
  }

  return "tavern_reserve";
}

export function getGuildRecruitReserveCapacity(): number {
  return GUILD_RECRUIT_RESERVE_CAPACITY;
}

export function sanitizeGuildRecruitState(
  guildRecruit: GuildRecruitState | undefined,
  nowMs = Date.now(),
): GuildRecruitState {
  if (!guildRecruit) {
    return createInitialGuildRecruitState(nowMs);
  }

  const recruitSequence = sanitizeSequence(guildRecruit.recruitSequence);
  const candidate = sanitizeGuildRecruitCandidate(
    guildRecruit.candidate,
    recruitSequence,
    nowMs,
  );
  const nextRefreshAtMs = sanitizeTimestamp(
    guildRecruit.nextRefreshAtMs,
    nowMs + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
  );

  return {
    candidate,
    nextRefreshAtMs,
    recruitSequence,
  };
}

function createCompanionFromRecruitCandidate(
  state: GameState,
  candidate: GuildRecruitCandidate,
): Companion {
  const leader = getPartyLeader(state);
  const activeCompanions = getActiveCompanions(state);
  const position = getRecruitSpawnPosition(leader?.position);
  const followTargetId = leader?.id ?? state.partyLeaderId ?? candidate.id;
  const partyOrder = activeCompanions.length;

  return {
    ...createCompanion(
      `guild-recruit-${candidate.sequence}`,
      position,
      followTargetId,
      candidate.role,
      partyOrder,
      candidate.classId,
    ),
    characterLevel: candidate.characterLevel,
  };
}

function createGuildRecruitCandidate(
  sequence: number,
  nowMs: number,
): GuildRecruitCandidate {
  return {
    id: `guild-recruit-candidate-${sequence}`,
    classId: "beginner",
    characterLevel: 1,
    role: "none",
    generatedAtMs: nowMs,
    sequence,
  };
}

function sanitizeGuildRecruitCandidate(
  candidate: GuildRecruitCandidate | null | undefined,
  fallbackSequence: number,
  nowMs: number,
): GuildRecruitCandidate | null {
  if (!candidate) {
    return null;
  }

  const sequence = sanitizeSequence(candidate.sequence, fallbackSequence);

  return {
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `guild-recruit-candidate-${sequence}`,
    classId: sanitizeRecruitClassId(candidate.classId),
    characterLevel: 1,
    role: sanitizeRecruitRole(candidate.role),
    generatedAtMs: sanitizeTimestamp(candidate.generatedAtMs, nowMs),
    sequence,
  };
}

function getRecruitSpawnPosition(position: Position | undefined): Position {
  if (!position) {
    return { x: 0, y: 0 };
  }

  return {
    x: position.x + 0.5,
    y: position.y + 0.5,
  };
}

function sanitizeRecruitClassId(classId: ClassId | undefined): ClassId {
  return classId === "beginner" ? classId : "beginner";
}

function sanitizeRecruitRole(
  role: PartyMemberRole | undefined,
): PartyMemberRole {
  return role === "none" ? role : "none";
}

function sanitizeSequence(sequence: number | undefined, fallback = 1): number {
  return typeof sequence === "number" && Number.isFinite(sequence)
    ? Math.max(1, Math.floor(sequence))
    : fallback;
}

function sanitizeTimestamp(timestamp: number | undefined, fallback: number): number {
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : fallback;
}

function getAvailableRecruitSequence(state: GameState, sequence: number): number {
  const activeCompanionIds = new Set(
    getActiveCompanions(state).map((companion) => companion.id),
  );
  const restingCompanionIds = new Set(
    getRestingCompanions(state).map((companion) => companion.id),
  );
  let nextSequence = sanitizeSequence(sequence);

  while (
    activeCompanionIds.has(`guild-recruit-${nextSequence}`) ||
    restingCompanionIds.has(`guild-recruit-${nextSequence}`)
  ) {
    nextSequence += 1;
  }

  return nextSequence;
}
