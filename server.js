require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require("socket.io");
const axios = require('axios');
const Odds = require('./models/OddsModel');

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://www.gstatic.com;");
    next();
});


// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connexion MongoDB réussie"))
    .catch(err => console.error("❌ Erreur MongoDB :", err));

const http = require('http');
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://abproject-production.up.railway.app/",
        methods: ["GET", "POST"]
    }
});

let latestOdds = [];
let lastTelegramMessageTime = 0;
const TELEGRAM_THROTTLE_TIME = 3000; // 3 secondes d'attente entre chaque message Telegram

io.on("connection", (socket) => {
    console.log("🟢 Un client est connecté au WebSocket");

    socket.emit("latest_odds", latestOdds);

    socket.on("update_odds", (oddsData) => {
        latestOdds = oddsData;
        io.emit("latest_odds", latestOdds);
    });

    socket.on("disconnect", () => {
        console.log("🔴 Un client s'est déconnecté");
    });
});

// 📌 API pour sauvegarder les arbitrages en MongoDB et envoyer à Telegram
app.post("/save_arbitrage", async (req, res) => {
    try {
        const arbitrageData = req.body;
        const insertedData = await Odds.create(arbitrageData);
        console.log("✅ Arbitrage enregistré :", insertedData);
        
        // Envoi à Telegram avec limitation du nombre d'appels
        const now = Date.now();
        if (now - lastTelegramMessageTime >= TELEGRAM_THROTTLE_TIME) {
            await sendTelegramNotification(arbitrageData);
            lastTelegramMessageTime = now;
        } else {
            console.log("⏳ Message Telegram ignoré pour éviter le dépassement de limite.");
        }

        res.status(200).json({ message: "Arbitrage sauvegardé !" });
    } catch (error) {
        console.error("❌ Erreur lors de l'enregistrement :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// 📌 Fonction pour envoyer une alerte Telegram
async function sendTelegramNotification(arbitrage) {
    try {
        const message = `📢 Nouvelle opportunité d'arbitrage !\n` +
            `Événement : ${arbitrage.event}\n` +
            arbitrage.bets.map(bet => `🏦 ${bet.bookmaker} - ${bet.team} | Cote : ${bet.odds}`).join("\n") +
            `\n💰 Profit potentiel : ${arbitrage.profit}%`;

        const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(telegramUrl, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
        console.log("📩 Message envoyé sur Telegram");
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi Telegram :", error);
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ Serveur WebSocket lancé sur le port ${PORT}`);
});
