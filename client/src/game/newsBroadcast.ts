import type { GameState } from "./state";
import type { NewsBroadcastEvent } from "./types";

export const NEWS_BROADCAST_DURATION_MS = 3000;

export function queueNewsBroadcast(
  state: GameState,
  text: string,
  nowMs = Date.now(),
): GameState {
  const event: NewsBroadcastEvent = {
    id: `${nowMs}-news-${state.newsBroadcasts?.length ?? 0}`,
    text,
    createdAt: nowMs,
    expiresAt: nowMs + NEWS_BROADCAST_DURATION_MS,
  };

  return {
    ...state,
    newsBroadcasts: [...(state.newsBroadcasts ?? []), event],
  };
}

export function queueUnlockNewsBroadcast(
  state: GameState,
  displayName: string,
  nowMs = Date.now(),
): GameState {
  return queueNewsBroadcast(state, `Unlocked: ${displayName}`, nowMs);
}

export function updateNewsBroadcasts(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const broadcasts = state.newsBroadcasts ?? [];

  if (broadcasts.length === 0) {
    return state;
  }

  const activeBroadcasts = broadcasts.filter(
    (broadcast) => broadcast.expiresAt > nowMs,
  );

  return activeBroadcasts.length === broadcasts.length
    ? state
    : {
        ...state,
        newsBroadcasts: activeBroadcasts,
      };
}
