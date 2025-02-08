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

app.use(cors());
app.use(express.json());

// ✅ Servir le dossier "public" correctement
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Vérification des fichiers statiques
app.get('/styles.css', (req, res) => {
    console.log('🔍 Requête reçue pour styles.css');
    res.type('text/css');
    res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

// ✅ Vérification de la route racine
app.get('/', (req, res) => {
    console.log('🔍 Requête reçue pour index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint pour récupérer les cotes historiques
app.get('/historical-odds', async (req, res) => {
    try {
        const odds = await Odds.find().sort({ timestamp: -1 }).limit(100);
        res.json(odds);
    } catch (error) {
        console.error('❌ Erreur récupération cotes historiques :', error.message);
        res.status(500).json({ message: 'Erreur récupération cotes historiques' });
    }
});

// Lancer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend en écoute sur le port ${PORT}`);
});
