import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getItemDefinition } from "./items";
import type { GameState } from "./state";
import type {
  InventoryAddResult,
  InventoryMutationSource,
  InventoryRemoveResult,
  InventorySlot,
  ItemDefinition,
  ItemId,
  PartyInventory,
} from "./types";

export const STARTING_INVENTORY_CAPACITY = 50;
const INVENTORY_TELEMETRY_ENTITY_ID = "__inventory__";

export function createEmptyPartyInventory(
  capacity = STARTING_INVENTORY_CAPACITY,
): PartyInventory {
  return {
    capacity,
    slots: [],
    lockedSlotIndices: [],
  };
}

export function canStackItems(
  slot: InventorySlot,
  itemDefinition: ItemDefinition,
): boolean {
  return (
    itemDefinition.stackable &&
    slot.itemId === itemDefinition.id &&
    slot.quantity < itemDefinition.maxStack
  );
}

export function getUsedInventorySlots(inventory: PartyInventory): number {
  return inventory.slots.length;
}

export function getAvailableInventorySlots(inventory: PartyInventory): number {
  if (!isIndexedInventory(inventory)) {
    return Math.max(0, inventory.capacity - getUsedInventorySlots(inventory));
  }

  const occupiedIndices = new Set(
    inventory.slots.map((slot, fallbackIndex) =>
      getInventorySlotIndex(slot, fallbackIndex),
    ),
  );
  const lockedEmptySlots = getLockedInventorySlotIndices(inventory).filter(
    (slotIndex) =>
      slotIndex >= 0 &&
      slotIndex < inventory.capacity &&
      !occupiedIndices.has(slotIndex),
  ).length;

  return Math.max(
    0,
    inventory.capacity - getUsedInventorySlots(inventory) - lockedEmptySlots,
  );
}

export function isIndexedInventory(inventory: PartyInventory): boolean {
  return (
    inventory.slots.some((slot) => typeof slot.slotIndex === "number") ||
    getLockedInventorySlotIndices(inventory).length > 0
  );
}

export function getLockedInventorySlotIndices(
  inventory: PartyInventory,
): number[] {
  return normalizeSlotIndices(inventory.lockedSlotIndices, inventory.capacity);
}

export function isInventorySlotLocked(
  inventory: PartyInventory,
  slotIndex: number,
): boolean {
  return getLockedInventorySlotIndices(inventory).includes(slotIndex);
}

export function getInventorySlotIndex(
  slot: InventorySlot,
  fallbackIndex: number,
): number {
  return typeof slot.slotIndex === "number" &&
    Number.isFinite(slot.slotIndex) &&
    slot.slotIndex >= 0
    ? Math.floor(slot.slotIndex)
    : fallbackIndex;
}

export function getInventorySlotAtIndex(
  inventory: PartyInventory,
  slotIndex: number,
): InventorySlot | null {
  const resolvedIndex = Math.floor(slotIndex);

  if (resolvedIndex < 0 || resolvedIndex >= inventory.capacity) {
    return null;
  }

  if (isIndexedInventory(inventory)) {
    return (
      inventory.slots.find(
        (slot, fallbackIndex) =>
          getInventorySlotIndex(slot, fallbackIndex) === resolvedIndex,
      ) ?? null
    );
  }

  return inventory.slots[resolvedIndex] ?? null;
}

export function getInventorySlotsByFixedIndex(
  inventory: PartyInventory,
): Array<{ index: number; slot: InventorySlot | null; locked: boolean }> {
  const lockedSlotIndices = new Set(getLockedInventorySlotIndices(inventory));

  return Array.from({ length: inventory.capacity }, (_, index) => ({
    index,
    slot: getInventorySlotAtIndex(inventory, index),
    locked: lockedSlotIndices.has(index),
  }));
}

export function countInventoryItem(
  inventory: PartyInventory,
  itemId: ItemId,
): number {
  return inventory.slots
    .filter((slot) => slot.itemId === itemId)
    .reduce((total, slot) => total + slot.quantity, 0);
}

export function addItemToInventoryState(
  state: GameState,
  itemId: ItemId,
  quantity: number,
  source: InventoryMutationSource = "unknown",
): { state: GameState; result: InventoryAddResult } {
  const itemDefinition = getItemDefinition(itemId);
  const requestedQuantity = Math.floor(quantity);
  let nextState = appendInventoryTelemetry(state, itemDefinition, source, {
    type: "item_add_attempt",
    requestedQuantity,
  });
  nextState = appendCapacityTelemetry(nextState, itemDefinition, source);

  if (requestedQuantity <= 0) {
    return {
      state: nextState,
      result: {
        status: "failed_invalid",
        itemId,
        requestedQuantity,
        addedQuantity: 0,
        overflowQuantity: Math.max(0, requestedQuantity),
      },
    };
  }

  const inventoryUsesFixedSlots = isIndexedInventory(nextState.inventory);
  const slots = [...nextState.inventory.slots];
  let remainingQuantity = requestedQuantity;
  let addedQuantity = 0;

  if (itemDefinition.stackable) {
    for (let slotIndex = 0; slotIndex < slots.length && remainingQuantity > 0; slotIndex += 1) {
      const slot = slots[slotIndex];

      if (!canStackItems(slot, itemDefinition)) {
        continue;
      }

      const beforeQuantity = slot.quantity;
      const addedToStack = Math.min(
        itemDefinition.maxStack - slot.quantity,
        remainingQuantity,
      );
      slots[slotIndex] = {
        ...slot,
        quantity: slot.quantity + addedToStack,
      };
      remainingQuantity -= addedToStack;
      addedQuantity += addedToStack;
      nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
        type: "inventory_stack_updated",
        addedQuantity: addedToStack,
        slotIndex: getInventorySlotIndex(slot, slotIndex),
        stackQuantityBefore: beforeQuantity,
        stackQuantityAfter: slots[slotIndex].quantity,
      });
    }
  }

  while (
    remainingQuantity > 0 &&
    slots.length < nextState.inventory.capacity &&
    (!inventoryUsesFixedSlots ||
      getFirstAvailableInventorySlotIndex(
        {
          ...nextState.inventory,
          slots,
        },
        { skipLocked: true },
      ) !== null)
  ) {
    const addedToStack = itemDefinition.stackable
      ? Math.min(itemDefinition.maxStack, remainingQuantity)
      : 1;
    const slotIndex = inventoryUsesFixedSlots
      ? getFirstAvailableInventorySlotIndex(
          {
            ...nextState.inventory,
            slots,
          },
          { skipLocked: true },
        )
      : slots.length;

    if (slotIndex === null) {
      break;
    }

    slots.push({
      itemId,
      quantity: addedToStack,
      ...(inventoryUsesFixedSlots ? { slotIndex } : {}),
    });
    remainingQuantity -= addedToStack;
    addedQuantity += addedToStack;
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "inventory_stack_created",
      addedQuantity: addedToStack,
      slotIndex,
      stackQuantityBefore: 0,
      stackQuantityAfter: addedToStack,
    });
  }

  const inventory = {
    ...nextState.inventory,
    slots,
    lockedSlotIndices: getLockedInventorySlotIndices(nextState.inventory),
  };
  nextState = {
    ...nextState,
    inventory,
  };

  const result: InventoryAddResult = {
    status:
      addedQuantity === requestedQuantity
        ? "success"
        : addedQuantity > 0
          ? "partial"
          : "failed_full",
    itemId,
    requestedQuantity,
    addedQuantity,
    overflowQuantity: remainingQuantity,
  };
  nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
    type:
      result.status === "success"
        ? "item_added"
        : result.status === "partial"
          ? "item_add_partial"
          : "item_add_failed_full",
    requestedQuantity,
    addedQuantity,
    overflowQuantity: remainingQuantity,
  });

  return { state: nextState, result };
}

export function removeItemFromInventoryState(
  state: GameState,
  itemId: ItemId,
  quantity: number,
  source: InventoryMutationSource = "unknown",
): { state: GameState; result: InventoryRemoveResult } {
  const itemDefinition = getItemDefinition(itemId);
  const requestedQuantity = Math.floor(quantity);

  if (requestedQuantity <= 0) {
    return {
      state,
      result: {
        status: "failed_invalid",
        itemId,
        requestedQuantity,
        removedQuantity: 0,
        remainingQuantity: Math.max(0, requestedQuantity),
      },
    };
  }

  const slots = [...state.inventory.slots];
  let nextState = state;
  let remainingQuantity = requestedQuantity;
  let removedQuantity = 0;

  for (let slotIndex = 0; slotIndex < slots.length && remainingQuantity > 0; slotIndex += 1) {
    const slot = slots[slotIndex];

    if (slot.itemId !== itemId) {
      continue;
    }

    const beforeQuantity = slot.quantity;
    const removedFromStack = Math.min(slot.quantity, remainingQuantity);
    const afterQuantity = slot.quantity - removedFromStack;
    slots[slotIndex] = {
      ...slot,
      quantity: afterQuantity,
    };
    remainingQuantity -= removedFromStack;
    removedQuantity += removedFromStack;
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "inventory_stack_updated",
      removedQuantity: removedFromStack,
      slotIndex: getInventorySlotIndex(slot, slotIndex),
      stackQuantityBefore: beforeQuantity,
      stackQuantityAfter: afterQuantity,
    });
  }

  const inventory = {
    ...nextState.inventory,
    slots: slots.filter((slot) => slot.quantity > 0),
    lockedSlotIndices: getLockedInventorySlotIndices(nextState.inventory),
  };
  nextState = {
    ...nextState,
    inventory,
  };

  if (removedQuantity > 0) {
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "item_removed",
      requestedQuantity,
      removedQuantity,
    });
  }

  return {
    state: nextState,
    result: {
      status:
        removedQuantity === requestedQuantity
          ? "success"
          : removedQuantity > 0
            ? "partial"
            : "failed_invalid",
      itemId,
      requestedQuantity,
      removedQuantity,
      remainingQuantity,
    },
  };
}

export function removeItemFromInventorySlotState(
  state: GameState,
  slotIndex: number,
  quantity: number,
  source: InventoryMutationSource = "unknown",
): { state: GameState; result: InventoryRemoveResult } {
  const resolvedSlotIndex = Math.floor(slotIndex);
  const slot = getInventorySlotAtIndex(state.inventory, resolvedSlotIndex);

  if (!slot) {
    return {
      state,
      result: {
        status: "failed_invalid",
        itemId: "wood",
        requestedQuantity: Math.floor(quantity),
        removedQuantity: 0,
        remainingQuantity: Math.max(0, Math.floor(quantity)),
      },
    };
  }

  const itemDefinition = getItemDefinition(slot.itemId);
  const requestedQuantity = Math.floor(quantity);

  if (requestedQuantity <= 0) {
    return {
      state,
      result: {
        status: "failed_invalid",
        itemId: slot.itemId,
        requestedQuantity,
        removedQuantity: 0,
        remainingQuantity: Math.max(0, requestedQuantity),
      },
    };
  }

  const slots = [...state.inventory.slots];
  const arrayIndex = slots.findIndex(
    (candidate, fallbackIndex) =>
      getInventorySlotIndex(candidate, fallbackIndex) === resolvedSlotIndex,
  );

  if (arrayIndex < 0) {
    return {
      state,
      result: {
        status: "failed_invalid",
        itemId: slot.itemId,
        requestedQuantity,
        removedQuantity: 0,
        remainingQuantity: requestedQuantity,
      },
    };
  }

  const beforeQuantity = slot.quantity;
  const removedQuantity = Math.min(slot.quantity, requestedQuantity);
  const afterQuantity = slot.quantity - removedQuantity;
  let nextState = appendInventoryTelemetry(state, itemDefinition, source, {
    type: "inventory_stack_updated",
    removedQuantity,
    slotIndex: resolvedSlotIndex,
    stackQuantityBefore: beforeQuantity,
    stackQuantityAfter: afterQuantity,
  });

  slots[arrayIndex] = {
    ...slot,
    slotIndex: isIndexedInventory(state.inventory)
      ? resolvedSlotIndex
      : slot.slotIndex,
    quantity: afterQuantity,
  };

  nextState = {
    ...nextState,
    inventory: {
      ...nextState.inventory,
      slots: slots.filter((candidate) => candidate.quantity > 0),
      lockedSlotIndices: getLockedInventorySlotIndices(nextState.inventory),
    },
  };

  if (removedQuantity > 0) {
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "item_removed",
      requestedQuantity,
      removedQuantity,
    });
  }

  const remainingQuantity = requestedQuantity - removedQuantity;

  return {
    state: nextState,
    result: {
      status:
        removedQuantity === requestedQuantity
          ? "success"
          : removedQuantity > 0
            ? "partial"
            : "failed_invalid",
      itemId: slot.itemId,
      requestedQuantity,
      removedQuantity,
      remainingQuantity,
    },
  };
}

export function toggleInventorySlotLock(
  inventory: PartyInventory,
  slotIndex: number,
): PartyInventory {
  const resolvedSlotIndex = Math.floor(slotIndex);

  if (resolvedSlotIndex < 0 || resolvedSlotIndex >= inventory.capacity) {
    return sanitizePartyInventory(inventory);
  }

  const lockedSlotIndices = new Set(getLockedInventorySlotIndices(inventory));

  if (lockedSlotIndices.has(resolvedSlotIndex)) {
    lockedSlotIndices.delete(resolvedSlotIndex);
  } else {
    lockedSlotIndices.add(resolvedSlotIndex);
  }

  return sanitizePartyInventory({
    ...inventory,
    slots: assignMissingSlotIndices(inventory),
    lockedSlotIndices: [...lockedSlotIndices],
  });
}

export function sanitizePartyInventory(
  inventory: PartyInventory | undefined,
): PartyInventory {
  const capacity = Math.max(
    0,
    Math.floor(inventory?.capacity ?? STARTING_INVENTORY_CAPACITY),
  );
  const rawSlots = Array.isArray(inventory?.slots) ? inventory.slots : [];
  const shouldUseFixedSlots =
    rawSlots.some((slot) => typeof slot.slotIndex === "number") ||
    Boolean(inventory?.lockedSlotIndices?.length);
  const lockedSlotIndices = normalizeSlotIndices(
    inventory?.lockedSlotIndices,
    capacity,
  );
  const usedIndices = new Set<number>();
  const slots: InventorySlot[] = [];

  for (const [fallbackIndex, rawSlot] of rawSlots.entries()) {
    if (!rawSlot || rawSlot.quantity <= 0 || !getItemDefinition(rawSlot.itemId)) {
      continue;
    }

    const candidateIndex = shouldUseFixedSlots
      ? getInventorySlotIndex(rawSlot, fallbackIndex)
      : fallbackIndex;
    const slotIndex = getFirstUsableSlotIndex(
      candidateIndex,
      usedIndices,
      capacity,
    );

    if (slotIndex === null) {
      continue;
    }

    usedIndices.add(slotIndex);
    slots.push({
      itemId: rawSlot.itemId,
      quantity: Math.max(1, Math.floor(rawSlot.quantity)),
      ...(shouldUseFixedSlots ? { slotIndex } : {}),
    });
  }

  return {
    capacity,
    slots,
    lockedSlotIndices,
  };
}

function assignMissingSlotIndices(inventory: PartyInventory): InventorySlot[] {
  const usedIndices = new Set<number>();

  return inventory.slots.map((slot, fallbackIndex) => {
    const preferredIndex = getInventorySlotIndex(slot, fallbackIndex);
    const slotIndex =
      getFirstUsableSlotIndex(preferredIndex, usedIndices, inventory.capacity) ??
      fallbackIndex;
    usedIndices.add(slotIndex);

    return {
      ...slot,
      slotIndex,
    };
  });
}

function getFirstAvailableInventorySlotIndex(
  inventory: PartyInventory,
  options: { skipLocked: boolean },
): number | null {
  const occupiedIndices = new Set(
    inventory.slots.map((slot, fallbackIndex) =>
      getInventorySlotIndex(slot, fallbackIndex),
    ),
  );
  const lockedIndices = new Set(
    options.skipLocked ? getLockedInventorySlotIndices(inventory) : [],
  );

  for (let index = 0; index < inventory.capacity; index += 1) {
    if (!occupiedIndices.has(index) && !lockedIndices.has(index)) {
      return index;
    }
  }

  return null;
}

function getFirstUsableSlotIndex(
  preferredIndex: number,
  usedIndices: Set<number>,
  capacity: number,
): number | null {
  if (
    preferredIndex >= 0 &&
    preferredIndex < capacity &&
    !usedIndices.has(preferredIndex)
  ) {
    return preferredIndex;
  }

  for (let index = 0; index < capacity; index += 1) {
    if (!usedIndices.has(index)) {
      return index;
    }
  }

  return null;
}

function normalizeSlotIndices(
  slotIndices: number[] | undefined,
  capacity: number,
): number[] {
  return Array.from(
    new Set(
      (slotIndices ?? [])
        .map((slotIndex) => Math.floor(slotIndex))
        .filter((slotIndex) => slotIndex >= 0 && slotIndex < capacity),
    ),
  ).sort((first, second) => first - second);
}

function appendCapacityTelemetry(
  state: GameState,
  itemDefinition: ItemDefinition,
  source: InventoryMutationSource,
): GameState {
  return appendInventoryTelemetry(state, itemDefinition, source, {
    type: "inventory_capacity_checked",
  });
}

function appendInventoryTelemetry(
  state: GameState,
  itemDefinition: ItemDefinition,
  source: InventoryMutationSource,
  event: {
    type:
      | "item_add_attempt"
      | "item_added"
      | "item_add_partial"
      | "item_add_failed_full"
      | "item_removed"
      | "inventory_stack_created"
      | "inventory_stack_updated"
      | "inventory_capacity_checked";
    requestedQuantity?: number;
    addedQuantity?: number;
    removedQuantity?: number;
    overflowQuantity?: number;
    slotIndex?: number;
    stackQuantityBefore?: number;
    stackQuantityAfter?: number;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    ...event,
    entityId: INVENTORY_TELEMETRY_ENTITY_ID,
    itemId: itemDefinition.id,
    itemCategory: itemDefinition.category,
    inventoryUsedSlots: getUsedInventorySlots(state.inventory),
    inventoryCapacity: state.inventory.capacity,
    source,
  });
}
