// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => {
            console.log('SW registered:', reg.scope);

            // Listen for messages from the service worker
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'SW_UPDATE_AVAILABLE') {
                    // Notify user that an update is available
                    if (confirm('A new version of the app is available. Would you like to reload now?')) {
                        window.location.reload();
                    }
                }

                // Handle other message types if needed
                if (event.data && event.data.type === 'SW_UPDATE_CHECKED_ONLINE') {
                    console.log('Service worker update check completed');
                }
            });
        })
        .catch(err => console.warn('SW registration failed:', err));
}

// Send a message to the active SW using a MessageChannel for a reply
function sendSwMessage(msg) {
    return new Promise((resolve, reject) => {
        if (!navigator.serviceWorker.controller) {
            reject('No active service worker');
            return;
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = e => resolve(e.data);
        navigator.serviceWorker.controller.postMessage(msg, [channel.port2]);
    });
}

// Cache controls
const cacheStatus = document.getElementById('cacheStatus');

document.getElementById('recacheBtn').addEventListener('click', async () => {
    cacheStatus.style.color = '#ff9729';
    cacheStatus.textContent = 'Caching...';
    try {
        const result = await sendSwMessage('RECACHE');
        cacheStatus.style.color = '#0f0';
        cacheStatus.textContent = '✓ Page cached!';
    } catch (e) {
        // Fallback if SW not yet controlling the page
        try {
            const cache = await caches.open('tubelive-v4');
            await cache.add('/nearby');
            await cache.add('/css/nearby.css');
            await cache.add('/js/nearby.js');
            await cache.add('/js/index.js');
            await cache.add('/css/index.css');
            await cache.add('/manifest.json?name=Nearby+Tubes&short_name=Nearby&start_url=/nearby.html');
            await cache.add('/images/192-192.png');
            await cache.add('/images/512-512.png');
            cacheStatus.style.color = '#0f0';
            cacheStatus.textContent = '✓ Page cached!';
            window.location.reload();
        } catch (err) {
            alert(err);
            cacheStatus.style.color = 'red';
            cacheStatus.textContent = '✗ Reload page first';
        }
    }
});

document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    cacheStatus.style.color = '#ff9729';
    cacheStatus.textContent = 'Clearing...';
    try {
        const result = await sendSwMessage('CLEAR_CACHE');
        cacheStatus.style.color = '#0f0';
        cacheStatus.textContent = '✓ Cache cleared!';
    } catch (e) {
        try {
            await caches.delete('tubelive-v1');
            cacheStatus.style.color = '#0f0';
            cacheStatus.textContent = '✓ Cache cleared!';
        } catch (err) {
            cacheStatus.style.color = 'red';
            cacheStatus.textContent = '✗ Failed';
        }
    }
});

// --- Cookie Functions ---
function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + "=" + value + ";expires=" + d.toUTCString() + ";path=/";
}

function getCookie(name) {
    const cname = name + "=";
    const ca = decodeURIComponent(document.cookie).split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(cname) === 0) return c.substring(cname.length);
    }
    return "";
}

// --- Adjustable Variables with Cookie Support ---
const onlineTimeoutInput = document.getElementById("onlineTimeout");
const geoTimeoutInput = document.getElementById("geoTimeout");
const locationIntervalInput = document.getElementById("locationInterval");
const fetchIntervalInput = document.getElementById("fetchInterval");
const radiusInput = document.getElementById("radius");
const fontSlider = document.getElementById("fontSlider");
const sliderContainer = document.getElementById("sliderContainer");
const cogBtn = document.getElementById("cogBtn");
const container = document.getElementById("arrivals");
const status = document.getElementById("status");

// Set up event listeners for all inputs
function setupInput(input, cookieName, defaultValue, applyFunction) {
    input.addEventListener("change", (e) => {
        const value = e.target.value;
        applyFunction(value);
        setCookie(cookieName, value, 30);
    });
}

// Apply functions for each setting
function applyFontSize(value) {
    document.body.style.fontSize = value + "em";
}

function applyOnlineTimeout(value) {
    // This will be used in the handleShow call
    window.onlineTimeoutValue = parseInt(value) * 1000; // Convert to milliseconds
}

function applyGeoTimeout(value) {
    // This will be used in the geolocation calls
    window.geoTimeoutValue = parseInt(value) * 1000; // Convert to milliseconds
}

function applyLocationInterval(value) {
    // This will be used in the location fetch interval
    window.locationIntervalValue = parseInt(value) * 1000; // Convert to milliseconds
}

function applyFetchInterval(value) {
    // This will be used in the arrivals fetch interval
    window.fetchIntervalValue = parseInt(value) * 1000; // Convert to milliseconds
}

function applyRadius(value) {
    // This will be used in the arrivals fetch interval
    window.radiusValue = parseInt(value);
}

// Initialize all inputs with cookie values or defaults
function initializeInput(input, cookieName, defaultValue, applyFunction) {
    const savedValue = getCookie(cookieName);
    const value = savedValue ? parseFloat(savedValue) : defaultValue;
    input.value = value;
    applyFunction(value);
}

addEventListener("DOMContentLoaded", () => {
    // Initialize font size slider
    initializeInput(fontSlider, "fontSize", 1, applyFontSize);

    // Initialize online timeout input (20 seconds default)
    initializeInput(onlineTimeoutInput, "onlineTimeout", 20, applyOnlineTimeout);

    // Initialize geo timeout input (15 seconds default)
    initializeInput(geoTimeoutInput, "geoTimeout", 15, applyGeoTimeout);

    // Initialize location interval input (10 seconds default)
    initializeInput(locationIntervalInput, "locationInterval", 10, applyLocationInterval);

    // Initialize fetch interval input (20 seconds default)
    initializeInput(fetchIntervalInput, "fetchInterval", 20, applyFetchInterval);

    // Initialize radius input (1000 meters default)
    initializeInput(radiusInput, "radius", 1000, applyRadius);

    // Setup event listeners for all inputs
    setupInput(fontSlider, "fontSize", 1, applyFontSize);
    setupInput(onlineTimeoutInput, "onlineTimeout", 20, applyOnlineTimeout);
    setupInput(geoTimeoutInput, "geoTimeout", 15, applyGeoTimeout);
    setupInput(locationIntervalInput, "locationInterval", 10, applyLocationInterval);
    setupInput(fetchIntervalInput, "fetchInterval", 20, applyFetchInterval);
    setupInput(radiusInput, "radius", 1000, applyRadius);

    setInterval(fetchArrivals, window.fetchIntervalValue || 20000);
});

cogBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = sliderContainer.style.display !== "none";
    sliderContainer.style.display = isOpen ? "none" : "block";
    if (!isOpen) cacheStatus.textContent = '';
});

document.addEventListener("click", (e) => {
    if (!document.getElementById("fontControls").contains(e.target)) {
        sliderContainer.style.display = "none";
    }
});

// Reload button functionality
document.getElementById('reloadBtn').addEventListener('click', () => {
    window.location.reload();
});
setInterval(() => {
    document.getElementById("clock").textContent =
        new Date().toLocaleTimeString();
}, 1000);

// Map TfL arrivals to platform dictionary
function mapTfl(arrivals) {
    if (arrivals.length === 0) return;
    const platformsMap = {};

    arrivals.forEach(a => {
        const platform = a.platformName + " - " + a.lineName || "Unknown";

        if (!platformsMap[platform]) {
            platformsMap[platform] = [];
        }

        platformsMap[platform].push({
            "@attributes": {
                Destination: a.destinationName || "Unknown",
                Location: a.currentLocation || "",
                ArrivalTime: new Date(a.expectedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || "Unknown",
                SecondsTo: a.timeToStation || 0,
                LineName: a.lineName || "Unknown",
                VehicleId: a.vehicleId,
                LineId: a.lineId,
                direction: a.direction,
                destinationNaptanId: a.destinationNaptanId,
                currentLocationNaptanId: a.naptanId
            }
        });
    });

    Object.values(platformsMap).forEach(arr =>
        arr.sort((a, b) =>
            a["@attributes"].SecondsTo - b["@attributes"].SecondsTo
        )
    );

    return platformsMap;
}

// Render ONE station
function renderStation(stationName, distance, platforms, index) {
    const stationDiv = document.getElementById("station-" + index);
    if (!stationDiv) return;
    stationDiv.classList.remove("hidden");

    if (!platforms || Object.keys(platforms).length === 0) {
        stationDiv.innerHTML = `
                <div class="station-name">
                    ${stationName.replace("Underground Station", "")} (${Math.round(distance)}m)
                </div>
                <div class="platforms">
                    <div class="platform-section">
                        <h3>No arrivals</h3>
                    </div>
                </div>
            `;
        return;
    }

    console.log(platforms);

    stationDiv.innerHTML = `
                <div class="station-name">
                    ${stationName.replace("Underground Station", "")} (${Math.round(distance)}m)
                </div>
            `;

    const platformsDiv = document.createElement("div");
    platformsDiv.className = "platforms";

    Object.entries(platforms).forEach(([platform, arrivals]) => {
        const platformDiv = document.createElement("div");
        platformDiv.className = "platform-section";

        platformDiv.innerHTML = `<h3>${platform}</h3>`;

        arrivals.slice(0, 4).forEach(a => {
            const item = a["@attributes"];
            const minutes = Math.floor(item.SecondsTo / 60);
            const destination = item.Destination?.replace("Underground Station", "") || 'Destination Unknown';

            const div = document.createElement("div");
            div.className = "arrival-time";


            div.innerHTML = `
                    <div class="departure" style="display: flex; align-items: center;">
                        <span style="flex-grow: 1;">${destination} - ${item.ArrivalTime}</span>
                        <span style="cursor: pointer; margin-right: 5px; color: #ff9729;" class="route-arrow">🔽</span>
                        <span class="time-left">${minutes} min</span>
                    </div>
                    <div class="live-location">
                        ${item.Location || ''}
                    </div>
                `;

            if (item.VehicleId) {
                const arrow = div.querySelector('.route-arrow');
                arrow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleVehicleRoute(div, item.VehicleId, item.LineId, item.direction, item.destinationNaptanId, item.currentLocationNaptanId, arrow);
                });
                div.style.cursor = 'pointer';
                div.addEventListener('click', () => {
                    toggleVehicleRoute(div, item.VehicleId, item.LineId, item.direction, item.destinationNaptanId, item.currentLocationNaptanId, arrow);
                });
            }

            platformDiv.appendChild(div);
        });

        platformsDiv.appendChild(platformDiv);
    });

    stationDiv.appendChild(platformsDiv);
}

async function toggleVehicleRoute(arrivalDiv, vehicleId, lineId, direction, destinationNaptanId, currentLocationNaptanId, arrowElem) {
    let routeDiv = arrivalDiv.querySelector('.vehicle-route');
    if (routeDiv) {
        const isHidden = routeDiv.style.display === 'none';
        routeDiv.style.display = isHidden ? 'block' : 'none';
        if (arrowElem) arrowElem.textContent = isHidden ? '🔼' : '🔽';
        return;
    }

    if (arrowElem) arrowElem.textContent = '🔼';

    routeDiv = document.createElement('div');
    routeDiv.className = 'vehicle-route';
    routeDiv.style.marginTop = '5px';
    routeDiv.style.fontSize = '0.85em';
    routeDiv.style.color = '#ccc';
    routeDiv.style.paddingLeft = '5px';
    routeDiv.style.borderLeft = '2px solid #555';
    routeDiv.innerHTML = '<em>Loading...</em>';
    arrivalDiv.appendChild(routeDiv);

    try {
        const res = await fetch(`https://api.tfl.gov.uk/Vehicle/${vehicleId}/Arrivals`);
        const data = await res.json();

        if (!data || data.length === 0) {
            routeDiv.innerHTML = '<em>No route data</em>';
            return;
        }

        console.log(currentLocationNaptanId)

        const newData = data.filter(a => (a.lineId?.trim() == lineId?.trim() && a.direction?.trim() == direction?.trim() || a.destinationNaptanId?.trim() == destinationNaptanId?.trim())).sort((a, b) => a.timeToStation - b.timeToStation);

        let html = '<ul style="margin: 5px 0 0 0; padding-left: 15px; list-style-type: circle;">';
        newData.forEach(stop => {
            const timeStr = new Date(stop.expectedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            html += `<li ${stop.naptanId == currentLocationNaptanId ? 'style="color: green;"' : ''}>${stop.stationName.replace("Underground Station", "")} - ${timeStr}</li>`;
        });
        html += '</ul>';
        routeDiv.innerHTML = html;

    } catch (e) {
        routeDiv.innerHTML = '<em>Error fetching route</em>';
        console.error(e);
    }
}

let pos = null;
let leaveTime = null;

// Handle page hide/show and visibility change
function handleHide() {
    leaveTime = Date.now();
}

async function handleShow(time = 300000) {
    if (leaveTime !== null && (Date.now() - leaveTime) > time) {
        pos = null;
        locationInterval = null;
        await fetchArrivals();
    }
    leaveTime = null;
    console.log("handleShow");
    console.log(pos);
    console.log(leaveTime);
}

document.addEventListener('pagehide', handleHide);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        handleHide();
    } else {
        handleShow();
    }
});

window.addEventListener('online', () => handleShow(window.onlineTimeoutValue || 20000));
window.addEventListener('offline', handleHide);

let locationInterval;
let lastStopData = null;
let lastPos = null;

// Fetch + render multiple stations
async function fetchArrivals() {
    try {
        if (!navigator.onLine) {
            status.textContent = "No internet connection, retrying...";
            return;
        }

        if (!pos || !pos?.coords || pos?.coords?.latitude === 0 || pos?.coords?.longitude === 0) {
            pos = await new Promise((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: window.geoTimeoutValue || 15000 })
            );
        }

        if (!locationInterval) {
            locationInterval = setInterval(fetchLocation, window.locationIntervalValue || 10000);
        }

        const { latitude, longitude } = pos.coords;

        if (lastPos && lastPos.latitude !== latitude && lastPos.longitude !== longitude || !lastStopData) {
            const stopsRes = await fetch(
                `https://api.tfl.gov.uk/StopPoint?lat=${latitude}&lon=${longitude}&stopTypes=NaptanMetroStation,NaptanRailStation&radius=${window.radiusValue || 1000}`
            );
            const stopsData = await stopsRes.json();
            lastStopData = stopsData;
            lastPos = { latitude, longitude };
        }

        const stations = (lastStopData.stopPoints || [])
            .sort((a, b) => parseInt(a.distance) - parseInt(b.distance))
            .slice(0, 9);
        if (!navigator.onLine) {
            status.textContent = "No internet connection";
            return;
        }

        console.log(stations);

        stations.forEach(async (station, index) => {
            if (!navigator.onLine) {
                status.textContent = "No internet connection, retrying...";
                return;
            }
            const arrivalsRes = await fetch(
                `https://api.tfl.gov.uk/StopPoint/${station.id}/Arrivals`
            );
            const arrivals = await arrivalsRes.json();

            if (!arrivals.length) {
                renderStation(station.commonName, station.distance, {}, index);
                console.log("No arrivals for station: " + station.commonName);
            }

            const platforms = mapTfl(arrivals);

            if (platforms === undefined) {
                renderStation(station.commonName, station.distance, {}, index);
                console.log("No arrivals for station: " + station.commonName);
            }

            status.textContent = "";

            renderStation(
                station.commonName,
                station.distance,
                platforms,
                index
            );
        });

    } catch (err) {
        //location.reload();
        status.textContent = "Cannot get location, use last location";
        console.error(err);
    }
}

fetchArrivals();

async function fetchLocation() {
    try {
        const newPos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: window.geoTimeoutValue || 15000 })
        )
        pos = newPos;
        console.log("Location fetched at " + new Date().toLocaleTimeString());
    } catch (err) {
        console.error(err);
    }
}