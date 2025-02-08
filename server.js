require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const mongoURI = process.env.MONGO_URI;
const apiKey = process.env.API_KEY;
const baseURL = 'https://api.the-odds-api.com/v4';

// Connexion à MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ Connexion à MongoDB réussie'))
  .catch(err => console.error('❌ Erreur de connexion à MongoDB :', err));

// Définition du modèle des cotes
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
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint de test pour vérifier si le serveur tourne
app.get('/', (req, res) => {
    res.send('✅ Serveur backend opérationnel !');
});

// Fonction pour récupérer et stocker les cotes historiques efficacement
async function fetchAndStoreHistoricalOdds() {
    try {
        console.log('🔄 Récupération des cotes historiques...');
        const response = await axios.get(`${baseURL}/sports`, { params: { apiKey } });
        const sports = response.data.map(sport => sport.key);

        for (const sport of sports) {
            try {
                const oddsResponse = await axios.get(`${baseURL}/historical/sports/${sport}/odds`, {
                    params: {
                        apiKey,
                        regions: 'us,eu',
                        markets: 'h2h,spreads,totals',
                        date: new Date().toISOString()
                    }
                });

                const oddsData = oddsResponse.data;
                for (const event of oddsData) {
                    for (const bookmaker of event.bookmakers) {
                        await Odds.findOneAndUpdate(
                            { sport: event.sport_key, event: event.id, bookmaker: bookmaker.title },
                            { odds: bookmaker.markets, timestamp: new Date() },
                            { upsert: true, new: true }
                        );
                    }
                }
                console.log(`✅ Cotes mises à jour pour "${sport}"`);
            } catch (error) {
                console.error(`❌ Erreur récupération cotes "${sport}" :`, error.message);
            }
        }
        console.log('✅ Mise à jour des cotes historiques terminée.');
    } catch (error) {
        console.error('❌ Erreur récupération des sports :', error.message);
    }
}

// Rafraîchissement des cotes toutes les heures
setInterval(fetchAndStoreHistoricalOdds, 3600000);

// Endpoint pour récupérer les cotes historiques
app.get('/historical-odds', async (req, res) => {
    try {
        const odds = await Odds.find().sort({ timestamp: -1 }).limit(100);
        res.json(odds);
    } catch (error) {
        console.error('❌ Erreur récupération cotes historiques :', error.message);
        res.status(500).json({ message: 'Erreur récupération cotes historiques' });
    }
});

// Lancer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend en écoute sur le port ${PORT}`);
});
