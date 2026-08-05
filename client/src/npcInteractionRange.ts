import type { NpcEntity } from "./game/types";

export const questGiverInteractionRange = 2;
export const merchantInteractionRange = 2;
export const bankInteractionRange = 2;
export const defaultNpcInteractionRange = 1.5;

export function getNpcInteractionRange(
  npc: Pick<NpcEntity, "npcRole">,
): number {
  if (npc.npcRole === "quest_giver" || npc.npcRole === "class_mentor") {
    return questGiverInteractionRange;
  }

  if (npc.npcRole === "merchant" || npc.npcRole === "smith") {
    return merchantInteractionRange;
  }

  if (npc.npcRole === "bank_chest") {
    return bankInteractionRange;
  }

  return defaultNpcInteractionRange;
}
