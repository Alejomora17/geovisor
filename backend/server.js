require("dotenv").config();

const express = require("express");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");

const app = express();

const PORT = process.env.PORT || 3001;
const CERTIFICADO_PASSWORD = process.env.CERTIFICADO_PASSWORD || "1234";
const DATA_DIR = path.join(__dirname, "data");
const DEFAULT_LIMIT = Number(process.env.LIMIT_PREDIOS_BBOX || 5000);

const FRONTEND_URLS = (
    process.env.FRONTEND_URLS ||
    "http://localhost:5173,http://127.0.0.1:5173"
)
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

/*
  Proyecciones comunes para Colombia.

  EPSG:9377: MAGNA-SIRGAS / Origen-Nacional
  EPSG:3116: MAGNA-SIRGAS / Colombia Bogotá zone
  EPSG:3857: Web Mercator
*/

proj4.defs(
    "EPSG:9377",
    "+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs"
);

proj4.defs(
    "EPSG:3116",
    "+proj=tmerc +lat_0=4.596200416666666 +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs +type=crs"
);

proj4.defs(
    "EPSG:3857",
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
);

const PROYECCIONES_SOPORTADAS = new Set([
    "EPSG:9377",
    "EPSG:3116",
    "EPSG:3857",
]);

app.use(
    cors({
        origin(origin, callback) {
            if (
                !origin ||
                FRONTEND_URLS.includes("*") ||
                FRONTEND_URLS.includes(origin)
            ) {
                return callback(null, true);
            }

            return callback(new Error(`CORS bloqueado para: ${origin}`));
        },
    })
);

app.use(express.json({ limit: "50mb" }));

function normalizarTexto(texto) {
    return String(texto || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}

function normalizarClave(clave) {
    return String(clave || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function obtenerCampo(objeto, posiblesNombres, valorPorDefecto = "") {
    const indice = {};

    Object.entries(objeto || {}).forEach(([clave, valor]) => {
        indice[normalizarClave(clave)] = valor;
    });

    for (const nombre of posiblesNombres) {
        const claveNormalizada = normalizarClave(nombre);

        if (
            Object.prototype.hasOwnProperty.call(indice, claveNormalizada) &&
            indice[claveNormalizada] !== null &&
            indice[claveNormalizada] !== undefined &&
            indice[claveNormalizada] !== ""
        ) {
            return indice[claveNormalizada];
        }
    }

    return valorPorDefecto;
}

function convertirNumero(valor) {
    if (valor === null || valor === undefined || valor === "") return 0;

    const numero = Number(String(valor).replace(",", "."));

    return Number.isFinite(numero) ? numero : 0;
}

function formatearArea(valor) {
    if (valor === null || valor === undefined || valor === "") {
        return "Sin área registrada";
    }

    const numero = convertirNumero(valor);

    if (numero > 0) {
        return `${numero.toLocaleString("es-CO")} m²`;
    }

    return String(valor);
}

function obtenerWkid(spatialReference) {
    if (!spatialReference) return null;

    if (typeof spatialReference === "number") {
        return spatialReference;
    }

    const wkid =
        spatialReference.latestWkid ||
        spatialReference.wkid ||
        spatialReference.WKID ||
        spatialReference.LatestWkid;

    return wkid ? Number(wkid) : null;
}

function obtenerSpatialReferenceDesdeNodo(nodo, referenciaPadre = null) {
    if (!nodo || typeof nodo !== "object") return referenciaPadre;

    if (nodo.spatialReference) return nodo.spatialReference;
    if (nodo.spatial_reference) return nodo.spatial_reference;

    if (nodo.crs?.properties?.name) {
        const match = String(nodo.crs.properties.name).match(/EPSG[:/](\d+)/i);

        if (match) {
            return {
                wkid: Number(match[1]),
            };
        }
    }

    return referenciaPadre;
}

function coordenadaEstaEnColombia(lat, lng) {
    return lat >= -5 && lat <= 15 && lng >= -85 && lng <= -65;
}

function transformarCoordenadaProyectada(x, y, spatialReference) {
    const wkid = obtenerWkid(spatialReference);
    const candidatos = [];

    if (wkid) {
        candidatos.push(`EPSG:${wkid}`);
    }

    candidatos.push("EPSG:9377");
    candidatos.push("EPSG:3116");
    candidatos.push("EPSG:3857");

    const candidatosUnicos = [...new Set(candidatos)];

    for (const epsg of candidatosUnicos) {
        if (!PROYECCIONES_SOPORTADAS.has(epsg)) {
            continue;
        }

        try {
            const [lng, lat] = proj4(epsg, "EPSG:4326", [x, y]);

            if (
                Number.isFinite(lat) &&
                Number.isFinite(lng) &&
                coordenadaEstaEnColombia(lat, lng)
            ) {
                return [lat, lng];
            }
        } catch {
            // Si una proyección falla, se intenta con la siguiente.
        }
    }

    return null;
}

function convertirParALatLng(par, spatialReference) {
    let a;
    let b;

    if (Array.isArray(par)) {
        a = Number(par[0]);
        b = Number(par[1]);
    } else if (par && typeof par === "object") {
        a = Number(par.x ?? par.lng ?? par.lon ?? par.longitud ?? par.longitude);
        b = Number(par.y ?? par.lat ?? par.latitude ?? par.latitud);
    }

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return null;
    }

    /*
      Coordenadas geográficas:
      GeoJSON / ArcGIS suelen venir como [longitud, latitud].
      Leaflet necesita [latitud, longitud].
    */
    if (Math.abs(a) <= 180 && Math.abs(b) <= 180) {
        if (a < 0 && b > 0) {
            return [b, a];
        }

        if (a > 0 && b < 0) {
            return [a, b];
        }

        return [b, a];
    }

    /*
      Coordenadas proyectadas:
      Ejemplo: 4900000, 2000000.
    */
    return transformarCoordenadaProyectada(a, b, spatialReference);
}

function limpiarAnilloCoordenadas(coords) {
    if (!Array.isArray(coords) || coords.length < 3) {
        return [];
    }

    const limpio = [...coords];

    const primero = limpio[0];
    const ultimo = limpio[limpio.length - 1];

    if (
        primero &&
        ultimo &&
        primero[0] === ultimo[0] &&
        primero[1] === ultimo[1]
    ) {
        limpio.pop();
    }

    return limpio;
}

function extraerCoordsDesdeGeometria(geometry, spatialReference) {
    if (!geometry || typeof geometry !== "object") {
        return [];
    }

    const sr = geometry.spatialReference || spatialReference;

    /*
      ArcGIS / Esri JSON:
      geometry: {
        rings: [[[x, y], [x, y], ...]]
      }
    */
    if (Array.isArray(geometry.rings)) {
        const ring = geometry.rings[0] || [];

        const coords = ring
            .map((par) => convertirParALatLng(par, sr))
            .filter(Boolean);

        return limpiarAnilloCoordenadas(coords);
    }

    /*
      GeoJSON Polygon.
    */
    if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
        const ring = geometry.coordinates[0] || [];

        const coords = ring
            .map((par) => convertirParALatLng(par, sr))
            .filter(Boolean);

        return limpiarAnilloCoordenadas(coords);
    }

    /*
      GeoJSON MultiPolygon.
      Para la BETA se toma el primer polígono.
    */
    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
        const ring = geometry.coordinates[0]?.[0] || [];

        const coords = ring
            .map((par) => convertirParALatLng(par, sr))
            .filter(Boolean);

        return limpiarAnilloCoordenadas(coords);
    }

    /*
      Algunos archivos traen "coordinates" sin "type".
    */
    if (Array.isArray(geometry.coordinates)) {
        const possibleRing = Array.isArray(geometry.coordinates[0]?.[0])
            ? geometry.coordinates[0]
            : geometry.coordinates;

        const coords = possibleRing
            .map((par) => convertirParALatLng(par, sr))
            .filter(Boolean);

        return limpiarAnilloCoordenadas(coords);
    }

    return [];
}

function calcularBBox(coords) {
    const lats = coords.map(([lat]) => lat);
    const lngs = coords.map(([, lng]) => lng);

    return {
        minLat: Math.min(...lats),
        minLng: Math.min(...lngs),
        maxLat: Math.max(...lats),
        maxLng: Math.max(...lngs),
    };
}

function calcularCentro(coords) {
    if (!Array.isArray(coords) || coords.length === 0) {
        return null;
    }

    const total = coords.reduce(
        (acc, [lat, lng]) => {
            acc.lat += lat;
            acc.lng += lng;
            acc.count += 1;
            return acc;
        },
        {
            lat: 0,
            lng: 0,
            count: 0,
        }
    );

    return {
        lat: total.lat / total.count,
        lng: total.lng / total.count,
    };
}

function obtenerCentroBbox(bbox) {
    if (!bbox) return null;

    return {
        lat: (bbox.minLat + bbox.maxLat) / 2,
        lng: (bbox.minLng + bbox.maxLng) / 2,
    };
}

function parseBbox(valor) {
    if (!valor) return null;

    const partes = String(valor)
        .split(",")
        .map((item) => Number(item));

    if (partes.length !== 4 || partes.some((numero) => !Number.isFinite(numero))) {
        return null;
    }

    const [minLng, minLat, maxLng, maxLat] = partes;

    return {
        minLng,
        minLat,
        maxLng,
        maxLat,
    };
}

function parseCenter(valor) {
    if (!valor) return null;

    const partes = String(valor)
        .split(",")
        .map((item) => Number(item));

    if (partes.length !== 2 || partes.some((numero) => !Number.isFinite(numero))) {
        return null;
    }

    const [lng, lat] = partes;

    return {
        lng,
        lat,
    };
}

function bboxIntersecta(a, b) {
    return (
        a.minLng <= b.maxLng &&
        a.maxLng >= b.minLng &&
        a.minLat <= b.maxLat &&
        a.maxLat >= b.minLat
    );
}

function obtenerCentroPredio(predio) {
    if (
        predio.center &&
        Number.isFinite(predio.center.lat) &&
        Number.isFinite(predio.center.lng)
    ) {
        return predio.center;
    }

    if (predio.bbox) {
        return obtenerCentroBbox(predio.bbox);
    }

    return calcularCentro(predio.coords);
}

function distanciaCuadradaCentro(predio, centro) {
    const centroPredio = obtenerCentroPredio(predio);

    if (!centroPredio || !centro) {
        return Number.MAX_SAFE_INTEGER;
    }

    const difLat = centroPredio.lat - centro.lat;
    const difLng = centroPredio.lng - centro.lng;

    return difLat * difLat + difLng * difLng;
}

function distanciaCuadradaABbox(predio, centro) {
    if (!predio.bbox || !centro) {
        return distanciaCuadradaCentro(predio, centro);
    }

    const bbox = predio.bbox;

    let dx = 0;
    let dy = 0;

    if (centro.lng < bbox.minLng) {
        dx = bbox.minLng - centro.lng;
    } else if (centro.lng > bbox.maxLng) {
        dx = centro.lng - bbox.maxLng;
    }

    if (centro.lat < bbox.minLat) {
        dy = bbox.minLat - centro.lat;
    } else if (centro.lat > bbox.maxLat) {
        dy = centro.lat - bbox.maxLat;
    }

    return dx * dx + dy * dy;
}

function ordenarPorCercaniaAlCentro(lista, centro) {
    if (!centro) return lista;

    return [...lista].sort((a, b) => {
        const distanciaBboxA = distanciaCuadradaABbox(a, centro);
        const distanciaBboxB = distanciaCuadradaABbox(b, centro);

        if (distanciaBboxA !== distanciaBboxB) {
            return distanciaBboxA - distanciaBboxB;
        }

        return distanciaCuadradaCentro(a, centro) - distanciaCuadradaCentro(b, centro);
    });
}

function extraerFeatureSetsDesdeJson(jsonData) {
    const featureSets = [];

    function recorrer(nodo, spatialReferencePadre = null) {
        if (!nodo) return;

        if (Array.isArray(nodo)) {
            const primerElemento = nodo[0];

            if (
                primerElemento &&
                typeof primerElemento === "object" &&
                (primerElemento.geometry ||
                    primerElemento.attributes ||
                    primerElemento.properties)
            ) {
                featureSets.push({
                    features: nodo,
                    spatialReference: spatialReferencePadre,
                });

                return;
            }

            nodo.forEach((item) => recorrer(item, spatialReferencePadre));
            return;
        }

        if (typeof nodo !== "object") return;

        const spatialReferenceLocal = obtenerSpatialReferenceDesdeNodo(
            nodo,
            spatialReferencePadre
        );

        if (Array.isArray(nodo.features)) {
            featureSets.push({
                features: nodo.features,
                spatialReference: spatialReferenceLocal,
            });

            return;
        }

        if (nodo.featureSet && Array.isArray(nodo.featureSet.features)) {
            featureSets.push({
                features: nodo.featureSet.features,
                spatialReference:
                    nodo.featureSet.spatialReference || spatialReferenceLocal,
            });

            return;
        }

        if (Array.isArray(nodo.data)) {
            featureSets.push({
                features: nodo.data,
                spatialReference: spatialReferenceLocal,
            });

            return;
        }

        if (Array.isArray(nodo.records)) {
            featureSets.push({
                features: nodo.records,
                spatialReference: spatialReferenceLocal,
            });

            return;
        }

        if (Array.isArray(nodo.rows)) {
            featureSets.push({
                features: nodo.rows,
                spatialReference: spatialReferenceLocal,
            });

            return;
        }

        if (Array.isArray(nodo.layers)) {
            nodo.layers.forEach((layer) => recorrer(layer, spatialReferenceLocal));
        }

        if (Array.isArray(nodo.results)) {
            nodo.results.forEach((result) => recorrer(result, spatialReferenceLocal));
        }
    }

    recorrer(jsonData);

    return featureSets;
}

function convertirFeatureAPredio(feature, index, nombreArchivo, spatialReference) {
    const properties = feature.properties || feature.attributes || feature;
    const geometry = feature.geometry || feature.geom || feature.shape || {};

    const coords = extraerCoordsDesdeGeometria(geometry, spatialReference);

    if (!coords || coords.length < 3) {
        return null;
    }

    const codigo =
        obtenerCampo(properties, [
            "CODIGO",
            "codigo",
            "CODIGO_ANTERIOR",
            "codigo_anterior",
            "CODIGO_PREDIAL",
            "codigo_predial",
            "CEDULA_CATASTRAL",
            "cedula_catastral",
            "CEDULA_CAT",
            "cedula_cat",
            "NUM_PREDIAL",
            "num_predial",
            "NUMERO_PREDIAL",
            "numero_predial",
            "ID_PREDIO",
            "id_predio",
            "TERRENO_CODIGO",
            "terreno_codigo",
            "OBJECTID",
            "objectid",
            "FID",
            "fid",
        ]) || `PREDIO-${index + 1}`;

    const propietario =
        obtenerCampo(properties, [
            "PROPIETARIO",
            "propietario",
            "NOMBRE_PROPIETARIO",
            "nombre_propietario",
            "NOMBRE",
            "nombre",
            "TITULAR",
            "titular",
            "TERCERO",
            "tercero",
        ]) || "Sin información";

    const direccion =
        obtenerCampo(properties, [
            "DIRECCION",
            "direccion",
            "DIR",
            "dir",
            "DIR_PREDIO",
            "dir_predio",
            "NOMENCLATURA",
            "nomenclatura",
            "NOMENCLA",
            "nomencla",
            "UBICACION",
            "ubicacion",
        ]) || "Sin dirección registrada";

    const matricula =
        obtenerCampo(properties, [
            "MATRICULA",
            "matricula",
            "MATRICULA_INMOBILIARIA",
            "matricula_inmobiliaria",
            "MAT_INMOB",
            "mat_inmob",
            "FOLIO",
            "folio",
        ]) || "Sin matrícula";

    const areaRaw =
        obtenerCampo(properties, [
            "AREA",
            "area",
            "AREA_M2",
            "area_m2",
            "AREA_TERRENO",
            "area_terreno",
            "AREATERRENO",
            "areaterreno",
            "AREA_TERRE",
            "area_terre",
            "SHAPE_AREA",
            "shape_area",
            "Shape__Area",
            "shape__area",
            "Shape_Area",
            "shape_area",
        ]) || "";

    const uso =
        obtenerCampo(properties, [
            "USO",
            "uso",
            "USO_SUELO",
            "uso_suelo",
            "DESTINO",
            "destino",
            "DESTINO_ECONOMICO",
            "destino_economico",
            "ACTIVIDAD",
            "actividad",
            "TIPO_USO",
            "tipo_uso",
        ]) || "Sin uso registrado";

    const estado =
        obtenerCampo(properties, ["ESTADO", "estado", "CONDICION", "condicion"]) ||
        "Activo";

    const barrio =
        obtenerCampo(properties, [
            "BARRIO",
            "barrio",
            "SECTOR",
            "sector",
            "VEREDA",
            "vereda",
            "VEREDA_CODIGO",
            "vereda_codigo",
            "ZONA",
            "zona",
        ]) || "Sin sector";

    const bbox = calcularBBox(coords);
    const center = calcularCentro(coords);

    return {
        id: `${nombreArchivo}-${index + 1}`,
        codigo: String(codigo),
        propietario: String(propietario),
        direccion: String(direccion),
        matricula: String(matricula),
        area: formatearArea(areaRaw),
        areaM2: convertirNumero(areaRaw),
        uso: String(uso),
        estado: String(estado),
        barrio: String(barrio),
        observacion: `Predio cargado desde archivo JSON: ${nombreArchivo}.`,
        coords,
        bbox,
        center,
    };
}

function prediosSimuladosGuataqui() {
    const prediosDemo = [
        {
            id: 1,
            codigo: "GUA-PREDIO-001",
            propietario: "Propietario simulado 001",
            direccion: "Calle 1 # 2 - 10",
            matricula: "GUA-001-2026",
            area: "520 m²",
            areaM2: 520,
            uso: "Residencial",
            estado: "Activo",
            barrio: "Casco urbano",
            observacion:
                "Predio simulado ubicado en el casco urbano de Guataquí para pruebas del geovisor BETA.",
            coords: [
                [4.51735, -74.79095],
                [4.51735, -74.79055],
                [4.51698, -74.79055],
                [4.51698, -74.79095],
            ],
        },
        {
            id: 2,
            codigo: "GUA-PREDIO-002",
            propietario: "Propietario simulado 002",
            direccion: "Carrera 2 # 1 - 25",
            matricula: "GUA-002-2026",
            area: "430 m²",
            areaM2: 430,
            uso: "Comercial",
            estado: "Activo",
            barrio: "Casco urbano",
            observacion: "Predio comercial simulado.",
            coords: [
                [4.51735, -74.79048],
                [4.51735, -74.79008],
                [4.51698, -74.79008],
                [4.51698, -74.79048],
            ],
        },
    ];

    return prediosDemo.map((predio) => ({
        ...predio,
        bbox: calcularBBox(predio.coords),
        center: calcularCentro(predio.coords),
    }));
}

function cargarPrediosDesdeJson() {
    if (!fs.existsSync(DATA_DIR)) {
        console.warn("No existe la carpeta backend/data. Usando datos simulados.");
        return prediosSimuladosGuataqui();
    }

    const archivos = fs
        .readdirSync(DATA_DIR)
        .filter((archivo) => archivo.toLowerCase().endsWith(".json"));

    if (archivos.length === 0) {
        console.warn("No se encontraron archivos .json en backend/data.");
        return prediosSimuladosGuataqui();
    }

    const prediosCargados = [];

    archivos.forEach((archivo) => {
        const filePath = path.join(DATA_DIR, archivo);

        try {
            const rawData = fs.readFileSync(filePath, "utf8");
            const jsonData = JSON.parse(rawData);

            const featureSets = extraerFeatureSetsDesdeJson(jsonData);

            console.log(
                `Archivo ${archivo}: ${featureSets.length} conjunto(s) encontrado(s).`
            );

            featureSets.forEach((featureSet, setIndex) => {
                const features = featureSet.features || [];
                const spatialReference = featureSet.spatialReference;
                const wkid = obtenerWkid(spatialReference);

                console.log(
                    `Archivo ${archivo}, conjunto ${setIndex + 1}: ${features.length} registros.`
                );

                if (wkid) {
                    console.log(`Archivo ${archivo}: WKID detectado ${wkid}`);
                } else {
                    console.log(
                        `Archivo ${archivo}: sin WKID detectado. Se intentará conversión automática.`
                    );
                }

                let convertidos = 0;

                features.forEach((feature, index) => {
                    const nombreReferencia = `${archivo}-set${setIndex + 1}`;

                    const predio = convertirFeatureAPredio(
                        feature,
                        index,
                        nombreReferencia,
                        spatialReference
                    );

                    if (predio) {
                        prediosCargados.push(predio);
                        convertidos += 1;
                    }
                });

                console.log(
                    `Archivo ${archivo}, conjunto ${setIndex + 1}: ${convertidos} predios convertidos.`
                );
            });
        } catch (error) {
            console.error(`Error leyendo el archivo ${archivo}:`, error.message);
        }
    });

    if (prediosCargados.length === 0) {
        console.warn(
            "No se pudo convertir ningún predio. Se usarán datos simulados."
        );

        return prediosSimuladosGuataqui();
    }

    console.log(`Predios cargados correctamente: ${prediosCargados.length}`);

    return prediosCargados;
}

let predios = cargarPrediosDesdeJson();

function buscarPredioPorCodigo(codigo) {
    const codigoNormalizado = normalizarTexto(codigo);

    return predios.find(
        (predio) => normalizarTexto(predio.codigo) === codigoNormalizado
    );
}

function buscarPrediosPorTexto(texto, limit = 20) {
    const busqueda = normalizarTexto(texto);

    if (!busqueda) return [];

    const exactos = [];
    const similares = [];

    predios.forEach((predio) => {
        const codigo = normalizarTexto(predio.codigo);
        const direccion = normalizarTexto(predio.direccion);
        const propietario = normalizarTexto(predio.propietario);
        const uso = normalizarTexto(predio.uso);
        const barrio = normalizarTexto(predio.barrio);

        if (codigo === busqueda) {
            exactos.push(predio);
            return;
        }

        if (
            codigo.includes(busqueda) ||
            direccion.includes(busqueda) ||
            propietario.includes(busqueda) ||
            uso.includes(busqueda) ||
            barrio.includes(busqueda)
        ) {
            similares.push(predio);
        }
    });

    return [...exactos, ...similares].slice(0, limit);
}

function aplicarFiltroBbox(lista, bbox) {
    if (!bbox) return lista;

    return lista.filter(
        (predio) => predio.bbox && bboxIntersecta(predio.bbox, bbox)
    );
}

function aplicarLimite(lista, limit) {
    if (!limit || limit <= 0) return lista;

    return lista.slice(0, limit);
}

function nombreArchivoSeguro(texto) {
    return String(texto || "predio")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80);
}

function dibujarFila(doc, etiqueta, valor, y) {
    doc.font("Helvetica-Bold").fontSize(10).text(etiqueta, 60, y, {
        width: 160,
    });

    doc.font("Helvetica").fontSize(10).text(valor || "---", 220, y, {
        width: 300,
    });
}

/* RUTAS */

app.get("/", (req, res) => {
    res.json({
        message: "Backend del geovisor funcionando correctamente",
        version: "BETA",
        prediosTotales: predios.length,
        modoCarga: "bbox",
        corsPermitidos: FRONTEND_URLS,
    });
});

app.get("/api/predios", (req, res) => {
    const bbox = parseBbox(req.query.bbox);

    const centroMapa =
        parseCenter(req.query.center) || (bbox ? obtenerCentroBbox(bbox) : null);

    const limit =
        req.query.limit !== undefined ? Number(req.query.limit) : DEFAULT_LIMIT;

    const filtrados = aplicarFiltroBbox(predios, bbox);
    const ordenados = ordenarPorCercaniaAlCentro(filtrados, centroMapa);
    const data = aplicarLimite(ordenados, limit);

    res.json({
        data,
        count: data.length,
        total: filtrados.length,
        totalGeneral: predios.length,
        limit: limit > 0 ? limit : null,
        bbox,
        center: centroMapa,
    });
});

app.get("/api/predios/buscar", (req, res) => {
    const q = req.query.q || "";
    const limit = Number(req.query.limit || 20);

    const resultados = buscarPrediosPorTexto(q, limit);

    res.json({
        data: resultados,
        count: resultados.length,
        totalGeneral: predios.length,
    });
});

app.get("/api/predios/:codigo", (req, res) => {
    const predio = buscarPredioPorCodigo(req.params.codigo);

    if (!predio) {
        return res.status(404).json({
            message: "Predio no encontrado",
        });
    }

    res.json(predio);
});

app.post("/api/recargar-predios", (req, res) => {
    predios = cargarPrediosDesdeJson();

    res.json({
        message: "Predios recargados correctamente",
        total: predios.length,
    });
});

app.post("/api/certificados/:codigo", (req, res) => {
    const { password } = req.body;

    if (!password || password !== CERTIFICADO_PASSWORD) {
        return res.status(401).json({
            message: "Contraseña incorrecta. No se puede generar el certificado.",
        });
    }

    const predio = buscarPredioPorCodigo(req.params.codigo);

    if (!predio) {
        return res.status(404).json({
            message: "Predio no encontrado",
        });
    }

    const fechaGeneracion = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(new Date());

    const nombreArchivo = nombreArchivoSeguro(predio.codigo);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename=certificado-${nombreArchivo}.pdf`
    );

    const doc = new PDFDocument({
        size: "A4",
        margin: 50,
    });

    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).text("CERTIFICADO PREDIAL MUNICIPAL", {
        align: "center",
    });

    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(10).text(
        "Geovisor Predial Municipal - Versión BETA",
        {
            align: "center",
        }
    );

    doc.moveDown(1.5);

    doc.rect(50, 105, 495, 65).stroke();

    doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("Información del documento", 60, 118);

    doc
        .font("Helvetica")
        .fontSize(10)
        .text(`Fecha de generación: ${fechaGeneracion}`, 60, 138)
        .text("Tipo de documento: Certificado predial informativo", 60, 153);

    doc.moveDown(3);

    doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .text("1. Información general del predio", 50, 200);

    let y = 230;

    dibujarFila(doc, "Código predial:", predio.codigo, y);
    y += 24;

    dibujarFila(doc, "Propietario:", predio.propietario, y);
    y += 24;

    dibujarFila(doc, "Dirección:", predio.direccion, y);
    y += 24;

    dibujarFila(doc, "Matrícula inmobiliaria:", predio.matricula, y);
    y += 24;

    dibujarFila(doc, "Barrio / sector:", predio.barrio, y);
    y += 24;

    dibujarFila(doc, "Área:", predio.area, y);
    y += 24;

    dibujarFila(doc, "Uso del suelo:", predio.uso, y);
    y += 24;

    dibujarFila(doc, "Estado:", predio.estado, y);
    y += 36;

    doc.font("Helvetica-Bold").fontSize(13).text("2. Observaciones", 50, y);

    y += 24;

    doc.font("Helvetica").fontSize(10).text(predio.observacion, 60, y, {
        width: 480,
        align: "justify",
    });

    y += 70;

    doc.font("Helvetica-Bold").fontSize(13).text("3. Nota de validez", 50, y);

    y += 24;

    doc
        .font("Helvetica")
        .fontSize(10)
        .text(
            "Este documento corresponde a una versión BETA del sistema y se genera con fines demostrativos, académicos y de validación funcional. La información aquí presentada debe ser contrastada con las fuentes oficiales del municipio antes de usarse en trámites administrativos o jurídicos.",
            60,
            y,
            {
                width: 480,
                align: "justify",
            }
        );

    doc.moveDown(6);

    doc
        .font("Helvetica")
        .fontSize(9)
        .text("Generado automáticamente por el Geovisor Predial Municipal.", {
            align: "center",
        });

    doc.end();
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
    console.log(`Carpeta de datos: ${DATA_DIR}`);
    console.log(`Predios en memoria: ${predios.length}`);
    console.log(`Límite por vista: ${DEFAULT_LIMIT}`);
    console.log(`Frontends permitidos: ${FRONTEND_URLS.join(", ")}`);
});