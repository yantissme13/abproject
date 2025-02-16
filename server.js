process.on('unhandledRejection', (reason, promise) => {
    console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🔴 Uncaught Exception:', err);
});

require('dotenv').config();
const { Worker } = require('bullmq');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const redis = require('redis');
const { Queue } = require('bullmq');
const { Server } = require("socket.io");
const saveToDatabase = require('./database');
const Odds = require('./models/OddsModel');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "connect-src 'self' ws://localhost:3001 http://localhost:3001; " +
        "style-src 'self' 'unsafe-inline';"
    );
    next();
});
let latestOdds = []; // Stocke les dernières cotes globalement



// 📌 Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connexion MongoDB réussie"))
    .catch(err => console.error("❌ Erreur MongoDB :", err));

// 📌 Connexion à Redis
const client = redis.createClient({ url: process.env.URL_REDIS });
client.connect().catch(err => console.error("❌ Erreur de connexion à Redis :", err));
client.on('error', (err) => console.error('🔴 Erreur Redis :', err));

// 📌 Configuration API
const API_KEY = process.env.ODDS_API_KEY;
const API_BASE_URL = 'https://api.the-odds-api.com/v4';

// 📌 File d'attente BullMQ
const fetchQueue = new Queue("fetchQueue", { connection: { url: process.env.URL_REDIS } });
const telegramQueue = new Queue("TELEGRAM_QUEUE", { connection: { url: process.env.URL_REDIS } });

// 📌 Configuration Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sendTelegramAlert = async (match, arbitrage) => {
    const TOTAL_AMOUNT = 100;
    let message = `🚀 Opportunité d’arbitrage détectée !\n`;
    message += `📅 Match : ${match.home_team} vs ${match.away_team}\n`;
    message += `🏟️ Compétition : ${match.league || match.sport || "N/A"}\n\n`;
    message += `💰 Profit potentiel : ${arbitrage.percentage}%\n\n`;

    let totalProb = arbitrage.bets.reduce((acc, bet) => acc + (1 / bet.odds), 0);
    message += `📊 Bookmakers et mises optimales (sur ${TOTAL_AMOUNT}€) :\n`;
    arbitrage.bets.forEach(bet => {
        const stake = (TOTAL_AMOUNT / bet.odds) / totalProb;
        message += `🏦 ${bet.bookmaker} - ${bet.team} | Cote : ${bet.odds} | Mise : ${stake.toFixed(2)}€\n`;
    });

    let retries = 0;
    const maxRetries = 5; // Nombre de tentatives avant d'abandonner
    const baseDelay = 3000; // 3 secondes entre chaque retry

    while (retries < maxRetries) {
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
            });
            console.log(`✅ Notification envoyée à Telegram après ${retries} tentatives.`);
            break; // Succès, on sort de la boucle
        } catch (error) {
            if (error.response && error.response.status === 429) {
                // Trop de requêtes, on attend avant de réessayer
                let waitTime = (error.response.headers["retry-after"] || (baseDelay * (retries + 1))) * 1000;
                console.warn(`⚠️ Telegram Rate Limit atteint. Réessai dans ${waitTime / 1000} secondes...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retries++;
            } else {
                console.error("🔴 Erreur lors de l'envoi de l'alerte Telegram :", error.message);
                break; // Si ce n'est pas une erreur 429, on arrête les tentatives
            }
        }
    }
};


// 📌 Fonction principale pour récupérer les cotes et stocker en base
async function fetchOdds() {
    try {
        console.log("📢 Début de la récupération des cotes...");
        let sports = await client.get('sports_list');
        if (!sports) {
            const sportsResponse = await axios.get(`${API_BASE_URL}/sports`, { params: { apiKey: API_KEY } });
            sports = sportsResponse.data.filter(sport => sport.active).map(sport => sport.key);
            await client.setEx('sports_list', 86400, JSON.stringify(sports));
        } else {
            sports = JSON.parse(sports);
        }
        
        const now = new Date();
        const commenceTimeFrom = now.toISOString().split('.')[0] + "Z";
        const markets = ['h2h', 'totals', 'spreads'];

        for (const sport of sports) {
            for (const market of markets) {
                let lastOdds = await client.get(`odds_${sport}_${market}`);

                try {
                    const response = await axios.get(`${API_BASE_URL}/sports/${sport}/odds`, {
                        params: {
                            apiKey: API_KEY,
                            regions: 'us',
                            markets: market,
                            oddsFormat: 'decimal',
                            commenceTimeFrom
                        }
                    });

                    if (JSON.stringify(response.data) !== lastOdds) {
                        await client.setEx(`odds_${sport}_${market}`, 60, JSON.stringify(response.data));
                        console.log(`✅ Mise à jour détectée pour ${sport} (${market})`);
                        await processOdds(sport, market, response.data);
                    } else {
                        console.log(`✅ Aucune modification des cotes pour ${sport} (${market}), pas d'appel API.`);
                    }
                } catch (error) {
                    console.error(`❌ Erreur sur ${sport} (${market}) :`, error.response?.data?.message || error.message);
                }
            }
        }
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des cotes :", error);
    }
}

async function processOdds(sport, market, odds) {
    if (!odds || odds.length === 0) {
        console.log(`⚠️ Aucun événement trouvé pour ${sport} (${market})`);
        return;
    }

    console.log(`🔎 Analyse de ${odds.length} événements pour ${sport} (${market})`);
    
    let arbitrageOpportunities = [];

    for (const event of odds) {
        const arbitrage = calculateArbitrage(event);

        if (arbitrage && arbitrage.percentage <= 30) { 
            console.log(`💰 Opportunité trouvée sur ${sport} (${market}) ! Profit : ${arbitrage.percentage}%`);
            arbitrageOpportunities.push({
                sport, market, event, arbitrage
            });

            await sendTelegramAlert(event, arbitrage);
        }
    }

    // Met à jour la variable globale
    latestOdds = arbitrageOpportunities;

    // Émet les nouvelles données via WebSocket
    io.emit("latest_odds", latestOdds);
}


function calculateArbitrage(event) {
    if (!event?.bookmakers?.length) return null;
    let bestOdds = {};

    for (const bookmaker of event.bookmakers) {
        for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes) {
                if (!bestOdds[outcome.name] || outcome.price > bestOdds[outcome.name].odds) {
                    bestOdds[outcome.name] = { odds: outcome.price, bookmaker: bookmaker.title };
                }
            }
        }
    }

    let sum = Object.values(bestOdds).reduce((acc, bet) => acc + (1 / bet.odds), 0);
    if (sum < 1) {
        const percentage = parseFloat(((1 - sum) * 100).toFixed(2));
        if (percentage > 1) {
            return { percentage, bets: Object.values(bestOdds) };
        }
    }
    return null;
}

fetchOdds();
setInterval(fetchOdds, 300000);

// 🔹 Démarre le serveur HTTP + WebSocket
const http = require('http');
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://abproject-production.up.railway.app/", // Autorise les connexions WebSocket depuis le client
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("🟢 Un client est connecté à WebSocket");
socket.emit("latest_odds", latestOdds);
    socket.on("disconnect", () => {
        console.log("🔴 Un client s'est déconnecté");
    });
});

const PORT = process.env.PORT || 3001;

// Écoute du serveur sur le port 3000
server.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
