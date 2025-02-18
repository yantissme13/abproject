document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");
    const totalArbitrage = document.getElementById("total-arbitrage");
    const bookmakersList = document.getElementById("bookmakers-list");
    const selectedBookmaker = document.getElementById("selected-bookmaker");
    const bookmakerOdds = document.getElementById("bookmaker-odds");

    let allOdds = []; // Stocke tous les paris en cours
    let bookmakersData = {}; // Stocke les statistiques par bookmaker

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

            const eventId = `${event.home_team}-${event.away_team}`;
            if (!allOdds.some(odds => odds.eventId === eventId)) {
                allOdds.push({ eventId, event, arbitrage });

                arbitrage.bets.forEach(bet => {
                    if (!bookmakersData[bet.bookmaker]) {
                        bookmakersData[bet.bookmaker] = { count: 0, totalROI: 0, bets: [] };
                    }
                    bookmakersData[bet.bookmaker].count++;
                    bookmakersData[bet.bookmaker].totalROI += arbitrage.percentage;
                    bookmakersData[bet.bookmaker].bets.push({ event, bet, arbitrage });
                });
            }
        });
        updateBookmakersList();
        updateTotalArbitrage();
        updateOddsList();
    });

    function updateBookmakersList() {
        Object.entries(bookmakersData).forEach(([bookmaker, data]) => {
            let listItem = document.getElementById(`bookmaker-${bookmaker}`);
            if (!listItem) {
                listItem = document.createElement("li");
                listItem.id = `bookmaker-${bookmaker}`;
                listItem.innerHTML = `
                    <strong>${bookmaker}</strong> 
                    (<span class="bet-count">${data.count}</span> paris) - 
                    ROI Moyen : <span class="roi">${(data.totalROI / data.count).toFixed(2)}%</span>
                    <button onclick="toggleBookmakerBets('${bookmaker}')">Voir les paris</button>
                    <ul id="bookmaker-bets-${bookmaker}" class="bookmaker-bets" style="display: none;"></ul>
                `;
                bookmakersList.appendChild(listItem);
            } else {
                listItem.querySelector(".bet-count").textContent = data.count;
                listItem.querySelector(".roi").textContent = `${(data.totalROI / data.count).toFixed(2)}%`;
            }
        });
    }

    function updateTotalArbitrage() {
        totalArbitrage.textContent = allOdds.length;
    }

    function updateOddsList() {
        allOdds.forEach(({ event, arbitrage }) => {
            let eventCard = document.getElementById(`event-${event.home_team}-${event.away_team}`);
            if (!eventCard) {
                eventCard = document.createElement("div");
                eventCard.classList.add("odds-card");
                eventCard.id = `event-${event.home_team}-${event.away_team}`;
                eventCard.innerHTML = `
                    <h2>${event.home_team} vs ${event.away_team}</h2>
                    ${arbitrage.bets.map(bet => `
                        <p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>
                    `).join("")}
                    <p class="profit">💰 Profit potentiel: ${arbitrage.percentage}%</p>
                `;
                oddsContainer.appendChild(eventCard);
            }
        });
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
