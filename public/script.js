document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");
    const totalArbitrage = document.getElementById("total-arbitrage");
    const bookmakersList = document.getElementById("bookmakers-list");
    
    let allOdds = []; // Stocke toutes les opportunités d'arbitrage sans regroupement
    let bookmakersData = {}; // Stocke les stats par bookmaker

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
        console.log("📡 Données reçues depuis WebSocket :", oddsData);
        
        if (!oddsData || oddsData.length === 0) {
            return;
        }

        // Ajouter chaque pari d'arbitrage individuellement sans perturber l'affichage existant
        oddsData.forEach(({ event, arbitrage }) => {
            if (!arbitrage || arbitrage.bets.length === 0) return;

            arbitrage.bets.forEach(bet => {
                let arbitrageEntry = {
                    event: event,
                    bet: bet,
                    arbitrage: arbitrage.percentage
                };
                allOdds.push(arbitrageEntry);
                addArbitrageToDisplay(arbitrageEntry);

                if (!bookmakersData[bet.bookmaker]) {
                    bookmakersData[bet.bookmaker] = { count: 0, totalROI: 0, bets: [] };
                    addBookmakerToDisplay(bet.bookmaker);
                }
                bookmakersData[bet.bookmaker].count++;
                bookmakersData[bet.bookmaker].totalROI += arbitrage.percentage;
                bookmakersData[bet.bookmaker].bets.push(arbitrageEntry);
                updateBookmakerStats(bet.bookmaker);
            });
        });
        
        updateTotalArbitrage();
    });

    function addArbitrageToDisplay(arbitrageEntry) {
        let eventCard = document.createElement("div");
        eventCard.classList.add("odds-card");
        eventCard.innerHTML = `
            <h2>${arbitrageEntry.event.home_team} vs ${arbitrageEntry.event.away_team}</h2>
            <p>🏦 ${arbitrageEntry.bet.bookmaker} - <strong>${arbitrageEntry.bet.team}</strong> | Cote : ${arbitrageEntry.bet.odds}</p>
            <p class="profit">💰 Profit potentiel: ${arbitrageEntry.arbitrage}%</p>
        `;
        oddsContainer.appendChild(eventCard);
    }

    function addBookmakerToDisplay(bookmaker) {
        let listItem = document.createElement("li");
        listItem.id = `bookmaker-${bookmaker}`;
        listItem.innerHTML = `
            <strong>${bookmaker}</strong> 
            (<span class="bet-count">0</span> paris) - 
            ROI Moyen : <span class="roi">0%</span>
            <button onclick="toggleBookmakerBets('${bookmaker}')">Voir les paris</button>
            <ul id="bookmaker-bets-${bookmaker}" class="bookmaker-bets" style="display: none;"></ul>
        `;
        bookmakersList.appendChild(listItem);
    }

    function updateBookmakerStats(bookmaker) {
        let listItem = document.getElementById(`bookmaker-${bookmaker}`);
        listItem.querySelector(".bet-count").textContent = bookmakersData[bookmaker].count;
        listItem.querySelector(".roi").textContent = `${(bookmakersData[bookmaker].totalROI / bookmakersData[bookmaker].count).toFixed(2)}%`;
    }

    function updateTotalArbitrage() {
        totalArbitrage.textContent = allOdds.length;
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
                    ${bet.team} @ ${bet.odds} (Profit : ${arbitrage}%)</p>
                `;
                betsContainer.appendChild(betItem);
            });
        } else {
            betsContainer.style.display = "none";
        }
    }
});
