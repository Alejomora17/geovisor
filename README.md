Geovisor Predial de Guataquí

Aplicación web de visualización geográfica (geovisor) para el municipio de **Guataquí, Cundinamarca** (código DANE 25324). Permite explorar de forma interactiva la información predial, catastral y de infraestructura del municipio, y generar certificados prediales en PDF.

Funcionalidades

- **Visualización de capas GeoJSON**: terrenos rurales y urbanos, veredas, barrios, construcciones y vías del municipio.
- **Consulta y búsqueda de predios** por código catastral.
- **Herramientas de medición**: distancias y áreas de predios directamente sobre el mapa.
- **Mapas base intercambiables**: OpenStreetMap y satélite (Esri World Imagery).
- **Generación de certificados prediales en PDF**, protegida por contraseña, con la información oficial del predio consultado.

## Arquitectura

El proyecto está dividido en dos partes independientes:

```
geovisor/
├── backend/    # API en Node.js / Express
└── frontend/   # Interfaz en React + Leaflet
```

Backend

- **Stack**: Node.js, Express 5
- **Datos**: capas en formato GeoJSON servidas desde `backend/data/guataqui/` (terrenos, veredas, barrios, construcciones y vías)
- **Generación de PDF**: `pdfkit`
- **Endpoints principales**:
  - `GET /api/config` — configuración del mapa y capas disponibles
  - `GET /api/capas` — listado de capas
  - `GET /api/capas/:layerId` — features de una capa (con filtro por bbox/centro)
  - `GET /api/predios` — listado de predios
  - `GET /api/predios/buscar` — búsqueda de predios
  - `GET /api/predios/:codigo` — detalle de un predio (incluye geometría)
  - `POST /api/certificados/:codigo` — genera el certificado predial en PDF (requiere contraseña)
  - `GET /healthz` — estado del servicio

Frontend

- **Stack**: React 19, Vite, Leaflet + react-leaflet
- **Componentes principales**:
  - `MapView` — mapa interactivo, capas, herramientas de medición
  - `Sidebar` — panel lateral de navegación/filtros
  - `Header` — cabecera de la aplicación
  - `CertificateModal` — modal para generar el certificado predial en PDF

Variables de entorno

**Backend**

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3001` |
| `CERTIFICADO_PASSWORD` | Contraseña requerida para generar certificados PDF | 1234
| `LIMIT_ELEMENTOS_CAPA` / `LIMIT_PREDIOS_BBOX` | Límite de elementos por consulta de capa | `5000` |
| `MAX_ELEMENTOS_CAPA` | Límite máximo de elementos por capa | `10000` |
| `FRONTEND_URLS` | Orígenes permitidos (CORS) | — |

**Frontend**

| Variable | Descripción | Por defecto |
|---|---|---|
| `VITE_API_URL` | URL base de la API del backend | `http://localhost:3001` |

Instalación y ejecución local

Backend

```bash
cd backend
npm install
npm run dev   # con nodemon
# o
npm start
```

Frontend

```bash
cd frontend
npm install
npm run dev
```

## Estado del proyecto

Proyecto en fase **BETA**.

Autor

Desarrollado por [Alejomora17](https://github.com/Alejomora17).
