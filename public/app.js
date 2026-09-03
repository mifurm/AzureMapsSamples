const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const resultsSection = document.querySelector("#results-section");
const resultsList = document.querySelector("#results");
const status = document.querySelector("#status");
const count = document.querySelector("#results-count");
const example = document.querySelector(".example");
const submitButton = form.querySelector("button[type='submit']");

function confidenceLabel(confidence) {
  return {
    High: "wysoka zgodność",
    Medium: "średnia zgodność",
    Low: "niska zgodność",
  }[confidence] ?? "wynik przybliżony";
}

function resultTemplate(result, index) {
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
  return item;
}

async function search(query) {
  resultsSection.hidden = false;
  resultsList.replaceChildren();
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

    const fragment = document.createDocumentFragment();
    payload.results.forEach((result, index) => fragment.append(resultTemplate(result, index)));
    resultsList.append(fragment);
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

example.addEventListener("click", () => {
  queryInput.value = example.textContent;
  form.requestSubmit();
});
