import {
    CircleMarker,
    GeoJSON,
    MapContainer,
    Polygon,
    Polyline,
    Popup,
    TileLayer,
    useMap,
    useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";

function PanelIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v14H4z" />
            <path d="M9 5v14" />
            <path d="M6.5 9h0M6.5 13h0" />
        </svg>
    );
}

function AreaIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5 19 7 17 19 6 17z" />
            <circle cx="5" cy="5" r="1.5" />
            <circle cx="19" cy="7" r="1.5" />
            <circle cx="17" cy="19" r="1.5" />
            <circle cx="6" cy="17" r="1.5" />
        </svg>
    );
}

function DistanceIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 17 17 5" />
            <path d="m5 12 0 5 5 0M12 5h5v5" />
            <circle cx="5" cy="17" r="1.5" />
            <circle cx="17" cy="5" r="1.5" />
        </svg>
    );
}

function HomeIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 11 9-8 9 8" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
        </svg>
    );
}

function LegendIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h4v4H4zM4 15h4v4H4z" />
            <path d="M11 7h9M11 17h9" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
        </svg>
    );
}

function formatDistance(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(2)} km`;
    }

    return `${meters.toFixed(2)} m`;
}

function formatArea(squareMeters) {
    if (squareMeters >= 10000) {
        return `${(squareMeters / 10000).toFixed(2)} ha`;
    }

    return `${squareMeters.toFixed(2)} m²`;
}

function calculateDistance(points) {
    let total = 0;

    for (let index = 1; index < points.length; index += 1) {
        const previous = L.latLng(points[index - 1][0], points[index - 1][1]);
        const current = L.latLng(points[index][0], points[index][1]);

        total += previous.distanceTo(current);
    }

    return total;
}

function calculatePolygonArea(points) {
    if (points.length < 3) return 0;

    const earthRadius = 6378137;
    const radians = points.map(([lat, lng]) => [
        (lat * Math.PI) / 180,
        (lng * Math.PI) / 180,
    ]);

    let area = 0;

    for (let index = 0; index < radians.length; index += 1) {
        const [lat1, lng1] = radians[index];
        const [lat2, lng2] = radians[(index + 1) % radians.length];

        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    return Math.abs((area * earthRadius * earthRadius) / 2);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatPopupValue(key, value) {
    if (value === null || value === undefined || value === "") {
        return "Sin información";
    }

    if (typeof value === "number") {
        if (String(key).toLowerCase().includes("area")) {
            return `${new Intl.NumberFormat("es-CO", {
                maximumFractionDigits: 2,
            }).format(value)} m²`;
        }

        if (String(key).toLowerCase().includes("length")) {
            return `${new Intl.NumberFormat("es-CO", {
                maximumFractionDigits: 2,
            }).format(value)} m`;
        }

        return new Intl.NumberFormat("es-CO", {
            maximumFractionDigits: 2,
        }).format(value);
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

const FIELD_LABELS = {
    CODIGO: "Código",
    CODIGO_ANTERIOR: "Código anterior",
    CODIGO_MUNICIPIO: "Código municipal",
    MANZANA_CODIGO: "Código de manzana",
    VEREDA_CODIGO: "Código de vereda",
    SECTOR_CODIGO: "Código de sector",
    NOMBRE: "Nombre",
    TERRENO_CODIGO: "Código del terreno",
    TIPO_CONSTRUCCION: "Tipo de construcción",
    TIPO_DOMINIO: "Tipo de dominio",
    NUMERO_PISOS: "Número de pisos",
    NUMERO_SOTANOS: "Número de sótanos",
    NUMERO_SUBTERRANEOS: "Número de subterráneos",
    SHAPE_Area: "Área",
    SHAPE_Length: "Perímetro",
    OBJECTID: "Identificador",
};

const PREFERRED_FIELDS = {
    "u-terreno": [
        "CODIGO",
        "CODIGO_ANTERIOR",
        "MANZANA_CODIGO",
        "NUMERO_SUBTERRANEOS",
        "SHAPE_Area",
        "SHAPE_Length",
    ],
    "r-terreno": [
        "CODIGO",
        "CODIGO_ANTERIOR",
        "VEREDA_CODIGO",
        "NUMERO_SUBTERRANEOS",
        "SHAPE_Area",
        "SHAPE_Length",
    ],
    "u-construccion": [
        "TERRENO_CODIGO",
        "TIPO_CONSTRUCCION",
        "TIPO_DOMINIO",
        "NUMERO_PISOS",
        "NUMERO_SOTANOS",
        "SHAPE_Area",
    ],
    "r-vereda": ["CODIGO", "NOMBRE", "SHAPE_Area", "SHAPE_Length"],
    "u-barrio": ["SECTOR_CODIGO", "NOMBRE", "SHAPE_Area", "SHAPE_Length"],
    vias: ["NOMBRE", "TIPO", "CLASE", "OBJECTID", "SHAPE_Length"],
};

function buildPopupHtml(feature, layerInfo) {
    const properties = feature?.properties || {};
    const preferred = PREFERRED_FIELDS[layerInfo.id] || [];

    let entries = preferred
        .filter((key) => properties[key] !== undefined && properties[key] !== null)
        .map((key) => [key, properties[key]]);

    if (!entries.length) {
        entries = Object.entries(properties)
            .filter(([key]) => !key.startsWith("_"))
            .slice(0, 7);
    }

    const rows = entries
        .map(([key, value]) => {
            const label = FIELD_LABELS[key] || key.replaceAll("_", " ");

            return `
        <div class="geo-popup-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatPopupValue(key, value))}</strong>
        </div>
      `;
        })
        .join("");

    return `
    <div class="geo-popup">
      <div class="geo-popup-layer">${escapeHtml(layerInfo.name)}</div>
      ${rows || '<p class="geo-popup-empty">Sin atributos disponibles.</p>'}
    </div>
  `;
}

function getFeatureStyle(layerInfo, feature, selectedPredio) {
    const base = layerInfo.style || {};
    const properties = feature?.properties || {};
    const isTerrain = ["u-terreno", "r-terreno"].includes(layerInfo.id);
    const selected =
        isTerrain &&
        selectedPredio?.codigo &&
        String(properties.CODIGO) === String(selectedPredio.codigo);

    if (selected) {
        return {
            color: "#f97316",
            fillColor: "#fb923c",
            weight: 3,
            opacity: 1,
            fillOpacity: 0.55,
        };
    }

    if (layerInfo.geometryKind === "line") {
        return {
            color: base.color || "#475569",
            weight: base.weight ?? 2,
            opacity: base.opacity ?? 0.85,
        };
    }

    return {
        color: base.color || "#0f766e",
        fillColor: base.fillColor || base.color || "#14b8a6",
        weight: base.weight ?? 1.4,
        opacity: base.opacity ?? 1,
        fillOpacity: base.fillOpacity ?? 0.2,
    };
}

function MapController({ mapConfig, selectedPredio, resetCounter, sidebarCollapsed }) {
    const map = useMap();
    const lastConfigRef = useRef("");

    const centerLat = Number(mapConfig?.center?.[0] ?? 4.517973);
    const centerLng = Number(mapConfig?.center?.[1] ?? -74.789503);
    const zoom = Number(mapConfig?.zoom ?? 16);

    useEffect(() => {
        const configKey = `${centerLat},${centerLng},${zoom}`;

        if (lastConfigRef.current !== configKey) {
            lastConfigRef.current = configKey;
            map.setView([centerLat, centerLng], zoom);
        }
    }, [centerLat, centerLng, zoom, map]);

    useEffect(() => {
        if (!selectedPredio?.coords?.length) return;

        const bounds = L.latLngBounds(selectedPredio.coords);

        map.fitBounds(bounds, {
            padding: [55, 55],
            maxZoom: 19,
        });
    }, [selectedPredio, map]);

    useEffect(() => {
        map.setView([centerLat, centerLng], zoom);
    }, [resetCounter, centerLat, centerLng, zoom, map]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            map.invalidateSize();
        }, 260);

        return () => clearTimeout(timeout);
    }, [sidebarCollapsed, map]);

    return null;
}

function BoundsWatcher({ onBoundsChange }) {
    const map = useMap();

    function emitBounds() {
        const bounds = map.getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const center = map.getCenter();

        onBoundsChange({
            minLng: southWest.lng,
            minLat: southWest.lat,
            maxLng: northEast.lng,
            maxLat: northEast.lat,
            centerLng: center.lng,
            centerLat: center.lat,
        });
    }

    useEffect(() => {
        const timeout = setTimeout(emitBounds, 180);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    useMapEvents({
        moveend: emitBounds,
        zoomend: emitBounds,
    });

    return null;
}

function MeasurementEvents({ activeTool, onMeasurementPoint }) {
    useMapEvents({
        click(event) {
            if (activeTool === "area" || activeTool === "distancia") {
                onMeasurementPoint(event.latlng);
            }
        },
    });

    return null;
}

function LayerGeoJson({
    layerInfo,
    payload,
    selectedPredio,
    activeTool,
    onTerrainClick,
}) {
    if (!payload?.features?.length) return null;

    const data = {
        type: "FeatureCollection",
        features: payload.features,
    };

    function onEachFeature(feature, leafletLayer) {
        leafletLayer.bindPopup(buildPopupHtml(feature, layerInfo), {
            maxWidth: 320,
            className: "geo-popup-wrapper",
        });

        if (["r-vereda", "u-barrio"].includes(layerInfo.id)) {
            const label = feature.properties?.NOMBRE;

            if (label) {
                leafletLayer.bindTooltip(String(label), {
                    sticky: true,
                    direction: "top",
                    className: "geo-label-tooltip",
                });
            }
        }

        if (["u-terreno", "r-terreno"].includes(layerInfo.id)) {
            leafletLayer.on("click", () => {
                if (activeTool !== "navegar") return;

                const code = feature.properties?.CODIGO;

                if (code) {
                    onTerrainClick(code);
                }
            });
        }
    }

    return (
        <GeoJSON
            key={`${layerInfo.id}-${payload.loadedAt}-${selectedPredio?.codigo || ""}-${activeTool}`}
            data={data}
            style={(feature) => getFeatureStyle(layerInfo, feature, selectedPredio)}
            onEachFeature={onEachFeature}
        />
    );
}

function LegendSwatch({ layer }) {
    const style = layer.style || {};

    if (layer.geometryKind === "line") {
        return (
            <span
                className="map-legend-swatch line"
                style={{ backgroundColor: style.color || "#475569" }}
            />
        );
    }

    return (
        <span
            className="map-legend-swatch polygon"
            style={{
                backgroundColor: style.fillColor || style.color || "#14b8a6",
                borderColor: style.color || "#0f766e",
            }}
        />
    );
}

function MapView({
    mapConfig,
    layers,
    activeLayerIds,
    selectedPredio,
    onTerrainClick,
    activeTool,
    onToolChange,
    onResetView,
    resetCounter,
    onBoundsChange,
    onStatusChange,
    status,
    legendVisible,
    onToggleLegend,
    sidebarCollapsed,
    onOpenSidebar,
    loadingLayerIds,
}) {
    const [measurementPoints, setMeasurementPoints] = useState([]);
    const [measurementResult, setMeasurementResult] = useState("");

    useEffect(() => {
        setMeasurementPoints([]);
        setMeasurementResult("");
    }, [activeTool, resetCounter]);

    const measurementLine = useMemo(() => {
        if (activeTool !== "distancia" || measurementPoints.length < 2) {
            return null;
        }

        return measurementPoints;
    }, [activeTool, measurementPoints]);

    const measurementPolygon = useMemo(() => {
        if (activeTool !== "area" || measurementPoints.length < 3) {
            return null;
        }

        return measurementPoints;
    }, [activeTool, measurementPoints]);

    const totalVisibleElements = useMemo(() => {
        return layers.reduce((total, layer) => {
            return total + Number(layer.payload?.count || 0);
        }, 0);
    }, [layers]);

    function handleMeasurementPoint(latlng) {
        const nextPoint = [latlng.lat, latlng.lng];

        setMeasurementPoints((previous) => {
            const next = [...previous, nextPoint];

            if (activeTool === "distancia") {
                if (next.length >= 2) {
                    const result = `Distancia total: ${formatDistance(
                        calculateDistance(next)
                    )}`;

                    setMeasurementResult(result);
                    onStatusChange(result);
                } else {
                    setMeasurementResult("Selecciona al menos dos puntos.");
                }
            }

            if (activeTool === "area") {
                if (next.length >= 3) {
                    const result = `Área aproximada: ${formatArea(
                        calculatePolygonArea(next)
                    )}`;

                    setMeasurementResult(result);
                    onStatusChange(result);
                } else {
                    setMeasurementResult("Selecciona al menos tres puntos.");
                }
            }

            return next;
        });
    }

    return (
        <div className={`map-wrapper ${activeTool !== "navegar" ? "measuring" : ""}`}>
            <MapContainer
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                className="leaflet-map"
                preferCanvas
            >
                <MapController
                    mapConfig={mapConfig}
                    selectedPredio={selectedPredio}
                    resetCounter={resetCounter}
                    sidebarCollapsed={sidebarCollapsed}
                />

                <BoundsWatcher onBoundsChange={onBoundsChange} />

                <MeasurementEvents
                    activeTool={activeTool}
                    onMeasurementPoint={handleMeasurementPoint}
                />

                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {layers.map(({ info, payload }) => (
                    <LayerGeoJson
                        key={info.id}
                        layerInfo={info}
                        payload={payload}
                        selectedPredio={selectedPredio}
                        activeTool={activeTool}
                        onTerrainClick={onTerrainClick}
                    />
                ))}

                {measurementLine && (
                    <Polyline
                        positions={measurementLine}
                        pathOptions={{
                            color: "#2563eb",
                            weight: 4,
                            opacity: 0.95,
                        }}
                    />
                )}

                {measurementPolygon && (
                    <Polygon
                        positions={measurementPolygon}
                        pathOptions={{
                            color: "#7c3aed",
                            fillColor: "#8b5cf6",
                            fillOpacity: 0.22,
                            weight: 3,
                        }}
                    />
                )}

                {measurementPoints.map((point, index) => (
                    <CircleMarker
                        key={`measurement-${index}`}
                        center={point}
                        radius={6}
                        pathOptions={{
                            color: "#111827",
                            fillColor: "#facc15",
                            fillOpacity: 1,
                            weight: 2,
                        }}
                    >
                        <Popup>Punto {index + 1}</Popup>
                    </CircleMarker>
                ))}
            </MapContainer>

            {sidebarCollapsed && (
                <button
                    type="button"
                    className="map-panel-open-button"
                    onClick={onOpenSidebar}
                    title="Abrir panel lateral"
                    aria-label="Abrir panel lateral"
                >
                    <PanelIcon />
                </button>
            )}

            <div className="floating-map-tools" aria-label="Herramientas del mapa">
                <button
                    type="button"
                    className={activeTool === "area" ? "active" : ""}
                    onClick={() => onToolChange("area")}
                    title="Medir área"
                    aria-label="Medir área"
                    aria-pressed={activeTool === "area"}
                >
                    <AreaIcon />
                </button>

                <button
                    type="button"
                    className={activeTool === "distancia" ? "active" : ""}
                    onClick={() => onToolChange("distancia")}
                    title="Medir distancia"
                    aria-label="Medir distancia"
                    aria-pressed={activeTool === "distancia"}
                >
                    <DistanceIcon />
                </button>

                <span className="floating-tools-divider" />

                <button
                    type="button"
                    onClick={onResetView}
                    title="Volver a la vista inicial"
                    aria-label="Vista inicial"
                >
                    <HomeIcon />
                </button>
            </div>

            <div className="active-layers-pill">
                <LayersIconForPill />
                <span>{activeLayerIds.length} capas</span>
                <strong>{new Intl.NumberFormat("es-CO").format(totalVisibleElements)}</strong>
            </div>

            {loadingLayerIds.length > 0 && (
                <div className="map-loading-indicator">
                    <span className="small-spinner" />
                    <span>
                        Cargando {loadingLayerIds.length} capa
                        {loadingLayerIds.length === 1 ? "" : "s"}
                    </span>
                </div>
            )}

            {!legendVisible && (
                <button
                    type="button"
                    className="map-legend-toggle"
                    onClick={onToggleLegend}
                    aria-label="Abrir leyenda"
                >
                    <LegendIcon />
                    <span>Leyenda</span>
                </button>
            )}

            {legendVisible && (
                <div className="map-legend-panel">
                    <div className="map-legend-header">
                        <div>
                            <span>Mapa</span>
                            <h3>Leyenda</h3>
                        </div>

                        <button
                            type="button"
                            onClick={onToggleLegend}
                            aria-label="Cerrar leyenda"
                            title="Cerrar leyenda"
                        >
                            <CloseIcon />
                        </button>
                    </div>

                    <div className="map-legend-list">
                        {layers.length === 0 ? (
                            <p className="map-legend-empty">No hay capas activas.</p>
                        ) : (
                            layers.map(({ info }) => (
                                <div className="map-legend-item" key={info.id}>
                                    <LegendSwatch layer={info} />
                                    <span>{info.name}</span>
                                </div>
                            ))
                        )}

                        {selectedPredio && (
                            <div className="map-legend-item special">
                                <span className="map-legend-swatch polygon selected" />
                                <span>Predio seleccionado</span>
                            </div>
                        )}

                        {(activeTool === "area" || activeTool === "distancia") && (
                            <div className="map-legend-item special">
                                <span className="map-legend-swatch line measurement" />
                                <span>Medición activa</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {measurementResult && (
                <div className="measurement-result-panel">
                    <span>Resultado</span>
                    <strong>{measurementResult}</strong>
                </div>
            )}

            <div className="map-status-message">{status}</div>
        </div>
    );
}

function LayersIconForPill() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3 9 5-9 5-9-5z" />
            <path d="m3 12 9 5 9-5" />
        </svg>
    );
}

export default MapView;
