function Sidebar({
    selectedPredio,
    searchTerm,
    onSearchTermChange,
    onSearch,
    prediosVisible,
    legendVisible,
    activeTool,
    onToggleLayer,
    onToggleLegend,
    onToolChange,
    onResetView,
    onGeneratePdf,
    onDownloadData,
    onPrint,
    onReloadVisible,
    loadingPredios,
    prediosMeta,
}) {
    return (
        <aside className="sidebar">
            <section className="sidebar-card sidebar-summary">
                <div className="card-title-row">
                    <h2>Estado de la capa</h2>
                    <span className="status-pill">BETA</span>
                </div>

                <div className="stats-grid">
                    <div>
                        <span>Visibles</span>
                        <strong>{prediosMeta.count}</strong>
                    </div>

                    <div>
                        <span>En vista</span>
                        <strong>{prediosMeta.total}</strong>
                    </div>
                </div>

                <p className="helper-text">
                    El visor carga únicamente los predios dentro de la zona visible del
                    mapa para mejorar el rendimiento.
                </p>

                <button
                    type="button"
                    className="full-button"
                    onClick={onReloadVisible}
                    disabled={loadingPredios}
                >
                    {loadingPredios ? "Cargando predios..." : "Actualizar vista"}
                </button>
            </section>

            <section className="sidebar-card">
                <div className="card-title-row">
                    <h2>Búsqueda predial</h2>
                    <span className="mini-pill">Consulta</span>
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSearch();
                    }}
                >
                    <label className="input-label">Código, dirección o propietario</label>

                    <div className="search-row">
                        <input
                            type="text"
                            placeholder="Ej: PREDIO-001"
                            className="search-input"
                            value={searchTerm}
                            onChange={(event) => onSearchTermChange(event.target.value)}
                        />

                        <button type="submit" className="search-button">
                            Buscar
                        </button>
                    </div>
                </form>

                <p className="helper-text">
                    Puedes buscar por código predial, dirección, propietario, uso del
                    suelo o sector.
                </p>
            </section>

            <section className="sidebar-card">
                <h2>Herramientas</h2>

                <div className="tool-grid">
                    <button
                        type="button"
                        className={`tool-button ${prediosVisible ? "active" : ""}`}
                        onClick={onToggleLayer}
                    >
                        🗺️ {prediosVisible ? "Ocultar capa" : "Mostrar capa"}
                    </button>

                    <button
                        type="button"
                        className={`tool-button ${legendVisible ? "active" : ""}`}
                        onClick={onToggleLegend}
                    >
                        🧾 Leyenda
                    </button>

                    <button
                        type="button"
                        className={`tool-button ${activeTool === "identificar" ? "active" : ""
                            }`}
                        onClick={() => onToolChange("identificar")}
                    >
                        🔎 Identificar
                    </button>

                    <button
                        type="button"
                        className={`tool-button ${activeTool === "area" ? "active" : ""}`}
                        onClick={() => onToolChange("area")}
                    >
                        ◼️ Área
                    </button>

                    <button
                        type="button"
                        className={`tool-button ${activeTool === "distancia" ? "active" : ""
                            }`}
                        onClick={() => onToolChange("distancia")}
                    >
                        📏 Distancia
                    </button>

                    <button type="button" className="tool-button" onClick={onResetView}>
                        🧭 Vista inicial
                    </button>
                </div>
            </section>

            <section className="sidebar-card">
                <h2>Información del predio</h2>

                <div className="property-info">
                    <div>
                        <span>Código</span>
                        <strong>{selectedPredio?.codigo || "---"}</strong>
                    </div>

                    <div>
                        <span>Propietario</span>
                        <strong>{selectedPredio?.propietario || "---"}</strong>
                    </div>

                    <div>
                        <span>Dirección</span>
                        <strong>{selectedPredio?.direccion || "---"}</strong>
                    </div>

                    <div>
                        <span>Uso</span>
                        <strong>{selectedPredio?.uso || "---"}</strong>
                    </div>

                    <div>
                        <span>Área</span>
                        <strong>{selectedPredio?.area || "---"}</strong>
                    </div>

                    <div>
                        <span>Estado</span>
                        <strong>{selectedPredio?.estado || "---"}</strong>
                    </div>
                </div>
            </section>

            <section className="sidebar-card certificate-card">
                <h2>Certificados</h2>

                <p>
                    Generación de certificado predial en PDF. La contraseña se valida
                    desde el backend.
                </p>

                <button
                    type="button"
                    className="certificate-button"
                    onClick={onGeneratePdf}
                >
                    Generar certificado PDF
                </button>
            </section>

            <section className="sidebar-card">
                <h2>Salidas</h2>

                <div className="tool-grid">
                    <button type="button" className="tool-button" onClick={onPrint}>
                        🖨️ Imprimir mapa
                    </button>

                    <button
                        type="button"
                        className="tool-button"
                        onClick={onDownloadData}
                    >
                        ⬇️ Descargar visibles
                    </button>
                </div>
            </section>
        </aside>
    );
}

export default Sidebar;