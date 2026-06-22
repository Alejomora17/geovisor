require("dotenv").config();

const express = require("express");
const cors = require("cors");
const compression = require("compression");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3001);
const CERTIFICADO_PASSWORD =
    process.env.CERTIFICADO_PASSWORD || "1234";
const DATA_DIR = path.join(__dirname, "data", "guataqui");
const DEFAULT_LAYER_LIMIT = Number(
    process.env.LIMIT_ELEMENTOS_CAPA || process.env.LIMIT_PREDIOS_BBOX || 5000
);
const MAX_LAYER_LIMIT = Number(process.env.MAX_ELEMENTOS_CAPA || 10000);

const MAP_DEFAULTS = {
    center: [4.517973, -74.789503],
    zoom: 16,
};

const FRONTEND_URLS = (
    process.env.FRONTEND_URLS ||
    "http://localhost:5173,http://127.0.0.1:5173"
)
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);

const LAYER_CONFIG = [
    {
        id: "r-vereda",
        file: "R_VEREDA_J.json",
        name: "Veredas rurales",
        description: "Límites y nombres de las veredas de Guataquí.",
        group: "División territorial",
        geometryKind: "polygon",
        defaultVisible: false,
        searchable: false,
        certificateSource: false,
        order: 10,
        style: {
            color: "#4d7c0f",
            fillColor: "#bef264",
            weight: 2,
            fillOpacity: 0.08,
        },
    },
    {
        id: "u-barrio",
        file: "U_BARRIO_J.json",
        name: "Barrios urbanos",
        description: "Sectores o barrios urbanos de Guataquí.",
        group: "División territorial",
        geometryKind: "polygon",
        defaultVisible: false,
        searchable: false,
        certificateSource: false,
        order: 20,
        style: {
            color: "#0369a1",
            fillColor: "#38bdf8",
            weight: 2,
            fillOpacity: 0.1,
        },
    },
    {
        id: "vias",
        file: "VIAS.geojson",
        name: "Red vial",
        description: "Elementos viales disponibles para el área de estudio.",
        group: "Infraestructura",
        geometryKind: "line",
        defaultVisible: false,
        searchable: false,
        certificateSource: false,
        order: 30,
        style: {
            color: "#475569",
            weight: 2,
            opacity: 0.85,
        },
    },
    {
        id: "r-terreno",
        file: "R_TERRENO_J.json",
        name: "Terrenos rurales",
        description: "Predios o terrenos de la zona rural de Guataquí.",
        group: "Catastro predial",
        geometryKind: "polygon",
        defaultVisible: true,
        searchable: true,
        certificateSource: true,
        order: 40,
        style: {
            color: "#4d7c0f",
            fillColor: "#84cc16",
            weight: 1.3,
            fillOpacity: 0.2,
        },
    },
    {
        id: "u-terreno",
        file: "U_TERRENO_J.json",
        name: "Terrenos urbanos",
        description: "Predios o terrenos de la zona urbana de Guataquí.",
        group: "Catastro predial",
        geometryKind: "polygon",
        defaultVisible: true,
        searchable: true,
        certificateSource: true,
        order: 50,
        style: {
            color: "#0f766e",
            fillColor: "#14b8a6",
            weight: 1.4,
            fillOpacity: 0.28,
        },
    },
    {
        id: "u-construccion",
        file: "U_CONSTRUCCION_J.json",
        name: "Construcciones urbanas",
        description: "Construcciones relacionadas con los terrenos urbanos.",
        group: "Catastro predial",
        geometryKind: "polygon",
        defaultVisible: false,
        searchable: false,
        certificateSource: false,
        order: 60,
        style: {
            color: "#b45309",
            fillColor: "#f59e0b",
            weight: 1.2,
            fillOpacity: 0.45,
        },
    },
];

app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "10mb" }));

app.use(
    cors({
        origin(origin, callback) {
            if (
                !origin ||
                FRONTEND_URLS.includes("*") ||
                FRONTEND_URLS.includes(origin.replace(/\/$/, ""))
            ) {
                return callback(null, true);
            }

            return callback(new Error(`CORS bloqueado para: ${origin}`));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}

function toFiniteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    const normalized =
        typeof value === "string" ? value.trim().replace(",", ".") : value;
    const number = Number(normalized);

    return Number.isFinite(number) ? number : fallback;
}

function formatSquareMeters(value) {
    const number = toFiniteNumber(value, 0);

    if (number <= 0) {
        return "Sin información";
    }

    return `${new Intl.NumberFormat("es-CO", {
        maximumFractionDigits: 2,
    }).format(number)} m²`;
}

function formatMeters(value) {
    const number = toFiniteNumber(value, 0);

    if (number <= 0) {
        return "Sin información";
    }

    return `${new Intl.NumberFormat("es-CO", {
        maximumFractionDigits: 2,
    }).format(number)} m`;
}

function formatDate(value) {
    const timestamp = toFiniteNumber(value, 0);

    if (!timestamp) {
        return "Sin información";
    }

    try {
        return new Intl.DateTimeFormat("es-CO", {
            dateStyle: "medium",
        }).format(new Date(timestamp));
    } catch {
        return "Sin información";
    }
}

function visitCoordinatePairs(node, callback) {
    if (!Array.isArray(node)) {
        return;
    }

    if (
        node.length >= 2 &&
        Number.isFinite(Number(node[0])) &&
        Number.isFinite(Number(node[1]))
    ) {
        callback(Number(node[0]), Number(node[1]));
        return;
    }

    node.forEach((child) => visitCoordinatePairs(child, callback));
}

function calculateGeometryBBox(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
        return null;
    }

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    visitCoordinatePairs(geometry.coordinates, (lng, lat) => {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    });

    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
        return null;
    }

    return { minLng, minLat, maxLng, maxLat };
}

function getBBoxCenter(bbox) {
    if (!bbox) return null;

    return {
        lng: (bbox.minLng + bbox.maxLng) / 2,
        lat: (bbox.minLat + bbox.maxLat) / 2,
    };
}

function unionBBoxes(bboxes) {
    const valid = bboxes.filter(Boolean);

    if (!valid.length) {
        return null;
    }

    return valid.reduce(
        (result, bbox) => ({
            minLng: Math.min(result.minLng, bbox.minLng),
            minLat: Math.min(result.minLat, bbox.minLat),
            maxLng: Math.max(result.maxLng, bbox.maxLng),
            maxLat: Math.max(result.maxLat, bbox.maxLat),
        }),
        {
            minLng: Infinity,
            minLat: Infinity,
            maxLng: -Infinity,
            maxLat: -Infinity,
        }
    );
}

function bboxIntersects(a, b) {
    if (!a || !b) return false;

    return (
        a.minLng <= b.maxLng &&
        a.maxLng >= b.minLng &&
        a.minLat <= b.maxLat &&
        a.maxLat >= b.minLat
    );
}

function parseBBox(value) {
    if (!value) return null;

    const parts = String(value)
        .split(",")
        .map((item) => Number(item));

    if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) {
        return null;
    }

    const [minLng, minLat, maxLng, maxLat] = parts;

    if (minLng > maxLng || minLat > maxLat) {
        return null;
    }

    return { minLng, minLat, maxLng, maxLat };
}

function parseCenter(value) {
    if (!value) return null;

    const parts = String(value)
        .split(",")
        .map((item) => Number(item));

    if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item))) {
        return null;
    }

    return {
        lng: parts[0],
        lat: parts[1],
    };
}

function parseLimit(value, fallback = DEFAULT_LAYER_LIMIT) {
    if (value === undefined || value === null || value === "") {
        return Math.max(0, Math.min(fallback, MAX_LAYER_LIMIT));
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        return Math.max(0, Math.min(fallback, MAX_LAYER_LIMIT));
    }

    if (parsed <= 0) {
        return 0;
    }

    return Math.min(Math.floor(parsed), MAX_LAYER_LIMIT);
}

function distanceSquaredToBBox(record, center) {
    if (!record?.bbox || !center) {
        return Number.MAX_SAFE_INTEGER;
    }

    let dx = 0;
    let dy = 0;

    if (center.lng < record.bbox.minLng) {
        dx = record.bbox.minLng - center.lng;
    } else if (center.lng > record.bbox.maxLng) {
        dx = center.lng - record.bbox.maxLng;
    }

    if (center.lat < record.bbox.minLat) {
        dy = record.bbox.minLat - center.lat;
    } else if (center.lat > record.bbox.maxLat) {
        dy = center.lat - record.bbox.maxLat;
    }

    return dx * dx + dy * dy;
}

function distanceSquaredToCenter(record, center) {
    if (!record?.center || !center) {
        return Number.MAX_SAFE_INTEGER;
    }

    const dx = record.center.lng - center.lng;
    const dy = record.center.lat - center.lat;

    return dx * dx + dy * dy;
}

function sortRecordsByCenter(records, center) {
    if (!center) return records;

    return [...records].sort((a, b) => {
        const bboxDistanceA = distanceSquaredToBBox(a, center);
        const bboxDistanceB = distanceSquaredToBBox(b, center);

        if (bboxDistanceA !== bboxDistanceB) {
            return bboxDistanceA - bboxDistanceB;
        }

        return (
            distanceSquaredToCenter(a, center) -
            distanceSquaredToCenter(b, center)
        );
    });
}

function buildStableFeatureId(layerId, feature, index) {
    const properties = feature?.properties || {};
    const sourceId =
        feature?.id ??
        properties.OBJECTID ??
        properties.CODIGO ??
        properties.PK_CUE ??
        index + 1;

    return `${layerId}-${String(sourceId)}`;
}

function loadLayer(config) {
    const filePath = path.join(DATA_DIR, config.file);

    if (!fs.existsSync(filePath)) {
        throw new Error(`No se encontró el archivo ${config.file}`);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const geojson = JSON.parse(raw.replace(/^\uFEFF/, ""));

    if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
        throw new Error(`${config.file} no es un FeatureCollection válido`);
    }

    const records = geojson.features
        .map((sourceFeature, index) => {
            const bbox = calculateGeometryBBox(sourceFeature.geometry);

            if (!bbox) {
                return null;
            }

            const feature = {
                type: "Feature",
                id: buildStableFeatureId(config.id, sourceFeature, index),
                geometry: sourceFeature.geometry,
                properties: {
                    ...(sourceFeature.properties || {}),
                    _layerId: config.id,
                },
            };

            return {
                feature,
                bbox,
                center: getBBoxCenter(bbox),
            };
        })
        .filter(Boolean);

    const extent = unionBBoxes(records.map((record) => record.bbox));

    const fields = Array.from(
        records.reduce((set, record) => {
            Object.keys(record.feature.properties || {}).forEach((field) => {
                if (!field.startsWith("_")) {
                    set.add(field);
                }
            });

            return set;
        }, new Set())
    );

    return {
        config,
        records,
        extent,
        fields,
    };
}

function publicLayerInfo(layer) {
    return {
        id: layer.config.id,
        name: layer.config.name,
        description: layer.config.description,
        group: layer.config.group,
        geometryKind: layer.config.geometryKind,
        defaultVisible: layer.config.defaultVisible,
        searchable: layer.config.searchable,
        certificateSource: layer.config.certificateSource,
        order: layer.config.order,
        style: layer.config.style,
        count: layer.records.length,
        extent: layer.extent,
        fields: layer.fields,
    };
}

function loadAllLayers() {
    if (!fs.existsSync(DATA_DIR)) {
        throw new Error(
            `No existe la carpeta de datos: ${DATA_DIR}. Crea backend/data/guataqui.`
        );
    }

    const store = new Map();

    for (const config of LAYER_CONFIG) {
        const layer = loadLayer(config);
        store.set(config.id, layer);

        console.log(
            `Capa cargada: ${config.name} (${layer.records.length} elementos)`
        );
    }

    return store;
}

let layerStore;

try {
    layerStore = loadAllLayers();
} catch (error) {
    console.error("No fue posible iniciar las capas de Guataquí:");
    console.error(error.message);
    process.exit(1);
}

const veredaNameByCode = new Map();
const barrioNameBySector = new Map();
const constructionsByTerrainCode = new Map();
const terrainRecords = [];
const terrainByCode = new Map();
const terrainByPreviousCode = new Map();

function buildIndexes() {
    veredaNameByCode.clear();
    barrioNameBySector.clear();
    constructionsByTerrainCode.clear();
    terrainRecords.length = 0;
    terrainByCode.clear();
    terrainByPreviousCode.clear();

    const veredaLayer = layerStore.get("r-vereda");
    const barrioLayer = layerStore.get("u-barrio");
    const constructionLayer = layerStore.get("u-construccion");

    veredaLayer?.records.forEach((record) => {
        const properties = record.feature.properties || {};
        const code = String(properties.CODIGO || "").trim();

        if (code) {
            veredaNameByCode.set(code, properties.NOMBRE || "Sin nombre");
        }
    });

    barrioLayer?.records.forEach((record) => {
        const properties = record.feature.properties || {};
        const sectorCode = String(properties.SECTOR_CODIGO || "").trim();

        if (sectorCode) {
            barrioNameBySector.set(
                sectorCode,
                properties.NOMBRE || "Sin nombre"
            );
        }
    });

    constructionLayer?.records.forEach((record) => {
        const properties = record.feature.properties || {};
        const terrainCode = String(properties.TERRENO_CODIGO || "").trim();

        if (!terrainCode) return;

        if (!constructionsByTerrainCode.has(terrainCode)) {
            constructionsByTerrainCode.set(terrainCode, []);
        }

        constructionsByTerrainCode.get(terrainCode).push(record);
    });

    ["u-terreno", "r-terreno"].forEach((layerId) => {
        const layer = layerStore.get(layerId);

        layer?.records.forEach((record) => {
            const properties = record.feature.properties || {};
            const code = String(properties.CODIGO || "").trim();
            const previousCode = String(
                properties.CODIGO_ANTERIOR || ""
            ).trim();

            const item = {
                layerId,
                record,
            };

            terrainRecords.push(item);

            if (code) {
                terrainByCode.set(normalizeText(code), item);
            }

            if (previousCode) {
                terrainByPreviousCode.set(normalizeText(previousCode), item);
            }
        });
    });
}

buildIndexes();

function findBarrioName(properties) {
    const blockCode = String(properties.MANZANA_CODIGO || "").trim();

    if (!blockCode) {
        return "No aplica";
    }

    for (const [sectorCode, name] of barrioNameBySector.entries()) {
        if (blockCode.startsWith(sectorCode)) {
            return name;
        }
    }

    return "Sector urbano sin nombre";
}

function summarizeConstructions(terrainCode) {
    const records = constructionsByTerrainCode.get(terrainCode) || [];

    if (!records.length) {
        return {
            cantidad: 0,
            areaConstruidaM2: 0,
            areaConstruida: "0 m²",
            maxPisos: 0,
            maxSotanos: 0,
            tipos: [],
            dominios: [],
        };
    }

    const types = new Set();
    const domains = new Set();

    let totalArea = 0;
    let maxFloors = 0;
    let maxBasements = 0;

    records.forEach((record) => {
        const properties = record.feature.properties || {};

        totalArea += toFiniteNumber(properties.SHAPE_Area, 0);

        maxFloors = Math.max(
            maxFloors,
            toFiniteNumber(properties.NUMERO_PISOS, 0)
        );

        maxBasements = Math.max(
            maxBasements,
            toFiniteNumber(properties.NUMERO_SOTANOS, 0)
        );

        if (properties.TIPO_CONSTRUCCION) {
            types.add(String(properties.TIPO_CONSTRUCCION));
        }

        if (properties.TIPO_DOMINIO) {
            domains.add(String(properties.TIPO_DOMINIO));
        }
    });

    return {
        cantidad: records.length,
        areaConstruidaM2: totalArea,
        areaConstruida: formatSquareMeters(totalArea),
        maxPisos: maxFloors,
        maxSotanos: maxBasements,
        tipos: Array.from(types).sort(),
        dominios: Array.from(domains).sort(),
    };
}

function ringAreaApproximation(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;

    let sum = 0;

    for (let index = 0; index < ring.length; index += 1) {
        const current = ring[index];
        const next = ring[(index + 1) % ring.length];

        sum += Number(current[0]) * Number(next[1]);
        sum -= Number(next[0]) * Number(current[1]);
    }

    return Math.abs(sum / 2);
}

function getLargestExteriorRing(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
        return [];
    }

    let rings = [];

    if (geometry.type === "Polygon") {
        rings = geometry.coordinates.length
            ? [geometry.coordinates[0]]
            : [];
    } else if (geometry.type === "MultiPolygon") {
        rings = geometry.coordinates
            .map((polygon) => polygon?.[0])
            .filter(Array.isArray);
    }

    if (!rings.length) {
        return [];
    }

    return rings.reduce((largest, ring) =>
        ringAreaApproximation(ring) > ringAreaApproximation(largest)
            ? ring
            : largest
    );
}

function geometryToLeafletCoordinates(geometry) {
    const ring = getLargestExteriorRing(geometry);

    if (!ring.length) {
        return [];
    }

    const converted = ring
        .filter(
            (coordinate) =>
                Array.isArray(coordinate) &&
                Number.isFinite(Number(coordinate[0])) &&
                Number.isFinite(Number(coordinate[1]))
        )
        .map((coordinate) => [
            Number(coordinate[1]),
            Number(coordinate[0]),
        ]);

    if (converted.length > 1) {
        const first = converted[0];
        const last = converted[converted.length - 1];

        if (first[0] === last[0] && first[1] === last[1]) {
            converted.pop();
        }
    }

    return converted;
}

function terrainItemToPredio(item) {
    const { layerId, record } = item;
    const properties = record.feature.properties || {};

    const urban = layerId === "u-terreno";
    const code = String(properties.CODIGO || "").trim();
    const areaM2 = toFiniteNumber(properties.SHAPE_Area, 0);
    const perimeterM = toFiniteNumber(properties.SHAPE_Length, 0);
    const veredaCode = String(properties.VEREDA_CODIGO || "").trim();
    const blockCode = String(properties.MANZANA_CODIGO || "").trim();

    const sectorName = urban
        ? findBarrioName(properties)
        : veredaNameByCode.get(veredaCode) || "Vereda sin nombre";

    const constructionSummary = urban
        ? summarizeConstructions(code)
        : summarizeConstructions("");

    return {
        id: record.feature.id,
        layerId,

        codigo: code || `SIN-CODIGO-${record.feature.id}`,

        codigoAnterior: String(
            properties.CODIGO_ANTERIOR || "Sin información"
        ),

        objectId: properties.OBJECTID ?? null,

        zona: urban ? "Urbana" : "Rural",

        propietario: "No disponible en la capa suministrada",
        direccion: "No disponible en la capa suministrada",
        matricula: "No disponible en la capa suministrada",

        area: formatSquareMeters(areaM2),
        areaM2,

        perimetro: formatMeters(perimeterM),
        perimetroM: perimeterM,

        uso: urban ? "Terreno urbano" : "Terreno rural",

        estado: "Registrado en la capa predial",

        barrio: urban ? sectorName : "No aplica",
        vereda: urban ? "No aplica" : sectorName,
        barrioOSector: sectorName,

        manzanaCodigo: blockCode || "No aplica",
        veredaCodigo: veredaCode || "No aplica",

        numeroSubterraneos: toFiniteNumber(
            properties.NUMERO_SUBTERRANEOS,
            0
        ),

        codigoMunicipio: String(
            properties.CODIGO_MUNICIPIO || "25324"
        ),

        fechaActualizacion: formatDate(properties.FECHA_LOG),

        construcciones: constructionSummary,

        observacion:
            "Información tomada de las capas vectoriales de prueba de Guataquí.",

        coords: geometryToLeafletCoordinates(record.feature.geometry),

        geometry: record.feature.geometry,
        bbox: record.bbox,
        center: record.center,
    };
}

function findTerrainByCode(value) {
    const normalized = normalizeText(value);

    return (
        terrainByCode.get(normalized) ||
        terrainByPreviousCode.get(normalized) ||
        null
    );
}

function searchTerrains(query, limit = 20) {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
        return [];
    }

    const exact = [];
    const partial = [];

    terrainRecords.forEach((item) => {
        const predio = terrainItemToPredio(item);

        const searchableValues = [
            predio.codigo,
            predio.codigoAnterior,
            predio.zona,
            predio.barrioOSector,
            predio.manzanaCodigo,
            predio.veredaCodigo,
            predio.codigoMunicipio,
        ].map(normalizeText);

        if (
            searchableValues[0] === normalizedQuery ||
            searchableValues[1] === normalizedQuery
        ) {
            exact.push(predio);
            return;
        }

        if (
            searchableValues.some((value) =>
                value.includes(normalizedQuery)
            )
        ) {
            partial.push(predio);
        }
    });

    return [...exact, ...partial].slice(0, limit);
}

function getFilteredLayerRecords(layer, bbox, center) {
    const filtered = bbox
        ? layer.records.filter((record) =>
            bboxIntersects(record.bbox, bbox)
        )
        : layer.records;

    return {
        filtered,
        ordered: sortRecordsByCenter(filtered, center),
    };
}

function cleanFileName(value) {
    return String(value || "predio")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 100);
}

function addPdfField(doc, label, value) {
    doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0f172a")
        .text(`${label}: `, {
            continued: true,
        });

    doc
        .font("Helvetica")
        .fillColor("#334155")
        .text(String(value ?? "Sin información"));

    doc.moveDown(0.35);
}

function addPdfSectionTitle(doc, title) {
    doc.moveDown(0.5);

    doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#0f766e")
        .text(title);

    doc.moveDown(0.6);
}

app.get("/healthz", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "geovisor-guataqui-backend",
        layers: layerStore.size,
        terrains: terrainRecords.length,
    });
});

app.get("/", (req, res) => {
    res.json({
        message:
            "Backend del Geovisor de Guataquí funcionando correctamente",

        version: "BETA",

        municipality: "Guataquí, Cundinamarca",

        mapDefaults: MAP_DEFAULTS,

        layers: Array.from(layerStore.values())
            .map(publicLayerInfo)
            .sort((a, b) => a.order - b.order),

        terrainCount: terrainRecords.length,
    });
});

app.get("/api/config", (req, res) => {
    const layers = Array.from(layerStore.values())
        .map(publicLayerInfo)
        .sort((a, b) => a.order - b.order);

    const municipalityExtent =
        layerStore.get("r-vereda")?.extent ||
        unionBBoxes(layers.map((layer) => layer.extent));

    res.json({
        municipality: {
            name: "Guataquí",
            department: "Cundinamarca",
            daneCode: "25324",
        },

        map: {
            ...MAP_DEFAULTS,
            extent: municipalityExtent,
        },

        layers,
    });
});

app.get("/api/capas", (req, res) => {
    const layers = Array.from(layerStore.values())
        .map(publicLayerInfo)
        .sort((a, b) => a.order - b.order);

    res.set("Cache-Control", "public, max-age=300");

    res.json({
        data: layers,
        count: layers.length,
    });
});

app.get("/api/capas/:layerId", (req, res) => {
    const layer = layerStore.get(req.params.layerId);

    if (!layer) {
        return res.status(404).json({
            message: "La capa solicitada no existe.",
            availableLayers: Array.from(layerStore.keys()),
        });
    }

    const bbox = parseBBox(req.query.bbox);

    const center =
        parseCenter(req.query.center) ||
        (bbox ? getBBoxCenter(bbox) : null);

    const limit = parseLimit(req.query.limit);

    const { filtered, ordered } = getFilteredLayerRecords(
        layer,
        bbox,
        center
    );

    const selected =
        limit > 0 ? ordered.slice(0, limit) : ordered;

    res.set("Cache-Control", "public, max-age=60");

    res.json({
        type: "FeatureCollection",
        name: layer.config.name,
        layer: publicLayerInfo(layer),

        features: selected.map((record) => record.feature),

        count: selected.length,
        totalInView: filtered.length,
        totalLayer: layer.records.length,

        truncated: selected.length < filtered.length,

        limit: limit > 0 ? limit : null,

        bbox,
        center,
    });
});

/*
  Endpoint compatible con el frontend actual.

  Une terrenos urbanos y rurales y devuelve
  el formato predio.coords.
*/
app.get("/api/predios", (req, res) => {
    const bbox = parseBBox(req.query.bbox);

    const center =
        parseCenter(req.query.center) ||
        (bbox ? getBBoxCenter(bbox) : null);

    const limit = parseLimit(req.query.limit);

    const filtered = terrainRecords.filter(
        (item) =>
            !bbox || bboxIntersects(item.record.bbox, bbox)
    );

    const ordered = sortRecordsByCenter(
        filtered.map((item) => item.record),
        center
    );

    const itemByRecord = new Map(
        filtered.map((item) => [
            item.record.feature.id,
            item,
        ])
    );

    const selectedRecords =
        limit > 0 ? ordered.slice(0, limit) : ordered;

    const data = selectedRecords
        .map((record) =>
            itemByRecord.get(record.feature.id)
        )
        .filter(Boolean)
        .map(terrainItemToPredio);

    res.json({
        data,

        count: data.length,

        total: filtered.length,

        totalGeneral: terrainRecords.length,

        limit: limit > 0 ? limit : null,

        truncated: data.length < filtered.length,

        bbox,
        center,
    });
});

app.get("/api/predios/buscar", (req, res) => {
    const query = String(req.query.q || "").trim();

    const limit = Math.min(
        Math.max(Number(req.query.limit || 20), 1),
        100
    );

    if (!query) {
        return res.json({
            data: [],
            count: 0,
            totalGeneral: terrainRecords.length,
        });
    }

    const results = searchTerrains(query, limit);

    res.json({
        data: results,
        count: results.length,
        totalGeneral: terrainRecords.length,
    });
});

app.get("/api/predios/:codigo", (req, res) => {
    const item = findTerrainByCode(req.params.codigo);

    if (!item) {
        return res.status(404).json({
            message: "Predio no encontrado.",
        });
    }

    res.json(terrainItemToPredio(item));
});

app.post("/api/certificados/:codigo", (req, res) => {
    const { password } = req.body || {};

    if (!password || password !== CERTIFICADO_PASSWORD) {
        return res.status(401).json({
            message:
                "Contraseña incorrecta. No se puede generar el certificado.",
        });
    }

    const item = findTerrainByCode(req.params.codigo);

    if (!item) {
        return res.status(404).json({
            message: "Predio no encontrado.",
        });
    }

    const predio = terrainItemToPredio(item);

    const generatedAt = new Intl.DateTimeFormat(
        "es-CO",
        {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "America/Bogota",
        }
    ).format(new Date());

    const fileName = cleanFileName(predio.codigo);

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="certificado-${fileName}.pdf"`
    );

    const doc = new PDFDocument({
        size: "A4",
        margin: 52,

        info: {
            Title: `Certificado predial ${predio.codigo}`,
            Author: "Geovisor Predial de Guataquí",
            Subject: "Certificado predial informativo BETA",
        },
    });

    doc.on("error", (error) => {
        console.error("Error generando PDF:", error);

        if (!res.headersSent) {
            res.status(500).json({
                message:
                    "No fue posible generar el certificado.",
            });
        }
    });

    doc.pipe(res);

    doc
        .roundedRect(52, 45, 491, 72, 10)
        .fillAndStroke("#f0fdfa", "#0f766e");

    doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#0f766e")
        .text(
            "CERTIFICADO PREDIAL INFORMATIVO",
            70,
            64,
            {
                width: 455,
                align: "center",
            }
        );

    doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#475569")
        .text(
            "Geovisor Predial de Guataquí · Versión BETA",
            70,
            91,
            {
                width: 455,
                align: "center",
            }
        );

    doc.y = 140;

    addPdfField(
        doc,
        "Fecha de generación",
        generatedAt
    );

    addPdfField(
        doc,
        "Municipio",
        "Guataquí, Cundinamarca"
    );

    addPdfField(
        doc,
        "Código DANE",
        predio.codigoMunicipio
    );

    addPdfSectionTitle(
        doc,
        "1. Identificación del terreno"
    );

    addPdfField(
        doc,
        "Código predial",
        predio.codigo
    );

    addPdfField(
        doc,
        "Código anterior",
        predio.codigoAnterior
    );

    addPdfField(
        doc,
        "Zona",
        predio.zona
    );

    addPdfField(
        doc,
        "Área catastral",
        predio.area
    );

    addPdfField(
        doc,
        "Perímetro",
        predio.perimetro
    );

    addPdfField(
        doc,
        "Número de subterráneos",
        predio.numeroSubterraneos
    );

    if (predio.zona === "Urbana") {
        addPdfField(
            doc,
            "Código de manzana",
            predio.manzanaCodigo
        );

        addPdfField(
            doc,
            "Barrio o sector",
            predio.barrio
        );
    } else {
        addPdfField(
            doc,
            "Código de vereda",
            predio.veredaCodigo
        );

        addPdfField(
            doc,
            "Vereda",
            predio.vereda
        );
    }

    addPdfField(
        doc,
        "Última fecha registrada",
        predio.fechaActualizacion
    );

    if (predio.zona === "Urbana") {
        addPdfSectionTitle(
            doc,
            "2. Construcciones relacionadas"
        );

        addPdfField(
            doc,
            "Cantidad de construcciones",
            predio.construcciones.cantidad
        );

        addPdfField(
            doc,
            "Área construida acumulada",
            predio.construcciones.areaConstruida
        );

        addPdfField(
            doc,
            "Número máximo de pisos",
            predio.construcciones.maxPisos
        );

        addPdfField(
            doc,
            "Número máximo de sótanos",
            predio.construcciones.maxSotanos
        );

        addPdfField(
            doc,
            "Tipos de construcción",
            predio.construcciones.tipos.join(", ") ||
            "Sin construcciones registradas"
        );

        addPdfField(
            doc,
            "Tipos de dominio",
            predio.construcciones.dominios.join(", ") ||
            "Sin información"
        );
    }

    addPdfSectionTitle(
        doc,
        predio.zona === "Urbana"
            ? "3. Nota de alcance"
            : "2. Nota de alcance"
    );

    doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#334155")
        .text(
            "Este documento se genera a partir de capas vectoriales suministradas para pruebas del prototipo. Tiene carácter informativo y académico. No reemplaza certificados, actos administrativos ni documentos oficiales expedidos por las autoridades competentes.",
            {
                align: "justify",
                lineGap: 3,
            }
        );

    doc.moveDown(2);

    doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor("#64748b")
        .text(
            "Generado automáticamente por el Geovisor Predial de Guataquí.",
            {
                align: "center",
            }
        );

    doc.end();
});

app.use((req, res) => {
    res.status(404).json({
        message: "Ruta no encontrada.",
    });
});

app.use((error, req, res, next) => {
    console.error(error);

    if (
        error.message?.startsWith("CORS bloqueado")
    ) {
        return res.status(403).json({
            message: error.message,
        });
    }

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        message: "Error interno del servidor.",
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Servidor del geovisor ejecutándose en el puerto ${PORT}`
    );

    console.log(
        "Municipio: Guataquí, Cundinamarca"
    );

    console.log(
        `Carpeta de capas: ${DATA_DIR}`
    );

    console.log(
        `Capas disponibles: ${layerStore.size}`
    );

    console.log(
        `Terrenos consultables: ${terrainRecords.length}`
    );

    console.log(
        `Límite por petición: ${DEFAULT_LAYER_LIMIT}`
    );

    console.log(
        `Frontends permitidos: ${FRONTEND_URLS.join(", ")}`
    );
});