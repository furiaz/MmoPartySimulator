export type GameMenuTab =
  | "party"
  | "partyManagement"
  | "inventory"
  | "atlas"
  | "world"
  | "options";

export type AtlasSubpage =
  | "quests"
  | "crafts"
  | "bank"
  | "guildTavern"
  | "afkEstimate";

export type PartyMenuSection =
  | "stats"
  | "equipment"
  | "skills"
  | "skillPreferences";

export type PartyManagementSection =
  | "role"
  | "partyOrder"
  | "formation"
  | "behaviorSettings";

export type PartyShortcutTarget = PartyMenuSection;
