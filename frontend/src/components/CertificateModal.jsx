import { useEffect, useRef, useState } from "react";

function CertificateModal({
    isOpen,
    onClose,
    onConfirm,
    selectedPredio,
    loading,
    error,
}) {
    const [password, setPassword] = useState("");
    const passwordInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setPassword("");

            setTimeout(() => {
                passwordInputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    useEffect(() => {
        function handleEsc(event) {
            if (event.key === "Escape" && isOpen && !loading) {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEsc);

        return () => {
            window.removeEventListener("keydown", handleEsc);
        };
    }, [isOpen, loading, onClose]);

    if (!isOpen) return null;

    function handleSubmit(event) {
        event.preventDefault();
        onConfirm(password);
    }

    return (
        <div className="modal-overlay">
            <div className="certificate-modal" role="dialog" aria-modal="true">
                <div className="modal-header">
                    <div className="modal-title-group">
                        <div className="modal-icon">PDF</div>

                        <div>
                            <h2>Acceso a certificado predial</h2>
                            <p>
                                Ingresa la contraseña autorizada para generar el certificado del
                                predio seleccionado.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="modal-close-btn"
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Cerrar modal"
                    >
                        ✕
                    </button>
                </div>

                <div className="modal-predio-box">
                    <span>Predio seleccionado</span>
                    <strong>{selectedPredio?.codigo || "---"}</strong>
                    <small>{selectedPredio?.direccion || "Sin dirección disponible"}</small>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    <label className="modal-label" htmlFor="certificate-password">
                        Contraseña de autorización
                    </label>

                    <input
                        id="certificate-password"
                        ref={passwordInputRef}
                        type="password"
                        className="modal-input"
                        placeholder="Ingresa la contraseña"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={loading}
                        autoComplete="off"
                    />

                    {error && <p className="modal-error">{error}</p>}

                    <div className="modal-security-note">
                        <strong>Nota:</strong>
                        <span>
                            La contraseña se valida desde el backend antes de generar el PDF.
                        </span>
                    </div>

                    <div className="modal-actions">
                        <button
                            type="button"
                            className="modal-btn secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="modal-btn primary"
                            disabled={loading}
                        >
                            {loading ? "Generando..." : "Generar certificado"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default CertificateModal;