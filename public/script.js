document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
        console.log("📡 Données reçues depuis WebSocket :", oddsData);

        if (!oddsData || oddsData.length === 0) {
            oddsContainer.innerHTML = "<p>Aucune opportunité détectée pour l'instant.</p>";
            return;
        }

        oddsContainer.innerHTML = ""; // Efface les anciennes données

        oddsData.forEach(({ event, arbitrage }) => {
            if (!arbitrage || arbitrage.bets.length === 0) return; // Vérification de sécurité

            const eventCard = document.createElement("div");
            eventCard.classList.add("odds-card");

            eventCard.innerHTML = `
                <h2>${event.home_team} vs ${event.away_team}</h2>
                ${arbitrage.bets.map(bet => `
                    <p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>
                `).join("")}
                <p class="profit">💰 Profit potentiel: ${arbitrage.percentage}%</p>
            `;

            oddsContainer.appendChild(eventCard);
        });

        if (oddsContainer.innerHTML === "") {
            oddsContainer.innerHTML = "<p>Aucune opportunité rentable détectée.</p>";
        }
    });
});
