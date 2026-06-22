function Header({ selectedPredio, onCertificateClick }) {
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
