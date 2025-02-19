document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");
    const totalArbitrage = document.getElementById("total-arbitrage");
    const bookmakersList = document.getElementById("bookmakers-list");
    
    let allArbitrages = []; // Stocke toutes les opportunités d'arbitrage complètes
    let bookmakersData = {}; // Stocke les stats par bookmaker

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
        console.log("📡 Données reçues depuis WebSocket :", oddsData);
        
        if (!oddsData || oddsData.length === 0) {
            return;
        }

        oddsData.forEach(({ event, arbitrage }) => {
            if (!arbitrage || arbitrage.bets.length < 2) return; // Vérifier qu'on a bien deux mises

            let arbitrageEntry = {
                event: event,
                bets: arbitrage.bets,
                profit: arbitrage.percentage
            };
            
            // Vérifier si l'arbitrage existe déjà pour éviter les doublons
            let exists = allArbitrages.some(a => 
                a.event.home_team === event.home_team && 
                a.event.away_team === event.away_team && 
                JSON.stringify(a.bets) === JSON.stringify(arbitrage.bets)
            );
            
            if (!exists) {
                allArbitrages.push(arbitrageEntry);
                addArbitrageToDisplay(arbitrageEntry);
                
                arbitrage.bets.forEach(bet => {
                    if (!bookmakersData[bet.bookmaker]) {
                        bookmakersData[bet.bookmaker] = { count: 0, totalROI: 0, bets: [] };
                        addBookmakerToDisplay(bet.bookmaker);
                    }
                    bookmakersData[bet.bookmaker].count++;
                    bookmakersData[bet.bookmaker].totalROI += arbitrage.percentage;
                    bookmakersData[bet.bookmaker].bets.push(arbitrageEntry);
                    updateBookmakerStats(bet.bookmaker);
                });
            }
        });
        
        updateTotalArbitrage();
    });

    function addArbitrageToDisplay(arbitrageEntry) {
        let eventCard = document.createElement("div");
        eventCard.classList.add("odds-card");
        eventCard.innerHTML = `
            <h2>${arbitrageEntry.event.home_team} vs ${arbitrageEntry.event.away_team}</h2>
            ${arbitrageEntry.bets.map(bet => `
                <p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>
            `).join("")}
            <p class="profit">💰 Profit potentiel: ${arbitrageEntry.profit}%</p>
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
        totalArbitrage.textContent = allArbitrages.length;
    }

    window.toggleBookmakerBets = function (bookmaker) {
        const betsContainer = document.getElementById(`bookmaker-bets-${bookmaker}`);
        if (betsContainer.style.display === "none") {
            betsContainer.style.display = "block";
            betsContainer.innerHTML = "";

            bookmakersData[bookmaker].bets.forEach(({ event, bets, profit }) => {
                const betItem = document.createElement("li");
                betItem.innerHTML = `
                    <p>${event.home_team} vs ${event.away_team}</p>
                    ${bets.map(bet => `🏦 ${bet.bookmaker} - ${bet.team} @ ${bet.odds}`).join(" | ")}
                    <p>(Profit : ${profit}%)</p>
                `;
                betsContainer.appendChild(betItem);
            });
        } else {
            betsContainer.style.display = "none";
        }
    }
});
