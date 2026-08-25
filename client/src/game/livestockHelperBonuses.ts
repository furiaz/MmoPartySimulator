import type { GameState } from "./state";
import type { LivestockCreatureId } from "./types";

export const LIVESTOCK_WOLF_NOTICE_BOARD_REROLLS = 1;
export const LIVESTOCK_ELDER_MOSSLING_FARM_BONUS_PERCENT = 10;

export type LivestockHelperBonusSummary = {
  activeWolfCount: number;
  noticeBoardRerollBonus: number;
  activeElderMosslingCount: number;
  farmGenerationBonusPercent: number;
  farmGenerationMultiplier: number;
  noticeBoardLivestockSourceText: string | null;
  farmGenerationLivestockSourceText: string | null;
  summaryText: string;
};

export function getLivestockHelperBonusSummary(
  state: Pick<GameState, "livestock">,
): LivestockHelperBonusSummary {
  const activeWolfCount = getActiveFedCreatureCount(state, "wolf");
  const activeElderMosslingCount = getActiveFedCreatureCount(
    state,
    "elder_mossling",
  );
  const noticeBoardRerollBonus =
    activeWolfCount * LIVESTOCK_WOLF_NOTICE_BOARD_REROLLS;
  const farmGenerationBonusPercent =
    activeElderMosslingCount * LIVESTOCK_ELDER_MOSSLING_FARM_BONUS_PERCENT;
  const noticeBoardLivestockSourceText =
    activeWolfCount > 0
      ? `${noticeBoardRerollBonus} from Livestock (Wolf x${activeWolfCount})`
      : null;
  const farmGenerationLivestockSourceText =
    activeElderMosslingCount > 0
      ? `+${farmGenerationBonusPercent}% from Livestock (Elder Mossling x${activeElderMosslingCount})`
      : null;
  const summaryParts = [
    farmGenerationBonusPercent > 0
      ? `Farm generation +${farmGenerationBonusPercent}% (Elder Mossling x${activeElderMosslingCount})`
      : null,
    noticeBoardRerollBonus > 0
      ? `Notice Board rerolls +${noticeBoardRerollBonus}/day (Wolf x${activeWolfCount})`
      : null,
  ].filter((part): part is string => part !== null);

  return {
    activeWolfCount,
    noticeBoardRerollBonus,
    activeElderMosslingCount,
    farmGenerationBonusPercent,
    farmGenerationMultiplier: 1 + farmGenerationBonusPercent / 100,
    noticeBoardLivestockSourceText,
    farmGenerationLivestockSourceText,
    summaryText:
      summaryParts.length > 0
        ? summaryParts.join(", ")
        : "No helper bonuses active",
  };
}

function getActiveFedCreatureCount(
  state: Pick<GameState, "livestock">,
  creatureId: LivestockCreatureId,
): number {
  return Object.values(state.livestock?.placementsById ?? {}).filter(
    (placement) =>
      placement.creatureId === creatureId && placement.isHungry !== true,
  ).length;
}
