const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
require('dotenv').config();

const apiKey = process.env.API_KEY || 'f0c696ab8a6fa3ed0c5dfd3e694c1fe1';
const baseURL = 'https://api.the-odds-api.com/v4';

mongoose.connect('mongodb://localhost:27017/oddsDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const OddsSchema = new mongoose.Schema({
    sport: String,
    event: String,
    bookmaker: String,
    odds: Object,
    timestamp: Date
});

const Odds = mongoose.model('Odds', OddsSchema);

app.use(cors());
app.use(express.json());

// Fetch and store historical odds efficiently
async function fetchAndStoreHistoricalOdds() {
    try {
        const response = await axios.get(`${baseURL}/sports`, { params: { apiKey } });
        const sports = response.data.map(sport => sport.key);
        
        for (const sport of sports) {
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
                        { upsert: true }
                    );
                }
            }
        }
        console.log('Cotes historiques mises à jour');
    } catch (error) {
        console.error('Erreur lors de la récupération des cotes historiques :', error);
    }
}

setInterval(fetchAndStoreHistoricalOdds, 3600000); // Mettre à jour toutes les heures

app.get('/historical-odds', async (req, res) => {
    try {
        const odds = await Odds.find().sort({ timestamp: -1 }).limit(100);
        res.json(odds);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération des cotes historiques' });
    }
});

app.listen(3001, () => {
    console.log('Serveur backend en écoute sur le port 3001');
});
