import { useState } from "react";
import { FARM_CROP_ICON_SRC } from "./assetIcons";
import {
  getTownServicesLockedMessage,
  type FarmFieldId,
  type FarmFieldUpgradeId,
  type GameState,
} from "./game";
import {
  getFarmDisplay,
  type FarmCropFilter,
  type FarmFieldDisplay,
} from "./farmPresentation";
import { OverlayPanel } from "./OverlayPanel";

type FarmLivestockPanelProps = {
  currentTime: number;
  farmResultMessage?: string | null;
  state: GameState;
  onHarvestAll: () => void;
  onPurchaseFarmUpgrade: (
    fieldId: FarmFieldId,
    upgradeId: FarmFieldUpgradeId,
  ) => void;
};

type FarmLivestockSection = "farm" | "livestock";

export function FarmLivestockPanel({
  currentTime,
  farmResultMessage,
  state,
  onHarvestAll,
  onPurchaseFarmUpgrade,
}: FarmLivestockPanelProps) {
  const [cropFilter, setCropFilter] = useState<FarmCropFilter>("unlocked");
  const display = getFarmDisplay(state, currentTime, cropFilter);
  const lockedMessage = getTownServicesLockedMessage(state);
  const field = display.field;
  const [activeSection, setActiveSection] =
    useState<FarmLivestockSection>("farm");
  const [selectedUpgradeFieldId, setSelectedUpgradeFieldId] = useState<
    FarmFieldDisplay["fieldId"] | null
  >(null);
  const selectedUpgradeField =
    display.fields.find((farmField) => farmField.fieldId === selectedUpgradeFieldId) ??
    null;

  return (
    <section
      aria-label="Farm and Livestock"
      className="guild-tavern-panel farm-livestock-panel"
    >
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
            <dt>Crops/hr</dt>
            <dd>{display.totalCropsPerHourText}</dd>
          </div>
          <div>
            <dt>Livestock/hr</dt>
            <dd>{display.livestockProductionPerHourText}</dd>
          </div>
        </dl>
      </div>

      {lockedMessage ? (
        <p className="guild-requires-service">{lockedMessage}</p>
      ) : null}

      {farmResultMessage ? (
        <p className="guild-result-message">{farmResultMessage}</p>
      ) : null}

      <div
        aria-label="Farm and Livestock sections"
        className="guild-tavern-section-nav"
        role="tablist"
      >
        <button
          aria-selected={activeSection === "farm"}
          className={activeSection === "farm" ? "active" : ""}
          onClick={() => setActiveSection("farm")}
          role="tab"
          type="button"
        >
          <strong>Farm</strong>
          <small>
            Crops {display.totalHeldQuantity}/{display.totalHoldCap}
          </small>
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
        <>
          <div className="guild-tavern-service-actions farm-actions">
            <button disabled={!field.canHarvest} onClick={onHarvestAll} type="button">
              <span>Harvest All</span>
              <small>{getFarmHarvestButtonStatusText(field)}</small>
            </button>
            <button disabled type="button">
              <span>Upgrade Building</span>
              <small>Coming soon</small>
            </button>
          </div>

          <section className="guild-tavern-section farm-field-card">
            <div className="guild-roster-topline">
              <div>
                <span className="guild-recruit-kicker">Farm</span>
                <h3>Fields</h3>
              </div>
              <div className="farm-crop-filter" aria-label="Farm crop filter">
                <button
                  className={cropFilter === "unlocked" ? "active" : ""}
                  onClick={() => setCropFilter("unlocked")}
                  type="button"
                >
                  Unlocked
                </button>
                <button
                  className={cropFilter === "all" ? "active" : ""}
                  onClick={() => setCropFilter("all")}
                  type="button"
                >
                  All
                </button>
              </div>
            </div>
            {!lockedMessage && !display.isNearFarmer ? (
              <p className="guild-requires-service">
                Stand near the Farmer to upgrade fields or harvest crops. You
                can browse from afar, but actions require proximity.
              </p>
            ) : null}
            <div className="farm-crop-list">
              {display.fields.map((farmField) => (
                <FarmCropRow
                  key={farmField.fieldId}
                  field={farmField}
                  onOpenUpgrades={() => setSelectedUpgradeFieldId(farmField.fieldId)}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="guild-tavern-section farm-livestock-placeholder">
          {!lockedMessage && !display.isNearLivestockKeeper ? (
            <p className="guild-requires-service">
              Stand near Livestock to manage future Livestock actions. You can
              browse from afar, but actions will require proximity.
            </p>
          ) : null}
          <h3>Livestock</h3>
          <p>Locked for a later work order.</p>
        </section>
      )}

      {selectedUpgradeField ? (
        <OverlayPanel
          ariaLabel={`${selectedUpgradeField.cropName} upgrades`}
          className="farm-upgrade-overlay"
          onClose={() => setSelectedUpgradeFieldId(null)}
        >
          <FarmUpgradeOverlayContent
            field={selectedUpgradeField}
            isNearFarmer={display.isNearFarmer}
            isUnlocked={display.isUnlocked}
            lockedMessage={lockedMessage}
            onClose={() => setSelectedUpgradeFieldId(null)}
            onPurchase={onPurchaseFarmUpgrade}
          />
        </OverlayPanel>
      ) : null}
    </section>
  );
}

function FarmCropRow({
  field,
  onOpenUpgrades,
}: {
  field: FarmFieldDisplay;
  onOpenUpgrades: () => void;
}) {
  if (!field.isUnlocked) {
    return (
      <article className="farm-crop-row locked">
        <div className="farm-crop-row-main">
          <div className="farm-crop-heading">
            <img
              alt=""
              className="farm-crop-icon locked"
              src={FARM_CROP_ICON_SRC.locked}
            />
            <div>
              <h3>{field.cropName}</h3>
              <span>{field.productionText}</span>
            </div>
          </div>
        </div>
        <div className="farm-crop-row-stats">
          <div className="farm-crop-metrics">
            <span>{field.sourceHint}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="farm-crop-row">
      <div className="farm-crop-row-main">
        <div className="farm-crop-heading">
          <img
            alt=""
            className="farm-crop-icon"
            src={FARM_CROP_ICON_SRC[field.cropId] ?? FARM_CROP_ICON_SRC.locked}
          />
          <div>
            <h3>{field.cropName}</h3>
            <span>{field.productionText}</span>
          </div>
        </div>
        <button onClick={onOpenUpgrades} type="button">
          Upgrades
        </button>
      </div>
      <div className="farm-crop-row-stats">
        <div className="farm-crop-metrics">
          <span title={field.speedTooltip}>Speed {field.speedText}</span>
          <span title={field.multiCropTooltip}>
            Multi crop {field.multiCropText}
          </span>
          <span title={field.generationPerHourTooltip}>
            Gen/hr {field.generationPerHourText}
          </span>
        </div>
        <strong title={field.holdingTooltip}>{field.holdText}</strong>
      </div>
    </article>
  );
}

function FarmUpgradeOverlayContent({
  field,
  isNearFarmer,
  isUnlocked,
  lockedMessage,
  onClose,
  onPurchase,
}: {
  field: FarmFieldDisplay;
  isNearFarmer: boolean;
  isUnlocked: boolean;
  lockedMessage: string | null;
  onClose: () => void;
  onPurchase: (fieldId: FarmFieldId, upgradeId: FarmFieldUpgradeId) => void;
}) {
  return (
    <>
      <div className="farm-upgrade-overlay-heading">
          <img
          alt=""
          className="farm-crop-icon"
          src={FARM_CROP_ICON_SRC[field.cropId] ?? FARM_CROP_ICON_SRC.locked}
        />
        <h3>{field.cropName}</h3>
      </div>

      {lockedMessage ? (
        <p className="guild-requires-service">{lockedMessage}</p>
      ) : !isNearFarmer && isUnlocked ? (
        <p className="guild-requires-service">
          Stand near the Farmer to purchase upgrades.
        </p>
      ) : null}

      <div className="farm-upgrade-row-list">
        {field.upgrades.map((upgrade) => (
          <div className="farm-upgrade-row" key={upgrade.id}>
            <div>
              <strong>{upgrade.displayName}</strong>
              <span>
                Lv {upgrade.level}/{upgrade.maxLevel}
              </span>
            </div>
            <small>
              {upgrade.currentEffectText}
              {upgrade.nextEffectText ? ` -> ${upgrade.nextEffectText}` : ""}
            </small>
            <button
              disabled={!upgrade.canPurchase}
              onClick={() => onPurchase(field.fieldId, upgrade.id)}
              type="button"
            >
              {upgrade.actionText}
            </button>
          </div>
        ))}
      </div>

      <div className="farm-upgrade-overlay-footer">
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </>
  );
}

function getFarmHarvestButtonStatusText(field: FarmFieldDisplay): string {
  return field.harvestActionText === "Requires proximity"
    ? field.heldQuantity > 0
      ? field.holdText
      : "Nothing held"
    : field.harvestActionText;
}
