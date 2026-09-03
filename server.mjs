import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const POLAND_BBOX = "14.1229,49.0020,24.1458,54.8358";
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export function loadEnvironment(filePath = join(ROOT, ".env")) {
  try {
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function buildSearchUrl(query, subscriptionKey) {
  const url = new URL("https://atlas.microsoft.com/geocode");
  url.search = new URLSearchParams({
    "api-version": "2026-01-01",
    query: `${query}, Polska`,
    bbox: POLAND_BBOX,
    top: "10",
  });
  url.searchParams.set("subscription-key", subscriptionKey);
  return url;
}

export function buildAutocompleteUrl(query, subscriptionKey) {
  const url = new URL("https://atlas.microsoft.com/geocode:autocomplete");
  url.search = new URLSearchParams({
    "api-version": "2026-01-01",
    query: `${query}, Polska`,
    bbox: POLAND_BBOX,
    countryRegion: "PL",
    resultTypeGroups: "address",
    top: "6",
  });
  url.searchParams.set("subscription-key", subscriptionKey);
  return url;
}

export function buildStaticMapUrl({ longitude, latitude }, subscriptionKey) {
  const url = new URL("https://atlas.microsoft.com/map/static");
  url.search = new URLSearchParams({
    "api-version": "2024-04-01",
    center: `${longitude},${latitude}`,
    zoom: "16",
    width: "640",
    height: "320",
    language: "pl-PL",
    tilesetId: "microsoft.base.road",
  });
  url.searchParams.set("subscription-key", subscriptionKey);
  return url;
}

export function normalizeResults(payload) {
  return (payload.features ?? [])
    .filter(({ properties }) => {
      const country = properties?.address?.countryRegion;
      return country?.ISO === "PL" || ["Poland", "Polska"].includes(country?.name);
    })
    .map(({ properties, geometry }) => ({
      address: properties.address?.formattedAddress ?? "Nieznany adres",
      addressLine: properties.address?.addressLine ?? "",
      locality: properties.address?.locality ?? "",
      postalCode: properties.address?.postalCode ?? "",
      type: properties.type ?? "",
      confidence: properties.confidence ?? "",
      matchCodes: properties.matchCodes ?? [],
      longitude: geometry?.coordinates?.[0],
      latitude: geometry?.coordinates?.[1],
    }))
    .filter(({ longitude, latitude }) => Number.isFinite(longitude) && Number.isFinite(latitude));
}

export function normalizeAutocompleteResults(payload) {
  const seen = new Set();
  return (payload.features ?? [])
    .map(({ properties, geometry }) => ({
      address: properties?.address?.formattedAddress ?? properties?.name ?? "",
      locality: properties?.address?.locality ?? "",
      postalCode: properties?.address?.postalCode ?? "",
      type: properties?.type ?? "",
      longitude: geometry?.coordinates?.[0],
      latitude: geometry?.coordinates?.[1],
    }))
    .filter(({ address, longitude, latitude }) => {
      if (!address || seen.has(address)) return false;
      seen.add(address);
      return Number.isFinite(longitude) && Number.isFinite(latitude);
    })
    .slice(0, 6);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function getAzureMapsKey(response) {
  const key = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;
  if (!key) {
    sendJson(response, 503, { error: "Brak konfiguracji klucza Azure Maps na serwerze." });
    return undefined;
  }
  return key;
}

async function searchAddress(requestUrl, response) {
  const query = requestUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 3 || query.length > 200) {
    sendJson(response, 400, { error: "Wpisz adres zawierający od 3 do 200 znaków." });
    return;
  }

  const key = getAzureMapsKey(response);
  if (!key) return;

  try {
    const azureResponse = await fetch(buildSearchUrl(query, key), {
      headers: { "Accept-Language": "pl-PL" },
      signal: AbortSignal.timeout(8000),
    });

    if (!azureResponse.ok) {
      console.error(`Azure Maps returned ${azureResponse.status}`);
      sendJson(response, 502, { error: "Usługa wyszukiwania adresów jest chwilowo niedostępna." });
      return;
    }

    sendJson(response, 200, { results: normalizeResults(await azureResponse.json()) });
  } catch (error) {
    console.error("Azure Maps request failed:", error.message);
    sendJson(response, 502, { error: "Nie udało się połączyć z usługą Azure Maps." });
  }
}

async function autocompleteAddress(requestUrl, response) {
  const query = requestUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 3 || query.length > 200) {
    sendJson(response, 400, { error: "Wpisz co najmniej 3 znaki, aby podpowiedzieć adres." });
    return;
  }

  const key = getAzureMapsKey(response);
  if (!key) return;

  try {
    const azureResponse = await fetch(buildAutocompleteUrl(query, key), {
      headers: { "Accept-Language": "pl-PL" },
      signal: AbortSignal.timeout(5000),
    });

    if (!azureResponse.ok) {
      console.error(`Azure Maps autocomplete returned ${azureResponse.status}`);
      sendJson(response, 502, { error: "Podpowiedzi adresów są chwilowo niedostępne." });
      return;
    }

    sendJson(response, 200, { suggestions: normalizeAutocompleteResults(await azureResponse.json()) });
  } catch (error) {
    console.error("Azure Maps autocomplete failed:", error.message);
    sendJson(response, 502, { error: "Nie udało się pobrać podpowiedzi adresów." });
  }
}

async function renderStaticMap(requestUrl, response) {
  const latitude = Number.parseFloat(requestUrl.searchParams.get("lat") ?? "");
  const longitude = Number.parseFloat(requestUrl.searchParams.get("lon") ?? "");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    sendJson(response, 400, { error: "Nieprawidłowe współrzędne mapy." });
    return;
  }

  const key = getAzureMapsKey(response);
  if (!key) return;

  try {
    const azureResponse = await fetch(buildStaticMapUrl({ longitude, latitude }, key), {
      signal: AbortSignal.timeout(8000),
    });

    if (!azureResponse.ok || !azureResponse.body) {
      console.error(`Azure Maps render returned ${azureResponse.status}`);
      sendJson(response, 502, { error: "Mapa jest chwilowo niedostępna." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": azureResponse.headers.get("content-type") ?? "image/png",
      "Cache-Control": "private, max-age=300",
    });
    for await (const chunk of azureResponse.body) response.write(chunk);
    response.end();
  } catch (error) {
    console.error("Azure Maps render failed:", error.message);
    sendJson(response, 502, { error: "Nie udało się wyrenderować mapy." });
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:;",
    );

    if (request.method === "GET" && requestUrl.pathname === "/api/search") {
      await searchAddress(requestUrl, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/autocomplete") {
      await autocompleteAddress(requestUrl, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/map") {
      await renderStaticMap(requestUrl, response);
      return;
    }

    const staticFile = request.method === "GET" && STATIC_FILES.get(requestUrl.pathname);
    if (!staticFile) {
      sendJson(response, 404, { error: "Nie znaleziono strony." });
      return;
    }

    try {
      const body = readFileSync(join(PUBLIC_DIR, staticFile));
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(staticFile)],
        "Cache-Control": "no-cache",
      });
      response.end(body);
    } catch (error) {
      console.error("Static file error:", error.message);
      sendJson(response, 500, { error: "Nie udało się wczytać aplikacji." });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvironment();
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  createAppServer().listen(port, () => {
    console.log(`Wyszukiwarka adresów działa na http://localhost:${port}`);
  });
}
