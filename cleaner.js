require('dotenv').config();
const mongoose = require('mongoose');
const Odds = require('./models/OddsModel');
const mongoURI = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;

mongoose.connect(mongoURI, { dbName: dbName })
    .then(() => console.log('✅ Nettoyage : Connexion MongoDB réussie'))
    .catch(err => console.error('❌ Erreur connexion MongoDB :', err));

async function cleanOldData() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    try {
        // Suppression des cotes trop anciennes
        const oldDelete = await Odds.deleteMany({ timestamp: { $lt: oneDayAgo } });
        console.log(`🗑️ Suppression des cotes anciennes : ${oldDelete.deletedCount} supprimées.`);

        // Suppression des doublons (événement + bookmakers identiques)
        const duplicates = await Odds.aggregate([
            {
                $group: {
                    _id: { event: "$event", bookmaker1: "$bookmaker1", bookmaker2: "$bookmaker2" },
                    oldest: { $min: "$_id" },
                    count: { $sum: 1 }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ]);

        const duplicateIds = duplicates.map(d => d.oldest);
        const duplicateDelete = await Odds.deleteMany({ _id: { $in: duplicateIds } });

        console.log(`🗑️ Suppression des doublons : ${duplicateDelete.deletedCount} supprimées.`);
    } catch (error) {
        console.error("❌ Erreur lors du nettoyage des données :", error.message);
    } finally {
        mongoose.connection.close();
    }
}

cleanOldData();
