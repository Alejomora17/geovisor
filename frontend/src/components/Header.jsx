function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
        </svg>
    );
}

function Header({
    selectedPredio,
    onCertificateClick,
    searchTerm,
    onSearchTermChange,
    onSearch,
    searchResults = [],
    searchLoading,
    searchError,
    onSelectResult,
}) {
    return (
        <header className="app-header">
            <div className="header-brand">
                <div className="brand-icon" aria-hidden="true">
                    G
                </div>

                <div className="brand-copy">
                    <div className="brand-title-row">
                        <h1>Geovisor Predial de Guataquí</h1>
                        <span className="beta-badge">BETA</span>
                    </div>

                    <p>Consulta geográfica y predial · Guataquí, Cundinamarca</p>
                </div>
            </div>

            {/* Buscador de predio movido al header. */}
            <div className="header-search">
                <form className="header-search-form" onSubmit={onSearch}>
                    <span className="header-search-icon" aria-hidden="true">
                        <SearchIcon />
                    </span>

                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => onSearchTermChange(event.target.value)}
                        placeholder="Buscar por código predial, vereda o sector"
                        aria-label="Buscar predio"
                        autoComplete="off"
                    />

                    <button type="submit" disabled={searchLoading}>
                        {searchLoading ? "Buscando..." : "Buscar"}
                    </button>
                </form>

                {(searchError || searchResults.length > 0) && (
                    <div className="header-search-results">
                        {searchError && (
                            <p className="header-search-error">{searchError}</p>
                        )}

                        {searchResults.map((predio) => (
                            <button
                                type="button"
                                className="header-search-result"
                                key={`${predio.layerId}-${predio.id}-${predio.codigo}`}
                                onClick={() => onSelectResult(predio)}
                            >
                                <span className="result-zone">{predio.zona}</span>
                                <strong>{predio.codigo}</strong>
                                <small>
                                    {predio.barrioOSector ||
                                        predio.vereda ||
                                        predio.barrio}
                                </small>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="header-actions">
                {selectedPredio && (
                    <span className="selected-code-chip" title={selectedPredio.codigo}>
                        {selectedPredio.codigo}
                    </span>
                )}

                <button
                    type="button"
                    className="header-certificate-button"
                    onClick={onCertificateClick}
                    disabled={!selectedPredio}
                    title={
                        selectedPredio
                            ? "Generar certificado del predio seleccionado"
                            : "Selecciona un predio para generar el certificado"
                    }
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 2h8l4 4v16H6z" />
                        <path d="M14 2v5h5" />
                        <path d="M9 13h6M9 17h6M9 9h2" />
                    </svg>
                    <span>Certificado</span>
                </button>
            </div>
        </header>
    );
}

export default Header;