import { useState } from "react";
import { FARM_CROP_ICON_SRC } from "./assetIcons";
import {
  FARM_CARROT_FIELD_ID,
  getTownServicesLockedMessage,
  type GameState,
} from "./game";
import { getFarmDisplay } from "./farmPresentation";

type FarmLivestockPanelProps = {
  currentTime: number;
  farmResultMessage?: string | null;
  state: GameState;
  onHarvestAll: () => void;
  onUpgradeCarrotField: () => void;
};

type FarmLivestockSection = "farm" | "livestock";

export function FarmLivestockPanel({
  currentTime,
  farmResultMessage,
  state,
  onHarvestAll,
  onUpgradeCarrotField,
}: FarmLivestockPanelProps) {
  const display = getFarmDisplay(state, currentTime);
  const lockedMessage = getTownServicesLockedMessage(state);
  const field = display.field;
  const [activeSection, setActiveSection] =
    useState<FarmLivestockSection>("farm");

  return (
    <section className="guild-tavern-panel farm-livestock-panel" aria-label="Farm and Livestock">
      <div className="guild-tavern-header">
        <div>
          <h2>Farm & Livestock</h2>
          <span>{display.isUnlocked ? "Town service" : "Locked"}</span>
        </div>
        <dl>
          <div>
            <dt>Crowns</dt>
            <dd>{display.crownBalance.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Farm</dt>
            <dd>{display.isNearFarmer ? "Near" : "Away"}</dd>
          </div>
          <div>
            <dt>Livestock</dt>
            <dd>{display.isNearLivestockKeeper ? "Near" : "Away"}</dd>
          </div>
        </dl>
      </div>

      {lockedMessage ? (
        <p className="guild-requires-service">{lockedMessage}</p>
      ) : null}

      {farmResultMessage ? (
        <p className="guild-result-message">{farmResultMessage}</p>
      ) : null}

      <div className="guild-tavern-section-nav" role="tablist" aria-label="Farm and Livestock sections">
        <button
          aria-selected={activeSection === "farm"}
          className={activeSection === "farm" ? "active" : ""}
          onClick={() => setActiveSection("farm")}
          role="tab"
          type="button"
        >
          <strong>Farm</strong>
          <small>{field.holdText}</small>
        </button>
        <button
          aria-selected={activeSection === "livestock"}
          className={activeSection === "livestock" ? "active" : ""}
          onClick={() => setActiveSection("livestock")}
          role="tab"
          type="button"
        >
          <strong>Livestock</strong>
          <small>Not ready</small>
        </button>
      </div>

      {activeSection === "farm" ? (
        <div className="guild-tavern-service-actions farm-actions">
          <button
            disabled={!field.canHarvest}
            onClick={onHarvestAll}
            type="button"
          >
            <span>Harvest All</span>
            <small>{getFarmHarvestButtonStatusText(field)}</small>
          </button>
        </div>
      ) : null}

      {activeSection === "farm" ? (
        <section className="guild-tavern-section farm-field-card">
          <div className="guild-roster-topline">
            <div>
              <span className="guild-recruit-kicker">Farm</span>
              <h3>Fields</h3>
            </div>
          </div>
          {!lockedMessage && !display.isNearFarmer ? (
            <p className="guild-requires-service">
              Stand near the Farmer to upgrade fields or harvest crops. You can
              browse from afar, but actions require proximity.
            </p>
          ) : null}
          <div className="farm-crop-heading">
            <img
              alt=""
              className="farm-crop-icon"
              src={FARM_CROP_ICON_SRC[field.cropId]}
            />
            <div>
              <h3>{field.cropName}</h3>
              <span>{field.productionText}</span>
            </div>
          </div>

          <dl className="farm-field-stats">
            <div>
              <dt>Field</dt>
              <dd>{FARM_CARROT_FIELD_ID}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>
                {field.level}/{field.maxLevel}
              </dd>
            </div>
            <div>
              <dt>Holding</dt>
              <dd>{field.holdText}</dd>
            </div>
            <div>
              <dt>Yield</dt>
              <dd>1 / 20m</dd>
            </div>
          </dl>

          <div className="guild-tavern-service-actions farm-actions">
            <button
              disabled={!field.canUpgrade}
              onClick={onUpgradeCarrotField}
              type="button"
            >
              <span>Upgrade</span>
              <small>{getFarmUpgradeButtonStatusText(field)}</small>
            </button>
          </div>
        </section>
      ) : (
        <section className="guild-tavern-section farm-livestock-placeholder">
          <h3>Livestock</h3>
          <p>Locked for a later work order.</p>
        </section>
      )}
    </section>
  );
}

function getFarmHarvestButtonStatusText(
  field: ReturnType<typeof getFarmDisplay>["field"],
): string {
  return field.harvestActionText === "Requires proximity"
    ? field.heldQuantity > 0
      ? field.holdText
      : "Nothing held"
    : field.harvestActionText;
}

function getFarmUpgradeButtonStatusText(
  field: ReturnType<typeof getFarmDisplay>["field"],
): string {
  return field.upgradeActionText === "Requires proximity"
    ? field.level >= field.maxLevel
      ? "Max level"
      : `${field.upgradeCostCrowns} Crowns`
    : field.upgradeActionText;
}
