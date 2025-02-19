document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");
    const totalArbitrage = document.getElementById("total-arbitrage");

    let allOddsCache = {}; // Stocke toutes les cotes en temps réel
    let allArbitrages = []; // Stocke les opportunités d’arbitrage détectées

    console.log("🟢 Connecté au WebSocket !");

    // 📌 WebSocket : mise à jour des cotes en temps réel
    socket.on("latest_odds", (oddsData) => {
        if (!oddsData || oddsData.length === 0) return;

        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        oddsData.forEach(({ event, arbitrage }) => {
            const eventTime = new Date(event.commence_time);
            if (eventTime > todayMidnight) return; // Ignorer les événements après minuit

            arbitrage.bets.forEach(bet => {
                if (!allOddsCache[event.id]) {
                    allOddsCache[event.id] = {};
                }
                allOddsCache[event.id][bet.bookmaker] = {
                    team: bet.team,
                    odds: bet.odds,
                    timestamp: Date.now()
                };
            });
        });

        console.log("📌 Cotes mises à jour :", allOddsCache);
    });

    // 📌 Recalculer les arbitrages toutes les 0.1 secondes
    setInterval(() => {
        console.log("🔄 Recalcul des arbitrages...");
        recalculateArbitrage();
    }, 100);

    function recalculateArbitrage() {
        const newArbitrages = [];

        Object.keys(allOddsCache).forEach(eventId => {
            const eventOdds = allOddsCache[eventId];
            const bookmakers = Object.keys(eventOdds);
            if (bookmakers.length < 2) return;

            let bestOdds = {};
            bookmakers.forEach(bookmaker => {
                const bet = eventOdds[bookmaker];
                if (!bestOdds[bet.team] || bet.odds > bestOdds[bet.team].odds) {
                    bestOdds[bet.team] = { ...bet, bookmaker };
                }
            });

            const teams = Object.keys(bestOdds);
            if (teams.length < 2) return; // Besoin d'au moins 2 équipes différentes

            let sum = teams.reduce((acc, team) => acc + (1 / bestOdds[team].odds), 0);
            if (sum < 1) {
                const percentage = parseFloat(((1 - sum) * 100).toFixed(2));
                newArbitrages.push({
                    event: eventId,
                    bets: Object.values(bestOdds),
                    profit: percentage
                });
            }
        });

        console.log("✅ Arbitrages mis à jour :", newArbitrages);
        updateArbitrageDisplay(newArbitrages);
    }

    function updateArbitrageDisplay(arbitrages) {
        oddsContainer.innerHTML = "";
        arbitrages.forEach(({ event, bets, profit }) => {
            let eventCard = document.createElement("div");
            eventCard.classList.add("odds-card");
            eventCard.innerHTML = `
                <h2>${event}</h2>
                ${bets.map(bet => `<p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>`).join("")}
                <p class="profit">💰 Profit potentiel: ${profit}%</p>
            `;
            oddsContainer.appendChild(eventCard);
        });
    }
});
