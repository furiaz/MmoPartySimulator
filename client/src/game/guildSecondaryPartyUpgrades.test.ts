import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  createInitialGuildUpgradesState,
  getGuildSecondaryPartyAssignmentDurationMs,
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartyDropEfficiency,
  getGuildSecondaryPartyExperienceEfficiency,
  getGuildSecondaryPartyMemberSlotCount,
  getGuildSecondaryPartyUpgradeStatuses,
  purchaseGuildSecondaryPartyUpgrade,
} from "./guildRecruitUpgrades";
import { GUILD_SECONDARY_PARTY_ID } from "./guildSecondaryParties";
import type { GameState } from "./state";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { createTestGameState } from "./testState";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";

describe("guild field team upgrades", () => {
  it("starts with zero unlocked Field Teams and Lv 1 per-team baselines", () => {
    const state = createUpgradeState();

    expect(getGuildSecondaryPartyCount(state)).toBe(0);
    expect(getGuildSecondaryPartyMemberSlotCount(state, GUILD_SECONDARY_PARTY_ID)).toBe(1);
    expect(getGuildSecondaryPartyExperienceEfficiency(state, GUILD_SECONDARY_PARTY_ID)).toBe(0.5);
    expect(getGuildSecondaryPartyDropEfficiency(state, GUILD_SECONDARY_PARTY_ID)).toBe(0.5);
    expect(getGuildSecondaryPartyAssignmentDurationMs(state, GUILD_SECONDARY_PARTY_ID)).toBe(6 * 60 * 60 * 1000);
  });

  it("purchases Field Team count upgrades with high scaling costs", () => {
    let state = createUpgradeState(40_000);

    const first = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count");
    expect(first.ok).toBe(true);
    state = first.state;
    expect(getGuildSecondaryPartyCount(state)).toBe(1);
    expect(getCurrencyBalance(state.wallet, "crowns")).toBe(39_999);

    const second = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count");
    expect(second.ok).toBe(true);
    state = second.state;
    expect(getGuildSecondaryPartyCount(state)).toBe(2);
    expect(getCurrencyBalance(state.wallet, "crowns")).toBe(34_999);

    const third = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count");
    expect(third.ok).toBe(true);
    state = third.state;
    expect(getGuildSecondaryPartyCount(state)).toBe(3);
    expect(getCurrencyBalance(state.wallet, "crowns")).toBe(4_999);
  });

  it("blocks per-party upgrades until that party is unlocked", () => {
    const locked = purchaseGuildSecondaryPartyUpgrade(
      createUpgradeState(1_000),
      "secondary_party_members",
      GUILD_SECONDARY_PARTY_ID,
    );

    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.reason).toBe("locked");
    }
  });

  it("uses per-party cost multipliers for efficiency upgrades", () => {
    let state = createUpgradeState(10_000);
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;

    const partyOne = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_experience_efficiency",
      "secondary-party-1",
    );
    const partyTwo = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_experience_efficiency",
      "secondary-party-2",
    );

    expect(partyOne.ok && partyOne.costCrowns).toBe(100);
    expect(partyTwo.ok && partyTwo.costCrowns).toBe(200);
  });

  it("blocks member upgrades above the main party slot unlock limit", () => {
    let state = createUpgradeState(10_000, 1);
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;
    state = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_members",
      GUILD_SECONDARY_PARTY_ID,
    ).state;

    expect(getGuildSecondaryPartyMemberSlotCount(state, GUILD_SECONDARY_PARTY_ID)).toBe(2);

    const blocked = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_members",
      GUILD_SECONDARY_PARTY_ID,
    );

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe("locked");
    }

    expect(
      getGuildSecondaryPartyUpgradeStatuses(state, GUILD_SECONDARY_PARTY_ID).find(
        (status) => status.id === "secondary_party_members",
      )?.lockReason,
    ).toBe("Requires main party slot 3 unlock");
  });

  it("caps max levels and blocks insufficient Crowns", () => {
    let state = createUpgradeState(1);
    const unlocked = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count");
    expect(unlocked.ok).toBe(true);
    state = unlocked.state;

    const broke = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_members",
      GUILD_SECONDARY_PARTY_ID,
    );
    expect(broke.ok).toBe(false);
    if (!broke.ok) {
      expect(broke.reason).toBe("insufficient_crowns");
    }

    state = createUpgradeState(100_000);
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;
    const maxed = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count");
    expect(maxed.ok).toBe(false);
    if (!maxed.ok) {
      expect(maxed.reason).toBe("max_level");
    }
  });

  it("preserves Field Team upgrades through save restore", () => {
    let state = createUpgradeState(2_000);
    state = purchaseGuildSecondaryPartyUpgrade(state, "secondary_party_count").state;
    state = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_members",
      GUILD_SECONDARY_PARTY_ID,
    ).state;
    state = purchaseGuildSecondaryPartyUpgrade(
      state,
      "secondary_party_experience_efficiency",
      GUILD_SECONDARY_PARTY_ID,
    ).state;

    const restored = restoreGameStateFromSave(createSavedGame(state, 1_000));

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(getGuildSecondaryPartyCount(restored.state)).toBe(1);
    expect(getGuildSecondaryPartyMemberSlotCount(restored.state, GUILD_SECONDARY_PARTY_ID)).toBe(2);
    expect(getGuildSecondaryPartyExperienceEfficiency(restored.state, GUILD_SECONDARY_PARTY_ID)).toBeCloseTo(0.55);
  });
});

function createUpgradeState(crowns = 0, highestCharacterLevelEver = 60): GameState {
  const leader = {
    ...createCompanion("leader", { x: 10, y: 10 }, "leader", "defender", 0),
    state: "idle" as const,
    currentTargetId: null,
  };
  const state = createTestGameState({
    entities: {
      leader,
    },
    partyLeaderId: leader.id,
    highestCharacterLevelEver,
    guildUpgrades: createInitialGuildUpgradesState(),
  });

  return setCurrencyBalanceForDebug(state, "crowns", crowns).state;
}
