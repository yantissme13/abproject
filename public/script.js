document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");

    if (!oddsContainer) {
        console.error("❌ Erreur : Impossible de trouver #odds-container !");
        return;
    }

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
        console.log("📡 Données reçues depuis WebSocket :", oddsData);

        if (!oddsData || oddsData.length === 0) {
            if (oddsContainer.children.length === 0) {
                oddsContainer.innerHTML = "<p>Aucune opportunité détectée pour l'instant.</p>";
            }
            return;
        }

        // Vérifie si l'utilisateur est déjà en bas
        let isAtBottom = oddsContainer.scrollTop + oddsContainer.clientHeight >= oddsContainer.scrollHeight - 50;

        oddsData.forEach(({ event, arbitrage }) => {
            if (!arbitrage || arbitrage.bets.length === 0) return;

            // Vérifie si l'événement existe déjà
            const existingEvent = [...oddsContainer.children].find(card =>
                card.dataset.eventId === `${event.home_team}-${event.away_team}`
            );

            if (!existingEvent) {
                // Création d'une carte pour l'événement
                const eventCard = document.createElement("div");
                eventCard.classList.add("odds-card");
                eventCard.dataset.eventId = `${event.home_team}-${event.away_team}`;

                eventCard.innerHTML = `
                    <h2>${event.home_team} vs ${event.away_team}</h2>
                    ${arbitrage.bets.map(bet => `
                        <p>🏦 ${bet.bookmaker || "Inconnu"} - <strong>${bet.team}</strong> | Cote : ${bet.odds || "N/A"}</p>
                    `).join("")}
                    <p class="profit">💰 Profit potentiel: ${arbitrage.percentage}%</p>
                `;

                // Ajoute l'événement **en bas**
                oddsContainer.appendChild(eventCard);
            }
        });

        // 📌 Ajuste la hauteur du conteneur pour permettre le scroll dynamique
        oddsContainer.style.height = "auto";

        // Auto-scroll en bas seulement si l'utilisateur était déjà en bas avant l'ajout
        if (isAtBottom) {
            oddsContainer.scrollTop = oddsContainer.scrollHeight;
        }
    });
});
