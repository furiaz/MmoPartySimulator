import type { NpcEntity } from "./game/types";
import { GUILD_TAVERN_INTERACTION_RANGE } from "./game/guildTavern";

export const questGiverInteractionRange = 2;
export const merchantInteractionRange = 2;
export const bankInteractionRange = 2;
export const guildTavernInteractionRange = GUILD_TAVERN_INTERACTION_RANGE;
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

  if (
    npc.npcRole === "guild_coordinator" ||
    npc.npcRole === "tavern_keeper"
  ) {
    return guildTavernInteractionRange;
  }

  return defaultNpcInteractionRange;
}
