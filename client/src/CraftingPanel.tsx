import { useEffect, useMemo, useState } from "react";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  formatCurrencyDisplay,
  getItemDefinition,
  getSortedCraftingRecipeStatuses,
  type CraftingRecipeId,
  type CraftingRecipeStatus,
  type GameState,
} from "./game";

function getCraftingBlockReason(status: CraftingRecipeStatus): string | null {
  if (!status.outputItemDefinition) {
    return "Recipe unavailable";
  }

  if (!status.isLeaderNearSmith) {
    return "Requires Smithy";
  }

  if (!status.hasRequiredMaterials) {
    return "Missing materials";
  }

  if (!status.hasRequiredCrowns) {
    return "Not enough Crowns";
  }

  if (!status.hasInventorySpace) {
    return "Inventory full";
  }

  return null;
}

export function CraftingPanel({
  state,
  resultMessage,
  onCraft,
}: {
  state: GameState;
  resultMessage?: string | null;
  onCraft: (recipeId: CraftingRecipeId) => void;
}) {
  const recipeStatuses = useMemo(
    () => getSortedCraftingRecipeStatuses(state),
    [state],
  );
  const [selectedRecipeId, setSelectedRecipeId] =
    useState<CraftingRecipeId | null>(recipeStatuses[0]?.recipe.id ?? null);

  useEffect(() => {
    if (
      selectedRecipeId &&
      recipeStatuses.some((status) => status.recipe.id === selectedRecipeId)
    ) {
      return;
    }

    setSelectedRecipeId(recipeStatuses[0]?.recipe.id ?? null);
  }, [recipeStatuses, selectedRecipeId]);

  const selectedStatus =
    recipeStatuses.find((status) => status.recipe.id === selectedRecipeId) ??
    recipeStatuses[0] ??
    null;
  const selectedBlockReason = selectedStatus
    ? getCraftingBlockReason(selectedStatus)
    : "No recipe selected";
  const selectedOutputIconSrc = selectedStatus?.outputItemDefinition
    ? INVENTORY_ITEM_ICON_SRC[selectedStatus.outputItemDefinition.id]
    : undefined;

  return (
    <section className="crafting-panel" aria-label="Crafts">
      <div className="crafting-header">
        <div>
          <h2>Crafts</h2>
          <span>{formatCurrencyDisplay(state.wallet, "crowns")}</span>
        </div>
        <span>
          Slots {state.inventory.slots.length}/{state.inventory.capacity}
        </span>
      </div>
      <div className="crafting-layout">
        <div className="crafting-recipe-list" aria-label="Crafting recipes">
          {recipeStatuses.map((status) => {
            const outputItem = status.outputItemDefinition;
            const isSelected = selectedStatus?.recipe.id === status.recipe.id;

            return (
              <button
                key={status.recipe.id}
                className={`crafting-recipe-row${
                  isSelected ? " selected" : ""
                }${status.canCraft ? " craftable" : ""}`}
                onClick={() => setSelectedRecipeId(status.recipe.id)}
                type="button"
              >
                <span>
                  <strong>{outputItem?.displayName ?? "Unknown Recipe"}</strong>
                  <small>
                    {status.recipe.outputQuantity > 1
                      ? `Output x${status.recipe.outputQuantity}`
                      : "Equipment"}
                  </small>
                </span>
                <b>{status.canCraft ? "Ready" : "Missing"}</b>
              </button>
            );
          })}
        </div>
        <div className="crafting-detail" aria-label="Selected recipe">
          {selectedStatus ? (
            <>
              <div className="crafting-output">
                {selectedOutputIconSrc ? (
                  <img alt="" src={selectedOutputIconSrc} />
                ) : (
                  <span className="crafting-output-placeholder" aria-hidden="true" />
                )}
                <div>
                  <span className="crafting-detail-kicker">Output</span>
                  <h3>
                    {selectedStatus.outputItemDefinition?.displayName ??
                      "Unknown Recipe"}
                  </h3>
                  <p>
                    Quantity x{selectedStatus.recipe.outputQuantity}
                    {selectedStatus.outputItemDefinition?.stackable
                      ? ""
                      : " - one slot each"}
                  </p>
                </div>
              </div>
              <dl className="crafting-cost-grid">
                <div>
                  <dt>Crowns</dt>
                  <dd>
                    {selectedStatus.crownBalance}/
                    {selectedStatus.recipe.crownCost}
                  </dd>
                </div>
                <div>
                  <dt>Smithy</dt>
                  <dd>
                    {selectedStatus.isLeaderNearSmith ? "Nearby" : "Required"}
                  </dd>
                </div>
              </dl>
              <div className="crafting-requirement-list">
                <span className="crafting-detail-kicker">Materials</span>
                {selectedStatus.requirements.map((requirement) => {
                  const item = getItemDefinition(requirement.itemId);

                  return (
                    <div
                      key={requirement.itemId}
                      className={`crafting-requirement-row${
                        requirement.isMet ? " met" : " missing"
                      }`}
                    >
                      <span>{item.displayName}</span>
                      <strong>
                        {requirement.ownedQuantity}/{requirement.quantity}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <button
                className="crafting-action"
                disabled={Boolean(selectedBlockReason)}
                onClick={() => onCraft(selectedStatus.recipe.id)}
                title={
                  selectedBlockReason ||
                  `Craft ${selectedStatus.outputItemDefinition?.displayName}`
                }
                type="button"
              >
                {selectedBlockReason || "Craft"}
              </button>
              {resultMessage ? (
                <p className="crafting-result-message">{resultMessage}</p>
              ) : null}
            </>
          ) : (
            <span className="crafting-empty">No recipes available</span>
          )}
        </div>
      </div>
    </section>
  );
}
