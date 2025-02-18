document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
        console.log("📡 Données reçues depuis WebSocket :", oddsData);

        if (!oddsData || oddsData.length === 0) {
            if (oddsContainer.children.length === 0) {
                oddsContainer.innerHTML = "<p>Aucune opportunité détectée pour l'instant.</p>";
            }
            return;
        }

        oddsData.forEach(({ event, arbitrage }) => {
            if (!arbitrage || arbitrage.bets.length === 0) return;

            // 🔎 Vérifie si l'événement existe déjà dans la liste (évite les doublons)
            const existingEvent = [...oddsContainer.children].find(card =>
                card.dataset.eventId === `${event.home_team}-${event.away_team}`
            );

            if (!existingEvent) {
                // 🆕 Crée une nouvelle carte pour le pari
                const eventCard = document.createElement("div");
                eventCard.classList.add("odds-card");
                eventCard.dataset.eventId = `${event.home_team}-${event.away_team}`; // Ajoute un identifiant unique

                eventCard.innerHTML = `
                    <h2>${event.home_team} vs ${event.away_team}</h2>
                    ${arbitrage.bets.map(bet => `
                        <p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>
                    `).join("")}
                    <p class="profit">💰 Profit potentiel: ${arbitrage.percentage}%</p>
                `;

                // 🔥 Ajoute la nouvelle carte **en haut**
                oddsContainer.prepend(eventCard);
            }
        });
    });
});
