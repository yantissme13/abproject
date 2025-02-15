const mongoose = require('mongoose');

const OddsSchema = new mongoose.Schema({
    sport: String,
    league: String,
    event: String,
    home_team: String,
    away_team: String,
    bookmaker1: String,
    bookmaker2: String,
    team_to_bet1: String,
    team_to_bet2: String,
    best_odds1: Number,
    best_odds2: Number,
    stake1: String,
    stake2: String,
    profit: String,
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const Odds = mongoose.model('Odds', OddsSchema, process.env.MONGO_COLLECTION_NAME || 'arbitrageData');

module.exports = Odds; // ✅ Assurez-vous que c'est bien exporté
