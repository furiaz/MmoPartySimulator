import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import {
  CLASS_DEFINITIONS,
  getGuildNoticeBoardRerollDisplayState,
  getGuildNoticeBoardRewardPercent,
  getGuildRecruitDestination,
  getGuildRecruitState,
  getGuildNoticeBoardUpgradeStatuses,
  getGuildRecruitUpgradeStatuses,
  getGuildNoticeBoardState,
  getActiveCompanions,
  getCurrencyBalance,
  getEnemyType,
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartyDispatchDestinations,
  getGuildSecondaryPartyDispatchPreview,
  getGuildSecondaryPartyDispatchDurationMs,
  getGuildSecondaryPartyUpgradeStatuses,
  getGuildCompanionCapacity,
  getGuildSecondaryPartiesState,
  getInnReserveCompanions,
  getItemDefinition,
  getPartySizeLimit,
  getPartySizeUnlockRequirement,
  getRestingCompanions,
  getTotalRosterCompanionCount,
  getTotalRosterCompanionLevel,
  SKILL_DEFINITIONS,
  type Companion,
  type GuildRecruitCandidate,
  type GuildNoticeBoardUpgradeId,
  type GuildRecruitUpgradeId,
  type GuildSecondaryPartyDispatchResult,
  type GuildSecondaryParty,
  type GuildSecondaryPartyDispatchState,
  type GuildSecondaryPartyUpgradeId,
  type GuildRosterSlotRef,
  type GuildNoticeBoardQuest,
  type DebugMapId,
  type GameState,
  type ItemId,
  type PartyMemberRole,
  type ResourceType,
} from "./game";
import SpriteAnimation from "./SpriteAnimation";
import { getClassIdleFrameSrc, getEnemyWalkingAnimation } from "./visualAssets";

type GuildTavernSection = "guild" | "inn";
type GuildView =
  | "hall"
  | "recruit"
  | "noticeBoard"
  | "secondaryParties"
  | "recruitUpgrades"
  | "noticeBoardUpgrades"
  | "secondaryPartyUpgrades";

const MAX_MAIN_PARTY_SLOTS = 5;
const innActions = ["Rooms", "Kitchen"];

export type GuildSecondaryPartyAccomplishedSummary = {
  partyName: string;
  mapName: string;
  subzoneName: string;
  durationMs: number;
  experienceEfficiency: number;
  dropEfficiency: number;
  result: GuildSecondaryPartyDispatchResult;
};

export function GuildTavernPanel({
  canUse,
  currentTime,
  recruitResultMessage,
  upgradeResultMessage,
  noticeBoardResultMessage,
  secondaryPartyResultMessage,
  state,
  onCancelNoticeBoardQuest,
  onMoveGuildRosterCompanion,
  onOpenNoticeBoard,
  onPurchaseNoticeBoardUpgrade,
  onPurchaseRecruitUpgrade,
  onPurchaseSecondaryPartyUpgrade,
  onRecruit,
  onRerollNoticeBoard,
  onTakeNoticeBoardQuest,
  onDispatchSecondaryParty,
  onClaimSecondaryPartyDispatch,
  onCancelSecondaryPartyDispatch,
  onClearSecondaryPartySummary,
  secondaryPartyAccomplishedSummary,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  upgradeResultMessage?: string | null;
  noticeBoardResultMessage?: string | null;
  secondaryPartyResultMessage?: string | null;
  secondaryPartyAccomplishedSummary?: GuildSecondaryPartyAccomplishedSummary | null;
  state: GameState;
  onCancelNoticeBoardQuest: (slotIndex?: number) => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onOpenNoticeBoard: () => void;
  onPurchaseNoticeBoardUpgrade: (upgradeId: GuildNoticeBoardUpgradeId) => void;
  onPurchaseRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onPurchaseSecondaryPartyUpgrade: (
    upgradeId: GuildSecondaryPartyUpgradeId,
    partyId?: string | null,
  ) => void;
  onRecruit: (candidateId?: string) => void;
  onRerollNoticeBoard: () => void;
  onTakeNoticeBoardQuest: (slotIndex?: number) => void;
  onDispatchSecondaryParty: (
    partyId: string,
    mapId: DebugMapId,
    subzoneId: string,
    durationMs: number,
  ) => void;
  onClaimSecondaryPartyDispatch: (partyId: string) => void;
  onCancelSecondaryPartyDispatch: (partyId: string) => void;
  onClearSecondaryPartySummary: () => void;
}) {
  const [activeSection, setActiveSection] =
    useState<GuildTavernSection>("guild");
  const [guildView, setGuildView] = useState<GuildView>("hall");
  const [selectedRosterCompanionId, setSelectedRosterCompanionId] =
    useState<string | null>(null);
  const activeCompanions = getActiveCompanions(state);
  const partySizeLimit = getPartySizeLimit(state);
  const rosterCapacity = getGuildCompanionCapacity();
  const rosterCount = getTotalRosterCompanionCount(state);
  const totalRosterLevel = getTotalRosterCompanionLevel(state);
  const actionStatus = canUse ? "Coming soon" : "Requires Guild & Inn";
  const guildRecruit = getGuildRecruitState(state, currentTime);
  const readyRecruitCount = guildRecruit.candidates.filter(Boolean).length;
  const recruitButtonStatus = canUse
    ? readyRecruitCount > 0
      ? "Ready"
      : "Waiting"
    : "Requires Guild & Inn";
  const recruitButtonCountdown = formatRecruitButtonCountdown(
    guildRecruit.nextRefreshAtMs,
    currentTime,
  );
  const noticeBoard = getGuildNoticeBoardState(state, currentTime);
  const noticeBoardQuest = noticeBoard.slots[0] ?? null;
  const noticeBoardButtonCountdown = formatRecruitButtonCountdown(
    noticeBoard.nextRefreshAtMs,
    currentTime,
  );
  const noticeBoardButtonStatus = canUse
    ? getNoticeBoardButtonStatus(noticeBoardQuest)
    : "Requires Guild & Inn";

  function showPreviousSection() {
    setActiveSection((section) => (section === "guild" ? "inn" : "guild"));
    setGuildView("hall");
  }

  function showNextSection() {
    setActiveSection((section) => (section === "guild" ? "inn" : "guild"));
    setGuildView("hall");
  }

  return (
    <section className="guild-tavern-panel" aria-label="Guild and Inn">
      <div className="guild-tavern-header">
        <div>
          <h2>Guild & Inn</h2>
          <span>{canUse ? "Nearby" : "Reference only"}</span>
        </div>
        <dl>
          <div>
            <dt>Active</dt>
            <dd>
              {activeCompanions.length}/{partySizeLimit}
            </dd>
          </div>
          <div>
            <dt>Companions</dt>
            <dd>
              {rosterCount}/{rosterCapacity}
            </dd>
          </div>
          <div>
            <dt>Total Level</dt>
            <dd>
              {totalRosterLevel}
            </dd>
          </div>
        </dl>
      </div>

      <div className="guild-tavern-section-nav">
        <button
          aria-label="Previous Guild or Inn section"
          onClick={showPreviousSection}
          type="button"
        >
          &lt;
        </button>
        <strong>{activeSection === "guild" ? "Guild" : "Inn"}</strong>
        <button
          aria-label="Next Guild or Inn section"
          onClick={showNextSection}
          type="button"
        >
          &gt;
        </button>
      </div>

      {activeSection === "guild" && guildView === "recruit" ? (
        <GuildRecruitView
          canUse={canUse}
          currentTime={currentTime}
          recruitResultMessage={recruitResultMessage}
          state={state}
          onBack={() => setGuildView("hall")}
          onOpenUpgrades={() => setGuildView("recruitUpgrades")}
          onRecruit={onRecruit}
        />
      ) : activeSection === "guild" && guildView === "noticeBoard" ? (
        <GuildNoticeBoardView
          canUse={canUse}
          currentTime={currentTime}
          noticeBoardResultMessage={noticeBoardResultMessage}
          state={state}
          onBack={() => setGuildView("hall")}
          onCancelQuest={onCancelNoticeBoardQuest}
          onOpenUpgrades={() => setGuildView("noticeBoardUpgrades")}
          onReroll={onRerollNoticeBoard}
          onTakeQuest={onTakeNoticeBoardQuest}
        />
      ) : activeSection === "guild" && guildView === "secondaryParties" ? (
        <GuildSecondaryPartiesView
          canUse={canUse}
          resultMessage={secondaryPartyResultMessage}
          accomplishedSummary={secondaryPartyAccomplishedSummary}
          currentTime={currentTime}
          selectedCompanionId={selectedRosterCompanionId}
          state={state}
          onBack={() => setGuildView("hall")}
          onCancelDispatch={onCancelSecondaryPartyDispatch}
          onClaimDispatch={onClaimSecondaryPartyDispatch}
          onClearSummary={onClearSecondaryPartySummary}
          onDispatch={onDispatchSecondaryParty}
          onMoveCompanion={onMoveGuildRosterCompanion}
          onOpenUpgrades={() => setGuildView("secondaryPartyUpgrades")}
          onSelectCompanion={setSelectedRosterCompanionId}
        />
      ) : activeSection === "guild" && guildView === "recruitUpgrades" ? (
        <GuildRecruitUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("recruit")}
          onPurchase={onPurchaseRecruitUpgrade}
        />
      ) : activeSection === "guild" && guildView === "noticeBoardUpgrades" ? (
        <GuildNoticeBoardUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("noticeBoard")}
          onPurchase={onPurchaseNoticeBoardUpgrade}
        />
      ) : activeSection === "guild" && guildView === "secondaryPartyUpgrades" ? (
        <GuildSecondaryPartyUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("secondaryParties")}
          onPurchase={onPurchaseSecondaryPartyUpgrade}
        />
      ) : (
        <div className="guild-tavern-section">
          <div className="guild-tavern-service-portrait" aria-hidden="true">
            <img
              alt=""
              src={
                activeSection === "guild"
                  ? "/assets/Generated/guild-tavern/guild-coordinator.png"
                  : "/assets/Generated/guild-tavern/tavern-keeper.png"
              }
            />
          </div>
          <div className="guild-tavern-service-actions">
            <h3>
              {activeSection === "guild" ? "Guild Hall" : "Inn Hearth"}
            </h3>
            <div>
              {activeSection === "guild" ? (
                <>
                  <button
                    disabled={!canUse}
                    onClick={() => setGuildView("recruit")}
                    type="button"
                  >
                    <span>Recruit</span>
                    <span className="guild-recruit-button-timer">
                      {recruitButtonCountdown}
                    </span>
                    <small>{recruitButtonStatus}</small>
                  </button>
                  <button
                    disabled={!canUse}
                    onClick={() => {
                      onOpenNoticeBoard();
                      setGuildView("noticeBoard");
                    }}
                    type="button"
                  >
                    <span>Notice Board</span>
                    <span className="guild-recruit-button-timer">
                      {noticeBoardButtonCountdown}
                    </span>
                    <small>{noticeBoardButtonStatus}</small>
                  </button>
                  <button
                    disabled={!canUse}
                    onClick={() => setGuildView("secondaryParties")}
                    type="button"
                  >
                    <span>Secondary Parties</span>
                    <small>{canUse ? "Ready" : actionStatus}</small>
                  </button>
                </>
              ) : (
                <>
                  {innActions.map((action) => (
                    <button disabled key={action} type="button">
                      <span>{action}</span>
                      <small>{actionStatus}</small>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GuildRecruitView({
  canUse,
  currentTime,
  recruitResultMessage,
  state,
  onBack,
  onOpenUpgrades,
  onRecruit,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onOpenUpgrades: () => void;
  onRecruit: (candidateId?: string) => void;
}) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const guildRecruit = getGuildRecruitState(state, currentTime);
  const candidates = guildRecruit.candidates;
  const candidate =
    candidates.find((item) => item?.id === selectedCandidateId) ??
    candidates.find(Boolean) ??
    null;
  const destination = getGuildRecruitDestination(state);
  const classDefinition = candidate
    ? CLASS_DEFINITIONS[candidate.classId]
    : null;
  const idleFrameSrc = candidate
    ? getClassIdleFrameSrc(candidate.classId)
    : null;
  const recruitDisabled = !canUse || !candidate || destination === "blocked_full";
  const blockedText = !canUse
    ? "Requires Guild & Inn"
    : !candidate
      ? `Next recruit in ${formatRecruitCountdown(
          guildRecruit.nextRefreshAtMs,
          currentTime,
        )}`
      : destination === "blocked_full"
        ? "No active slot or Inn room."
        : null;

  return (
    <div className="guild-recruit-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button disabled={!canUse} onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>

      <div className="guild-recruit-card">
        <div className="guild-recruit-slot-list" aria-label="Recruit slots">
          {candidates.map((slotCandidate, index) => (
            <button
              className={
                candidate?.id === slotCandidate?.id
                  ? "guild-recruit-slot selected"
                  : "guild-recruit-slot"
              }
              disabled={!slotCandidate}
              key={slotCandidate?.id ?? `empty-${index}`}
              onClick={() => setSelectedCandidateId(slotCandidate?.id ?? null)}
              type="button"
            >
              <strong>Slot {index + 1}</strong>
              <span>
                {slotCandidate
                  ? `Lv ${slotCandidate.characterLevel} ${
                      CLASS_DEFINITIONS[slotCandidate.classId]?.displayName ??
                      slotCandidate.classId
                    }`
                  : "Empty"}
              </span>
              <small>
                {slotCandidate
                  ? "Available"
                  : `Refresh ${formatRecruitCountdown(
                      guildRecruit.nextRefreshAtMs,
                      currentTime,
                    )}`}
              </small>
            </button>
          ))}
        </div>

        <div className="guild-recruit-details">
          <span className="guild-recruit-kicker">Available Recruit</span>
          {candidate && classDefinition ? (
            <>
              <h3>
                Level {candidate.characterLevel} {classDefinition.displayName}
              </h3>
              <dl>
                <div>
                  <dt>Role</dt>
                  <dd>None / Unassigned</dd>
                </div>
                <div>
                  <dt>Gear</dt>
                  <dd>{formatCandidateGear(candidate)}</dd>
                </div>
                <div>
                  <dt>Skills</dt>
                  <dd>{formatCandidateSkills(candidate)}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{getDestinationLabel(destination)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <h3>No recruit available</h3>
              <p>
                Next recruit in{" "}
                {formatRecruitCountdown(guildRecruit.nextRefreshAtMs, currentTime)}.
              </p>
            </>
          )}
          {blockedText ? <p className="guild-recruit-message">{blockedText}</p> : null}
          {recruitResultMessage ? (
            <p className="guild-recruit-message">{recruitResultMessage}</p>
          ) : null}
          <button
            disabled={recruitDisabled}
            onClick={() => {
              if (candidate) {
                onRecruit(candidate.id);
              }
            }}
            type="button"
          >
            Recruit
          </button>
        </div>

        <div className="guild-recruit-sprite-frame" aria-hidden={!idleFrameSrc}>
          {idleFrameSrc ? (
            <img
              alt={`${classDefinition?.displayName ?? "Recruit"} idle sprite`}
              src={idleFrameSrc}
            />
          ) : (
            <span>Waiting</span>
          )}
        </div>
      </div>
    </div>
  );
}

function GuildNoticeBoardView({
  canUse,
  currentTime,
  noticeBoardResultMessage,
  state,
  onBack,
  onCancelQuest,
  onOpenUpgrades,
  onReroll,
  onTakeQuest,
}: {
  canUse: boolean;
  currentTime: number;
  noticeBoardResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onCancelQuest: (slotIndex?: number) => void;
  onOpenUpgrades: () => void;
  onReroll: () => void;
  onTakeQuest: (slotIndex?: number) => void;
}) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const board = getGuildNoticeBoardState(state, currentTime);
  const rerollState = getGuildNoticeBoardRerollDisplayState(state, currentTime);
  const quest = board.slots[selectedSlotIndex] ?? null;
  const isAvailable = quest?.status === "available";
  const isTaken = quest?.status === "taken";
  const isDone = quest?.status === "done";
  const actionDisabled = !canUse || !quest || isDone;
  const takeButtonLabel = isTaken
    ? "Taken"
    : quest && isDone
      ? getNoticeBoardQuestStatusLabel(quest)
      : "Take Quest";
  const statusText = !canUse
    ? "Requires Guild & Inn"
    : quest
      ? getNoticeBoardQuestStatusLabel(quest)
      : `Next posting in ${formatRecruitCountdown(
          board.nextRefreshAtMs,
          currentTime,
        )}`;
  const rerollDisabled = !canUse || !rerollState.isUnlocked || rerollState.remaining <= 0;

  useEffect(() => {
    if (selectedSlotIndex >= board.slots.length) {
      setSelectedSlotIndex(0);
    }
  }, [board.slots.length, selectedSlotIndex]);

  return (
    <div className="guild-notice-board-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button disabled={!canUse} onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>

      <div className="guild-notice-board-card">
        <div className="guild-notice-board-topline">
          <div>
            <span className="guild-recruit-kicker">Notice Board</span>
            <h3>Guild Postings</h3>
          </div>
          {rerollState.isUnlocked ? (
            <button
              disabled={rerollDisabled}
              onClick={onReroll}
              type="button"
            >
              Reroll {rerollState.remaining}/{rerollState.dailyLimit}
            </button>
          ) : (
            <small>Scouts locked</small>
          )}
        </div>

        {rerollState.isUnlocked ? (
          <p className="guild-recruit-message">
            Rerolls reset at {new Date(rerollState.nextResetAtMs).toLocaleTimeString()}.
          </p>
        ) : null}

        <div className="guild-notice-board-slots" aria-label="Notice Board postings">
          {board.slots.map((slot, index) => (
            <button
              className={
                selectedSlotIndex === index
                  ? "guild-notice-board-slot selected"
                  : "guild-notice-board-slot"
              }
              key={slot?.id ?? `notice-slot-${index}`}
              onClick={() => setSelectedSlotIndex(index)}
              type="button"
            >
              <strong>
                <span aria-hidden="true">!</span>
                Slot {index + 1}
              </strong>
              <span>{slot?.title ?? "No posting"}</span>
              <small>
                {slot ? getNoticeBoardQuestStatusLabel(slot) : statusText}
              </small>
            </button>
          ))}
        </div>

        {quest ? (
          <div className="guild-notice-board-detail">
            <div className="guild-notice-board-summary">
              <div>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{getNoticeBoardQuestStatusLabel(quest)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>Exterminate</dd>
                  </div>
                </dl>
              </div>
              <div className="guild-notice-board-monsters" aria-label="Quest targets">
                {quest.objectives.map((objective) => {
                  const enemyType = getEnemyType(objective.enemyTypeId);
                  const enemyDisplayName =
                    enemyType?.displayName ?? objective.enemyTypeId;
                  const animation = getEnemyWalkingAnimation(
                    objective.enemyTypeId,
                    "east",
                  );

                  return (
                    <div key={objective.id}>
                      <SpriteAnimation
                        alt={`${enemyDisplayName} walking east`}
                        animation={animation}
                        currentTime={currentTime}
                      />
                      <span>{enemyDisplayName}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="guild-notice-board-objectives">
              <strong>Objectives</strong>
              {quest.objectives.map((objective) => {
                const enemyType = getEnemyType(objective.enemyTypeId);
                const enemyDisplayName =
                  enemyType?.displayName ?? objective.enemyTypeId;
                return (
                  <span key={objective.id}>
                    Kill {enemyDisplayName}: {objective.currentCount}/
                    {objective.requiredCount}
                  </span>
                );
              })}
            </div>

            <div className="guild-notice-board-rewards">
              <strong>Rewards</strong>
              <span>{formatNoticeBoardRewards(state, quest)}</span>
            </div>

            {noticeBoardResultMessage ? (
              <p className="guild-recruit-message">{noticeBoardResultMessage}</p>
            ) : null}

            <div className="guild-notice-board-actions">
              <button
                disabled={actionDisabled || !isAvailable}
                onClick={() => onTakeQuest(selectedSlotIndex)}
                type="button"
              >
                {takeButtonLabel}
              </button>
              <button
                disabled={!canUse || !isTaken}
                onClick={() => onCancelQuest(selectedSlotIndex)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="guild-recruit-message">
            No quest is posted. Next posting in{" "}
            {formatRecruitCountdown(board.nextRefreshAtMs, currentTime)}.
          </p>
        )}
      </div>
    </div>
  );
}

function GuildRecruitUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (upgradeId: GuildRecruitUpgradeId) => void;
}) {
  const upgradeStatuses = getGuildRecruitUpgradeStatuses(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Guild Investment</span>
            <h3>Recruit Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <p className="guild-recruit-message">Requires Guild & Inn</p>
        ) : null}
        {resultMessage ? (
          <p className="guild-recruit-message">{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {upgradeStatuses.map((upgrade) => {
            const purchaseDisabled =
              !canUse ||
              upgrade.isLocked ||
              upgrade.isMaxLevel ||
              !upgrade.canAfford;
            const statusText = upgrade.isLocked
              ? upgrade.lockReason
              : upgrade.isMaxLevel
                ? "Max"
                : upgrade.canAfford
                  ? `${upgrade.nextCostCrowns} Crowns`
                  : `Need ${upgrade.nextCostCrowns} Crowns`;

            return (
              <article className="guild-upgrade-row" key={upgrade.id}>
                <div>
                  <strong>{upgrade.displayName}</strong>
                  <span>Lv {upgrade.level}</span>
                </div>
                <p>{upgrade.description}</p>
                <dl>
                  <div>
                    <dt>Current</dt>
                    <dd>{upgrade.currentEffect}</dd>
                  </div>
                  <div>
                    <dt>Next</dt>
                    <dd>{upgrade.nextEffect ?? "Max"}</dd>
                  </div>
                </dl>
                <button
                  disabled={purchaseDisabled}
                  onClick={() => onPurchase(upgrade.id)}
                  type="button"
                >
                  {statusText}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GuildNoticeBoardUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (upgradeId: GuildNoticeBoardUpgradeId) => void;
}) {
  const upgradeStatuses = getGuildNoticeBoardUpgradeStatuses(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Guild Investment</span>
            <h3>Notice Board Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <p className="guild-recruit-message">Requires Guild & Inn</p>
        ) : null}
        {resultMessage ? (
          <p className="guild-recruit-message">{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {upgradeStatuses.map((upgrade) => {
            const purchaseDisabled =
              !canUse ||
              upgrade.isLocked ||
              upgrade.isMaxLevel ||
              !upgrade.canAfford;
            const statusText = upgrade.isLocked
              ? upgrade.lockReason
              : upgrade.isMaxLevel
                ? "Max"
                : upgrade.canAfford
                  ? `${upgrade.nextCostCrowns} Crowns`
                  : `Need ${upgrade.nextCostCrowns} Crowns`;

            return (
              <article className="guild-upgrade-row" key={upgrade.id}>
                <div>
                  <strong>{upgrade.displayName}</strong>
                  <span>Lv {upgrade.level}</span>
                </div>
                <p>{upgrade.description}</p>
                <dl>
                  <div>
                    <dt>Current</dt>
                    <dd>{upgrade.currentEffect}</dd>
                  </div>
                  <div>
                    <dt>Next</dt>
                    <dd>{upgrade.nextEffect ?? "Max"}</dd>
                  </div>
                </dl>
                <button
                  disabled={purchaseDisabled}
                  onClick={() => onPurchase(upgrade.id)}
                  type="button"
                >
                  {statusText}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GuildSecondaryPartyUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (
    upgradeId: GuildSecondaryPartyUpgradeId,
    partyId?: string | null,
  ) => void;
}) {
  const crowns = getCurrencyBalance(state.wallet, "crowns");
  const partyCountStatuses = getGuildSecondaryPartyUpgradeStatuses(state);
  const secondaryParties = getGuildSecondaryPartiesState(state);
  const unlockedPartyCount = getGuildSecondaryPartyCount(state);

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Guild Investment</span>
            <h3>Secondary Party Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <p className="guild-recruit-message">Requires Guild & Inn</p>
        ) : null}
        {resultMessage ? (
          <p className="guild-recruit-message">{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {partyCountStatuses.map((upgrade) => (
            <GuildUpgradeRow
              canUse={canUse}
              key={upgrade.id}
              upgrade={upgrade}
              onPurchase={() => onPurchase(upgrade.id, upgrade.partyId)}
            />
          ))}
        </div>

        <div className="guild-secondary-upgrade-groups">
          {secondaryParties.parties.map((party, index) => {
            const isUnlocked = index < unlockedPartyCount;
            const upgradeStatuses = getGuildSecondaryPartyUpgradeStatuses(
              state,
              party.id,
            );

            return (
              <section className="guild-secondary-upgrade-group" key={party.id}>
                <div>
                  <h4>{party.displayName}</h4>
                  <small>
                    {isUnlocked ? "Unlocked" : `Unlock Secondary Party ${index + 1}`}
                  </small>
                </div>
                <div className="guild-upgrade-list">
                  {upgradeStatuses.map((upgrade) => (
                    <GuildUpgradeRow
                      canUse={canUse}
                      key={`${party.id}-${upgrade.id}`}
                      upgrade={upgrade}
                      onPurchase={() => onPurchase(upgrade.id, party.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GuildUpgradeRow({
  canUse,
  upgrade,
  onPurchase,
}: {
  canUse: boolean;
  upgrade: {
    id: string;
    displayName: string;
    description: string;
    level: number;
    currentEffect: string;
    nextEffect: string | null;
    nextCostCrowns: number | null;
    isLocked: boolean;
    isMaxLevel: boolean;
    lockReason: string | null;
    canAfford: boolean;
  };
  onPurchase: () => void;
}) {
  const purchaseDisabled =
    !canUse ||
    upgrade.isLocked ||
    upgrade.isMaxLevel ||
    !upgrade.canAfford;
  const statusText = upgrade.isLocked
    ? upgrade.lockReason
    : upgrade.isMaxLevel
      ? "Max"
      : upgrade.canAfford
        ? `${upgrade.nextCostCrowns} Crowns`
        : `Need ${upgrade.nextCostCrowns} Crowns`;

  return (
    <article className="guild-upgrade-row">
      <div>
        <strong>{upgrade.displayName}</strong>
        <span>Lv {upgrade.level}</span>
      </div>
      <p>{upgrade.description}</p>
      <dl>
        <div>
          <dt>Current</dt>
          <dd>{upgrade.currentEffect}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{upgrade.nextEffect ?? "Max"}</dd>
        </div>
      </dl>
      <button disabled={purchaseDisabled} onClick={onPurchase} type="button">
        {statusText}
      </button>
    </article>
  );
}

function GuildSecondaryPartiesView({
  canUse,
  accomplishedSummary,
  currentTime,
  resultMessage,
  selectedCompanionId,
  state,
  onBack,
  onCancelDispatch,
  onClaimDispatch,
  onClearSummary,
  onDispatch,
  onMoveCompanion,
  onOpenUpgrades,
  onSelectCompanion,
}: {
  canUse: boolean;
  accomplishedSummary?: GuildSecondaryPartyAccomplishedSummary | null;
  currentTime: number;
  resultMessage?: string | null;
  selectedCompanionId: string | null;
  state: GameState;
  onBack: () => void;
  onCancelDispatch: (partyId: string) => void;
  onClaimDispatch: (partyId: string) => void;
  onClearSummary: () => void;
  onDispatch: (
    partyId: string,
    mapId: DebugMapId,
    subzoneId: string,
    durationMs: number,
  ) => void;
  onMoveCompanion: (companionId: string, target: GuildRosterSlotRef) => void;
  onOpenUpgrades: () => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const [draggedCompanionId, setDraggedCompanionId] = useState<string | null>(
    null,
  );
  const [dispatchPartyId, setDispatchPartyId] = useState<string | null>(null);
  const [selectedDestinationKey, setSelectedDestinationKey] =
    useState<string>("");
  const [selectedDurationMs, setSelectedDurationMs] = useState(60 * 60 * 1000);
  const activeCompanions = getActiveCompanions(state).sort(compareCompanionCards);
  const innReserveCompanions = getInnReserveCompanions(state);
  const secondaryParties = getGuildSecondaryPartiesState(state);
  const unlockedPartyCount = getGuildSecondaryPartyCount(state);
  const dispatchDestinations = getGuildSecondaryPartyDispatchDestinations(state);
  const partySizeLimit = getPartySizeLimit(state);
  const rosterCapacity = getGuildCompanionCapacity();
  const rosterCount = getTotalRosterCompanionCount(state);
  const totalRosterLevel = getTotalRosterCompanionLevel(state);
  const companionsById = Object.fromEntries(
    [
      ...activeCompanions,
      ...getRestingCompanions(state),
    ].map((companion) => [companion.id, companion]),
  );
  const reserveSlotCount = innReserveCompanions.length + 1;
  const dispatchParty = dispatchPartyId
    ? secondaryParties.parties.find((party) => party.id === dispatchPartyId) ?? null
    : null;
  const selectedDestination = selectedDestinationKey
    ? parseDispatchDestinationKey(selectedDestinationKey)
    : null;
  const dispatchPreview =
    dispatchParty && selectedDestination
      ? getGuildSecondaryPartyDispatchPreview(
          state,
          dispatchParty.id,
          selectedDestination.mapId,
          selectedDestination.subzoneId,
        )
      : null;
  const maxDispatchDurationMs = dispatchParty
    ? getGuildSecondaryPartyDispatchDurationMs(state, dispatchParty.id)
    : 60 * 60 * 1000;
  const dispatchDurationOptions = createDispatchDurationOptions(
    maxDispatchDurationMs,
  );

  useEffect(() => {
    setDraggedCompanionId(null);
  }, [state]);

  useEffect(() => {
    if (!selectedDestinationKey && dispatchDestinations.length > 0) {
      const firstDestination = dispatchDestinations[0];
      setSelectedDestinationKey(
        createDispatchDestinationKey(
          firstDestination.mapId,
          firstDestination.subzoneId,
        ),
      );
    }
  }, [dispatchDestinations, selectedDestinationKey]);

  useEffect(() => {
    if (selectedDurationMs > maxDispatchDurationMs) {
      setSelectedDurationMs(maxDispatchDurationMs);
    }
  }, [maxDispatchDurationMs, selectedDurationMs]);

  useEffect(() => {
    if (selectedCompanionId && !companionsById[selectedCompanionId]) {
      onSelectCompanion(null);
    }
  }, [companionsById, onSelectCompanion, selectedCompanionId]);

  return (
    <div className="guild-roster-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button disabled={!canUse} onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>

      <div className="guild-roster-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Roster Board</span>
            <h3>Secondary Parties</h3>
          </div>
          <dl>
            <div>
              <dt>Companions</dt>
              <dd>
                {rosterCount}/{rosterCapacity}
              </dd>
            </div>
            <div>
              <dt>Total Level</dt>
              <dd>{totalRosterLevel}</dd>
            </div>
          </dl>
        </div>

        {!canUse ? (
          <p className="guild-recruit-message">Requires Guild & Inn</p>
        ) : null}
        {selectedCompanionId ? (
          <p className="guild-recruit-message">
            Selected {companionsById[selectedCompanionId]?.id ?? "companion"}. Pick a
            slot to move.
          </p>
        ) : null}
        {resultMessage ? (
          <p className="guild-recruit-message">{resultMessage}</p>
        ) : null}
        {accomplishedSummary ? (
          <div className="guild-dispatch-summary">
            <div>
              <span className="guild-recruit-kicker">Accomplished</span>
              <h4>{accomplishedSummary.partyName}</h4>
              <p>
                {accomplishedSummary.mapName} - {accomplishedSummary.subzoneName}
                {" | "}
                {formatDispatchDuration(accomplishedSummary.durationMs)}
              </p>
            </div>
            <dl>
              <div>
                <dt>EXP Eff.</dt>
                <dd>{formatDispatchMultiplier(accomplishedSummary.experienceEfficiency)}</dd>
              </div>
              <div>
                <dt>Drop Eff.</dt>
                <dd>{formatDispatchMultiplier(accomplishedSummary.dropEfficiency)}</dd>
              </div>
              <div>
                <dt>Kills</dt>
                <dd>{accomplishedSummary.result.enemyKills}</dd>
              </div>
              <div>
                <dt>XP</dt>
                <dd>{accomplishedSummary.result.xpGranted}</dd>
              </div>
            </dl>
            <p>
              Loot: {formatDispatchLoot(accomplishedSummary.result.loot)}
              {" | "}
              Resources: {formatDispatchLoot(accomplishedSummary.result.resources)}
            </p>
            <button onClick={onClearSummary} type="button">
              Continue
            </button>
          </div>
        ) : null}

        <div className="guild-roster-board">
          <RosterColumn title="Main Party">
            {Array.from({ length: MAX_MAIN_PARTY_SLOTS }, (_, index) => {
              const isLocked = index >= partySizeLimit;
              const unlockRequirement = getPartySizeUnlockRequirement(index + 1);

              return (
                <RosterSlot
                  canUse={canUse}
                  companion={activeCompanions[index] ?? null}
                  draggedCompanionId={draggedCompanionId}
                  key={`main-${index}`}
                  label={
                    isLocked && unlockRequirement
                      ? `Slot ${index + 1} - Level ${unlockRequirement}`
                      : `Slot ${index + 1}`
                  }
                  locked={isLocked}
                  selectedCompanionId={selectedCompanionId}
                  slotRef={{
                    area: "main_party",
                    slotIndex: index,
                  }}
                  onDragEnd={() => setDraggedCompanionId(null)}
                  onDragStart={setDraggedCompanionId}
                  onMoveCompanion={onMoveCompanion}
                  onSelectCompanion={onSelectCompanion}
                />
              );
            })}
          </RosterColumn>

          <RosterColumn title="Inn's Reserve">
            {Array.from({ length: reserveSlotCount }, (_, index) => (
              <RosterSlot
                canUse={canUse}
                companion={innReserveCompanions[index] ?? null}
                draggedCompanionId={draggedCompanionId}
                key={`reserve-${index}`}
                label={`Reserve ${index + 1}`}
                locked={false}
                selectedCompanionId={selectedCompanionId}
                slotRef={{
                  area: "inn_reserve",
                  slotIndex: index,
                }}
                onDragEnd={() => setDraggedCompanionId(null)}
                onDragStart={setDraggedCompanionId}
                onMoveCompanion={onMoveCompanion}
                onSelectCompanion={onSelectCompanion}
              />
            ))}
          </RosterColumn>

          {secondaryParties.parties.map((party, partyIndex) => {
            const isUnlocked = partyIndex < unlockedPartyCount;
            const displayDispatch = getDisplayDispatch(party, currentTime);
            const partyCompanionCount = party.companionIds.filter(Boolean).length;
            const isPartyLocked = Boolean(displayDispatch);

            return (
              <RosterColumn
                key={party.id}
                subtitle={
                  isUnlocked
                    ? getDispatchStatusLabel(displayDispatch, currentTime)
                    : `Unlock Secondary Party ${partyIndex + 1}`
                }
                title={party.displayName}
              >
                {Array.from({ length: MAX_MAIN_PARTY_SLOTS }, (_, index) => {
                  const isMemberSlotUnlocked = isUnlocked &&
                    index < party.companionIds.length;
                  const companionId = isMemberSlotUnlocked
                    ? party.companionIds[index]
                    : null;

                  return (
                    <RosterSlot
                      canUse={canUse && !isPartyLocked}
                      companion={companionId ? companionsById[companionId] ?? null : null}
                      draggedCompanionId={draggedCompanionId}
                      key={`${party.id}-${index}`}
                      label={`Slot ${index + 1}`}
                      locked={!isMemberSlotUnlocked || isPartyLocked}
                      lockedText={
                        isPartyLocked
                          ? "Dispatched"
                          : isUnlocked
                            ? "Upgrade"
                            : "Locked"
                      }
                      selectedCompanionId={selectedCompanionId}
                      slotRef={{
                        area: "secondary_party",
                        partyId: party.id,
                        slotIndex: index,
                      }}
                      onDragEnd={() => setDraggedCompanionId(null)}
                      onDragStart={setDraggedCompanionId}
                      onMoveCompanion={onMoveCompanion}
                      onSelectCompanion={onSelectCompanion}
                    />
                  );
                })}
                <div className="guild-dispatch-actions">
                  {!isUnlocked ? (
                    <small>Buy Number of Parties to unlock.</small>
                  ) : displayDispatch?.status === "completed" ? (
                    <>
                      <strong>Returned</strong>
                      <button
                        disabled={!canUse}
                        onClick={() => onClaimDispatch(party.id)}
                        type="button"
                      >
                        Accomplished
                      </button>
                      <button
                        disabled={!canUse}
                        onClick={() => onCancelDispatch(party.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : displayDispatch ? (
                    <>
                      <strong>
                        Returns in {formatDispatchCountdown(displayDispatch.endsAtMs, currentTime)}
                      </strong>
                      <button
                        disabled={!canUse}
                        onClick={() => onCancelDispatch(party.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={
                          !canUse ||
                          partyCompanionCount <= 0 ||
                          dispatchDestinations.length <= 0
                        }
                        onClick={() => setDispatchPartyId(party.id)}
                        type="button"
                      >
                        Dispatch
                      </button>
                      <small>
                        {dispatchDestinations.length > 0
                          ? `${partyCompanionCount} assigned`
                          : "No visited wild subzones"}
                      </small>
                    </>
                  )}
                </div>
              </RosterColumn>
            );
          })}
        </div>

        {dispatchParty ? (
          <div className="guild-dispatch-setup">
            <div className="guild-roster-topline">
              <div>
                <span className="guild-recruit-kicker">Dispatch Setup</span>
                <h3>{dispatchParty.displayName}</h3>
              </div>
              <button onClick={() => setDispatchPartyId(null)} type="button">
                Close
              </button>
            </div>
            {dispatchDestinations.length > 0 ? (
              <>
                <label>
                  Destination
                  <select
                    onChange={(event) =>
                      setSelectedDestinationKey(event.currentTarget.value)
                    }
                    value={selectedDestinationKey}
                  >
                    {dispatchDestinations.map((destination) => (
                      <option
                        key={createDispatchDestinationKey(
                          destination.mapId,
                          destination.subzoneId,
                        )}
                        value={createDispatchDestinationKey(
                          destination.mapId,
                          destination.subzoneId,
                        )}
                      >
                        {destination.mapName} - {destination.subzoneName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Duration
                  <select
                    onChange={(event) =>
                      setSelectedDurationMs(Number(event.currentTarget.value))
                    }
                    value={selectedDurationMs}
                  >
                    {dispatchDurationOptions.map((durationMs) => (
                      <option key={durationMs} value={durationMs}>
                        {formatDispatchDuration(durationMs)}
                      </option>
                    ))}
                  </select>
                </label>
                {dispatchPreview?.ok ? (
                  <div className="guild-dispatch-preview">
                    <dl>
                      <div>
                        <dt>Rating</dt>
                        <dd>{dispatchPreview.estimate.rating}</dd>
                      </div>
                      <div>
                        <dt>Kills/hr</dt>
                        <dd>{dispatchPreview.estimate.killsPerHour}</dd>
                      </div>
                      <div>
                        <dt>EXP Eff.</dt>
                        <dd>{formatDispatchMultiplier(dispatchPreview.experienceEfficiency)}</dd>
                      </div>
                      <div>
                        <dt>Drop Eff.</dt>
                        <dd>{formatDispatchMultiplier(dispatchPreview.dropEfficiency)}</dd>
                      </div>
                    </dl>
                    <p>
                      Possible drops:{" "}
                      {formatItemIdList(dispatchPreview.estimate.estimatedDropsPerHour.map((drop) => drop.itemId))}
                    </p>
                    <p>
                      Resources:{" "}
                      {formatResourceTypes(dispatchPreview.estimate.resources)}
                    </p>
                    {dispatchPreview.estimate.warnings.length > 0 ? (
                      <p className="guild-recruit-message">
                        Warning: {dispatchPreview.estimate.warnings.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : dispatchPreview ? (
                  <p className="guild-recruit-message">{dispatchPreview.message}</p>
                ) : null}
                <button
                  disabled={!canUse || !dispatchPreview?.ok}
                  onClick={() => {
                    if (selectedDestination) {
                      onDispatch(
                        dispatchParty.id,
                        selectedDestination.mapId,
                        selectedDestination.subzoneId,
                        selectedDurationMs,
                      );
                      setDispatchPartyId(null);
                    }
                  }}
                  type="button"
                >
                  Send Party
                </button>
              </>
            ) : (
              <p className="guild-recruit-message">
                Visit a wild subzone with enemies to unlock dispatch destinations.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RosterColumn({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <div className="guild-roster-column">
      <h4>{title}</h4>
      {subtitle ? <small>{subtitle}</small> : null}
      <div>{children}</div>
    </div>
  );
}

function RosterSlot({
  canUse,
  companion,
  draggedCompanionId,
  label,
  locked,
  lockedText = "Locked",
  selectedCompanionId,
  slotRef,
  onDragEnd,
  onDragStart,
  onMoveCompanion,
  onSelectCompanion,
}: {
  canUse: boolean;
  companion: Companion | null;
  draggedCompanionId: string | null;
  label: string;
  locked: boolean;
  lockedText?: string;
  selectedCompanionId: string | null;
  slotRef: GuildRosterSlotRef;
  onDragEnd: () => void;
  onDragStart: (companionId: string) => void;
  onMoveCompanion: (companionId: string, target: GuildRosterSlotRef) => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const canReceive = canUse && !locked;
  const isTargeting = canReceive && Boolean(draggedCompanionId || selectedCompanionId);

  function moveCompanion(companionId: string) {
    if (!canReceive || companionId === companion?.id) {
      return;
    }

    onMoveCompanion(companionId, slotRef);
    onDragEnd();
    onSelectCompanion(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const companionId =
      event.dataTransfer.getData("text/plain") || draggedCompanionId;

    if (companionId) {
      moveCompanion(companionId);
    }
  }

  function handleSlotClick() {
    if (selectedCompanionId) {
      moveCompanion(selectedCompanionId);
    }
  }

  return (
    <div
      className={`guild-roster-slot${locked ? " locked" : ""}${
        isTargeting ? " can-receive" : ""
      }`}
      onClick={handleSlotClick}
      onDragOver={(event) => {
        if (canReceive) {
          event.preventDefault();
        }
      }}
      onDrop={handleDrop}
    >
      <span className="guild-roster-slot-label">{label}</span>
      {companion ? (
        <>
          {locked ? (
            <span className="guild-roster-locked-status">{lockedText}</span>
          ) : null}
          <CompanionRosterCard
            canUse={canUse && !locked}
            companion={companion}
            isSelected={!locked && selectedCompanionId === companion.id}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onSelectCompanion={onSelectCompanion}
          />
        </>
      ) : locked ? (
        <span className="guild-roster-locked">{lockedText}</span>
      ) : (
        <span className="guild-roster-empty">Empty</span>
      )}
    </div>
  );
}

function CompanionRosterCard({
  canUse,
  companion,
  isSelected,
  onDragEnd,
  onDragStart,
  onSelectCompanion,
}: {
  canUse: boolean;
  companion: Companion;
  isSelected: boolean;
  onDragEnd: () => void;
  onDragStart: (companionId: string) => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const classDefinition = CLASS_DEFINITIONS[companion.classId];
  const idleFrameSrc = getClassIdleFrameSrc(companion.classId);

  return (
    <button
      className={`guild-roster-companion-card${isSelected ? " selected" : ""}`}
      disabled={!canUse}
      draggable={canUse}
      onClick={(event) => {
        event.stopPropagation();
        onSelectCompanion(isSelected ? null : companion.id);
      }}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", companion.id);
        onDragStart(companion.id);
      }}
      type="button"
    >
      <span className="guild-roster-companion-sprite" aria-hidden="true">
        {idleFrameSrc ? <img alt="" src={idleFrameSrc} /> : null}
      </span>
      <strong>
        Lv {companion.characterLevel} {classDefinition?.displayName ?? companion.classId}
      </strong>
      <small>{getRoleLabel(companion.role)}</small>
    </button>
  );
}

function getDisplayDispatch(
  party: GuildSecondaryParty,
  currentTime: number,
): GuildSecondaryPartyDispatchState | null {
  if (!party.dispatch) {
    return null;
  }

  if (
    party.dispatch.status === "dispatched" &&
    currentTime >= party.dispatch.endsAtMs
  ) {
    return {
      ...party.dispatch,
      status: "completed",
    };
  }

  return party.dispatch;
}

function getDispatchStatusLabel(
  dispatch: GuildSecondaryPartyDispatchState | null,
  currentTime: number,
): string {
  if (!dispatch) {
    return "Idle";
  }

  if (dispatch.status === "completed") {
    return "Returned";
  }

  return `Away ${formatDispatchCountdown(dispatch.endsAtMs, currentTime)}`;
}

function createDispatchDestinationKey(
  mapId: DebugMapId,
  subzoneId: string,
): string {
  return `${mapId}|${subzoneId}`;
}

function parseDispatchDestinationKey(
  key: string,
): { mapId: DebugMapId; subzoneId: string } | null {
  const [mapId, subzoneId] = key.split("|");

  if (!mapId || !subzoneId) {
    return null;
  }

  return {
    mapId: mapId as DebugMapId,
    subzoneId,
  };
}

function createDispatchDurationOptions(maxDurationMs: number): number[] {
  const stepMs = 30 * 60 * 1000;
  const firstDurationMs = 60 * 60 * 1000;
  const safeMaxDurationMs = Math.max(firstDurationMs, maxDurationMs);
  const options: number[] = [];

  for (
    let durationMs = firstDurationMs;
    durationMs <= safeMaxDurationMs;
    durationMs += stepMs
  ) {
    options.push(durationMs);
  }

  return options;
}

function formatDispatchCountdown(endAtMs: number, currentTime: number): string {
  return formatDispatchDuration(Math.max(0, endAtMs - currentTime));
}

function formatDispatchDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function formatDispatchMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatDispatchLoot(
  loot: GuildSecondaryPartyDispatchResult["loot"],
): string {
  if (loot.length <= 0) {
    return "None";
  }

  return loot
    .map((item) => `${getItemDefinition(item.itemId).displayName} x${item.quantity}`)
    .join(", ");
}

function formatItemIdList(itemIds: ItemId[]): string {
  const uniqueItemIds = [...new Set(itemIds)];

  if (uniqueItemIds.length <= 0) {
    return "None";
  }

  return uniqueItemIds
    .map((itemId) => getItemDefinition(itemId).displayName)
    .join(", ");
}

function formatResourceTypes(resources: ResourceType[]): string {
  if (resources.length <= 0) {
    return "None";
  }

  const labels: Record<ResourceType, string> = {
    herb: "Herbs",
    ore: "Ore",
    wood: "Wood",
  };

  return [...new Set(resources)].map((resource) => labels[resource]).join(", ");
}

function getDestinationLabel(destination: ReturnType<typeof getGuildRecruitDestination>): string {
  if (destination === "active_party") {
    return "Active Party";
  }

  if (destination === "tavern_reserve") {
    return "Inn's Reserve";
  }

  return "No room available";
}

function formatCandidateGear(candidate: GuildRecruitCandidate): string {
  const equipmentItemIds = candidate.equipmentItemIds ?? [];

  if (equipmentItemIds.length <= 0) {
    return "None";
  }

  return equipmentItemIds
    .map((itemId) => getItemDefinition(itemId).displayName)
    .join(", ");
}

function formatCandidateSkills(candidate: GuildRecruitCandidate): string {
  const skillRows = Object.entries(candidate.startingSkillRanksBySkillId ?? {})
    .map(([skillId, rank]) => {
      const skillDefinition = SKILL_DEFINITIONS[skillId as keyof typeof SKILL_DEFINITIONS];

      return skillDefinition
        ? `${skillDefinition.displayName} Lv ${rank}`
        : null;
    })
    .filter((row): row is string => Boolean(row));

  return skillRows.length > 0 ? skillRows.join(", ") : "None";
}

function formatNoticeBoardRewards(
  state: GameState,
  quest: GuildNoticeBoardQuest,
): string {
  const rewardPercent = getGuildNoticeBoardRewardPercent(state);
  const crowns = Math.floor((quest.rewards.crowns * rewardPercent) / 100);
  const guaranteedBooks = Math.floor(rewardPercent / 100);
  const extraChance = Math.floor(rewardPercent % 100);
  const bookName = getItemDefinition(quest.rewards.skillBookItemId).displayName;
  const bookText =
    extraChance > 0
      ? `${guaranteedBooks} ${bookName} + ${extraChance}% extra`
      : `${guaranteedBooks} ${bookName}`;

  return `${crowns} Crowns, ${bookText}`;
}

function getNoticeBoardButtonStatus(
  quest: GuildNoticeBoardQuest | null,
): string {
  if (!quest) {
    return "Empty";
  }

  return getNoticeBoardQuestStatusLabel(quest);
}

function getNoticeBoardQuestStatusLabel(
  quest: GuildNoticeBoardQuest,
): string {
  if (quest.status === "taken") {
    return "Taken";
  }

  if (quest.status === "done") {
    return quest.rewardClaimedAtMs === null ? "Done" : "Completed";
  }

  return "Available";
}

function getRoleLabel(role: PartyMemberRole): string {
  const roleLabels: Record<PartyMemberRole, string> = {
    defender: "Defender",
    fighter: "Fighter",
    gatherer: "Gatherer",
    support: "Support",
    none: "None",
  };

  return roleLabels[role];
}

function compareCompanionCards(a: Companion, b: Companion): number {
  return a.partyOrder - b.partyOrder || a.id.localeCompare(b.id);
}

function formatRecruitCountdown(refreshAtMs: number, currentTime: number): string {
  const remainingMs = Math.max(0, refreshAtMs - currentTime);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatRecruitButtonCountdown(
  refreshAtMs: number,
  currentTime: number,
): string {
  const remainingMs = Math.max(0, refreshAtMs - currentTime);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}min`;
  }

  return `${hours}H ${minutes}min`;
}
