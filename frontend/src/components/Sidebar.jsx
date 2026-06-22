function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
        </svg>
    );
}

function LayersIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3 9 5-9 5-9-5z" />
            <path d="m3 12 9 5 9-5" />
            <path d="m3 16 9 5 9-5" />
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

function RefreshIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6v5h-5" />
            <path d="M4 18v-5h5" />
            <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
        </svg>
    );
}

function CertificateIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 2h8l4 4v16H6z" />
            <path d="M14 2v5h5" />
            <path d="M9 12h6M9 16h6" />
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

function Sidebar({
    activeView,
    onViewChange,
    onClose,
    searchTerm,
    onSearchTermChange,
    onSearch,
    searchResults,
    searchLoading,
    searchError,
    onSelectResult,
    selectedPredio,
    onGenerateCertificate,
    layerCatalog,
    activeLayerIds,
    loadingLayerIds,
    layerErrors,
    onToggleLayer,
    onActivateAll,
    onClearAll,
    onReloadLayers,
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

    return (
        <aside className="sidebar" aria-label="Panel lateral del geovisor">
            <div className="sidebar-topbar">
                <div>
                    <span className="sidebar-kicker">Guataquí</span>
                    <h2>Panel del geovisor</h2>
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

            <div className="sidebar-tabs" role="tablist" aria-label="Vistas del panel">
                <button
                    type="button"
                    className={`sidebar-tab ${activeView === "buscar" ? "active" : ""}`}
                    onClick={() => onViewChange("buscar")}
                    role="tab"
                    aria-selected={activeView === "buscar"}
                >
                    <SearchIcon />
                    <span>Buscar</span>
                </button>

                <button
                    type="button"
                    className={`sidebar-tab ${activeView === "capas" ? "active" : ""}`}
                    onClick={() => onViewChange("capas")}
                    role="tab"
                    aria-selected={activeView === "capas"}
                >
                    <LayersIcon />
                    <span>Capas</span>
                    <span className="tab-count">{activeLayerIds.length}</span>
                </button>
            </div>

            <div className="sidebar-content">
                {activeView === "buscar" && (
                    <div className="panel-view" role="tabpanel">
                        <section className="panel-section search-section">
                            <div className="section-heading">
                                <div>
                                    <span className="section-eyebrow">Consulta predial</span>
                                    <h3>Buscar terreno</h3>
                                </div>
                            </div>

                            <form className="predial-search-form" onSubmit={onSearch}>
                                <label htmlFor="predial-search">Código, vereda o sector</label>

                                <div className="predial-search-row">
                                    <input
                                        id="predial-search"
                                        type="search"
                                        value={searchTerm}
                                        onChange={(event) => onSearchTermChange(event.target.value)}
                                        placeholder="Ej. código predial"
                                        autoComplete="off"
                                    />

                                    <button type="submit" disabled={searchLoading}>
                                        {searchLoading ? (
                                            <span className="small-spinner" aria-hidden="true" />
                                        ) : (
                                            <SearchIcon />
                                        )}
                                        <span>{searchLoading ? "Buscando" : "Buscar"}</span>
                                    </button>
                                </div>
                            </form>

                            {searchError && <p className="inline-message error">{searchError}</p>}

                            {searchResults.length > 0 && (
                                <div className="search-results">
                                    <div className="results-heading">
                                        <span>Resultados</span>
                                        <strong>{searchResults.length}</strong>
                                    </div>

                                    <div className="results-list">
                                        {searchResults.map((predio) => (
                                            <button
                                                type="button"
                                                className="search-result-item"
                                                key={`${predio.layerId}-${predio.id}-${predio.codigo}`}
                                                onClick={() => onSelectResult(predio)}
                                            >
                                                <span className="result-zone">{predio.zona}</span>
                                                <strong>{predio.codigo}</strong>
                                                <small>{predio.barrioOSector || predio.vereda || predio.barrio}</small>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="panel-section selected-property-section">
                            <div className="section-heading">
                                <div>
                                    <span className="section-eyebrow">Selección actual</span>
                                    <h3>Información del predio</h3>
                                </div>
                            </div>

                            {!selectedPredio ? (
                                <div className="empty-state">
                                    <SearchIcon />
                                    <p>Busca un predio o selecciónalo directamente en el mapa.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="selected-property-code">
                                        <span>Código predial</span>
                                        <strong>{selectedPredio.codigo}</strong>
                                    </div>

                                    <dl className="property-details">
                                        <div>
                                            <dt>Zona</dt>
                                            <dd>{selectedPredio.zona || "Sin información"}</dd>
                                        </div>

                                        <div>
                                            <dt>Área</dt>
                                            <dd>{selectedPredio.area || "Sin información"}</dd>
                                        </div>

                                        <div>
                                            <dt>Sector</dt>
                                            <dd>
                                                {selectedPredio.barrioOSector ||
                                                    selectedPredio.vereda ||
                                                    selectedPredio.barrio ||
                                                    "Sin información"}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt>Código anterior</dt>
                                            <dd>{selectedPredio.codigoAnterior || "Sin información"}</dd>
                                        </div>

                                        {selectedPredio.zona === "Urbana" && (
                                            <div>
                                                <dt>Construcciones</dt>
                                                <dd>{selectedPredio.construcciones?.cantidad ?? 0}</dd>
                                            </div>
                                        )}
                                    </dl>

                                    <button
                                        type="button"
                                        className="sidebar-certificate-button"
                                        onClick={onGenerateCertificate}
                                    >
                                        <CertificateIcon />
                                        <span>Generar certificado PDF</span>
                                    </button>
                                </>
                            )}
                        </section>
                    </div>
                )}

                {activeView === "capas" && (
                    <div className="panel-view" role="tabpanel">
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
                    </div>
                )}
            </div>
        </aside>
    );
}

export default Sidebar;
