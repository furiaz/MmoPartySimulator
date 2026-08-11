import { useState } from "react";
import {
  CLASS_DEFINITIONS,
  getGuildRecruitDestination,
  getGuildRecruitReserveCapacity,
  getGuildRecruitState,
  getGuildNoticeBoardState,
  getActiveCompanions,
  getEnemyType,
  getItemDefinition,
  getPartySizeLimit,
  getRestingCompanions,
  type GuildNoticeBoardQuest,
  type GameState,
} from "./game";
import SpriteAnimation from "./SpriteAnimation";
import { getClassIdleFrameSrc, getEnemyWalkingAnimation } from "./visualAssets";

type GuildTavernSection = "guild" | "tavern";
type GuildView = "hall" | "recruit" | "noticeBoard";

const tavernActions = ["Rooms", "Kitchen"];

export function GuildTavernPanel({
  canUse,
  currentTime,
  recruitResultMessage,
  noticeBoardResultMessage,
  state,
  onCancelNoticeBoardQuest,
  onOpenNoticeBoard,
  onRecruit,
  onTakeNoticeBoardQuest,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  noticeBoardResultMessage?: string | null;
  state: GameState;
  onCancelNoticeBoardQuest: () => void;
  onOpenNoticeBoard: () => void;
  onRecruit: () => void;
  onTakeNoticeBoardQuest: () => void;
}) {
  const [activeSection, setActiveSection] =
    useState<GuildTavernSection>("guild");
  const [guildView, setGuildView] = useState<GuildView>("hall");
  const activeCompanions = getActiveCompanions(state);
  const restingCompanions = getRestingCompanions(state);
  const partySizeLimit = getPartySizeLimit(state);
  const reserveCapacity = getGuildRecruitReserveCapacity();
  const actionStatus = canUse ? "Coming soon" : "Requires Guild & Tavern";
  const guildRecruit = getGuildRecruitState(state, currentTime);
  const recruitButtonStatus = canUse
    ? guildRecruit.candidate
      ? "Ready"
      : "Waiting"
    : "Requires Guild & Tavern";
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
    : "Requires Guild & Tavern";

  function showPreviousSection() {
    setActiveSection((section) => (section === "guild" ? "tavern" : "guild"));
    setGuildView("hall");
  }

  function showNextSection() {
    setActiveSection((section) => (section === "guild" ? "tavern" : "guild"));
    setGuildView("hall");
  }

  return (
    <section className="guild-tavern-panel" aria-label="Guild and Tavern">
      <div className="guild-tavern-header">
        <div>
          <h2>Guild & Tavern</h2>
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
            <dt>Resting</dt>
            <dd>
              {restingCompanions.length}/{reserveCapacity}
            </dd>
          </div>
        </dl>
      </div>

      <div className="guild-tavern-section-nav">
        <button
          aria-label="Previous Guild or Tavern section"
          onClick={showPreviousSection}
          type="button"
        >
          &lt;
        </button>
        <strong>{activeSection === "guild" ? "Guild" : "Tavern"}</strong>
        <button
          aria-label="Next Guild or Tavern section"
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
          onTakeQuest={onTakeNoticeBoardQuest}
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
              {activeSection === "guild" ? "Guild Hall" : "Tavern Hearth"}
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
                  <button disabled type="button">
                    <span>Secondary Parties</span>
                    <small>{actionStatus}</small>
                  </button>
                </>
              ) : (
                tavernActions.map((action) => (
                  <button disabled key={action} type="button">
                    <span>{action}</span>
                    <small>{actionStatus}</small>
                  </button>
                ))
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
  onRecruit,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onRecruit: () => void;
}) {
  const guildRecruit = getGuildRecruitState(state, currentTime);
  const candidate = guildRecruit.candidate;
  const destination = getGuildRecruitDestination(state);
  const classDefinition = candidate
    ? CLASS_DEFINITIONS[candidate.classId]
    : null;
  const idleFrameSrc = candidate
    ? getClassIdleFrameSrc(candidate.classId)
    : null;
  const recruitDisabled = !canUse || !candidate || destination === "blocked_full";
  const blockedText = !canUse
    ? "Requires Guild & Tavern"
    : !candidate
      ? `Next recruit in ${formatRecruitCountdown(
          guildRecruit.nextRefreshAtMs,
          currentTime,
        )}`
      : destination === "blocked_full"
        ? "No active slot or Tavern reserve room."
        : null;

  return (
    <div className="guild-recruit-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-recruit-card">
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
                  <dd>None</dd>
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
          <button disabled={recruitDisabled} onClick={onRecruit} type="button">
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
  onTakeQuest,
}: {
  canUse: boolean;
  currentTime: number;
  noticeBoardResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onCancelQuest: () => void;
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
    ? "Requires Guild & Tavern"
    : quest
      ? getNoticeBoardQuestStatusLabel(quest)
      : `Next posting in ${formatRecruitCountdown(
          board.nextRefreshAtMs,
          currentTime,
        )}`;

  return (
    <div className="guild-notice-board-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

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

function getDestinationLabel(destination: ReturnType<typeof getGuildRecruitDestination>): string {
  if (destination === "active_party") {
    return "Active Party";
  }

  if (destination === "tavern_reserve") {
    return "Tavern Reserve";
  }

  return "No room available";
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
