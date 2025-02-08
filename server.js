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

app.use(cors());
app.use(express.json());

// ✅ Ajout de la ligne pour s'assurer que styles.css est bien accessible
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Ajout d'un middleware spécifique pour éviter les erreurs de MIME
app.get('/styles.css', (req, res) => {
    res.type('text/css'); // Forcer le bon type MIME
    res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

// ✅ Ajout d'une route pour servir la page index.html correctement
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Définition du modèle des cotes
const OddsSchema = new mongoose.Schema({
    sport: String,
    event: String,
    bookmaker: String,
    odds: Object,
    timestamp: Date,
}, { timestamps: true });

const Odds = mongoose.model('Odds', OddsSchema);

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
