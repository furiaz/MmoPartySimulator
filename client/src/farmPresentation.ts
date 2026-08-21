import {
  FARM_CARROT_CROP_ID,
  FARM_CARROT_FIELD_ID,
  FARM_CARROT_GROWTH_MS,
  FARM_CARROT_HOLD_CAP,
  FARM_CARROT_LEVEL_ONE_COST_CROWNS,
  FARM_CARROT_MAX_MVP_LEVEL,
  getCurrencyBalance,
  getFarmState,
  isPartyLeaderNearFarmer,
  isPartyLeaderNearLivestockKeeper,
  isTownServicesUnlocked,
  type FarmCropId,
  type GameState,
} from "./game";

export type FarmFieldDisplay = {
  fieldId: typeof FARM_CARROT_FIELD_ID;
  cropId: FarmCropId;
  cropName: string;
  level: number;
  maxLevel: number;
  heldQuantity: number;
  holdCap: number;
  upgradeCostCrowns: number;
  canUpgrade: boolean;
  canHarvest: boolean;
  isProducing: boolean;
  isAtCap: boolean;
  timeRemainingMs: number | null;
  productionText: string;
  holdText: string;
  upgradeActionText: string;
  harvestActionText: string;
};

export type FarmDisplay = {
  isUnlocked: boolean;
  isNearFarmer: boolean;
  isNearLivestockKeeper: boolean;
  crownBalance: number;
  field: FarmFieldDisplay;
};

export function getFarmDisplay(
  state: GameState,
  nowMs = Date.now(),
): FarmDisplay {
  const farm = getFarmState(state);
  const field = farm.fieldsById[FARM_CARROT_FIELD_ID];
  const isUnlocked = isTownServicesUnlocked(state);
  const isNearFarmer = isPartyLeaderNearFarmer(state);
  const isNearLivestockKeeper = isPartyLeaderNearLivestockKeeper(state);
  const isAtCap = field.heldQuantity >= FARM_CARROT_HOLD_CAP;
  const isProducing = field.level >= 1 && !isAtCap;
  const elapsedMs = Math.max(0, nowMs - field.lastGeneratedAtMs);
  const timeRemainingMs =
    isProducing ? Math.max(0, FARM_CARROT_GROWTH_MS - elapsedMs) : null;
  const crownBalance = getCurrencyBalance(state.wallet, "crowns");
  const upgradeActionText = getFarmUpgradeActionText({
    crownBalance,
    isNearFarmer,
    isUnlocked,
    level: field.level,
  });
  const harvestActionText = getFarmHarvestActionText({
    heldQuantity: field.heldQuantity,
    isNearFarmer,
    isUnlocked,
  });

  return {
    isUnlocked,
    isNearFarmer,
    isNearLivestockKeeper,
    crownBalance,
    field: {
      fieldId: FARM_CARROT_FIELD_ID,
      cropId: FARM_CARROT_CROP_ID,
      cropName: "Carrots",
      level: field.level,
      maxLevel: FARM_CARROT_MAX_MVP_LEVEL,
      heldQuantity: field.heldQuantity,
      holdCap: FARM_CARROT_HOLD_CAP,
      upgradeCostCrowns: FARM_CARROT_LEVEL_ONE_COST_CROWNS,
      canUpgrade:
        isUnlocked &&
        isNearFarmer &&
        field.level < FARM_CARROT_MAX_MVP_LEVEL &&
        crownBalance >= FARM_CARROT_LEVEL_ONE_COST_CROWNS,
      canHarvest: isUnlocked && isNearFarmer && field.heldQuantity > 0,
      isProducing,
      isAtCap,
      timeRemainingMs,
      productionText: getProductionText(field.level, isAtCap, timeRemainingMs),
      holdText: `Carrots ${field.heldQuantity}/${FARM_CARROT_HOLD_CAP}`,
      upgradeActionText,
      harvestActionText,
    },
  };
}

export function formatFarmDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getProductionText(
  level: number,
  isAtCap: boolean,
  timeRemainingMs: number | null,
): string {
  if (level <= 0) {
    return "Production inactive";
  }

  if (isAtCap) {
    return "Holding full";
  }

  return timeRemainingMs === null
    ? "Production inactive"
    : `Next carrot in ${formatFarmDuration(timeRemainingMs)}`;
}

function getFarmUpgradeActionText({
  crownBalance,
  isNearFarmer,
  isUnlocked,
  level,
}: {
  crownBalance: number;
  isNearFarmer: boolean;
  isUnlocked: boolean;
  level: number;
}): string {
  if (!isUnlocked || !isNearFarmer) {
    return "Requires proximity";
  }

  if (level >= FARM_CARROT_MAX_MVP_LEVEL) {
    return "Max level";
  }

  if (crownBalance < FARM_CARROT_LEVEL_ONE_COST_CROWNS) {
    return "Need Crowns";
  }

  return `${FARM_CARROT_LEVEL_ONE_COST_CROWNS} Crowns`;
}

function getFarmHarvestActionText({
  heldQuantity,
  isNearFarmer,
  isUnlocked,
}: {
  heldQuantity: number;
  isNearFarmer: boolean;
  isUnlocked: boolean;
}): string {
  if (!isUnlocked || !isNearFarmer) {
    return "Requires proximity";
  }

  if (heldQuantity <= 0) {
    return "Nothing held";
  }

  return `Carrots ${heldQuantity}/${FARM_CARROT_HOLD_CAP}`;
}
