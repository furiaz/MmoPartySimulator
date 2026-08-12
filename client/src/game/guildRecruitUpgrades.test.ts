import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  GUILD_RECRUIT_REFRESH_INTERVAL_MS,
  createInitialGuildRecruitState,
  recruitGuildCandidate,
  refreshGuildRecruitState,
} from "./guildRecruit";
import {
  createInitialGuildUpgradesState,
  getGuildRecruitRefreshIntervalMs,
  getGuildRecruitUpgradeStatuses,
  purchaseGuildRecruitUpgrade,
} from "./guildRecruitUpgrades";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import { setCurrencyBalanceForDebug } from "./wallet";

const NOW_MS = 1_000_000;

describe("guild recruit upgrades", () => {
  it("creates baseline Lv 1 recruit upgrades", () => {
    const state = createUpgradeState();
    const upgrades = state.guildUpgrades?.recruit;

    expect(upgrades).toMatchObject({
      recruit_slots: 1,
      recruit_max_level: 1,
      recruit_min_level: 1,
      recruit_refresh_rate: 1,
      recruit_equipment_chance: 1,
      recruit_skill_chance: 1,
    });
  });

  it("purchases a recruit upgrade with Crowns", () => {
    const state = createUpgradeState(1_000);
    const result = purchaseGuildRecruitUpgrade(state, "recruit_max_level");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.previousLevel).toBe(1);
    expect(result.nextLevel).toBe(2);
    expect(result.costCrowns).toBe(150);
    expect(result.state.guildUpgrades?.recruit.recruit_max_level).toBe(2);
    expect(result.state.wallet.balancesByCurrencyId.crowns).toBe(850);
  });

  it("blocks purchases without enough Crowns and at max level", () => {
    const broke = purchaseGuildRecruitUpgrade(
      createUpgradeState(0),
      "recruit_max_level",
    );

    expect(broke.ok).toBe(false);
    if (!broke.ok) {
      expect(broke.reason).toBe("insufficient_crowns");
    }

    let state = createUpgradeState(1_000);
    state = purchaseGuildRecruitUpgrade(state, "recruit_max_level").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_max_level").state;
    const maxed = purchaseGuildRecruitUpgrade(state, "recruit_max_level");

    expect(maxed.ok).toBe(false);
    if (!maxed.ok) {
      expect(maxed.reason).toBe("max_level");
    }
  });

  it("locks recruit min level until recruit max level reaches Lv 3", () => {
    const lockedState = createUpgradeState(1_000);
    const locked = purchaseGuildRecruitUpgrade(lockedState, "recruit_min_level");

    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.reason).toBe("locked");
    }

    const statuses = getGuildRecruitUpgradeStatuses(lockedState);
    expect(
      statuses.find((status) => status.id === "recruit_min_level")?.lockReason,
    ).toBe("Requires Recruit Max Level Lv 3");
  });

  it("applies recruit slot upgrades on the next shared refresh only", () => {
    let state = createUpgradeState(2_000);
    state = purchaseGuildRecruitUpgrade(state, "recruit_slots").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_slots").state;

    expect(state.guildRecruit?.candidates).toHaveLength(1);

    const refreshed = refreshGuildRecruitState(
      state,
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildRecruit?.candidates).toHaveLength(3);
    expect(refreshed.guildRecruit?.candidates.every(Boolean)).toBe(true);
  });

  it("uses upgraded refresh rate for the next generated timer", () => {
    let state = createUpgradeState(1_000);
    state = purchaseGuildRecruitUpgrade(state, "recruit_refresh_rate").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_refresh_rate").state;

    const refreshed = refreshGuildRecruitState(
      state,
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    );

    expect(getGuildRecruitRefreshIntervalMs(refreshed)).toBe(178 * 60 * 1000);
    expect(refreshed.guildRecruit?.nextRefreshAtMs).toBe(
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS + 178 * 60 * 1000,
    );
  });

  it("generates upgraded recruit levels and preserves visible candidates until refresh", () => {
    let state = createUpgradeState(2_000);
    state = purchaseGuildRecruitUpgrade(state, "recruit_max_level").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_max_level").state;

    expect(state.guildRecruit?.candidates[0]?.characterLevel).toBe(1);

    const refreshed = refreshGuildRecruitState(
      state,
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildRecruit?.candidates[0]?.characterLevel).toBeGreaterThan(1);
  });

  it("creates recruited companions with stored equipment and skill boosts", () => {
    let state = createUpgradeState(3_000);
    state = purchaseGuildRecruitUpgrade(state, "recruit_equipment_chance").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_equipment_chance").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_skill_chance").state;
    state = purchaseGuildRecruitUpgrade(state, "recruit_skill_chance").state;

    const refreshed = refreshGuildRecruitState(
      state,
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    );
    const candidate = refreshed.guildRecruit?.candidates[0];

    expect(candidate?.equipmentItemIds?.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(candidate?.startingSkillRanksBySkillId ?? {}).length)
      .toBeGreaterThanOrEqual(1);

    const result = recruitGuildCandidate(refreshed, NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(Object.values(result.companion.equipment).some(Boolean)).toBe(true);
    expect(
      Object.values(result.companion.skillProgression?.ranksBySkillId ?? {})
        .some((rank) => (rank ?? 0) > 1),
    ).toBe(true);
  });
});

function createUpgradeState(crowns = 0): GameState {
  const leader = {
    ...createCompanion("companion-1", { x: 10, y: 10 }, "companion-1", "defender", 0),
    state: "idle" as const,
    currentTargetId: null,
  };
  const state = createTestGameState({
    entities: {
      [leader.id]: leader,
    },
    partyLeaderId: leader.id,
    highestCharacterLevelEver: 10,
    guildRecruit: createInitialGuildRecruitState(NOW_MS),
    guildUpgrades: createInitialGuildUpgradesState(),
  });

  return setCurrencyBalanceForDebug(state, "crowns", crowns).state;
}
