import { useRef, useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";
import CertificateModal from "./components/CertificateModal";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/$/, "");
const LIMIT_PREDIOS_POR_VISTA = 3000;

function normalizarTexto(texto) {
  return String(texto || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function crearBboxKey(bounds) {
  if (!bounds) return "";

  return [
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
    bounds.centerLng,
    bounds.centerLat,
  ]
    .filter((value) => Number.isFinite(Number(value)))
    .map((value) => Number(value).toFixed(5))
    .join(",");
}

function App() {
  const [predios, setPredios] = useState([]);
  const [selectedPredio, setSelectedPredio] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [prediosVisible, setPrediosVisible] = useState(true);
  const [legendVisible, setLegendVisible] = useState(true);
  const [activeTool, setActiveTool] = useState("identificar");
  const [resetCounter, setResetCounter] = useState(0);
  const [status, setStatus] = useState(
    "Mueve o acerca el mapa para cargar predios por zona visible."
  );

  const [loadingPredios, setLoadingPredios] = useState(false);
  const [prediosMeta, setPrediosMeta] = useState({
    count: 0,
    total: 0,
    totalGeneral: 0,
    limit: LIMIT_PREDIOS_POR_VISTA,
  });

  const [currentBounds, setCurrentBounds] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [certificateError, setCertificateError] = useState("");
  const [certificateLoading, setCertificateLoading] = useState(false);

  const fetchTimeoutRef = useRef(null);
  const lastBboxKeyRef = useRef("");
  const requestIdRef = useRef(0);

  async function cargarPrediosPorBbox(bounds, force = false) {
    if (!bounds) return;

    const bboxKey = crearBboxKey(bounds);

    if (!force && bboxKey === lastBboxKeyRef.current) {
      return;
    }

    lastBboxKeyRef.current = bboxKey;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;

    const center =
      Number.isFinite(Number(bounds.centerLng)) &&
        Number.isFinite(Number(bounds.centerLat))
        ? `&center=${bounds.centerLng},${bounds.centerLat}`
        : "";

    setLoadingPredios(true);

    try {
      const response = await fetch(
        `${API_URL}/api/predios?bbox=${bbox}${center}&limit=${LIMIT_PREDIOS_POR_VISTA}`
      );

      if (!response.ok) {
        throw new Error("No fue posible cargar los predios.");
      }

      const payload = await response.json();

      if (requestId !== requestIdRef.current) {
        return;
      }

      const data = Array.isArray(payload) ? payload : payload.data || [];

      setPredios(data);
      setPrediosMeta({
        count: payload.count ?? data.length,
        total: payload.total ?? data.length,
        totalGeneral: payload.totalGeneral ?? data.length,
        limit: payload.limit ?? LIMIT_PREDIOS_POR_VISTA,
      });

      if (payload.total > payload.count) {
        setStatus(
          `Se muestran ${payload.count} de ${payload.total} predios en esta vista. Acerca más el mapa para reducir la carga.`
        );
      } else {
        setStatus(`${data.length} predios cargados en la zona visible.`);
      }
    } catch (error) {
      console.error("Error cargando predios:", error);
      setStatus("Error al cargar predios por zona visible.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingPredios(false);
      }
    }
  }

  function manejarCambioDeVista(bounds) {
    setCurrentBounds(bounds);

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(() => {
      cargarPrediosPorBbox(bounds);
    }, 350);
  }

  function recargarVistaActual() {
    if (!currentBounds) {
      setStatus("Aún no hay una vista del mapa para recargar.");
      return;
    }

    cargarPrediosPorBbox(currentBounds, true);
  }

  function seleccionarPredio(predio) {
    setSelectedPredio(predio);
    setActiveTool("identificar");
    setStatus(`Predio seleccionado: ${predio.codigo}`);
  }

  async function buscarPredio() {
    const busqueda = normalizarTexto(searchTerm);

    if (!busqueda) {
      setStatus("Ingresa un código, dirección, uso, propietario o sector.");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/predios/buscar?q=${encodeURIComponent(
          searchTerm
        )}&limit=1`
      );

      if (!response.ok) {
        throw new Error("No fue posible buscar el predio.");
      }

      const payload = await response.json();
      const encontrado = payload.data?.[0];

      if (!encontrado) {
        setStatus("No se encontró ningún predio con ese criterio de búsqueda.");
        return;
      }

      setPrediosVisible(true);
      setSelectedPredio(encontrado);
      setActiveTool("identificar");

      setPredios((prev) => {
        const existe = prev.some(
          (predio) => String(predio.id) === String(encontrado.id)
        );

        if (existe) return prev;

        return [encontrado, ...prev];
      });

      setStatus(`Predio encontrado: ${encontrado.codigo}`);
    } catch (error) {
      console.error("Error buscando predio:", error);
      setStatus("Error al buscar el predio.");
    }
  }

  function alternarCapaPredios() {
    setPrediosVisible((prev) => {
      const nuevoValor = !prev;

      setStatus(
        nuevoValor ? "Capa de predios visible." : "Capa de predios oculta."
      );

      return nuevoValor;
    });
  }

  function alternarLeyenda() {
    setLegendVisible((prev) => {
      const nuevoValor = !prev;

      setStatus(nuevoValor ? "Leyenda visible." : "Leyenda oculta.");

      return nuevoValor;
    });
  }

  function cambiarHerramienta(tool) {
    setActiveTool(tool);

    if (tool === "identificar") {
      setStatus("Herramienta identificar activa. Haz clic sobre un predio.");
    }

    if (tool === "distancia") {
      setStatus("Herramienta distancia activa. Haz clic en dos o más puntos.");
    }

    if (tool === "area") {
      setStatus("Herramienta área activa. Haz clic en tres o más puntos.");
    }
  }

  function volverVistaInicial() {
    setSelectedPredio(null);
    setActiveTool("identificar");
    setResetCounter((prev) => prev + 1);
    setStatus("Vista inicial restaurada.");
  }

  function abrirModalCertificado() {
    if (!selectedPredio) {
      setStatus("Selecciona primero un predio para generar el certificado.");
      return;
    }

    setCertificateError("");
    setIsCertificateModalOpen(true);
  }

  function cerrarModalCertificado() {
    if (certificateLoading) return;

    setIsCertificateModalOpen(false);
    setCertificateError("");
  }

  async function generarCertificadoPdf(password) {
    if (!selectedPredio) {
      setStatus("Selecciona primero un predio para generar el certificado.");
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
        let errorMessage = "No fue posible generar el certificado.";

        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          errorMessage = "Error inesperado al generar el certificado.";
        }

        setCertificateError(errorMessage);
        setStatus(errorMessage);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `certificado-${selectedPredio.codigo}.pdf`;
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);

      setStatus(`Certificado generado para ${selectedPredio.codigo}.`);
      setIsCertificateModalOpen(false);
      setCertificateError("");
    } catch (error) {
      console.error("Error generando certificado:", error);
      setCertificateError("Error de conexión con el backend.");
      setStatus("Error de conexión con el backend.");
    } finally {
      setCertificateLoading(false);
    }
  }

  function descargarDatosGeoJson() {
    if (!predios.length) {
      setStatus("No hay predios visibles para descargar.");
      return;
    }

    const features = predios.map((predio) => {
      const ring = predio.coords.map(([lat, lng]) => [lng, lat]);

      if (ring.length) {
        ring.push([...ring[0]]);
      }

      return {
        type: "Feature",
        properties: {
          id: predio.id,
          codigo: predio.codigo,
          propietario: predio.propietario,
          direccion: predio.direccion,
          matricula: predio.matricula,
          area: predio.area,
          uso: predio.uso,
          estado: predio.estado,
          barrio: predio.barrio,
        },
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      };
    });

    const geojson = {
      type: "FeatureCollection",
      name: "predios_visibles_geovisor_beta",
      features,
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/geo+json",
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "predios-visibles-geovisor-beta.geojson";
    document.body.appendChild(link);
    link.click();

    link.remove();
    window.URL.revokeObjectURL(url);

    setStatus("Predios visibles descargados en formato GeoJSON.");
  }

  function imprimirMapa() {
    setStatus("Preparando impresión del mapa.");

    setTimeout(() => {
      window.print();
    }, 300);
  }

  function alternarSidebar() {
    setSidebarCollapsed((prev) => !prev);
  }

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Header
        onCertificateClick={abrirModalCertificado}
        onToggleSidebar={alternarSidebar}
        sidebarCollapsed={sidebarCollapsed}
      />

      <main className="app-body">
        {!sidebarCollapsed && (
          <Sidebar
            selectedPredio={selectedPredio}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onSearch={buscarPredio}
            prediosVisible={prediosVisible}
            legendVisible={legendVisible}
            activeTool={activeTool}
            onToggleLayer={alternarCapaPredios}
            onToggleLegend={alternarLeyenda}
            onToolChange={cambiarHerramienta}
            onResetView={volverVistaInicial}
            onGeneratePdf={abrirModalCertificado}
            onDownloadData={descargarDatosGeoJson}
            onPrint={imprimirMapa}
            onReloadVisible={recargarVistaActual}
            loadingPredios={loadingPredios}
            prediosMeta={prediosMeta}
          />
        )}

        <section className="map-section">
          <MapView
            predios={predios}
            selectedPredio={selectedPredio}
            onSelectPredio={seleccionarPredio}
            prediosVisible={prediosVisible}
            legendVisible={legendVisible}
            activeTool={activeTool}
            resetCounter={resetCounter}
            status={status}
            onStatusChange={setStatus}
            onBoundsChange={manejarCambioDeVista}
            loadingPredios={loadingPredios}
            prediosMeta={prediosMeta}
            sidebarCollapsed={sidebarCollapsed}
          />
        </section>
      </main>

      <CertificateModal
        isOpen={isCertificateModalOpen}
        onClose={cerrarModalCertificado}
        onConfirm={generarCertificadoPdf}
        selectedPredio={selectedPredio}
        loading={certificateLoading}
        error={certificateError}
      />
    </div>
  );
}

export default App;