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

		const newArbitrages = {}; // Stock temporaire des nouvelles opportunités

		oddsData.forEach(({ event, arbitrage }) => {
			if (!arbitrage || arbitrage.bets.length < 2) return;

			const eventKey = `${event.home_team} vs ${event.away_team}`;

			// Vérifie si l'arbitrage a changé avant de le mettre à jour
			if (!allArbitrages[eventKey] || JSON.stringify(allArbitrages[eventKey].bets) !== JSON.stringify(arbitrage.bets)) {
				newArbitrages[eventKey] = {
					event: event,
					bets: arbitrage.bets,
					profit: arbitrage.percentage
				};
			}
		});

		// Supprimer les arbitrages obsolètes qui ne sont plus dans la nouvelle liste
				Object.keys(allArbitrages).forEach(eventKey => {
			if (!newArbitrages[eventKey] && latestOdds.some(odd => odd.eventKey === eventKey)) {
				removeArbitrageFromDisplay(eventKey);
				delete allArbitrages[eventKey];
			}
		});



		// Mettre à jour les arbitrages affichés
		Object.keys(newArbitrages).forEach(eventKey => {
			allArbitrages[eventKey] = newArbitrages[eventKey];
			addOrUpdateArbitrageToDisplay(eventKey, newArbitrages[eventKey]);
		});

		updateTotalArbitrage();
	});


    function addOrUpdateArbitrageToDisplay(eventKey, arbitrageEntry) {
		let eventCard = document.getElementById(`arbitrage-${eventKey}`);

		if (eventCard) {
			// 📌 Mise à jour des informations existantes
			eventCard.innerHTML = `
				<h2>${arbitrageEntry.event.home_team} vs ${arbitrageEntry.event.away_team}</h2>
				${arbitrageEntry.bets.map(bet => `
					<p>🏦 ${bet.bookmaker} - <strong>${bet.team}</strong> | Cote : ${bet.odds}</p>
				`).join("")}
				<p class="profit">💰 Profit potentiel: ${arbitrageEntry.profit}%</p>
			`;
		} else {
			// 📌 Ajout d'un nouveau bloc
			eventCard = document.createElement("div");
			eventCard.id = `arbitrage-${eventKey}`;
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
	}
	
	function removeArbitrageFromDisplay(eventKey) {
		let eventCard = document.getElementById(`arbitrage-${eventKey}`);
		if (eventCard) {
			eventCard.remove();
		}
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
