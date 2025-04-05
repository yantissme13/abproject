document.addEventListener("DOMContentLoaded", () => {
    const socket = io("https://abproject-production.up.railway.app");
    const oddsContainer = document.getElementById("odds-container");
    const totalArbitrage = document.getElementById("total-arbitrage");
    const bookmakersList = document.getElementById("bookmakers-list");
    
    let allArbitrages = []; // Stocke toutes les opportunités d'arbitrage complètes
    let bookmakersData = {}; // Stocke les stats par bookmaker
    let latestOdds = [];
	console.log("🟢 latestOdds initialisé :", latestOdds);

    console.log("🟢 Connecté au WebSocket !");

    socket.on("latest_odds", (oddsData) => {
		console.log("📡 Données reçues depuis WebSocket :", oddsData);

		if (!oddsData || (Array.isArray(oddsData) && oddsData.length === 0)) {
			console.warn("⚠️ Aucune donnée d'arbitrage reçue.");
			return;
		}

		// Vérifier si oddsData est un tableau, sinon le convertir
		if (!Array.isArray(oddsData)) {
			console.warn("⚠️ oddsData n'est pas un tableau, conversion en tableau appliquée.");
			oddsData = Object.values(oddsData);
		}

		const newArbitrages = {}; // Stock temporaire des nouvelles opportunités
		

		oddsData.forEach(({ event, arbitrage }) => {
			if (!arbitrage || !arbitrage.bets || arbitrage.bets.length < 2) return;

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
		
		Object.values(newArbitrages).forEach(arbitrage => {
			arbitrage.bets.forEach(bet => {
				if (!bookmakersData[bet.bookmaker]) {
					bookmakersData[bet.bookmaker] = { count: 0, totalROI: 0, bets: [] };
					addBookmakerToDisplay(bet.bookmaker);
				}
				bookmakersData[bet.bookmaker].count++;
				bookmakersData[bet.bookmaker].totalROI += arbitrage.profit;
				bookmakersData[bet.bookmaker].bets.push(arbitrage);
				updateBookmakerStats(bet.bookmaker);
			});
		});
		
		console.log("📊 Nombre d'opportunités d'arbitrage détectées :", Object.keys(newArbitrages).length);


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
		
		console.log("🔍 allArbitrages après mise à jour :", allArbitrages);
		console.log("🔍 Nombre d'opportunités détectées :", Object.keys(allArbitrages).length);

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
		if (bookmakersList.innerHTML.includes("Aucun bookmaker détecté")) {
			bookmakersList.innerHTML = ""; // Supprime le message "Aucun bookmaker détecté"
		}
		
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
		// Nettoyage des arbitrages expirés
		Object.keys(allArbitrages).forEach(eventKey => {
			if (!latestOdds.some(odd => odd.eventKey === eventKey)) {
				delete allArbitrages[eventKey];
			}
		});


		totalArbitrage.textContent = Object.keys(allArbitrages).length;
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
