require('dotenv').config();
const mongoose = require('mongoose');

const mongoURI = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;

async function connectDB() {
    try {
        await mongoose.connect(mongoURI, {
            dbName: dbName,
        });
        console.log('✅ Connexion à MongoDB réussie');
    } catch (error) {
        console.error('❌ Erreur de connexion à MongoDB :', error);
        process.exit(1);
    }
}

module.exports = connectDB;

