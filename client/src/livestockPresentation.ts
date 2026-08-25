import {
  getAvailableLivestockCreatureCount,
  getLivestockCreatureDefinition,
  getLivestockCreatureDefinitions,
  getLivestockExpectedOutputsPerHour,
  getLivestockFootprintCells,
  getNextLivestockFeedAtMs,
  getLivestockState,
  isPartyLeaderNearLivestockKeeper,
  isTownServicesUnlocked,
  LIVESTOCK_EGG_HOLD_CAP,
  LIVESTOCK_EGG_OUTPUT_ID,
  type GameState,
  type LivestockCreatureId,
  type LivestockOutputId,
  type LivestockPlacedCreatureState,
  type LivestockPlacementId,
  type LivestockPlacementRotation,
} from "./game";

export type LivestockGridCellDisplay = {
  x: number;
  y: number;
  placementId: LivestockPlacementId | null;
  creatureId: LivestockCreatureId | null;
  label: string;
  isOrigin: boolean;
  isHungry: boolean;
};

export type LivestockCreatureDisplay = {
  creatureId: LivestockCreatureId;
  displayName: string;
  shortLabel: string;
  ownedCount: number;
  placedCount: number;
  availableCount: number;
  footprintText: string;
  feedText: string;
  yieldText: string;
  expectedOutputPerHourText: string;
  fedCount: number;
  hungryCount: number;
  canHoldForPlacement: boolean;
};

export type LivestockOutputDisplay = {
  outputId: LivestockOutputId;
  displayName: string;
  quantity: number;
  cap: number;
  holdText: string;
};

export type LivestockDisplay = {
  isUnlocked: boolean;
  isNearLivestockKeeper: boolean;
  canUseActions: boolean;
  width: number;
  height: number;
  cells: LivestockGridCellDisplay[];
  creatures: LivestockCreatureDisplay[];
  placements: LivestockPlacedCreatureState[];
  outputs: LivestockOutputDisplay[];
  totalOutputPerHourText: string;
  totalFeedText: string;
  pantryFeedText: string;
  feedingStatusText: string;
  nextFeedAtText: string;
  collectActionText: string;
  canCollect: boolean;
  feedNowActionText: string;
  canFeedNow: boolean;
  hasHungryAnimals: boolean;
};

export function getLivestockDisplay(
  state: GameState,
  nowMs = Date.now(),
): LivestockDisplay {
  const livestock = getLivestockState(state, nowMs);
  const isUnlocked = isTownServicesUnlocked(state);
  const isNearLivestockKeeper = isPartyLeaderNearLivestockKeeper(state);
  const canUseActions = isUnlocked && isNearLivestockKeeper;
  const placements = Object.values(livestock.placementsById).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const creatures = getLivestockCreatureDefinitions().map((definition) => {
    const placedCount = placements.filter(
      (placement) => placement.creatureId === definition.id,
    ).length;
    const hungryCount = placements.filter(
      (placement) =>
        placement.creatureId === definition.id && placement.isHungry === true,
    ).length;
    const fedCount = Math.max(0, placedCount - hungryCount);
    const ownedCount = livestock.ownedCreaturesById[definition.id] ?? 0;
    const availableCount = getAvailableLivestockCreatureCount(
      livestock,
      definition.id,
    );
    const expectedPerHour =
      fedCount *
      ((60 * 60 * 1000 * definition.output.quantity) /
        definition.output.intervalMs);

    return {
      creatureId: definition.id,
      displayName: definition.displayName,
      shortLabel: definition.shortLabel,
      ownedCount,
      placedCount,
      availableCount,
      footprintText: `${definition.footprint.width}x${definition.footprint.height}`,
      feedText:
        definition.feedPerDay.length > 0
          ? definition.feedPerDay
              .map((feed) => `${formatIngredientName(feed.cropId)} ${feed.quantity}/day`)
              .join(", ")
          : "None",
      yieldText: `${definition.output.displayName} ${definition.output.quantity} / ${formatDuration(definition.output.intervalMs)}`,
      expectedOutputPerHourText: formatRate(expectedPerHour),
      fedCount,
      hungryCount,
      canHoldForPlacement: canUseActions && availableCount > 0,
    };
  });
  const outputs: LivestockOutputDisplay[] = [
    {
      outputId: LIVESTOCK_EGG_OUTPUT_ID,
      displayName: "Eggs",
      quantity:
        livestock.holdingQuantitiesByOutputId[LIVESTOCK_EGG_OUTPUT_ID] ?? 0,
      cap:
        livestock.holdingCapsByOutputId[LIVESTOCK_EGG_OUTPUT_ID] ??
        LIVESTOCK_EGG_HOLD_CAP,
      holdText: `Eggs ${
        livestock.holdingQuantitiesByOutputId[LIVESTOCK_EGG_OUTPUT_ID] ?? 0
      }/${
        livestock.holdingCapsByOutputId[LIVESTOCK_EGG_OUTPUT_ID] ??
        LIVESTOCK_EGG_HOLD_CAP
      }`,
    },
  ];
  const totalHeld = outputs.reduce((total, output) => total + output.quantity, 0);
  const hungryCount = placements.filter((placement) => placement.isHungry).length;
  const placedCount = placements.length;
  const pantryCarrots =
    state.innKitchen?.pantry.ingredientQuantitiesById.carrot ?? 0;

  return {
    isUnlocked,
    isNearLivestockKeeper,
    canUseActions,
    width: livestock.grid.width,
    height: livestock.grid.height,
    cells: createGridCells(livestock, placements),
    creatures,
    placements,
    outputs,
    totalOutputPerHourText: formatRate(getLivestockExpectedOutputsPerHour(state)),
    totalFeedText: getTotalFeedText(creatures),
    pantryFeedText: `Pantry Carrots ${pantryCarrots}`,
    feedingStatusText: `Fed ${Math.max(0, placedCount - hungryCount)} / Hungry ${hungryCount}`,
    nextFeedAtText: formatClockTime(getNextLivestockFeedAtMs(nowMs)),
    collectActionText: canUseActions
      ? totalHeld > 0
        ? outputs.map((output) => output.holdText).join(", ")
        : "Nothing held"
      : "Requires proximity",
    canCollect: canUseActions && totalHeld > 0,
    feedNowActionText:
      hungryCount <= 0
        ? "No hungry animals"
        : canUseActions
          ? `${hungryCount} hungry`
          : "Requires proximity",
    canFeedNow: canUseActions && hungryCount > 0,
    hasHungryAnimals: hungryCount > 0,
  };
}

export function getLivestockPlacementTimeRemainingText(
  placement: LivestockPlacedCreatureState,
  nowMs: number,
): string {
  const definition = getLivestockCreatureDefinition(placement.creatureId);

  if (!definition) {
    return "Unknown";
  }

  if (placement.isHungry) {
    return `Hungry (${formatDuration(
      placement.pausedProductionRemainingMs ?? definition.output.intervalMs,
    )} paused)`;
  }

  return formatDuration(
    Math.max(0, definition.output.intervalMs - (nowMs - placement.lastProducedAtMs)),
  );
}

export function getNextLivestockRotation(
  rotation: LivestockPlacementRotation,
): LivestockPlacementRotation {
  return rotation === "horizontal" ? "vertical" : "horizontal";
}

function createGridCells(
  livestock: ReturnType<typeof getLivestockState>,
  placements: LivestockPlacedCreatureState[],
): LivestockGridCellDisplay[] {
  const cells: LivestockGridCellDisplay[] = [];

  for (let y = 0; y < livestock.grid.height; y += 1) {
    for (let x = 0; x < livestock.grid.width; x += 1) {
      const occupant = findOccupant(placements, x, y);

      cells.push({
        x,
        y,
        placementId: occupant?.placement.id ?? null,
        creatureId: occupant?.placement.creatureId ?? null,
        label: occupant?.isOrigin ? occupant.definition.shortLabel : "",
        isOrigin: occupant?.isOrigin ?? false,
        isHungry: occupant?.placement.isHungry ?? false,
      });
    }
  }

  return cells;
}

function findOccupant(
  placements: LivestockPlacedCreatureState[],
  x: number,
  y: number,
):
  | {
      placement: LivestockPlacedCreatureState;
      definition: NonNullable<ReturnType<typeof getLivestockCreatureDefinition>>;
      isOrigin: boolean;
    }
  | null {
  for (const placement of placements) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition) {
      continue;
    }

    if (
      getLivestockFootprintCells(
        definition,
        placement.x,
        placement.y,
        placement.rotation,
      ).some((cell) => cell.x === x && cell.y === y)
    ) {
      return {
        placement,
        definition,
        isOrigin: placement.x === x && placement.y === y,
      };
    }
  }

  return null;
}

function getTotalFeedText(creatures: LivestockCreatureDisplay[]): string {
  const carrotTotal = creatures.reduce((total, creature) => {
    const match = creature.feedText.match(/Carrot(?:s)? (\d+)\/day/);

    return total + (match ? Number(match[1]) * creature.placedCount : 0);
  }, 0);

  return carrotTotal > 0 ? `Carrots ${carrotTotal}/day` : "No feed needed";
}

function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatIngredientName(ingredientId: string): string {
  return ingredientId
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}
