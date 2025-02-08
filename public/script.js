// Fonction pour afficher un onglet spécifique
function showTab(tabName) {
  const liveTab = document.getElementById('live-tab');
  const historicalTab = document.getElementById('historical-tab');
  const liveOddsContent = document.getElementById('live-odds');
  const historicalOddsContent = document.getElementById('historical-odds');

  if (tabName === 'live') {
    liveTab.classList.add('active');
    historicalTab.classList.remove('active');
    liveOddsContent.style.display = 'block';
    historicalOddsContent.style.display = 'none';
  } else {
    liveTab.classList.remove('active');
    historicalTab.classList.add('active');
    liveOddsContent.style.display = 'none';
    historicalOddsContent.style.display = 'block';
  }
}

// Fonction pour récupérer et afficher les cotes live
async function fetchLiveOdds() {
  try {
    const response = await fetch('/live-odds');
    if (!response.ok) throw new Error('Erreur lors de la récupération des cotes live.');
    const data = await response.json();

    const table = document.querySelector('#live-odds tbody');
    table.innerHTML = ''; // Réinitialiser le contenu du tableau

    if (data.length === 0) {
      table.innerHTML = '<tr><td colspan="4">Aucune cote live disponible.</td></tr>';
      return;
    }

    data.forEach(odds => {
      const row = `
        <tr>
          <td>${odds.sport}</td>
          <td>${odds.event}</td>
          <td>${odds.bookmakers.map(bm => `${bm.title} (${bm.odds})`).join('<br>')}</td>
          <td>${odds.gain || 'N/A'}</td>
        </tr>
      `;
      table.innerHTML += row;
    });
  } catch (error) {
    console.error(error);
    document.querySelector('#live-odds tbody').innerHTML =
      '<tr><td colspan="4">Erreur lors du chargement des cotes live.</td></tr>';
  }
}

// Fonction pour récupérer et afficher les cotes historiques
async function fetchHistoricalOdds() {
  try {
    const response = await fetch('/historical-odds');
    if (!response.ok) throw new Error('Erreur lors de la récupération des cotes historiques.');
    const data = await response.json();

    const table = document.querySelector('#historical-odds tbody');
    table.innerHTML = ''; // Réinitialiser le contenu du tableau

    if (data.length === 0) {
      table.innerHTML = '<tr><td colspan="4">Aucune donnée historique disponible.</td></tr>';
      return;
    }

    data.forEach(odds => {
      const row = `
        <tr>
          <td>${odds.sport}</td>
          <td>${odds.event}</td>
          <td>${odds.bookmaker}</td>
          <td>${JSON.stringify(odds.odds)}</td>
          <td>${new Date(odds.timestamp).toLocaleString()}</td>
        </tr>
      `;
      table.innerHTML += row;
    });
  } catch (error) {
    console.error(error);
    document.querySelector('#historical-odds tbody').innerHTML =
      '<tr><td colspan="4">Erreur lors du chargement des données historiques.</td></tr>';
  }
}

// Charger les données au démarrage de la page
document.addEventListener('DOMContentLoaded', () => {
  // Initialiser les onglets
  showTab('live');

  // Charger les données
  fetchLiveOdds();
  fetchHistoricalOdds();
});
