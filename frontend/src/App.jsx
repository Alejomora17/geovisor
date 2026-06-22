import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";
import CertificateModal from "./components/CertificateModal";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/$/, "");

const FALLBACK_MAP = {
  center: [4.517973, -74.789503],
  zoom: 16,
};

const ELEMENTOS_POR_CAPA = 6000;

function isMobileViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches
  );
}

function boundsKey(bounds) {
  if (!bounds) return "";

  return [
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
    bounds.centerLng,
    bounds.centerLat,
  ]
    .map((value) => Number(value).toFixed(5))
    .join(",");
}

function sanitizeDownloadName(value) {
  return String(value || "predio")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 100);
}

function App() {
  const [mapConfig, setMapConfig] = useState(FALLBACK_MAP);
  const [layerCatalog, setLayerCatalog] = useState([]);
  const [activeLayerIds, setActiveLayerIds] = useState([]);
  const [layerData, setLayerData] = useState({});
  const [loadingLayerIds, setLoadingLayerIds] = useState([]);
  const [layerErrors, setLayerErrors] = useState({});

  const [currentBounds, setCurrentBounds] = useState(null);
  const [selectedPredio, setSelectedPredio] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    isMobileViewport()
  );
  const [sidebarView, setSidebarView] = useState("buscar");

  const [legendVisible, setLegendVisible] = useState(false);
  const [activeTool, setActiveTool] = useState("navegar");
  const [resetCounter, setResetCounter] = useState(0);

  const [status, setStatus] = useState(
    "Preparando las capas de Guataquí..."
  );

  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [certificateError, setCertificateError] = useState("");
  const [certificateLoading, setCertificateLoading] = useState(false);

  const loadTimerRef = useRef(null);
  const lastLoadKeyRef = useRef("");
  const requestIdRef = useRef(0);
  const catalogInitializedRef = useRef(false);

  const activeLayerKey = useMemo(
    () => [...activeLayerIds].sort().join("|"),
    [activeLayerIds]
  );

  const layersForMap = useMemo(() => {
    return layerCatalog
      .filter((layer) => activeLayerIds.includes(layer.id))
      .sort((a, b) => a.order - b.order)
      .map((layer) => ({
        info: layer,
        payload: layerData[layer.id] || null,
      }));
  }, [layerCatalog, activeLayerIds, layerData]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguration() {
      try {
        const response = await fetch(`${API_URL}/api/config`);

        if (!response.ok) {
          throw new Error("No fue posible cargar la configuración del visor.");
        }

        const payload = await response.json();

        if (cancelled) return;

        const layers = Array.isArray(payload.layers) ? payload.layers : [];

        setLayerCatalog(layers);

        if (payload.map?.center && payload.map?.zoom) {
          setMapConfig({
            center: payload.map.center,
            zoom: payload.map.zoom,
          });
        }

        if (!catalogInitializedRef.current) {
          const defaults = layers
            .filter((layer) => layer.defaultVisible)
            .sort((a, b) => a.order - b.order)
            .map((layer) => layer.id);

          setActiveLayerIds(defaults);
          catalogInitializedRef.current = true;
        }

        setStatus("Configuración de Guataquí cargada correctamente.");
      } catch (error) {
        console.error("Error cargando configuración:", error);

        if (!cancelled) {
          setStatus("No fue posible cargar la configuración del backend.");
        }
      }
    }

    loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");

    function handleViewportChange(event) {
      if (event.matches) {
        setSidebarCollapsed(true);
      }
    }

    mediaQuery.addEventListener?.("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener?.("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!currentBounds) return;

    const ids = activeLayerKey ? activeLayerKey.split("|") : [];

    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
    }

    if (!ids.length) {
      setLayerData({});
      setLoadingLayerIds([]);
      setStatus("No hay capas activas.");
      return;
    }

    loadTimerRef.current = setTimeout(() => {
      loadActiveLayers(currentBounds, ids);
    }, 320);

    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
      }
    };
  }, [currentBounds, activeLayerKey]);

  useEffect(() => {
    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
      }
    };
  }, []);

  function sortLayerIds(ids) {
    const orderById = new Map(
      layerCatalog.map((layer) => [layer.id, layer.order])
    );

    return [...new Set(ids)].sort(
      (a, b) => (orderById.get(a) ?? 999) - (orderById.get(b) ?? 999)
    );
  }

  async function loadActiveLayers(bounds, ids, force = false) {
    if (!bounds || !ids.length) return;

    const requestKey = `${boundsKey(bounds)}|${[...ids].sort().join("|")}`;

    if (!force && requestKey === lastLoadKeyRef.current) {
      return;
    }

    lastLoadKeyRef.current = requestKey;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const bbox = [
      bounds.minLng,
      bounds.minLat,
      bounds.maxLng,
      bounds.maxLat,
    ].join(",");

    const center = `${bounds.centerLng},${bounds.centerLat}`;

    setLoadingLayerIds(ids);
    setLayerErrors({});
    setStatus(`Cargando ${ids.length} capa${ids.length === 1 ? "" : "s"}...`);

    const results = await Promise.allSettled(
      ids.map(async (layerId) => {
        const response = await fetch(
          `${API_URL}/api/capas/${encodeURIComponent(
            layerId
          )}?bbox=${bbox}&center=${center}&limit=${ELEMENTOS_POR_CAPA}`
        );

        if (!response.ok) {
          let message = `No fue posible cargar la capa ${layerId}.`;

          try {
            const errorPayload = await response.json();
            message = errorPayload.message || message;
          } catch {
            // Se conserva el mensaje genérico.
          }

          throw new Error(message);
        }

        const payload = await response.json();

        return {
          layerId,
          payload: {
            ...payload,
            loadedAt: Date.now(),
          },
        };
      })
    );

    if (requestId !== requestIdRef.current) {
      return;
    }

    const nextData = {};
    const nextErrors = {};
    let totalLoaded = 0;
    let truncatedLayers = 0;

    results.forEach((result, index) => {
      const layerId = ids[index];

      if (result.status === "fulfilled") {
        nextData[layerId] = result.value.payload;
        totalLoaded += result.value.payload.count || 0;

        if (result.value.payload.truncated) {
          truncatedLayers += 1;
        }
      } else {
        nextErrors[layerId] =
          result.reason?.message || "Error al cargar esta capa.";
      }
    });

    setLayerData(nextData);
    setLayerErrors(nextErrors);
    setLoadingLayerIds([]);

    const failedCount = Object.keys(nextErrors).length;

    if (failedCount > 0) {
      setStatus(
        `Se cargaron ${totalLoaded} elementos. ${failedCount} capa${failedCount === 1 ? " presentó" : "s presentaron"
        } un error.`
      );
    } else if (truncatedLayers > 0) {
      setStatus(
        `${totalLoaded} elementos cargados. Acerca el mapa para ver más detalle en las capas limitadas.`
      );
    } else {
      setStatus(`${totalLoaded} elementos cargados en la zona visible.`);
    }
  }

  function handleBoundsChange(bounds) {
    setCurrentBounds(bounds);
  }

  function reloadCurrentView() {
    if (!currentBounds) {
      setStatus("Aún no hay una vista del mapa para actualizar.");
      return;
    }

    const ids = activeLayerKey ? activeLayerKey.split("|") : [];
    lastLoadKeyRef.current = "";
    loadActiveLayers(currentBounds, ids, true);
  }

  function toggleLayer(layerId) {
    const isCurrentlyActive = activeLayerIds.includes(layerId);

    setActiveLayerIds((previous) => {
      if (previous.includes(layerId)) {
        return previous.filter((id) => id !== layerId);
      }

      return sortLayerIds([...previous, layerId]);
    });

    if (isCurrentlyActive) {
      setLayerData((previous) => {
        const next = { ...previous };
        delete next[layerId];
        return next;
      });

      if (selectedPredio?.layerId === layerId) {
        setSelectedPredio(null);
      }
    }
  }

  function activateAllLayers() {
    setActiveLayerIds(
      layerCatalog
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((layer) => layer.id)
    );
  }

  function clearAllLayers() {
    setActiveLayerIds([]);
    setLayerData({});
    setSelectedPredio(null);
  }

  async function searchPredios(event) {
    event?.preventDefault();

    const query = searchTerm.trim();

    if (!query) {
      setSearchError("Escribe un código, sector, vereda o zona.");
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setSearchError("");

    try {
      const response = await fetch(
        `${API_URL}/api/predios/buscar?q=${encodeURIComponent(query)}&limit=20`
      );

      if (!response.ok) {
        throw new Error("No fue posible realizar la búsqueda.");
      }

      const payload = await response.json();
      const results = Array.isArray(payload.data) ? payload.data : [];

      setSearchResults(results);

      if (!results.length) {
        setSearchError("No se encontraron predios con ese criterio.");
        setStatus("La búsqueda no produjo resultados.");
      } else {
        setStatus(`${results.length} resultado${results.length === 1 ? "" : "s"} encontrado${results.length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      console.error("Error buscando predios:", error);
      setSearchError("Error de conexión durante la búsqueda.");
      setSearchResults([]);
      setStatus("No fue posible consultar los predios.");
    } finally {
      setSearchLoading(false);
    }
  }

  function selectSearchResult(predio) {
    setSelectedPredio(predio);
    setSearchResults([]);
    setSearchError("");
    setActiveTool("navegar");

    if (predio.layerId && !activeLayerIds.includes(predio.layerId)) {
      setActiveLayerIds((previous) =>
        sortLayerIds([...previous, predio.layerId])
      );
    }

    setStatus(`Predio seleccionado: ${predio.codigo}`);
  }

  async function selectTerrainFromMap(code) {
    if (!code) return;

    try {
      const response = await fetch(
        `${API_URL}/api/predios/${encodeURIComponent(code)}`
      );

      if (!response.ok) {
        throw new Error("No fue posible consultar el predio.");
      }

      const predio = await response.json();

      setSelectedPredio(predio);
      setSidebarView("buscar");
      setStatus(`Predio seleccionado: ${predio.codigo}`);
    } catch (error) {
      console.error("Error consultando predio:", error);
      setStatus("No fue posible cargar el detalle del predio.");
    }
  }

  function changeTool(tool) {
    setActiveTool((current) => {
      const next = current === tool ? "navegar" : tool;

      if (next === "area") {
        setStatus("Medición de área activa. Marca al menos tres puntos.");
      } else if (next === "distancia") {
        setStatus("Medición de distancia activa. Marca al menos dos puntos.");
      } else {
        setStatus("Modo de navegación activo.");
      }

      return next;
    });
  }

  function resetMapView() {
    setActiveTool("navegar");
    setSelectedPredio(null);
    setResetCounter((value) => value + 1);
    setStatus("Vista inicial de Guataquí restaurada.");
  }

  function openCertificateModal() {
    if (!selectedPredio) {
      setStatus("Selecciona primero un predio para generar el certificado.");
      return;
    }

    setCertificateError("");
    setIsCertificateModalOpen(true);
  }

  function closeCertificateModal() {
    if (certificateLoading) return;

    setIsCertificateModalOpen(false);
    setCertificateError("");
  }

  async function generateCertificatePdf(password) {
    if (!selectedPredio) {
      setCertificateError("No hay un predio seleccionado.");
      return;
    }

    if (!password) {
      setCertificateError("Debes ingresar la contraseña.");
      return;
    }

    setCertificateLoading(true);
    setCertificateError("");

    try {
      const response = await fetch(
        `${API_URL}/api/certificados/${encodeURIComponent(
          selectedPredio.codigo
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password }),
        }
      );

      if (!response.ok) {
        let message = "No fue posible generar el certificado.";

        try {
          const payload = await response.json();
          message = payload.message || message;
        } catch {
          // Se conserva el mensaje genérico.
        }

        setCertificateError(message);
        setStatus(message);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `certificado-${sanitizeDownloadName(
        selectedPredio.codigo
      )}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setIsCertificateModalOpen(false);
      setStatus(`Certificado generado para ${selectedPredio.codigo}.`);
    } catch (error) {
      console.error("Error generando certificado:", error);
      setCertificateError("Error de conexión con el backend.");
      setStatus("No fue posible generar el certificado.");
    } finally {
      setCertificateLoading(false);
    }
  }

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Header
        selectedPredio={selectedPredio}
        onCertificateClick={openCertificateModal}
      />

      <main className="app-body">
        {!sidebarCollapsed && (
          <Sidebar
            activeView={sidebarView}
            onViewChange={setSidebarView}
            onClose={() => setSidebarCollapsed(true)}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onSearch={searchPredios}
            searchResults={searchResults}
            searchLoading={searchLoading}
            searchError={searchError}
            onSelectResult={selectSearchResult}
            selectedPredio={selectedPredio}
            onGenerateCertificate={openCertificateModal}
            layerCatalog={layerCatalog}
            activeLayerIds={activeLayerIds}
            loadingLayerIds={loadingLayerIds}
            layerErrors={layerErrors}
            onToggleLayer={toggleLayer}
            onActivateAll={activateAllLayers}
            onClearAll={clearAllLayers}
            onReloadLayers={reloadCurrentView}
          />
        )}

        <section className="map-section">
          <MapView
            mapConfig={mapConfig}
            layers={layersForMap}
            activeLayerIds={activeLayerIds}
            selectedPredio={selectedPredio}
            onTerrainClick={selectTerrainFromMap}
            activeTool={activeTool}
            onToolChange={changeTool}
            onResetView={resetMapView}
            resetCounter={resetCounter}
            onBoundsChange={handleBoundsChange}
            onStatusChange={setStatus}
            status={status}
            legendVisible={legendVisible}
            onToggleLegend={() => setLegendVisible((value) => !value)}
            sidebarCollapsed={sidebarCollapsed}
            onOpenSidebar={() => setSidebarCollapsed(false)}
            loadingLayerIds={loadingLayerIds}
          />
        </section>
      </main>

      <CertificateModal
        isOpen={isCertificateModalOpen}
        onClose={closeCertificateModal}
        onConfirm={generateCertificatePdf}
        selectedPredio={selectedPredio}
        loading={certificateLoading}
        error={certificateError}
      />
    </div>
  );
}

export default App;
