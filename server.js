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

// ✅ Test du serveur
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Route pour récupérer les cotes live
app.get('/live-odds', async (req, res) => {
    try {
        const response = await axios.get(`${baseURL}/sports/upcoming/odds`, {
            params: {
                apiKey,
                regions: 'us,eu',
                markets: 'h2h,spreads,totals',
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('❌ Erreur récupération des cotes live :', error.message);
        res.status(500).json({ message: 'Erreur récupération cotes live' });
    }
});

// ✅ Route pour récupérer les cotes historiques
app.get('/historical-odds', async (req, res) => {
    try {
        const odds = await Odds.find().sort({ timestamp: -1 }).limit(100);
        res.json(odds);
    } catch (error) {
        console.error('❌ Erreur récupération cotes historiques :', error.message);
        res.status(500).json({ message: 'Erreur récupération cotes historiques' });
    }
});

// ✅ Lancer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend en écoute sur http://localhost:${PORT}`);
});
