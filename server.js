require('dotenv').config(); // Charger les variables d'environnement 
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de l'API
const API_KEY = process.env.API_KEY || "28595ca16f06375a6806c0f40e095d44"; // Clé API avec valeur par défaut
const BASE_API_URL = "https://api.the-odds-api.com/v4";

// Cache : 
// - sportsCache reste à 1 heure (3600 secondes) pour une éventuelle utilisation ultérieure
// - oddsCache est mis à jour toutes les 60 secondes pour avoir des cotes récentes
const sportsCache = new NodeCache({ stdTTL: 3600 });
const oddsCache = new NodeCache({ stdTTL: 60 }); // Mise à jour toutes les 60 secondes

// Middleware
app.use(cors());
app.use(express.json());

// Fonction pour récupérer les cotes avec gestion des erreurs et cache
async function fetchOddsCached(sportKey, markets = "h2h,spreads,totals") {
  // Utilisation d'une clé composite pour le cache en incluant le paramètre markets
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
        includeLinks: "true",
      },
    });
    oddsCache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error(`Erreur lors de la récupération des cotes pour ${sportKey} (markets: ${markets}) :`, error.message);
    return [];
  }
}

// Route optimisée pour récupérer les cotes de plusieurs sports sélectionnés
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

    // Récupérer les cotes pour chaque sport sélectionné
    const allOdds = await Promise.all(
      sportsToFetch.map(sportKey => fetchOddsCached(sportKey))
    );

    // Filtrer pour ne garder que les événements avec des bookmakers
    const filteredOdds = allOdds.flat().filter(event => event.bookmakers && event.bookmakers.length > 0);

    res.json(filteredOdds);
  } catch (error) {
    console.error("Erreur lors de la récupération des cotes :", error);
    res.status(500).json({ error: "Erreur lors de la récupération des cotes." });
  }
});

// -------------------------------
// SERVEUR FRONTEND
// -------------------------------
// Servir les fichiers statiques du dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Pour toute requête non gérée par les routes ci-dessus, retourner le fichier index.html
// (utile pour une application monopage)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
