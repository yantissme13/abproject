// Fonction pour afficher un onglet spécifique
function showTab(tabName) {
  document.getElementById('live-odds').style.display = (tabName === 'live') ? 'block' : 'none';
  document.getElementById('historical-odds').style.display = (tabName === 'historical') ? 'block' : 'none';
}

// Fonction pour récupérer les cotes live
async function fetchLiveOdds() {
  try {
    const response = await fetch('/live-odds'); // ✅ Correction
    if (!response.ok) throw new Error('Erreur récupération des cotes live.');
    const data = await response.json();

    const table = document.querySelector('#live-odds tbody');
    table.innerHTML = ''; 

    if (data.length === 0) {
      table.innerHTML = '<tr><td colspan="4">Aucune cote live disponible.</td></tr>';
      return;
    }

    data.forEach(odds => {
      table.innerHTML += `
        <tr>
          <td>${odds.sport}</td>
          <td>${odds.event}</td>
          <td>${odds.bookmakers.map(bm => `${bm.title} (${bm.odds})`).join('<br>')}</td>
          <td>${odds.gain || 'N/A'}</td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

// Fonction pour récupérer les cotes historiques
async function fetchHistoricalOdds() {
  try {
    const response = await fetch('/historical-odds'); // ✅ Correction
    if (!response.ok) throw new Error('Erreur récupération des cotes historiques.');
    const data = await response.json();

    const table = document.querySelector('#historical-odds tbody');
    table.innerHTML = '';

    if (data.length === 0) {
      table.innerHTML = '<tr><td colspan="5">Aucune donnée historique disponible.</td></tr>';
      return;
    }

    data.forEach(odds => {
      table.innerHTML += `
        <tr>
          <td>${odds.sport}</td>
          <td>${odds.event}</td>
          <td>${odds.bookmaker}</td>
          <td>${JSON.stringify(odds.odds)}</td>
          <td>${new Date(odds.timestamp).toLocaleString()}</td>
        </tr>
      `;
    });
  } catch (error) {
    console.error(error);
  }
}

// Charger les données au démarrage
document.addEventListener('DOMContentLoaded', () => {
  showTab('live');
  fetchLiveOdds();
  fetchHistoricalOdds();
});
