import {
    CircleMarker,
    MapContainer,
    Polygon,
    Polyline,
    Popup,
    TileLayer,
    useMap,
    useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";

const INITIAL_CENTER = [4.862449952790654, -74.05591147976575];
const INITIAL_ZOOM = 15;

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

    for (let i = 1; i < points.length; i += 1) {
        const previous = L.latLng(points[i - 1][0], points[i - 1][1]);
        const current = L.latLng(points[i][0], points[i][1]);

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

    for (let i = 0; i < radians.length; i += 1) {
        const [lat1, lng1] = radians[i];
        const [lat2, lng2] = radians[(i + 1) % radians.length];

        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    return Math.abs((area * earthRadius * earthRadius) / 2);
}

function getUsoStyle(uso) {
    const texto = String(uso || "").toLowerCase();

    if (texto.includes("comercial")) {
        return {
            color: "#2563eb",
            fillColor: "#60a5fa",
        };
    }

    if (texto.includes("institucional") || texto.includes("equipamiento")) {
        return {
            color: "#7c3aed",
            fillColor: "#a78bfa",
        };
    }

    if (texto.includes("rural") || texto.includes("agro")) {
        return {
            color: "#16a34a",
            fillColor: "#86efac",
        };
    }

    if (texto.includes("lote") || texto.includes("expansion")) {
        return {
            color: "#ca8a04",
            fillColor: "#fde047",
        };
    }

    return {
        color: "#0f766e",
        fillColor: "#14b8a6",
    };
}

function MapController({
    selectedPredio,
    resetCounter,
    sidebarCollapsed,
}) {
    const map = useMap();

    useEffect(() => {
        if (!selectedPredio) return;

        const bounds = L.latLngBounds(selectedPredio.coords);

        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 18,
        });
    }, [selectedPredio, map]);

    useEffect(() => {
        map.setView(INITIAL_CENTER, INITIAL_ZOOM);
    }, [resetCounter, map]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            map.invalidateSize();
        }, 250);

        return () => clearTimeout(timeout);
    }, [sidebarCollapsed, map]);

    return null;
}

function BoundsWatcher({ onBoundsChange }) {
    const map = useMap();

    function emitirBounds() {
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
        const timeout = setTimeout(() => {
            emitirBounds();
        }, 200);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    useMapEvents({
        moveend() {
            emitirBounds();
        },
        zoomend() {
            emitirBounds();
        },
    });

    return null;
}

function MapClickEvents({ activeTool, onMeasurementClick }) {
    useMapEvents({
        click(event) {
            if (activeTool === "distancia" || activeTool === "area") {
                onMeasurementClick(event.latlng);
            }
        },
    });

    return null;
}

function MapView({
    predios,
    selectedPredio,
    onSelectPredio,
    prediosVisible,
    legendVisible,
    activeTool,
    resetCounter,
    status,
    onStatusChange,
    onBoundsChange,
    loadingPredios,
    prediosMeta,
    sidebarCollapsed,
}) {
    const [measurementPoints, setMeasurementPoints] = useState([]);
    const [measurementResult, setMeasurementResult] = useState("");

    const selectedCode = selectedPredio?.codigo;

    useEffect(() => {
        setMeasurementPoints([]);
        setMeasurementResult("");
    }, [activeTool, resetCounter]);

    const prediosParaMapa = useMemo(() => {
        const map = new Map();

        if (selectedPredio) {
            map.set(String(selectedPredio.id), selectedPredio);
        }

        predios.forEach((predio) => {
            map.set(String(predio.id), predio);
        });

        return Array.from(map.values());
    }, [predios, selectedPredio]);

    function getPredioStyle(predio) {
        const isSelected = predio.codigo === selectedCode;

        if (isSelected) {
            return {
                color: "#f97316",
                weight: 3,
                fillColor: "#fb923c",
                fillOpacity: 0.48,
            };
        }

        const usoStyle = getUsoStyle(predio.uso);

        return {
            color: usoStyle.color,
            weight: 1.4,
            fillColor: usoStyle.fillColor,
            fillOpacity: 0.28,
        };
    }

    function handleMeasurementClick(latlng) {
        const newPoint = [latlng.lat, latlng.lng];

        setMeasurementPoints((previousPoints) => {
            const nextPoints = [...previousPoints, newPoint];

            if (activeTool === "distancia") {
                if (nextPoints.length >= 2) {
                    const distance = calculateDistance(nextPoints);
                    const result = `Distancia total: ${formatDistance(distance)}`;

                    setMeasurementResult(result);
                    onStatusChange(result);
                } else {
                    setMeasurementResult("Selecciona al menos dos puntos.");
                    onStatusChange("Selecciona al menos dos puntos para medir distancia.");
                }
            }

            if (activeTool === "area") {
                if (nextPoints.length >= 3) {
                    const area = calculatePolygonArea(nextPoints);
                    const result = `Área aproximada: ${formatArea(area)}`;

                    setMeasurementResult(result);
                    onStatusChange(result);
                } else {
                    setMeasurementResult("Selecciona al menos tres puntos.");
                    onStatusChange("Selecciona al menos tres puntos para medir área.");
                }
            }

            return nextPoints;
        });
    }

    const measurementLine = useMemo(() => {
        if (activeTool !== "distancia") return null;
        if (measurementPoints.length < 2) return null;

        return measurementPoints;
    }, [activeTool, measurementPoints]);

    const measurementPolygon = useMemo(() => {
        if (activeTool !== "area") return null;
        if (measurementPoints.length < 3) return null;

        return measurementPoints;
    }, [activeTool, measurementPoints]);

    return (
        <div className="map-wrapper">
            <MapContainer
                center={INITIAL_CENTER}
                zoom={INITIAL_ZOOM}
                className="leaflet-map"
                preferCanvas={true}
            >
                <MapController
                    selectedPredio={selectedPredio}
                    resetCounter={resetCounter}
                    sidebarCollapsed={sidebarCollapsed}
                />

                <BoundsWatcher onBoundsChange={onBoundsChange} />

                <MapClickEvents
                    activeTool={activeTool}
                    onMeasurementClick={handleMeasurementClick}
                />

                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {prediosVisible &&
                    prediosParaMapa.map((predio) => (
                        <Polygon
                            key={predio.id}
                            positions={predio.coords}
                            pathOptions={getPredioStyle(predio)}
                            eventHandlers={{
                                click: () => {
                                    if (activeTool === "identificar") {
                                        onSelectPredio(predio);
                                    }
                                },
                            }}
                        >
                            <Popup>
                                <div className="popup-content">
                                    <h3>{predio.codigo}</h3>
                                    <p>
                                        <strong>Propietario:</strong> {predio.propietario}
                                    </p>
                                    <p>
                                        <strong>Dirección:</strong> {predio.direccion}
                                    </p>
                                    <p>
                                        <strong>Área:</strong> {predio.area}
                                    </p>
                                    <p>
                                        <strong>Uso:</strong> {predio.uso}
                                    </p>
                                    <p>
                                        <strong>Estado:</strong> {predio.estado}
                                    </p>
                                </div>
                            </Popup>
                        </Polygon>
                    ))}

                {measurementLine && (
                    <Polyline
                        positions={measurementLine}
                        pathOptions={{
                            color: "#2563eb",
                            weight: 4,
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

            {loadingPredios && (
                <div className="loading-layer">
                    <div className="loader"></div>
                    <p>Cargando predios de la zona visible...</p>
                </div>
            )}

            <div className="map-tool-indicator">
                <strong>Herramienta:</strong>{" "}
                {activeTool === "identificar" && "Identificar predio"}
                {activeTool === "distancia" && "Medición de distancia"}
                {activeTool === "area" && "Medición de área"}
            </div>

            <div className="map-floating-panel">
                <strong>Predios visibles:</strong>
                <span> {prediosVisible ? prediosMeta.count : 0}</span>

                {prediosMeta.total > prediosMeta.count && (
                    <small>Mostrando una parte de la vista actual</small>
                )}
            </div>

            {legendVisible && (
                <div className="map-legend">
                    <h3>Leyenda</h3>

                    <div className="legend-item">
                        <span className="legend-color residencial"></span>
                        <p>Residencial / general</p>
                    </div>

                    <div className="legend-item">
                        <span className="legend-color comercial"></span>
                        <p>Comercial</p>
                    </div>

                    <div className="legend-item">
                        <span className="legend-color institucional"></span>
                        <p>Institucional</p>
                    </div>

                    <div className="legend-item">
                        <span className="legend-color seleccionado"></span>
                        <p>Predio seleccionado</p>
                    </div>

                    <div className="legend-item">
                        <span className="legend-color medicion"></span>
                        <p>Medición</p>
                    </div>
                </div>
            )}

            {measurementResult && (
                <div className="measurement-panel">
                    <strong>Resultado:</strong>
                    <span>{measurementResult}</span>
                </div>
            )}

            <div className="map-status">{status}</div>
        </div>
    );
}

export default MapView;