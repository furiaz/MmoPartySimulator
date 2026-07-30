import { useEffect, useMemo, useState } from "react";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  ARMOR_FAMILY_LABELS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  formatCurrencyDisplay,
  getSortedCraftingRecipeStatuses,
  type ArmorFamily,
  type CraftingRecipeId,
  type CraftingRecipeStatus,
  type EquipmentType,
  type GameState,
  type ItemDefinition,
} from "./game";

type CraftingLevelFilter = "all" | "1" | "5" | "10plus";
type CraftingCategoryFilter = "all" | "weapons" | "armor" | "accessories";
type CraftingArmorFamilyFilter = "all" | ArmorFamily;
type CraftingWeaponTypeFilter = "all" | EquipmentType;
type CraftingArmorPartFilter =
  | "all"
  | "head"
  | "chest"
  | "legs"
  | "gloves"
  | "boots";
type CraftingCraftabilityFilter = "all" | "craftable" | "missing";

const armorFamilyFilterOptions: CraftingArmorFamilyFilter[] = [
  "all",
  "cloth",
  "leather",
  "mail",
  "plate",
];

const armorPartFilterOptions: CraftingArmorPartFilter[] = [
  "all",
  "head",
  "chest",
  "legs",
  "gloves",
  "boots",
];

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

function getRecipeSummary(itemDefinition: ItemDefinition | undefined): string {
  if (!itemDefinition) {
    return "Unavailable";
  }

  const level = itemDefinition.levelRequirement ?? 1;

  if (itemDefinition.equipmentKind === "armor" && itemDefinition.armorFamily) {
    return `Level ${level} ${ARMOR_FAMILY_LABELS[itemDefinition.armorFamily]} ${itemDefinition.equipmentSlot ? EQUIPMENT_SLOT_LABELS[itemDefinition.equipmentSlot] : "Armor"}`;
  }

  if (itemDefinition.equipmentKind === "weapon") {
    return `Level ${level} Weapon`;
  }

  if (itemDefinition.equipmentKind === "offhand") {
    return `Level ${level} Offhand`;
  }

  if (itemDefinition.equipmentKind === "accessory") {
    return `Level ${level} Accessory`;
  }

  return `Level ${level} Equipment`;
}

function matchesCraftingFilters(
  status: CraftingRecipeStatus,
  filters: {
    level: CraftingLevelFilter;
    category: CraftingCategoryFilter;
    armorFamily: CraftingArmorFamilyFilter;
    armorPart: CraftingArmorPartFilter;
    weaponType: CraftingWeaponTypeFilter;
    craftability: CraftingCraftabilityFilter;
  },
): boolean {
  const itemDefinition = status.outputItemDefinition;

  if (!itemDefinition) {
    return false;
  }

  const level = itemDefinition.levelRequirement ?? 1;

  if (
    (filters.level === "1" && level !== 1) ||
    (filters.level === "5" && level !== 5) ||
    (filters.level === "10plus" && level < 10)
  ) {
    return false;
  }

  if (
    (filters.category === "weapons" &&
      itemDefinition.equipmentKind !== "weapon" &&
      itemDefinition.equipmentKind !== "offhand") ||
    (filters.category === "armor" && itemDefinition.equipmentKind !== "armor") ||
    (filters.category === "accessories" &&
      itemDefinition.equipmentKind !== "accessory")
  ) {
    return false;
  }

  if (
    filters.category === "armor" &&
    filters.armorFamily !== "all" &&
    itemDefinition.armorFamily !== filters.armorFamily
  ) {
    return false;
  }

  if (
    filters.category === "armor" &&
    filters.armorPart !== "all" &&
    itemDefinition.equipmentSlot !== filters.armorPart
  ) {
    return false;
  }

  if (
    filters.category === "weapons" &&
    filters.weaponType !== "all" &&
    itemDefinition.equipmentType !== filters.weaponType
  ) {
    return false;
  }

  if (
    (filters.craftability === "craftable" && !status.canCraft) ||
    (filters.craftability === "missing" && status.canCraft)
  ) {
    return false;
  }

  return true;
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
  const [levelFilter, setLevelFilter] = useState<CraftingLevelFilter>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<CraftingCategoryFilter>("all");
  const [armorFamilyFilter, setArmorFamilyFilter] =
    useState<CraftingArmorFamilyFilter>("all");
  const [armorPartFilter, setArmorPartFilter] =
    useState<CraftingArmorPartFilter>("all");
  const [weaponTypeFilter, setWeaponTypeFilter] =
    useState<CraftingWeaponTypeFilter>("all");
  const [craftabilityFilter, setCraftabilityFilter] =
    useState<CraftingCraftabilityFilter>("all");
  const weaponTypeFilterOptions = useMemo<CraftingWeaponTypeFilter[]>(() => {
    const weaponTypes = new Set<EquipmentType>();

    for (const status of recipeStatuses) {
      const itemDefinition = status.outputItemDefinition;

      if (
        (itemDefinition?.equipmentKind === "weapon" ||
          itemDefinition?.equipmentKind === "offhand") &&
        itemDefinition.equipmentType
      ) {
        weaponTypes.add(itemDefinition.equipmentType);
      }
    }

    return [
      "all",
      ...Array.from(weaponTypes).sort((first, second) =>
        EQUIPMENT_TYPE_LABELS[first].localeCompare(EQUIPMENT_TYPE_LABELS[second]),
      ),
    ];
  }, [recipeStatuses]);
  const filteredRecipeStatuses = useMemo(
    () =>
      recipeStatuses.filter((status) =>
        matchesCraftingFilters(status, {
          level: levelFilter,
          category: categoryFilter,
          armorFamily: armorFamilyFilter,
          armorPart: armorPartFilter,
          weaponType: weaponTypeFilter,
          craftability: craftabilityFilter,
        }),
      ),
    [
      armorFamilyFilter,
      armorPartFilter,
      categoryFilter,
      craftabilityFilter,
      levelFilter,
      recipeStatuses,
      weaponTypeFilter,
    ],
  );
  const [selectedRecipeId, setSelectedRecipeId] =
    useState<CraftingRecipeId | null>(
      filteredRecipeStatuses[0]?.recipe.id ?? null,
    );

  useEffect(() => {
    if (
      selectedRecipeId &&
      filteredRecipeStatuses.some(
        (status) => status.recipe.id === selectedRecipeId,
      )
    ) {
      return;
    }

    setSelectedRecipeId(filteredRecipeStatuses[0]?.recipe.id ?? null);
  }, [filteredRecipeStatuses, selectedRecipeId]);

  const selectedStatus =
    filteredRecipeStatuses.find(
      (status) => status.recipe.id === selectedRecipeId,
    ) ??
    filteredRecipeStatuses[0] ??
    null;
  const selectedBlockReason = selectedStatus
    ? getCraftingBlockReason(selectedStatus)
    : "No recipe selected";
  const selectedOutputIconSrc = selectedStatus?.outputItemDefinition
    ? INVENTORY_ITEM_ICON_SRC[selectedStatus.outputItemDefinition.id]
    : undefined;
  const hasActiveCategoryFilter = categoryFilter !== "all";
  const hasActiveArmorFilters =
    categoryFilter === "armor" &&
    (armorFamilyFilter !== "all" || armorPartFilter !== "all");
  const hasActiveWeaponFilters =
    categoryFilter === "weapons" && weaponTypeFilter !== "all";
  const hasActiveFilters =
    levelFilter !== "all" ||
    hasActiveCategoryFilter ||
    hasActiveArmorFilters ||
    hasActiveWeaponFilters ||
    craftabilityFilter !== "all";

  function changeCategoryFilter(nextCategoryFilter: CraftingCategoryFilter) {
    setCategoryFilter(nextCategoryFilter);

    if (nextCategoryFilter !== "armor") {
      setArmorFamilyFilter("all");
      setArmorPartFilter("all");
    }

    if (nextCategoryFilter !== "weapons") {
      setWeaponTypeFilter("all");
    }
  }

  function clearFilters() {
    setLevelFilter("all");
    setCategoryFilter("all");
    setArmorFamilyFilter("all");
    setArmorPartFilter("all");
    setWeaponTypeFilter("all");
    setCraftabilityFilter("all");
  }

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
        <div className="crafting-browser">
          <div className="crafting-filters" aria-label="Crafting filters">
            <label>
              <span>Level</span>
              <select
                value={levelFilter}
                onChange={(event) =>
                  setLevelFilter(event.currentTarget.value as CraftingLevelFilter)
                }
              >
                <option value="all">All</option>
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10plus">10+</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) =>
                  changeCategoryFilter(
                    event.currentTarget.value as CraftingCategoryFilter,
                  )
                }
              >
                <option value="all">All</option>
                <option value="weapons">Weapons</option>
                <option value="armor">Armor</option>
                <option value="accessories">Accessories</option>
              </select>
            </label>
            {categoryFilter === "weapons" ? (
              <label>
                <span>Weapon type</span>
                <select
                  value={weaponTypeFilter}
                  onChange={(event) =>
                    setWeaponTypeFilter(
                      event.currentTarget.value as CraftingWeaponTypeFilter,
                    )
                  }
                >
                  {weaponTypeFilterOptions.map((weaponType) => (
                    <option key={weaponType} value={weaponType}>
                      {weaponType === "all"
                        ? "All"
                        : EQUIPMENT_TYPE_LABELS[weaponType]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {categoryFilter === "armor" ? (
              <>
                <label>
                  <span>Armor type</span>
                  <select
                    value={armorFamilyFilter}
                    onChange={(event) =>
                      setArmorFamilyFilter(
                        event.currentTarget.value as CraftingArmorFamilyFilter,
                      )
                    }
                  >
                    {armorFamilyFilterOptions.map((armorFamily) => (
                      <option key={armorFamily} value={armorFamily}>
                        {armorFamily === "all"
                          ? "All"
                          : ARMOR_FAMILY_LABELS[armorFamily]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Armor part</span>
                  <select
                    value={armorPartFilter}
                    onChange={(event) =>
                      setArmorPartFilter(
                        event.currentTarget.value as CraftingArmorPartFilter,
                      )
                    }
                  >
                    {armorPartFilterOptions.map((armorPart) => (
                      <option key={armorPart} value={armorPart}>
                        {armorPart === "all"
                          ? "All"
                          : EQUIPMENT_SLOT_LABELS[armorPart]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label>
              <span>Status</span>
              <select
                value={craftabilityFilter}
                onChange={(event) =>
                  setCraftabilityFilter(
                    event.currentTarget.value as CraftingCraftabilityFilter,
                  )
                }
              >
                <option value="all">All</option>
                <option value="craftable">Craftable</option>
                <option value="missing">Missing requirements</option>
              </select>
            </label>
            <button
              disabled={!hasActiveFilters}
              onClick={clearFilters}
              type="button"
            >
              Clear Filters
            </button>
          </div>
          <div className="crafting-recipe-count">
            {filteredRecipeStatuses.length}/{recipeStatuses.length} recipes
          </div>
          <div className="crafting-recipe-list" aria-label="Crafting recipes">
            {filteredRecipeStatuses.map((status) => {
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
                    <small>{getRecipeSummary(outputItem)}</small>
                  </span>
                  <b>{status.canCraft ? "Ready" : "Missing"}</b>
                </button>
              );
            })}
            {filteredRecipeStatuses.length === 0 ? (
              <span className="crafting-empty">No recipes match filters</span>
            ) : null}
          </div>
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
                  return (
                    <div
                      key={`${requirement.kind}:${requirement.displayName}`}
                      className={`crafting-requirement-row${
                        requirement.isMet ? " met" : " missing"
                      }`}
                    >
                      <span>{requirement.displayName}</span>
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
