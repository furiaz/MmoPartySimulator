import { useState } from "react";
import {
  getActiveCompanions,
  getPartySizeLimit,
  getRestingCompanions,
  type GameState,
} from "./game";

type GuildTavernSection = "guild" | "tavern";

const guildActions = ["Recruit", "Notice Board", "Secondary Parties"];
const tavernActions = ["Rooms", "Kitchen"];

export function GuildTavernPanel({
  canUse,
  state,
}: {
  canUse: boolean;
  state: GameState;
}) {
  const [activeSection, setActiveSection] =
    useState<GuildTavernSection>("guild");
  const activeCompanions = getActiveCompanions(state);
  const restingCompanions = getRestingCompanions(state);
  const partySizeLimit = getPartySizeLimit(state);
  const actions = activeSection === "guild" ? guildActions : tavernActions;
  const actionStatus = canUse ? "Coming soon" : "Requires Guild & Tavern";

  function showPreviousSection() {
    setActiveSection((section) => (section === "guild" ? "tavern" : "guild"));
  }

  function showNextSection() {
    setActiveSection((section) => (section === "guild" ? "tavern" : "guild"));
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
            <dd>{restingCompanions.length}</dd>
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
            {actions.map((action) => (
              <button disabled key={action} type="button">
                <span>{action}</span>
                <small>{actionStatus}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
