import { describe, expect, it } from "vitest";
import { createDebugMap, HUB_MAP_ID } from "./debugMap";
import {
  TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
  awardKeyItem,
  awardKeyItemIfMissing,
  getKeyItemQuantity,
  getOwnedKeyItemEntries,
  hasKeyItem,
} from "./keyItems";
import { restoreGameStateFromSave, SAVE_VERSION } from "./saveGame";
import { createTestGameState } from "./testState";

describe("key items", () => {
  it("awards and stacks slotless key item quantities", () => {
    const state = createTestGameState();

    const firstAward = awardKeyItem(
      state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    );
    const secondAward = awardKeyItem(
      firstAward.state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
      2,
    );

    expect(firstAward.awardedQuantity).toBe(1);
    expect(secondAward.newQuantity).toBe(3);
    expect(getKeyItemQuantity(
      secondAward.state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    )).toBe(3);
    expect(hasKeyItem(
      secondAward.state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    )).toBe(true);
    expect(secondAward.state.inventory.slots).toEqual([]);
  });

  it("can award a key item only when missing", () => {
    const state = awardKeyItem(
      createTestGameState(),
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    ).state;

    const duplicate = awardKeyItemIfMissing(
      state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    );

    expect(duplicate.awardedQuantity).toBe(0);
    expect(duplicate.state).toBe(state);
    expect(getOwnedKeyItemEntries(duplicate.state)).toHaveLength(1);
  });

  it("restores old saves with empty key item state", () => {
    const stateWithoutKeyItems = createTestGameState({
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      partyLeaderId: "leader",
    });
    const restored = restoreGameStateFromSave({
      saveVersion: SAVE_VERSION,
      savedAtMs: 1000,
      state: {
        ...stateWithoutKeyItems,
        keyItemsById: undefined,
      },
    });

    expect(restored.ok).toBe(true);

    if (restored.ok) {
      expect(restored.state.keyItemsById).toEqual({});
    }
  });
});
