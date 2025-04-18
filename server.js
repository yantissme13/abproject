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

const sendTelegramAlert = async (match, arbitrage, eventDateFormatted) => {
    const TOTAL_AMOUNT = 20;
    let message = `🚀 *Opportunité d’Arbitrage Détectée !*\n\n`;
    
    // 📌 Match en gras
    message += `📅 *Match :* ${match.home_team} vs ${match.away_team}\n`;
	message += `📆 *Date :* ${eventDateFormatted || "Non spécifiée"}\n`;
	
    
    // 📌 Profit potentiel en gras et avec icône
    message += `💰 *Profit Potentiel :* *${arbitrage.percentage}%*\n\n`;

    let totalProb = arbitrage.bets.reduce((acc, bet) => acc + (1 / bet.odds), 0);

    // 📌 Affichage des bookmakers et mises optimales
    message += `📊 *Bookmakers et mises optimales* (sur *${TOTAL_AMOUNT}€*) :\n`;
    arbitrage.bets.forEach(bet => {
        const stake = (TOTAL_AMOUNT * (1 / bet.odds)) / totalProb;
        message += `🏦 *${bet.bookmaker}* - *${bet.team}* | Cote : *${bet.odds}* | Mise : *${stake.toFixed(2)}€*\n`;
    });

    // 🔹 Paramètres de tentatives et délai entre les retries
    const maxRetries = 5; // Nombre de tentatives avant d'abandonner
    const baseDelay = 3000; // 3 secondes entre chaque retry

    setTimeout(async () => {
        for (let retries = 0; retries < maxRetries; retries++) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: "Markdown" // Utilisation de Markdown pour le texte en gras
                });
                console.log(`✅ Notification envoyée à Telegram après ${retries} tentative(s).`);
                return;
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    let waitTime = (error.response.headers["retry-after"] || (baseDelay * (retries + 1))) * 1000;
                    console.warn(`⚠️ Telegram Rate Limit atteint. Réessai dans ${waitTime / 1000} secondes...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    console.error("🔴 Erreur lors de l'envoi de l'alerte Telegram :", error.message);
                    return;
                }
            }
        }
    }, 0);
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


async function isBetAlreadyRecorded(eventName, bookmakers) {
    if (bookmakers.length === 0) return false; // 🔥 Évite une requête inutile

    try {
        const query = { event: eventName };

        // Si plusieurs bookmakers, utiliser $or pour chercher dans les deux champs
        if (bookmakers.length > 1) {
            query.$or = [{ bookmaker1: { $in: bookmakers } }, { bookmaker2: { $in: bookmakers } }];
        } else {
            // Si un seul bookmaker, chercher uniquement dans bookmaker1 (plus rapide)
            query.bookmaker1 = bookmakers[0];
        }

        // ⚡ Ne récupérer que l'ID, pas tout le document (optimisation)
        const existingBet = await Odds.findOne(query, { _id: 1 });

        return !!existingBet; // Retourne true si un pari existe déjà, sinon false
    } catch (error) {
        console.error("❌ Erreur lors de la vérification en base :", error);
        return false;
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
        const eventDate = new Date(event.commence_time);
		const now = new Date();

		// 📌 Calcul des dates acceptées
		const today = now.toISOString().split("T")[0];
		const OneDaysLater = new Date();
		OneDaysLater.setDate(now.getDate() + 1);
		const twoDaysLater = new Date();
		twoDaysLater.setDate(now.getDate() + 2);
		const threeDaysLater = new Date();
		threeDaysLater.setDate(now.getDate() + 3);
		const fourDaysLater = new Date();
		fourDaysLater.setDate(now.getDate() + 4);
		const fiveDaysLater = new Date();
		fiveDaysLater.setDate(now.getDate() + 5);
		const sixDaysLater = new Date();
		sixDaysLater.setDate(now.getDate() + 6);
		const sevenDaysLater = new Date();
		sevenDaysLater.setDate(now.getDate() + 7);
		const eightDaysLater = new Date();
		eightDaysLater.setDate(now.getDate() + 8);
		const nineDaysLater = new Date();
		nineDaysLater.setDate(now.getDate() + 9);
		const tenDaysLater = new Date();
		tenDaysLater.setDate(now.getDate() + 10);
		const elevenDaysLater = new Date();
		elevenDaysLater.setDate(now.getDate() + 11);
		const twelveDaysLater = new Date();
		twelveDaysLater.setDate(now.getDate() + 12);
		const thirteenDaysLater = new Date();
		thirteenDaysLater.setDate(now.getDate() + 13);
		const fourteenDaysLater = new Date();
		fourteenDaysLater.setDate(now.getDate() + 14);

		// 📌 Convertir les dates en format AAAA-MM-JJ
		const eventDay = eventDate.toISOString().split("T")[0];
		const acceptedDays = [
			today,
			OneDaysLater.toISOString().split("T")[0],
			twoDaysLater.toISOString().split("T")[0],
			threeDaysLater.toISOString().split("T")[0],
			fourDaysLater.toISOString().split("T")[0],
			fiveDaysLater.toISOString().split("T")[0],
			sixDaysLater.toISOString().split("T")[0],
			sevenDaysLater.toISOString().split("T")[0],
			eightDaysLater.toISOString().split("T")[0],
			nineDaysLater.toISOString().split("T")[0],
			tenDaysLater.toISOString().split("T")[0],
			elevenDaysLater.toISOString().split("T")[0],
			twelveDaysLater.toISOString().split("T")[0],
			thirteenDaysLater.toISOString().split("T")[0],
			fourteenDaysLater.toISOString().split("T")[0]
		];

		// 📌 Vérification
		if (!acceptedDays.includes(eventDay)) {
			console.log("🚫 Événement ignoré (hors de la plage des 14 jours) :", event.commence_time);
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

			const eventName = `${event.home_team} vs ${event.away_team}`;
			const bookmakersList = arbitrage.bets.map(bet => bet.bookmaker);

			// 🔥 Vérification rapide avant insertion
			const alreadyRecorded = await isBetAlreadyRecorded(eventName, bookmakersList);
            if (alreadyRecorded) {
                console.log(`⚠️ Arbitrage ignoré : un pari avec un même bookmaker a déjà été enregistré pour ${eventName}.`);
                continue;
            }

			// Ajout dans la mémoire locale après validation
			sentArbitrages.add(arbitrageKey);

			const eventDate = new Date(event.commence_time);
			const eventDateFormatted = eventDate.toLocaleString("fr-FR", {
				weekday: "long", 
				year: "numeric", 
				month: "long", 
				day: "numeric", 
				hour: "2-digit", 
				minute: "2-digit"
			});	
			
			
            const dataToInsert = {
                sport: sport,
				league: event.league || "N/A",
				event: `${event.home_team} vs ${event.away_team}`,
				event_date: event.commence_time,  // ✅ Ajout de la date de l'événement
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
				profit: `${arbitrage.percentage}%`,
				timestamp: new Date().toISOString(),

				// ✅ Ajouter un tableau des Over/Under pour récupérer toutes les options possibles
				over_under_details: arbitrage.bets
				.filter(bet => bet.market === "totals")  // ✅ Filtrer uniquement les Over/Under
				.map(bet => {
					console.log(`📌 Over/Under détecté : ${bet.bookmaker} | ${bet.team} ${bet.point} | Cote: ${bet.odds}`);
					return {
						bookmaker: bet.bookmaker,
						type: bet.team,  // "Over" ou "Under"
						point: bet.point,  // Le seuil (ex: 2.5 buts, 3.5 sets)
						odds: bet.odds  // La cote associée
					};
				}),


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

            sendTelegramAlert(event, arbitrage, eventDateFormatted).catch(err => 
				console.error("❌ Erreur envoi Telegram :", err)
			);

        }
    }

    latestOdds = arbitrageOpportunities;
    io.emit("latest_odds", latestOdds);
}


function calculateArbitrage(event) {
	console.log(`📥 Calcul arbitrage pour ${event.home_team} vs ${event.away_team}`);
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
	const bets = Object.values(bestOdds);
	// ✅ ⛔️ Filtrer : autoriser uniquement les marchés à 2 issues (exactement 2 cotes)
	if (bets.length !== 2) {
		console.log(`🚫 Ignoré : marché à ${bets.length} issues`);
		return null;
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

async function adaptiveFetchOdds() {
    await fetchOdds(); // Exécuter immédiatement

    // 🔥 Ajuster la fréquence des appels API selon la quantité de cotes mises à jour
    let fetchInterval = latestOdds.length > 20 ? 30000 : 120000; // 30s si beaucoup de cotes changent, sinon 2 minutes
    console.log(`⏳ Prochain fetch dans ${fetchInterval / 1000} secondes...`);

    setTimeout(adaptiveFetchOdds, fetchInterval);
}

// Démarrer l'exécution adaptative
adaptiveFetchOdds();


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
