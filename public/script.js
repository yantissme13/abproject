document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");
    const totalArbitrage = document.getElementById("total-arbitrage");
    const bookmakersList = document.getElementById("bookmakers-list");
    
    let allOdds = []; // Stocke toutes les opportunités d'arbitrage
    let bookmakersData = {}; // Stocke les stats par bookmaker
    const MAX_DISPLAY = 20000; // Nombre max d'opportunités affichées

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
        console.log("📡 Données reçues depuis WebSocket :", oddsData);
        
        if (!oddsData || oddsData.length === 0) {
            oddsContainer.innerHTML = "<p>Aucune opportunité détectée pour l'instant.</p>";
            return;
        }

        // Vider les anciennes données
        allOdds = [];
        bookmakersData = {};

        // Stocker toutes les opportunités
        oddsData.forEach(({ event, arbitrage }) => {
            if (!arbitrage || arbitrage.bets.length === 0) return;

            const eventId = `${event.home_team}-${event.away_team}`;
            let existingEvent = allOdds.find(odds => odds.eventId === eventId);
            
            if (existingEvent) {
                existingEvent.arbitrages.push(arbitrage);
            } else {
                allOdds.push({ eventId, event, arbitrages: [arbitrage] });
            }

            arbitrage.bets.forEach(bet => {
                if (!bookmakersData[bet.bookmaker]) {
                    bookmakersData[bet.bookmaker] = { count: 0, totalROI: 0, bets: [] };
                }
                bookmakersData[bet.bookmaker].count++;
                bookmakersData[bet.bookmaker].totalROI += arbitrage.percentage;
                bookmakersData[bet.bookmaker].bets.push({ event, bet, arbitrage });
            });
        });

        // Limiter l'affichage aux MAX_DISPLAY derniers paris
        if (allOdds.length > MAX_DISPLAY) {
            allOdds = allOdds.slice(-MAX_DISPLAY);
        }
        
        updateBookmakersList();
        updateTotalArbitrage();
        updateOddsList();
    });

    function updateBookmakersList() {
        bookmakersList.innerHTML = "";
        Object.entries(bookmakersData).forEach(([bookmaker, data]) => {
            let listItem = document.createElement("li");
            listItem.innerHTML = `
                <strong>${bookmaker}</strong> 
                (<span class="bet-count">${data.count}</span> paris) - 
                ROI Moyen : <span class="roi">${(data.totalROI / data.count).toFixed(2)}%</span>
                <button onclick="toggleBookmakerBets('${bookmaker}')">Voir les paris</button>
                <ul id="bookmaker-bets-${bookmaker}" class="bookmaker-bets" style="display: none;"></ul>
            `;
            bookmakersList.appendChild(listItem);
        });
    }

    function updateTotalArbitrage() {
        totalArbitrage.textContent = allOdds.length;
    }

    function updateOddsList() {
        oddsContainer.innerHTML = "";
        let fragment = document.createDocumentFragment();
        
        allOdds.forEach(({ event, arbitrages }) => {
            let eventCard = document.createElement("div");
            eventCard.classList.add("odds-card");
            eventCard.innerHTML = `
                <h2>${event.home_team} vs ${event.away_team}</h2>
                ${arbitrages.map(arbitrage => `
                    ${arbitrage.bets.map(bet => `
                        <p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>
                    `).join("")}
                    <p class="profit">💰 Profit potentiel: ${arbitrage.percentage}%</p>
                `).join("")}
            `;
            fragment.appendChild(eventCard);
        });
        oddsContainer.appendChild(fragment);
    }

    window.toggleBookmakerBets = function (bookmaker) {
        const betsContainer = document.getElementById(`bookmaker-bets-${bookmaker}`);
        if (betsContainer.style.display === "none") {
            betsContainer.style.display = "block";
            betsContainer.innerHTML = "";

            bookmakersData[bookmaker].bets.forEach(({ event, bet, arbitrage }) => {
                const betItem = document.createElement("li");
                betItem.innerHTML = `
                    <p>${event.home_team} vs ${event.away_team} - 
                    ${bet.team} @ ${bet.odds} (Profit : ${arbitrage.percentage}%)</p>
                `;
                betsContainer.appendChild(betItem);
            });
        } else {
            betsContainer.style.display = "none";
        }
    }
});
