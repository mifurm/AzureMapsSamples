# GdzieTo?

Prosta wyszukiwarka polskich adresów oparta na Azure Maps Search API. Klucz API jest używany
wyłącznie przez serwer Node.js i nie trafia do przeglądarki.

## Uruchomienie

1. Zaloguj się w Azure CLI poleceniem `az login`.
2. Skopiuj `.env.example` do `.env` i wpisz klucz istniejącego konta Azure Maps:

   ```bash
   cp .env.example .env
   ```

   Wymagana zmienna to `AZURE_MAPS_SUBSCRIPTION_KEY`. Klucz pozostaje po stronie serwera i nie jest
   wysyłany do przeglądarki.

3. Uruchom aplikację lokalnie:

   ```bash
   npm start
   ```

4. Otwórz <http://localhost:3000>.

Do pracy nad aplikacją z automatycznym restartem serwera użyj `npm run dev`. Testy uruchamia
polecenie `npm test`.

## Wdrożenie do Azure

Wdrożenie tworzy tylko zasoby hostingu: Linux App Service Plan w warstwie S1 oraz Web App dla Node.js
24. Istniejące konto Azure Maps nie jest tworzone ani modyfikowane; jego klucz jest odczytywany z
`.env` i zapisywany jako ustawienie aplikacji w App Service.

```bash
npm run infra:deploy
```

Domyślne ustawienia:

- grupa zasobów: `rg-geoap`
- region: `polandcentral`
- plan App Service: `S1`
- nazwa aplikacji: `geoap-<pierwsze-8-znaków-id-subskrypcji>`

Można je zmienić zmiennymi środowiskowymi:

```bash
AZURE_RESOURCE_GROUP=my-group \
AZURE_LOCATION=polandcentral \
AZURE_WEBAPP_NAME=my-unique-webapp-name \
AZURE_APP_SERVICE_PLAN_NAME=my-plan \
AZURE_APP_SERVICE_PLAN_SKU=S1 \
npm run infra:deploy
```

Szablon infrastruktury można sprawdzić bez wdrożenia poleceniem:

```bash
npm run infra:validate
```

Usunięcie zasobów hostingu bez ruszania istniejącego konta Azure Maps:

```bash
az webapp delete --resource-group rg-geoap --name <app-name>
az appservice plan delete --resource-group rg-geoap --name <plan-name> --yes
```

Wyszukiwanie korzysta z endpointu `GET /geocode` w wersji `2026-01-01`, dodaje granice Polski
jako geograficzny kontekst zapytania i odrzuca wyniki spoza Polski.
