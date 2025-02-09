require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// 🔍 Récupération des variables d'environnement
const mongoUser = process.env.MONGOUSIER || 'mongo';
const mongoPass = process.env.MOT_DE_PASSE_MONGO || 'rKwCKZMFUuKhqjHxaOMsSonBPcBWSrLk';
const mongoHost = process.env.MONGOHOSTE || 'mongodb.railway.internal';
const mongoPort = process.env.MONGOPORT || '27017';
const mongoDatabase = 'admin'; // Base d'authentification

// 🔗 Construire l'URI MongoDB avec authentification
const mongoURI = `mongodb://${mongoUser}:${encodeURIComponent(mongoPass)}@${mongoHost}:${mongoPort}/${mongoDatabase}?authSource=admin`;

// Vérifier si l'URI est bien définie
console.log("🔍 Vérification des variables d'environnement...");
console.log("MONGO_URI:", mongoURI);
console.log("API_KEY:", process.env.API_KEY);
console.log("PORT:", PORT);

// 🔗 Connexion à MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('✅ Connexion à MongoDB réussie');
}).catch(err => {
    console.error('❌ Erreur de connexion à MongoDB :', err);
    process.exit(1);
});

// 📌 Définition du modèle pour stocker les cotes
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

// 📌 Route de test pour voir si le serveur tourne
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📌 Fonction pour récupérer et stocker les cotes historiques
async function fetchAndStoreHistoricalOdds() {
    try {
        console.log('🔄 Récupération des cotes historiques...');
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports`, { 
            params: { apiKey: process.env.API_KEY } 
        });

        const sports = response.data.map(sport => sport.key);

        for (const sport of sports) {
            try {
                const oddsResponse = await axios.get(`https://api.the-odds-api.com/v4/historical/sports/${sport}/odds`, {
                    params: {
                        apiKey: process.env.API_KEY,
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

// 📌 Rafraîchissement des cotes toutes les heures
setInterval(fetchAndStoreHistoricalOdds, 3600000);

// 📌 Route pour récupérer les cotes historiques
app.get('/historical-odds', async (req, res) => {
    try {
        const odds = await Odds.find().sort({ timestamp: -1 }).limit(100);
        res.json(odds);
    } catch (error) {
        console.error('❌ Erreur récupération cotes historiques :', error.message);
        res.status(500).json({ message: 'Erreur récupération cotes historiques' });
    }
});

// 📌 Lancer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend en écoute sur http://localhost:${PORT}`);
});
