function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6v5h-5" />
            <path d="M4 18v-5h5" />
            <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
        </svg>
    );
}

// Icono para el botón de subir capa temporal.
function UploadIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
    );
}

function formatCount(value) {
    return new Intl.NumberFormat("es-CO").format(Number(value || 0));
}

function LayerSwatch({ layer }) {
    const style = layer.style || {};
    const isLine = layer.geometryKind === "line";

    if (isLine) {
        return (
            <span
                className="layer-swatch line"
                style={{
                    backgroundColor: style.color || "#475569",
                }}
                aria-hidden="true"
            />
        );
    }

    return (
        <span
            className="layer-swatch polygon"
            style={{
                backgroundColor: style.fillColor || style.color || "#14b8a6",
                borderColor: style.color || "#0f766e",
            }}
            aria-hidden="true"
        />
    );
}

// El panel lateral ahora es SOLO de capas (fijas + temporales).
// La búsqueda de predios se movió al header.
function Sidebar({
    onClose,
    layerCatalog,
    activeLayerIds,
    loadingLayerIds,
    layerErrors,
    onToggleLayer,
    onActivateAll,
    onClearAll,
    onReloadLayers,
    temporaryLayers = [],
    onAddTemporaryLayer,
    onToggleTemporaryLayer,
    onRemoveTemporaryLayer,
}) {
    const groupedLayers = layerCatalog.reduce((groups, layer) => {
        const groupName = layer.group || "Otras capas";

        if (!groups[groupName]) {
            groups[groupName] = [];
        }

        groups[groupName].push(layer);
        return groups;
    }, {});

    Object.values(groupedLayers).forEach((layers) => {
        layers.sort((a, b) => a.order - b.order);
    });

    function handleFileChange(event) {
        const file = event.target.files && event.target.files[0];

        if (file && onAddTemporaryLayer) {
            onAddTemporaryLayer(file);
        }

        event.target.value = "";
    }

    return (
        <aside className="sidebar" aria-label="Panel lateral del geovisor">
            <div className="sidebar-topbar">
                <div>
                    <span className="sidebar-kicker">Guataquí</span>
                    <h2>Panel de capas</h2>
                </div>

                <button
                    type="button"
                    className="sidebar-close-button"
                    onClick={onClose}
                    aria-label="Ocultar panel lateral"
                    title="Ocultar panel"
                >
                    <CloseIcon />
                </button>
            </div>

            <div className="sidebar-content">
                <div className="panel-view">
                    <section className="panel-section layers-section">
                        <div className="section-heading layers-heading">
                            <div>
                                <span className="section-eyebrow">Contenido cartográfico</span>
                                <h3>Capas del mapa</h3>
                            </div>

                            <button
                                type="button"
                                className="icon-action-button"
                                onClick={onReloadLayers}
                                title="Actualizar las capas de la vista"
                                aria-label="Actualizar capas"
                            >
                                <RefreshIcon />
                            </button>
                        </div>

                        <p className="layers-help">
                            Solo se consultan y dibujan las capas que estén activadas.
                        </p>

                        <div className="layer-bulk-actions">
                            <button type="button" onClick={onActivateAll}>
                                Activar todas
                            </button>
                            <button type="button" onClick={onClearAll}>
                                Limpiar
                            </button>
                        </div>

                        <div className="layer-groups">
                            {Object.entries(groupedLayers).map(([groupName, layers]) => (
                                <div className="layer-group" key={groupName}>
                                    <h4>{groupName}</h4>

                                    <div className="layer-list">
                                        {layers.map((layer) => {
                                            const checked = activeLayerIds.includes(layer.id);
                                            const loading = loadingLayerIds.includes(layer.id);
                                            const error = layerErrors[layer.id];

                                            return (
                                                <label
                                                    className={`layer-item ${checked ? "active" : ""}`}
                                                    key={layer.id}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => onToggleLayer(layer.id)}
                                                    />

                                                    <span className="custom-checkbox" aria-hidden="true" />
                                                    <LayerSwatch layer={layer} />

                                                    <span className="layer-copy">
                                                        <strong>{layer.name}</strong>
                                                        <small>{formatCount(layer.count)} elementos</small>

                                                        {error && <em>{error}</em>}
                                                    </span>

                                                    {loading && (
                                                        <span className="small-spinner layer-spinner" aria-label="Cargando capa" />
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Sección de capas temporales subidas por el usuario. */}
                    <section className="panel-section layers-section">
                        <div className="section-heading">
                            <div>
                                <span className="section-eyebrow">Datos propios</span>
                                <h3>Capas temporales</h3>
                            </div>
                        </div>

                        <p className="layers-help">
                            Sube un archivo GeoJSON para verlo sobre el mapa. No se guarda:
                            desaparece al cerrar o recargar la pestaña.
                        </p>

                        <label
                            className="sidebar-certificate-button"
                            style={{ cursor: "pointer" }}
                        >
                            <UploadIcon />
                            <span>Agregar GeoJSON</span>

                            <input
                                type="file"
                                accept=".geojson,.json,application/geo+json,application/json"
                                onChange={handleFileChange}
                                style={{ display: "none" }}
                            />
                        </label>

                        {temporaryLayers.length > 0 && (
                            <div className="layer-list" style={{ marginTop: "0.75rem" }}>
                                {temporaryLayers.map((layer) => (
                                    <div
                                        className={`layer-item ${layer.visible ? "active" : ""}`}
                                        key={layer.id}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={layer.visible}
                                            onChange={() => onToggleTemporaryLayer(layer.id)}
                                        />

                                        <span className="custom-checkbox" aria-hidden="true" />

                                        <span
                                            className="layer-swatch polygon"
                                            style={{
                                                backgroundColor: layer.color,
                                                borderColor: layer.color,
                                            }}
                                            aria-hidden="true"
                                        />

                                        <span className="layer-copy">
                                            <strong>{layer.name}</strong>
                                            <small>{formatCount(layer.count)} entidades</small>
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => onRemoveTemporaryLayer(layer.id)}
                                            title="Quitar capa temporal"
                                            aria-label="Quitar capa temporal"
                                            style={{
                                                marginLeft: "auto",
                                                background: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                fontSize: "1rem",
                                                lineHeight: 1,
                                                color: "#64748b",
                                                padding: "0.25rem",
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </aside>
    );
}

export default Sidebar;