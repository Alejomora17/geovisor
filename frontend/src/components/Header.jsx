function Header({ onCertificateClick, onToggleSidebar, sidebarCollapsed }) {
    return (
        <header className="app-header">
            <div className="header-brand">
                <div className="brand-icon">G</div>

                <div>
                    <h1>Geovisor Predial Municipal</h1>
                    <p>Prototipo BETA para consulta geográfica y predial</p>
                </div>
            </div>

            <nav className="header-actions">
                <button type="button" className="header-btn" onClick={onToggleSidebar}>
                    {sidebarCollapsed ? "☰ Mostrar panel" : "☰ Ocultar panel"}
                </button>

                <button type="button" className="header-btn">
                    Ayuda
                </button>

                <button
                    type="button"
                    className="header-btn primary"
                    onClick={onCertificateClick}
                >
                    Generar certificado
                </button>
            </nav>
        </header>
    );
}

export default Header;