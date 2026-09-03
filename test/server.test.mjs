import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutocompleteUrl,
  buildSearchUrl,
  buildStaticMapUrl,
  normalizeAutocompleteResults,
  normalizeResults,
} from "../server.mjs";

test("buildSearchUrl scopes a free-form query to Poland", () => {
  const url = buildSearchUrl("Marszałkowska 1, Warszawa", "secret");

  assert.equal(url.pathname, "/geocode");
  assert.equal(url.searchParams.get("api-version"), "2026-01-01");
  assert.equal(url.searchParams.get("query"), "Marszałkowska 1, Warszawa, Polska");
  assert.equal(url.searchParams.get("bbox"), "14.1229,49.0020,24.1458,54.8358");
  assert.equal(url.searchParams.get("subscription-key"), "secret");
});

test("buildAutocompleteUrl scopes suggestions to Polish addresses", () => {
  const url = buildAutocompleteUrl("Marsza", "secret");

  assert.equal(url.pathname, "/geocode:autocomplete");
  assert.equal(url.searchParams.get("api-version"), "2026-01-01");
  assert.equal(url.searchParams.get("query"), "Marsza");
  assert.equal(url.searchParams.get("bbox"), "14.1229,49.0020,24.1458,54.8358");
  assert.equal(url.searchParams.get("countryRegion"), "PL");
  assert.equal(url.searchParams.get("resultTypeGroups"), "Address");
  assert.equal(url.searchParams.get("subscription-key"), "secret");
});

test("buildStaticMapUrl renders a centered Polish map image", () => {
  const url = buildStaticMapUrl({ longitude: 21.018, latitude: 52.219 }, "secret");

  assert.equal(url.pathname, "/map/static");
  assert.equal(url.searchParams.get("api-version"), "2024-04-01");
  assert.equal(url.searchParams.get("center"), "21.018,52.219");
  assert.equal(url.searchParams.get("zoom"), "16");
  assert.equal(url.searchParams.get("tilesetId"), "microsoft.base.road");
  assert.equal(url.searchParams.get("subscription-key"), "secret");
});

test("normalizeResults keeps Polish results and maps coordinates", () => {
  const payload = {
    features: [
      {
        properties: {
          address: {
            countryRegion: { name: "Polska", ISO: "PL" },
            formattedAddress: "Marszałkowska 1, 00-624 Warszawa",
            locality: "Warszawa",
            postalCode: "00-624",
          },
          type: "Address",
          confidence: "High",
          matchCodes: ["Good"],
        },
        geometry: { coordinates: [21.018, 52.219] },
      },
      {
        properties: {
          address: { countryRegion: { name: "Germany", ISO: "DE" } },
        },
        geometry: { coordinates: [13.405, 52.52] },
      },
    ],
  };

  assert.deepEqual(normalizeResults(payload), [
    {
      address: "Marszałkowska 1, 00-624 Warszawa",
      addressLine: "",
      locality: "Warszawa",
      postalCode: "00-624",
      type: "Address",
      confidence: "High",
      matchCodes: ["Good"],
      longitude: 21.018,
      latitude: 52.219,
    },
  ]);
});

test("normalizeAutocompleteResults deduplicates address suggestions with coordinates", () => {
  const payload = {
    features: [
      {
        properties: {
          address: {
            formattedAddress: "Marszałkowska 1, Warszawa",
            locality: "Warszawa",
            postalCode: "00-624",
          },
          type: "Address",
        },
        geometry: { coordinates: [21.018, 52.219] },
      },
      {
        properties: {
          address: { formattedAddress: "Marszałkowska 1, Warszawa" },
        },
        geometry: { coordinates: [21.018, 52.219] },
      },
      {
        properties: { address: { formattedAddress: "Bez współrzędnych" } },
        geometry: null,
      },
    ],
  };

  assert.deepEqual(normalizeAutocompleteResults(payload), [
    {
      address: "Marszałkowska 1, Warszawa",
      locality: "Warszawa",
      postalCode: "00-624",
      type: "Address",
      longitude: 21.018,
      latitude: 52.219,
    },
    {
      address: "Bez współrzędnych",
      locality: "",
      postalCode: "",
      type: "",
      longitude: undefined,
      latitude: undefined,
    },
  ]);
});
