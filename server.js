const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
require('dotenv').config();

// Clé API et baseURL
const apiKey = process.env.API_KEY || 'f0c696ab8a6fa3ed0c5dfd3e694c1fe1';
const baseURL = 'https://api.the-odds-api.com/v4';
const mongoURI = process.env.URL_MONGO || 'mongodb://localhost:27017/oddsDB';
const PORT = process.env.PORT || 3001;

// Connexion à MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ Connexion à MongoDB réussie'))
  .catch(err => console.error('❌ Erreur de connexion à MongoDB :', err));

// Définition du schéma et du modèle pour stocker les cotes
const OddsSchema = new mongoose.Schema({
    sport: String,
    event: String,
    bookmaker: String,
    odds: Object,
    timestamp: Date,
}, { timestamps: true });

const Odds = mongoose.model('Odds', OddsSchema);

app.use(cors());
app.use(express.json());

// Récupération et stockage des cotes historiques
async function fetchAndStoreHistoricalOdds() {
    try {
        console.log('🔄 Récupération des cotes historiques...');
        const { data: sports } = await axios.get(`${baseURL}/sports`, { params: { apiKey } });
        const sportKeys = sports.map(sport => sport.key);

        for (const sport of sportKeys) {
            try {
                const { data: oddsData } = await axios.get(`${baseURL}/historical/sports/${sport}/odds`, {
                    params: {
                        apiKey,
                        regions: 'us,eu',
                        markets: 'h2h,spreads,totals',
                        date: new Date().toISOString()
                    }
                });

                const bulkOperations = oddsData.flatMap(event =>
                    event.bookmakers.map(bookmaker => ({
                        updateOne: {
                            filter: { sport: event.sport_key, event: event.id, bookmaker: bookmaker.title },
                            update: { odds: bookmaker.markets, timestamp: new Date() },
                            upsert: true
                        }
                    }))
                );
                
                if (bulkOperations.length) {
                    await Odds.bulkWrite(bulkOperations);
                    console.log(`✅ Cotes mises à jour pour "${sport}"`);
                }
            } catch (error) {
                console.error(`❌ Erreur sur "${sport}" :`, error.message);
            }
        }
        console.log('✅ Mise à jour complète des cotes historiques');
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des sports :', error.message);
    }
}

// Actualisation toutes les heures
setInterval(fetchAndStoreHistoricalOdds, 3600000);

// Endpoint pour récupérer les cotes historiques
app.get('/historical-odds', async (req, res) => {
    try {
        const odds = await Odds.find().sort({ timestamp: -1 }).limit(100);
        res.json(odds);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des cotes historiques :', error.message);
        res.status(500).json({ message: 'Erreur interne du serveur' });
    }
});

// Lancer le serveur
app.listen(PORT, () => console.log(`🚀 Serveur backend en écoute sur le port ${PORT}`));
