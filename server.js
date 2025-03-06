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
const sentArbitrages = new Set();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", 
        "default-src *; " +
        "script-src * 'unsafe-inline' 'unsafe-eval'; " +
        "connect-src * ws://abproject-production.up.railway.app wss://abproject-production.up.railway.app; " +
        "style-src * 'unsafe-inline';"
    );
    next();
});

let latestOdds = []; // Stocke les dernières cotes globalement



// 📌 Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connexion MongoDB réussie"))
    .catch(err => console.error("❌ Erreur MongoDB :", err));

// 📌 Connexion à Redis
const redisURL = process.env.REDIS_PUBLIC_URL;
console.log("🔍 URL Redis utilisée :", redisURL);

const client = redis.createClient({ url: redisURL });
client.connect()
    .then(() => console.log("✅ Connexion Redis réussie"))
    .catch(err => console.error("❌ Erreur de connexion à Redis :", err));


// 📌 Configuration API
const API_KEY = process.env.ODDS_API_KEY;
const API_BASE_URL = 'https://api.the-odds-api.com/v4';

// 📌 File d'attente BullMQ
const fetchQueue = new Queue("fetchQueue", { connection: { url: process.env.REDIS_PUBLIC_URL } });
const telegramQueue = new Queue("TELEGRAM_QUEUE", { connection: { url: process.env.REDIS_PUBLIC_URL } });

// 📌 Configuration Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sendTelegramAlert = async (match, arbitrage) => {
    const TOTAL_AMOUNT = 20;
    let message = `🚀 Opportunité d’arbitrage détectée !\n`;
    message += `📅 Match : ${match.home_team} vs ${match.away_team}\n`;
    message += `🏟️ Compétition : ${match.league || match.sport || "N/A"}\n\n`;
    message += `💰 Profit potentiel : ${arbitrage.percentage}%\n\n`;

    let totalProb = arbitrage.bets.reduce((acc, bet) => acc + (1 / bet.odds), 0);
    message += `📊 Bookmakers et mises optimales (sur ${TOTAL_AMOUNT}€) :\n`;
    arbitrage.bets.forEach(bet => {
        const stake = (TOTAL_AMOUNT * (1 / bet.odds)) / totalProb;
        message += `🏦 ${bet.bookmaker} - ${bet.team} | Cote : ${bet.odds} | Mise : ${stake.toFixed(2)}€\n`;
    });

    const maxRetries = 5; // Nombre de tentatives avant d'abandonner
    const baseDelay = 3000; // 3 secondes entre chaque retry

    // Exécuter l'envoi dans un setTimeout pour éviter de bloquer le traitement des autres opportunités
    setTimeout(async () => {
        for (let retries = 0; retries < maxRetries; retries++) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                });
                console.log(`✅ Notification envoyée à Telegram après ${retries} tentative(s).`);
                return;
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    let waitTime = (error.response.headers["retry-after"] || (baseDelay * (retries + 1))) * 1000;
                    console.warn(`⚠️ Telegram Rate Limit atteint. Réessai dans ${waitTime / 1000} secondes...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime)); // Correcte l'attente
                } else {
                    console.error("🔴 Erreur lors de l'envoi de l'alerte Telegram :", error.message);
                    return;
                }
            }
        }
    }, 0); // Lancer immédiatement en asynchrone
};

const ARBITRAGE_EXPIRATION_TIME = 300000; // Supprime les arbitrages après 5 minutes

function removeObsoleteArbitrages() {
    const now = Date.now();
    latestOdds = latestOdds.filter(arbitrage => now - arbitrage.timestamp < ARBITRAGE_EXPIRATION_TIME);
    io.emit("latest_odds", latestOdds);
    console.log("🗑️ Suppression des arbitrages obsolètes");
}

// 📌 Vérification toutes les 30 secondes
setInterval(removeObsoleteArbitrages, 30000);


// 📌 Fonction principale pour récupérer les cotes et stocker en base
let lastFetchedOdds = {}; // Stocke les dernières cotes connues

async function fetchOdds() {
    try {
        console.log("📢 Vérification des nouvelles cotes...");
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
                try {
                    // 🔥 Vérifier dans Redis avant d'appeler l'API
                    let cachedOdds = await client.get(`odds_${sport}_${market}`);
                    if (cachedOdds) {
                        console.log(`⏳ Cotes récentes trouvées en cache pour ${sport} (${market}), API ignorée.`);
                        continue; // ✅ Continue sans appeler l’API
                    }

                    // 📌 Si aucune cote en cache, on fait l’appel API
                    const response = await axios.get(`${API_BASE_URL}/sports/${sport}/odds`, {
                        params: {
                            apiKey: API_KEY,
                            regions: 'eu',
                            markets: market,
                            oddsFormat: 'decimal',
                            commenceTimeFrom
                        }
                    });

                    const newOdds = response.data;

                    // ✅ Toujours stocker les cotes en cache, même si elles ne changent pas
                    await client.setEx(`odds_${sport}_${market}`, 300, JSON.stringify(newOdds)); // 🔥 Cache 5 minutes (300s)
                    console.log(`✅ Cotes mises en cache pour ${sport} (${market})`);

                    // 📌 Détection des changements de cotes
                    let hasChanges = false;
                    if (!lastFetchedOdds[sport]) lastFetchedOdds[sport] = {};
                    if (!lastFetchedOdds[sport][market]) lastFetchedOdds[sport][market] = {};

                    newOdds.forEach(event => {
                        const eventId = event.id;
                        if (!lastFetchedOdds[sport][market][eventId] || JSON.stringify(lastFetchedOdds[sport][market][eventId]) !== JSON.stringify(event)) {
                            lastFetchedOdds[sport][market][eventId] = event;
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        console.log(`🔄 Cotes mises à jour pour ${sport} (${market})`);
                        // 🚀 Appel de processOdds() pour détecter les arbitrages
                        await processOdds(sport, market, newOdds);
                    } else {
                        console.log(`⏳ Aucune nouvelle cote pour ${sport} (${market})`);
                    }

                } catch (error) {
                    console.error(`❌ Erreur lors de la récupération des cotes pour ${sport} (${market}) :`, error.message);
                }
            }
        }

        // 🔥 Évite d'envoyer trop souvent les mêmes cotes au WebSocket
        latestOdds = Object.values(lastFetchedOdds).flatMap(sportData =>
            Object.values(sportData).flatMap(marketData => Object.values(marketData))
        );

        io.emit("latest_odds", latestOdds); // Toujours envoyer les cotes connues

    } catch (error) {
        console.error("❌ Erreur lors de la récupération des cotes :", error);
    }
}

// 📌 Exécuter toutes les 30 secondes, mais n’appeler l’API que si nécessaire
setInterval(fetchOdds, 30000);


async function processOdds(sport, market, odds) {
    if (!odds || odds.length === 0) {
        console.log(`⚠️ Aucun événement trouvé pour ${sport} (${market})`);
        return;
    }

    console.log(`🔎 Analyse de ${odds.length} événements pour ${sport} (${market})`);

    let arbitrageOpportunities = [];

    for (const event of odds) {
        const eventDate = new Date(event.commence_time);
        const now = new Date();

        const today = now.toISOString().split("T")[0];
        const eventDay = eventDate.toISOString().split("T")[0];

        if (eventDay !== today) {
            console.log("🚫 Événement ignoré (ne commence pas aujourd’hui) :", event.commence_time);
            continue;
        }

        const arbitrage = calculateArbitrage(event);

        if (arbitrage && 
            arbitrage.percentage > 1 && 
            arbitrage.percentage <= 300 &&
            arbitrage.bets.length >= 2 &&
            new Set(arbitrage.bets.map(bet => bet.bookmaker)).size >= 2) { 
            
            console.log(`💰 Opportunité trouvée sur ${sport} (${market}) ! Profit : ${arbitrage.percentage}%`);
			
			const arbitrageKey = `${event.home_team} vs ${event.away_team} - ${arbitrage.bets.map(bet => bet.bookmaker).join(",")}`;
			if (sentArbitrages.has(arbitrageKey)) {
				console.log(`⚠️ Déjà envoyé : ${arbitrageKey}, on ignore.`);
				continue;
			}
			sentArbitrages.add(arbitrageKey);

            const dataToInsert = {
                sport: sport,
                league: event.league || "N/A",
                event: `${event.home_team} vs ${event.away_team}`,
                home_team: event.home_team,
                away_team: event.away_team,
                bookmaker1: arbitrage.bets[0].bookmaker,
                bookmaker2: arbitrage.bets[1]?.bookmaker || "N/A",
                team_to_bet1: arbitrage.bets[0].team,
                team_to_bet2: arbitrage.bets[1]?.team || "N/A",
                best_odds1: arbitrage.bets[0].odds,
                best_odds2: arbitrage.bets[1]?.odds || 0,
                stake1: (18 / arbitrage.bets[0].odds).toFixed(2),
                stake2: arbitrage.bets[1] ? (18 / arbitrage.bets[1].odds).toFixed(2) : "0",
                profit: `${arbitrage.percentage}%`
            };

            console.log("📌 Tentative d'insertion de données MongoDB :", dataToInsert);

            arbitrageOpportunities.push({
                sport, market, event, arbitrage
            });

            io.emit("latest_odds", arbitrageOpportunities);

            try {
                const insertedData = await Odds.create(dataToInsert);
                console.log("✅ Insertion réussie :", insertedData);
            } catch (error) {
                console.error("❌ Erreur lors de l'insertion MongoDB :", error);
            }

            sendTelegramAlert(event, arbitrage).catch(err => 
                console.error("❌ Erreur envoi Telegram :", err)
            );
        }
    }

    latestOdds = arbitrageOpportunities;
    io.emit("latest_odds", latestOdds);
}


function calculateArbitrage(event) {
    if (!event?.bookmakers?.length) return null;
    let bestOdds = {};

	for (const bookmaker of event.bookmakers) {
		for (const market of bookmaker.markets || []) {
			for (const outcome of market.outcomes) {
				if (!bestOdds[outcome.name] || outcome.price > bestOdds[outcome.name].odds) {
					bestOdds[outcome.name] = { 
						team: outcome.name, // Ajout du nom de l'équipe
						odds: outcome.price, 
						bookmaker: bookmaker.title 
					};
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
setInterval(fetchOdds, 30000);

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

server.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur le port ${PORT}`);
});
