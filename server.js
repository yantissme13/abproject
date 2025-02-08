require('dotenv').config(); // Charger les variables d'environnement 
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de l'API
// Remplacez la clé API par la nouvelle (vous pouvez la mettre dans votre .env)
const API_KEY = process.env.API_KEY || "f0c696ab8a6fa3ed0c5dfd3e694c1fe1";
const BASE_API_URL = "https://api.the-odds-api.com/v4";

// Cache :
// - sportsCache reste à 1 heure (3600 secondes)
// - oddsCache est mis à jour toutes les 60 secondes pour les cotes récentes
const sportsCache = new NodeCache({ stdTTL: 3600 });
const oddsCache = new NodeCache({ stdTTL: 60 });

app.use(cors());
app.use(express.json());

// Fonction pour récupérer les cotes en temps réel
async function fetchOddsCached(sportKey, markets = "h2h,spreads,totals") {
  const cacheKey = `${sportKey}-${markets}`;
  const cachedOdds = oddsCache.get(cacheKey);
  if (cachedOdds) return cachedOdds;
  try {
    const response = await axios.get(`${BASE_API_URL}/sports/${sportKey}/odds`, {
      params: {
        apiKey: API_KEY,
        regions: "us,uk,eu,au",
        markets,
        oddsFormat: "decimal",
        includeLinks: "true"
      }
    });
    oddsCache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error(`Erreur lors de la récupération des cotes pour ${sportKey} (markets: ${markets}) :`, error.message);
    return [];
  }
}

// Endpoint existant pour les cotes en temps réel
app.get('/all-odds', async (req, res) => {
  try {
    const sportsToFetch = [
      'americanfootball_nfl',
      'basketball_nba',
      'tennis',
      'soccer',
      'icehockey_nhl',
      'baseball_mlb',
    ];
    const allOdds = await Promise.all(
      sportsToFetch.map(sportKey => fetchOddsCached(sportKey))
    );
    const filteredOdds = allOdds.flat().filter(event => event.bookmakers && event.bookmakers.length > 0);
    res.json(filteredOdds);
  } catch (error) {
    console.error("Erreur lors de la récupération des cotes :", error);
    res.status(500).json({ error: "Erreur lors de la récupération des cotes." });
  }
});

// Nouvel endpoint pour récupérer les cotes historiques
app.get('/historical-odds', async (req, res) => {
  try {
    const sportsToFetch = [
      'americanfootball_nfl',
      'basketball_nba',
      'tennis',
      'soccer',
      'icehockey_nhl',
      'baseball_mlb',
    ];
    const promises = sportsToFetch.map(async sportKey => {
      const response = await axios.get(`${BASE_API_URL}/sports/${sportKey}/odds`, {
        params: {
          apiKey: API_KEY,
          regions: "us,uk,eu,au",
          markets: "h2h,spreads,totals",
          oddsFormat: "decimal",
          includeLinks: "true",
          includeHistory: true  // Paramètre pour inclure l'historique (vérifiez la documentation de l'API)
        }
      });
      return response.data;
    });
    const allHistoricalOdds = await Promise.all(promises);
    res.json(allHistoricalOdds.flat());
  } catch (error) {
    console.error("Erreur lors de la récupération des cotes historiques :", error.message);
    res.status(500).json({ error: "Erreur lors de la récupération des cotes historiques." });
  }
});

// Servir les fichiers statiques du dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
