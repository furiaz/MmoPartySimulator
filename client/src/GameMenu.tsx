import { InventoryPanel } from "./InventoryPanel";
import { QuestsPanel } from "./QuestPanels";
import { WorldPanel } from "./WorldPanel";
import { BankPanel } from "./BankPanel";
import { GuildTavernPanel } from "./GuildTavernPanel";
import type {
  AtlasSubpage,
  GameMenuTab,
  PartyManagementSection,
  PartyMenuSection,
} from "./gameMenuTypes";
import { CraftingPanel } from "./CraftingPanel";
import {
  PartyManagementPanel,
  PartyMenuPanel,
} from "./CompanionPanels";
import type {
  Companion,
  GameState,
  PartyInventory,
  PartyWallet,
  PartyMemberRole,
  EquipmentSlot,
  ItemId,
  QuestId,
  DebugMapId,
  PrimaryStatId,
  SkillId,
  CraftingRecipeId,
  GuildRecruitUpgradeId,
  GuildRosterSlotRef,
} from "./game";

export function GameMenu({
  activeTab,
  activeAtlasSubpage,
  activeManagementSection,
  activePartySection,
  gameState,
  inventory,
  wallet,
  leaderId,
  members,
  currentTime,
  quests,
  currentMapId,
  skillBookReadMessage,
  worldTravelTargetMapId,
  selectedCompanionId,
  selectedQuestId,
  craftingResultMessage,
  guildRecruitResultMessage,
  guildUpgradeResultMessage,
  guildNoticeBoardResultMessage,
  guildSecondaryPartyResultMessage,
  canUseGuildTavern,
  highestCharacterLevelEver,
  onAllocateStatPoint,
  onChangeLeader,
  onChangeRole,
  onAssignFood,
  onChangeConsumableBehavior,
  onChangeSkillBehavior,
  onEquipEquipment,
  onEquipFlask,
  onOpenEquipmentManagement,
  onReadSkillBook,
  onSetLegacySkillEnabled,
  onSelectCompanion,
  onSelectManagementSection,
  onSelectPartySection,
  onSelectAtlasSubpage,
  onSelectQuest,
  onSelectTab,
  onCraftRecipe,
  onRecruitGuildCandidate,
  onPurchaseGuildRecruitUpgrade,
  onOpenGuildNoticeBoard,
  onTakeGuildNoticeBoardQuest,
  onCancelGuildNoticeBoardQuest,
  onMoveGuildRosterCompanion,
  onSetWorldTravelRoute,
  onClearWorldTravelRoute,
  onTeleportWorldTravelDestination,
  onUnequipEquipment,
  onUnequipFlask,
  onMovePartyOrder,
  saveStatusMessage,
  onExportSave,
  onImportSaveFile,
  onManualSave,
}: {
  activeTab: GameMenuTab | null;
  activeAtlasSubpage: AtlasSubpage;
  activeManagementSection: PartyManagementSection;
  activePartySection: PartyMenuSection;
  gameState: GameState;
  inventory: PartyInventory;
  wallet: PartyWallet;
  leaderId: string;
  members: Companion[];
  currentTime: number;
  quests: GameState["quests"];
  currentMapId?: DebugMapId;
  skillBookReadMessage?: string | null;
  worldTravelTargetMapId: DebugMapId | null;
  selectedCompanionId: string | null;
  selectedQuestId: QuestId | null;
  craftingResultMessage?: string | null;
  guildRecruitResultMessage?: string | null;
  guildUpgradeResultMessage?: string | null;
  guildNoticeBoardResultMessage?: string | null;
  guildSecondaryPartyResultMessage?: string | null;
  canUseGuildTavern: boolean;
  highestCharacterLevelEver: number;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onChangeLeader: (companionId: string) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onAssignFood: (companionId: string, itemId: ItemId | null) => void;
  onChangeConsumableBehavior: (
    companionId: string,
    update: Partial<Companion["consumableBehavior"]>,
  ) => void;
  onChangeSkillBehavior: (
    companionId: string,
    update: Partial<Companion["skillBehavior"]>,
  ) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onOpenEquipmentManagement: () => void;
  onReadSkillBook: (companionId: string, itemId: ItemId) => void;
  onSetLegacySkillEnabled: (
    companionId: string,
    skillId: SkillId,
    enabled: boolean,
  ) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectManagementSection: (section: PartyManagementSection) => void;
  onSelectPartySection: (section: PartyMenuSection) => void;
  onSelectAtlasSubpage: (subpage: AtlasSubpage) => void;
  onSelectQuest: (questId: QuestId) => void;
  onSelectTab: (tab: GameMenuTab | null) => void;
  onCraftRecipe: (recipeId: CraftingRecipeId) => void;
  onRecruitGuildCandidate: (candidateId?: string) => void;
  onPurchaseGuildRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onOpenGuildNoticeBoard: () => void;
  onTakeGuildNoticeBoardQuest: () => void;
  onCancelGuildNoticeBoardQuest: () => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onSetWorldTravelRoute: (targetMapId: DebugMapId) => void;
  onClearWorldTravelRoute: () => void;
  onTeleportWorldTravelDestination: (targetMapId: DebugMapId) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
  saveStatusMessage: string | null;
  onExportSave: () => void;
  onImportSaveFile: (file: File) => void | Promise<void>;
  onManualSave: () => void;
}) {
  return (
    <aside
      className={`game-menu-panel${
        activeTab === "atlas" && activeAtlasSubpage === "bank"
          ? " bank-menu-panel"
          : ""
      }${
        activeTab === "atlas" && activeAtlasSubpage === "guildTavern"
          ? " guild-tavern-menu-panel"
          : ""
      }`}
      aria-label="Game menu"
    >
          <nav className="game-menu-tabs" aria-label="Menu sections">
            <button
              className={activeTab === "party" ? "active" : ""}
              onClick={() => onSelectTab("party")}
              type="button"
            >
              Party
            </button>
            <button
              className={activeTab === "partyManagement" ? "active" : ""}
              onClick={() => onSelectTab("partyManagement")}
              type="button"
            >
              Party Management
            </button>
            <button
              className={activeTab === "inventory" ? "active" : ""}
              onClick={() => onSelectTab("inventory")}
              type="button"
            >
              Inventory
            </button>
            <button
              className={activeTab === "atlas" ? "active" : ""}
              onClick={() => onSelectTab("atlas")}
              type="button"
            >
              Atlas
            </button>
            <button
              className={activeTab === "world" ? "active" : ""}
              onClick={() => onSelectTab("world")}
              type="button"
            >
              World Travel
            </button>
            <button
              className={activeTab === "options" ? "active" : ""}
              onClick={() => onSelectTab("options")}
              type="button"
            >
              Options
            </button>
          </nav>
          {activeTab ? (
            <div className="game-menu-content">
              {activeTab === "party" ? (
                <PartyMenuPanel
                  activeSection={activePartySection}
                  inventory={inventory}
                  gameState={gameState}
                  members={members}
                  currentTime={currentTime}
                  selectedCompanionId={selectedCompanionId}
                  highestCharacterLevelEver={highestCharacterLevelEver}
                  onAllocateStatPoint={onAllocateStatPoint}
                  onAssignFood={onAssignFood}
                  onChangeSkillBehavior={onChangeSkillBehavior}
                  onEquipEquipment={onEquipEquipment}
                  onEquipFlask={onEquipFlask}
                  onSetLegacySkillEnabled={onSetLegacySkillEnabled}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectPartySection}
                  onUnequipEquipment={onUnequipEquipment}
                  onUnequipFlask={onUnequipFlask}
                />
              ) : activeTab === "partyManagement" ? (
                <PartyManagementPanel
                  activeSection={activeManagementSection}
                  currentTime={currentTime}
                  leaderId={leaderId}
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  highestCharacterLevelEver={highestCharacterLevelEver}
                  onChangeLeader={onChangeLeader}
                  onChangeConsumableBehavior={onChangeConsumableBehavior}
                  onChangeRole={onChangeRole}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectManagementSection}
                  onMovePartyOrder={onMovePartyOrder}
                />
              ) : activeTab === "inventory" ? (
                <InventoryPanel
                  inventory={inventory}
                  gameState={gameState}
                  members={members}
                  quests={quests}
                  skillBookReadMessage={skillBookReadMessage}
                  wallet={wallet}
                  onReadSkillBook={onReadSkillBook}
                  onOpenEquipmentManagement={onOpenEquipmentManagement}
                />
              ) : activeTab === "atlas" ? (
                <AtlasPanel
                  activeSubpage={activeAtlasSubpage}
                  craftingResultMessage={craftingResultMessage}
                  currentTime={currentTime}
                  guildRecruitResultMessage={guildRecruitResultMessage}
                  guildUpgradeResultMessage={guildUpgradeResultMessage}
                  guildNoticeBoardResultMessage={guildNoticeBoardResultMessage}
                  guildSecondaryPartyResultMessage={guildSecondaryPartyResultMessage}
                  canUseGuildTavern={canUseGuildTavern}
                  gameState={gameState}
                  quests={quests}
                  selectedQuestId={selectedQuestId}
                  onCraftRecipe={onCraftRecipe}
                  onRecruitGuildCandidate={onRecruitGuildCandidate}
                  onPurchaseGuildRecruitUpgrade={onPurchaseGuildRecruitUpgrade}
                  onOpenGuildNoticeBoard={onOpenGuildNoticeBoard}
                  onTakeGuildNoticeBoardQuest={onTakeGuildNoticeBoardQuest}
                  onCancelGuildNoticeBoardQuest={onCancelGuildNoticeBoardQuest}
                  onMoveGuildRosterCompanion={onMoveGuildRosterCompanion}
                  onSelectQuest={onSelectQuest}
                  onSelectSubpage={onSelectAtlasSubpage}
                />
              ) : activeTab === "world" ? (
                <WorldPanel
                  currentMapId={currentMapId}
                  gameState={gameState}
                  worldTravelTargetMapId={worldTravelTargetMapId}
                  onClearRoute={onClearWorldTravelRoute}
                  onSetRoute={onSetWorldTravelRoute}
                  onTeleport={onTeleportWorldTravelDestination}
                />
              ) : (
                <OptionsPanel
                  saveStatusMessage={saveStatusMessage}
                  onExportSave={onExportSave}
                  onImportSaveFile={onImportSaveFile}
                  onManualSave={onManualSave}
                />
              )}
            </div>
          ) : null}
    </aside>
  );
}

function AtlasPanel({
  activeSubpage,
  craftingResultMessage,
  currentTime,
  guildRecruitResultMessage,
  guildUpgradeResultMessage,
  guildNoticeBoardResultMessage,
  guildSecondaryPartyResultMessage,
  canUseGuildTavern,
  gameState,
  quests,
  selectedQuestId,
  onCraftRecipe,
  onRecruitGuildCandidate,
  onPurchaseGuildRecruitUpgrade,
  onOpenGuildNoticeBoard,
  onTakeGuildNoticeBoardQuest,
  onCancelGuildNoticeBoardQuest,
  onMoveGuildRosterCompanion,
  onSelectQuest,
  onSelectSubpage,
}: {
  activeSubpage: AtlasSubpage;
  craftingResultMessage?: string | null;
  currentTime: number;
  guildRecruitResultMessage?: string | null;
  guildUpgradeResultMessage?: string | null;
  guildNoticeBoardResultMessage?: string | null;
  guildSecondaryPartyResultMessage?: string | null;
  canUseGuildTavern: boolean;
  gameState: GameState;
  quests: GameState["quests"];
  selectedQuestId: QuestId | null;
  onCraftRecipe: (recipeId: CraftingRecipeId) => void;
  onRecruitGuildCandidate: (candidateId?: string) => void;
  onPurchaseGuildRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onOpenGuildNoticeBoard: () => void;
  onTakeGuildNoticeBoardQuest: () => void;
  onCancelGuildNoticeBoardQuest: () => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onSelectQuest: (questId: QuestId) => void;
  onSelectSubpage: (subpage: AtlasSubpage) => void;
}) {
  return (
    <section className="atlas-panel" aria-label="Atlas">
      <nav className="atlas-subtabs" aria-label="Atlas pages">
        <button
          className={activeSubpage === "quests" ? "active" : ""}
          onClick={() => onSelectSubpage("quests")}
          type="button"
        >
          Quests
        </button>
        <button
          className={activeSubpage === "crafts" ? "active" : ""}
          onClick={() => onSelectSubpage("crafts")}
          type="button"
        >
          Crafts
        </button>
        <button
          className={activeSubpage === "bank" ? "active" : ""}
          onClick={() => onSelectSubpage("bank")}
          type="button"
        >
          Bank
        </button>
        <button
          className={activeSubpage === "guildTavern" ? "active" : ""}
          onClick={() => onSelectSubpage("guildTavern")}
          type="button"
        >
          Guild & Inn
        </button>
      </nav>
      {activeSubpage === "quests" ? (
        <QuestsPanel
          currentTime={currentTime}
          state={gameState}
          quests={quests}
          selectedQuestId={selectedQuestId}
          onSelectQuest={onSelectQuest}
        />
      ) : activeSubpage === "crafts" ? (
        <CraftingPanel
          resultMessage={craftingResultMessage}
          state={gameState}
          onCraft={onCraftRecipe}
        />
      ) : activeSubpage === "bank" ? (
        <BankPanel
          canManage={false}
          state={gameState}
        />
      ) : (
        <GuildTavernPanel
          canUse={canUseGuildTavern}
          currentTime={currentTime}
          recruitResultMessage={guildRecruitResultMessage}
          upgradeResultMessage={guildUpgradeResultMessage}
          noticeBoardResultMessage={guildNoticeBoardResultMessage}
          secondaryPartyResultMessage={guildSecondaryPartyResultMessage}
          state={gameState}
          onCancelNoticeBoardQuest={onCancelGuildNoticeBoardQuest}
          onMoveGuildRosterCompanion={onMoveGuildRosterCompanion}
          onOpenNoticeBoard={onOpenGuildNoticeBoard}
          onPurchaseRecruitUpgrade={onPurchaseGuildRecruitUpgrade}
          onRecruit={onRecruitGuildCandidate}
          onTakeNoticeBoardQuest={onTakeGuildNoticeBoardQuest}
        />
      )}
    </section>
  );
}

function OptionsPanel({
  saveStatusMessage,
  onExportSave,
  onImportSaveFile,
  onManualSave,
}: {
  saveStatusMessage: string | null;
  onExportSave: () => void;
  onImportSaveFile: (file: File) => void | Promise<void>;
  onManualSave: () => void;
}) {
  return (
    <section className="options-panel" aria-label="Options">
      <div className="options-actions">
        <button onClick={onManualSave} type="button">
          Manual Save
        </button>
        <button onClick={onExportSave} type="button">
          Export Save
        </button>
        <label className="import-save-button">
          Import Save
          <input
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];

              if (file) {
                void onImportSaveFile(file);
              }

              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <p className="options-save-status">
        {saveStatusMessage ?? "Autosave ready."}
      </p>
    </section>
  );
}
