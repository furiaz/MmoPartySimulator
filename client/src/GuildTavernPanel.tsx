import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import {
  CLASS_DEFINITIONS,
  getGuildRecruitDestination,
  getGuildRecruitState,
  getGuildRecruitUpgradeStatuses,
  getGuildNoticeBoardState,
  getActiveCompanions,
  getCurrencyBalance,
  getEnemyType,
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
  type GuildRecruitUpgradeId,
  type GuildRosterSlotRef,
  type GuildNoticeBoardQuest,
  type GameState,
  type PartyMemberRole,
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
  onPurchaseRecruitUpgrade,
  onRecruit,
  onTakeNoticeBoardQuest,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  upgradeResultMessage?: string | null;
  noticeBoardResultMessage?: string | null;
  secondaryPartyResultMessage?: string | null;
  state: GameState;
  onCancelNoticeBoardQuest: () => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onOpenNoticeBoard: () => void;
  onPurchaseRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onRecruit: (candidateId?: string) => void;
  onTakeNoticeBoardQuest: () => void;
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
          onTakeQuest={onTakeNoticeBoardQuest}
        />
      ) : activeSection === "guild" && guildView === "secondaryParties" ? (
        <GuildSecondaryPartiesView
          canUse={canUse}
          resultMessage={secondaryPartyResultMessage}
          selectedCompanionId={selectedRosterCompanionId}
          state={state}
          onBack={() => setGuildView("hall")}
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
        <GuildPlaceholderUpgradesView
          canUse={canUse}
          kicker="Guild Investment"
          title="Notice Board Upgrades"
          state={state}
          onBack={() => setGuildView("noticeBoard")}
        />
      ) : activeSection === "guild" && guildView === "secondaryPartyUpgrades" ? (
        <GuildPlaceholderUpgradesView
          canUse={canUse}
          kicker="Guild Investment"
          title="Secondary Party Upgrades"
          state={state}
          onBack={() => setGuildView("secondaryParties")}
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
  onTakeQuest,
}: {
  canUse: boolean;
  currentTime: number;
  noticeBoardResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onCancelQuest: () => void;
  onOpenUpgrades: () => void;
  onTakeQuest: () => void;
}) {
  const board = getGuildNoticeBoardState(state, currentTime);
  const quest = board.slots[0] ?? null;
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
        <div className="guild-notice-board-slot">
          <strong>
            <span aria-hidden="true">!</span>
            {quest?.title ?? "No posting"}
          </strong>
          <small>{statusText}</small>
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
              <span>
                {quest.rewards.crowns} Crowns,{" "}
                {getItemDefinition(quest.rewards.skillBookItemId).displayName}
              </span>
            </div>

            {noticeBoardResultMessage ? (
              <p className="guild-recruit-message">{noticeBoardResultMessage}</p>
            ) : null}

            <div className="guild-notice-board-actions">
              <button
                disabled={actionDisabled || !isAvailable}
                onClick={onTakeQuest}
                type="button"
              >
                {takeButtonLabel}
              </button>
              <button
                disabled={!canUse || !isTaken}
                onClick={onCancelQuest}
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

function GuildPlaceholderUpgradesView({
  canUse,
  kicker,
  title,
  state,
  onBack,
}: {
  canUse: boolean;
  kicker: string;
  title: string;
  state: GameState;
  onBack: () => void;
}) {
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return (
    <div className="guild-upgrades-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
      </div>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">{kicker}</span>
            <h3>{title}</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <p className="guild-recruit-message">Requires Guild & Inn</p>
        ) : null}
        <p className="guild-recruit-message">
          Coming soon. This upgrade screen is reserved for this mechanic's
          expansion ticket.
        </p>
      </div>
    </div>
  );
}

function GuildSecondaryPartiesView({
  canUse,
  resultMessage,
  selectedCompanionId,
  state,
  onBack,
  onMoveCompanion,
  onOpenUpgrades,
  onSelectCompanion,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  selectedCompanionId: string | null;
  state: GameState;
  onBack: () => void;
  onMoveCompanion: (companionId: string, target: GuildRosterSlotRef) => void;
  onOpenUpgrades: () => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const [draggedCompanionId, setDraggedCompanionId] = useState<string | null>(
    null,
  );
  const activeCompanions = getActiveCompanions(state).sort(compareCompanionCards);
  const innReserveCompanions = getInnReserveCompanions(state);
  const secondaryParties = getGuildSecondaryPartiesState(state);
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

  useEffect(() => {
    setDraggedCompanionId(null);
  }, [state]);

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

          {secondaryParties.parties.map((party) => (
            <RosterColumn key={party.id} title={party.displayName}>
              {party.companionIds.map((companionId, index) => (
                <RosterSlot
                  canUse={canUse}
                  companion={companionId ? companionsById[companionId] ?? null : null}
                  draggedCompanionId={draggedCompanionId}
                  key={`${party.id}-${index}`}
                  label={`Slot ${index + 1}`}
                  locked={false}
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
              ))}
            </RosterColumn>
          ))}
        </div>
      </div>
    </div>
  );
}

function RosterColumn({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="guild-roster-column">
      <h4>{title}</h4>
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
      {locked ? (
        <span className="guild-roster-locked">Locked</span>
      ) : companion ? (
        <CompanionRosterCard
          canUse={canUse}
          companion={companion}
          isSelected={selectedCompanionId === companion.id}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onSelectCompanion={onSelectCompanion}
        />
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
      <strong>Lv {companion.characterLevel}</strong>
      <span>{classDefinition?.displayName ?? companion.classId}</span>
      <small>{getRoleLabel(companion.role)}</small>
    </button>
  );
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
