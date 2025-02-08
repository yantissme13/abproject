require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const mongoURI = process.env.URL_MONGO || 'mongodb://monorail.proxy.rlwy.net:28614/admin';
const apiKey = process.env.API_KEY;
const baseURL = 'https://api.the-odds-api.com/v4';

// Vérification des variables d'environnement
if (!mongoURI) {
    console.error("❌ ERREUR: La variable d'environnement URL_MONGO est absente ou mal configurée.");
    process.exit(1);
}
if (!apiKey) {
    console.error("❌ ERREUR: La variable d'environnement API_KEY est absente ou mal configurée.");
    process.exit(1);
}

// Connexion à MongoDB sans authentification
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('✅ Connexion à MongoDB réussie SANS authentification'))
  .catch(err => {
      console.error('❌ Erreur de connexion à MongoDB :', err);
      process.exit(1);
  });

// Configuration du serveur
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Vérification du serveur
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lancer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend en écoute sur http://localhost:${PORT}`);
});
