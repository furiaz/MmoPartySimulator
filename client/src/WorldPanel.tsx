import {
  debugMapDefinitions,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_FIVE_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_SEVEN_ID,
  MAP_SIX_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  getWorldTravelTeleportStatus,
  isAutoRouteDestinationKnown,
  type DebugMapId,
  type GameState,
} from "./game";

const prototypeRegionMapIds: DebugMapId[] = [
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  MAP_THREE_ID,
  HUB_TWO_MAP_ID,
  MAP_FOUR_ID,
  MAP_FIVE_ID,
  MAP_SIX_ID,
  MAP_SEVEN_ID,
];

export function WorldPanel({
  currentMapId,
  gameState,
  worldTravelTargetMapId,
  onClearRoute,
  onSetRoute,
  onToggleAutoCombatOnArrival,
  onTeleport,
}: {
  currentMapId?: DebugMapId;
  gameState: GameState;
  worldTravelTargetMapId: DebugMapId | null;
  onClearRoute: () => void;
  onSetRoute: (targetMapId: DebugMapId) => void;
  onToggleAutoCombatOnArrival: () => void;
  onTeleport: (targetMapId: DebugMapId) => void;
}) {
  const activeRouteName = worldTravelTargetMapId
    ? debugMapDefinitions[worldTravelTargetMapId].displayName
    : null;

  return (
    <section className="world-panel" aria-label="World">
      <div className="world-panel-header">
        <h2>World</h2>
        {activeRouteName ? (
          <button onClick={onClearRoute} type="button">
            Clear Route
          </button>
        ) : null}
      </div>
      <div className="world-region">
        <div className="menu-section-heading">
          <strong>Prototype Region</strong>
          {activeRouteName ? <span>Route: {activeRouteName}</span> : null}
        </div>
        <label className="world-route-toggle">
          <input
            checked={Boolean(gameState.autoCombatOnArrivalEnabled)}
            onChange={onToggleAutoCombatOnArrival}
            type="checkbox"
          />
          <span>Auto Combat on arrival</span>
        </label>
        <div className="world-map-list">
          {prototypeRegionMapIds.map((mapId) => {
            const mapDefinition = debugMapDefinitions[mapId];
            const isCurrentMap = mapId === currentMapId;
            const isActiveRoute = mapId === worldTravelTargetMapId;
            const isKnownDestination = isAutoRouteDestinationKnown(
              gameState,
              mapId,
            );
            const teleportStatus = getWorldTravelTeleportStatus(
              gameState,
              mapId,
            );
            const actionLabel = isCurrentMap
              ? "Current Zone"
              : isActiveRoute
                ? "Route Active"
                : "Set Route";

            return (
              <div className="world-map-row" key={mapId}>
                <div>
                  <strong>{mapDefinition.displayName}</strong>
                  <span>{mapDefinition.debugName}</span>
                </div>
                <div className="world-map-actions">
                  <button
                    className={isCurrentMap || isActiveRoute ? "active" : ""}
                    disabled={isCurrentMap || !isKnownDestination}
                    onClick={() => onSetRoute(mapId)}
                    title={
                      isKnownDestination
                        ? undefined
                        : "Visit this zone before routing to it."
                    }
                    type="button"
                  >
                    {isKnownDestination ? actionLabel : "Unvisited"}
                  </button>
                  <button
                    className={teleportStatus?.canTeleport ? "" : "locked"}
                    disabled={!teleportStatus?.canTeleport}
                    onClick={() => onTeleport(mapId)}
                    title={
                      !teleportStatus
                        ? "No teleport echo available"
                        : teleportStatus.isCurrentMap
                          ? "Current zone"
                          : teleportStatus.isUnlocked
                            ? `Teleport to ${mapDefinition.displayName}`
                            : teleportStatus.acquisitionHint
                    }
                    type="button"
                  >
                    Teleport
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
