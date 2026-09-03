const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const resultsSection = document.querySelector("#results-section");
const resultsList = document.querySelector("#results");
const status = document.querySelector("#status");
const count = document.querySelector("#results-count");
const example = document.querySelector(".example");
const submitButton = form.querySelector("button[type='submit']");
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const autocompleteToggle = document.querySelector("#autocomplete-toggle");
const renderToggle = document.querySelector("#render-toggle");
const suggestionsList = document.querySelector("#suggestions");

let autocompleteTimer;
let autocompleteRequest;
let lastResults = [];

function confidenceLabel(confidence) {
  return {
    High: "wysoka zgodność",
    Medium: "średnia zgodność",
    Low: "niska zgodność",
  }[confidence] ?? "wynik przybliżony";
}

function resultTemplate(result, index, includeMap) {
  const item = document.createElement("li");
  const coordinates = `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
  const mapUrl = new URL("https://www.openstreetmap.org/");
  mapUrl.search = new URLSearchParams({
    mlat: result.latitude,
    mlon: result.longitude,
    zoom: "17",
  });

  item.innerHTML = `
    <span class="result-number">${String(index + 1).padStart(2, "0")}</span>
    <div class="result-main">
      <h3></h3>
      <p class="result-meta"></p>
      <p class="coordinates">${coordinates}</p>
    </div>
    <a class="map-link" target="_blank" rel="noopener noreferrer">
      Mapa <span aria-hidden="true">↗</span>
    </a>
  `;
  item.querySelector("h3").textContent = result.address;
  item.querySelector(".result-meta").textContent =
    [result.postalCode, result.locality, confidenceLabel(result.confidence)]
      .filter(Boolean)
      .join(" · ");
  item.querySelector(".map-link").href = mapUrl;
  if (includeMap) {
    const map = document.createElement("figure");
    map.className = "result-map";
    map.innerHTML = `<img loading="lazy" width="640" height="320" alt="" /><span class="map-pin" aria-hidden="true"></span>`;
    const image = map.querySelector("img");
    image.alt = `Mapa: ${result.address}`;
    image.src = `/api/map?lat=${encodeURIComponent(result.latitude)}&lon=${encodeURIComponent(result.longitude)}`;
    item.append(map);
  }
  return item;
}

function renderResults(results) {
  const fragment = document.createDocumentFragment();
  results.forEach((result, index) => fragment.append(resultTemplate(result, index, renderToggle.checked)));
  resultsList.replaceChildren(fragment);
}

function hideSuggestions() {
  suggestionsList.hidden = true;
  suggestionsList.replaceChildren();
}

function showSuggestions(suggestions) {
  if (!autocompleteToggle.checked || suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  const fragment = document.createDocumentFragment();
  suggestions.forEach((suggestion) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = suggestion.address;
    button.addEventListener("click", () => {
      queryInput.value = suggestion.address;
      hideSuggestions();
      form.requestSubmit();
    });
    item.append(button);
    fragment.append(item);
  });
  suggestionsList.replaceChildren(fragment);
  suggestionsList.hidden = false;
}

function queueAutocomplete() {
  window.clearTimeout(autocompleteTimer);
  if (autocompleteRequest) autocompleteRequest.abort();

  const query = queryInput.value.trim();
  if (!autocompleteToggle.checked || query.length < 3) {
    hideSuggestions();
    return;
  }

  autocompleteTimer = window.setTimeout(async () => {
    autocompleteRequest = new AbortController();
    try {
      const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`, {
        signal: autocompleteRequest.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Nie udało się pobrać podpowiedzi.");
      showSuggestions(payload.suggestions ?? []);
    } catch (error) {
      if (error.name !== "AbortError") hideSuggestions();
    }
  }, 240);
}

async function search(query) {
  resultsSection.hidden = false;
  resultsList.replaceChildren();
  hideSuggestions();
  status.textContent = "Szukamy najlepszego dopasowania…";
  status.className = "status loading";
  count.textContent = "";
  submitButton.disabled = true;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Nie udało się wyszukać adresu.");

    if (payload.results.length === 0) {
      status.textContent = "Nie znaleźliśmy adresu w Polsce. Dodaj numer budynku, kod pocztowy lub miasto.";
      status.className = "status empty";
      return;
    }

    lastResults = payload.results;
    renderResults(lastResults);
    status.textContent = "";
    status.className = "status";
    count.textContent = `${payload.results.length} ${
      payload.results.length === 1 ? "wynik" : "wyników"
    }`;
  } catch (error) {
    status.textContent = error.message;
    status.className = "status error";
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (query.length >= 3) search(query);
});

settingsButton.addEventListener("click", () => {
  const expanded = settingsButton.getAttribute("aria-expanded") === "true";
  settingsButton.setAttribute("aria-expanded", String(!expanded));
  settingsPanel.hidden = expanded;
});

autocompleteToggle.addEventListener("change", () => {
  if (autocompleteToggle.checked) queueAutocomplete();
  else hideSuggestions();
});

renderToggle.addEventListener("change", () => {
  if (lastResults.length > 0) renderResults(lastResults);
});

queryInput.addEventListener("input", queueAutocomplete);

document.addEventListener("click", (event) => {
  if (!form.contains(event.target)) hideSuggestions();
  if (!settingsPanel.hidden && !settingsPanel.contains(event.target) && event.target !== settingsButton) {
    settingsPanel.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  }
});

example.addEventListener("click", () => {
  queryInput.value = example.textContent;
  form.requestSubmit();
});
