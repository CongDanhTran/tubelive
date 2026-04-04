require('dotenv').config();
const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const fetch = require('node-fetch'); // Use for TfL API calls
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('xmldom');

const app = express();
const PORT = process.env.PORT || 8081;
const SUB_PATH = path.join(__dirname + "/data", 'subscriptions.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// 1. Initialise VAPID keys from .env
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing in .env!");
}

webpush.setVapidDetails(
    process.env.EMAIL || 'mailto:test@test.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// 2. Local Storage for Subscriptions
let subscriptions = [];
if (fs.existsSync(SUB_PATH)) {
    subscriptions = JSON.parse(fs.readFileSync(SUB_PATH, 'utf8'));
}

function saveSubscriptions() {
    // Ensure data directory exists
    if (!fs.existsSync(path.dirname(SUB_PATH))) {
        fs.mkdirSync(path.dirname(SUB_PATH), { recursive: true });
    }
    fs.writeFileSync(SUB_PATH, JSON.stringify(subscriptions, null, 2));
}

const lineNames = {
    'B': 'Bakerloo',
    'C': 'Central',
    'D': 'District',
    'H': 'Hammersmith & Circle',
    'J': 'Jubilee',
    'M': 'Metropolitan',
    'N': 'Northern',
    'P': 'Piccadilly',
    'V': 'Victoria',
    'W': 'Waterloo & City'
};

// Converts TfL UTC HH:mm:ss to local time HH:mm:ss
function tflTimeToLocal(utcString, refDate = new Date()) {
    if (!utcString || !utcString.includes(':')) return utcString;
    const [h, m, s] = utcString.split(':').map(Number);
    const date = new Date(refDate);
    date.setUTCHours(h, m, s, 0);
    const pad = n => n.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function xmlToJson(xml) {
    var obj = {};
    if (xml.nodeType == 1) { // element
        if (xml.attributes && xml.attributes.length > 0) {
            obj["@attributes"] = {};
            for (var j = 0; j < xml.attributes.length; j++) {
                var attribute = xml.attributes.item(j);
                obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == 3) { // text
        obj = xml.nodeValue;
    }

    if (xml.hasChildNodes()) {
        for (var i = 0; i < xml.childNodes.length; i++) {
            var item = xml.childNodes.item(i);
            var nodeName = item.nodeName;

            if (nodeName === "#text" || nodeName === "#cdata-section") {
                const val = item.nodeValue.trim();
                if (val) {
                    if (Object.keys(obj).length === 0) obj = val;
                    else obj["#text"] = val;
                }
                continue;
            }

            var jsonItem = xmlToJson(item);
            if (typeof obj[nodeName] == "undefined") {
                obj[nodeName] = jsonItem;
            } else {
                if (!Array.isArray(obj[nodeName])) {
                    var old = obj[nodeName];
                    obj[nodeName] = [];
                    obj[nodeName].push(old);
                }
                obj[nodeName].push(jsonItem);
            }
        }
    }
    return obj;
}

// 3. API Endpoints
app.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

app.get('/subscriptions', (req, res) => {
    res.json(subscriptions);
});

app.post('/subscribe', (req, res) => {
    const { subscription, monitoredSetNo, timeFrom, timeTo, station, line, appKey } = req.body;

    // Check if subscription already exists
    const idx = subscriptions.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    const subData = {
        subscription,
        monitoredSetNo,
        timeFrom,
        timeTo,
        station: station,
        line: line,
        appKey: appKey
    };
    if (idx > -1) {
        subscriptions[idx] = subData;
    } else {
        subscriptions.push(subData);
    }

    saveSubscriptions();
    console.log(`Subscribed: SetNo ${monitoredSetNo} (Endpoint: ${subscription.endpoint.slice(-20)})`);
    res.status(201).json({});
});

app.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    subscriptions = subscriptions.filter(s => s.subscription.endpoint !== endpoint);
    saveSubscriptions();
    console.log(`Unsubscribed: ${endpoint.slice(-20)}`);
    res.status(200).json({});
});

// Creates a Date object for a specific HH:mm:ss on the given baseDate
function parseTimeToDate(timeStr, baseDate) {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [h, m, s] = timeStr.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h, m, s || 0, 0);
    return d;
}

// 4. TfL Monitoring Logic (Cron Job)
// Use schedule from env or default to every 5 mins from 5:00 AM to 5:30 AM
const cronSchedule = process.env.CRON_SCHEDULE || '0-30/5 5 * * *';
cron.schedule(cronSchedule, async () => {
    console.log(`[${new Date().toLocaleTimeString()}] Running scheduled TfL Arrival Check...`);
    await performGlobalCheck();
});

(async () => {
    try {
        console.log("Performing initial startup check...");
        await performGlobalCheck();
    } catch (e) {
        console.error("Initial check failed:", e);
    }
})();

async function performGlobalCheck() {
    if (subscriptions.length === 0) return;

    // Group subscriptions by Line/Station/AppKey to minimize API calls
    const groups = subscriptions.reduce((acc, sub) => {
        const key = `${sub.line}/${sub.station}/${sub.appKey}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(sub);
        return acc;
    }, {});


    for (const [key, subs] of Object.entries(groups)) {
        try {
            const [line, station, appKey] = key.split('/');
            const url = `https://api.tfl.gov.uk/trackernet/PredictionDetailed/${line}/${station}?app_key=${appKey}`;
            console.log(`[${new Date().toLocaleTimeString()}] Fetching TfL data for ${key}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`TfL Status: ${response.status} for ${key}`);

            const xmlString = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            const data = xmlToJson(xmlDoc);


            const whenCreatedRaw = data.ROOT?.WhenCreated || "";
            const apiDate = new Date(whenCreatedRaw || Date.now());
            const today = apiDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });

            for (const sub of subs) {
                const { subscription, monitoredSetNo, timeFrom, timeTo } = sub;
                const paddedSetNo = monitoredSetNo.toString().padStart(3, '0');

                const fromDate = parseTimeToDate(timeFrom, apiDate);
                const toDate = parseTimeToDate(timeTo, apiDate);

                let found = false;

                // Navigate the JSON structure: ROOT -> S (Station) -> P (Platform) -> T (Train)
                if (data.ROOT && data.ROOT.S && data.ROOT.S.P) {
                    const platforms = Array.isArray(data.ROOT.S.P) ? data.ROOT.S.P : [data.ROOT.S.P];

                    const stationName = data.ROOT.S['@attributes'].N;

                    for (const p of platforms) {
                        if (!p.T) continue;
                        const trains = Array.isArray(p.T) ? p.T : [p.T];

                        for (const t of trains) {
                            const attrs = t["@attributes"];
                            if (attrs && attrs.SetNo === paddedSetNo) {
                                const utcTime = attrs.ArrivalTime || attrs.DepartTime;
                                if (utcTime) {
                                    const localArrivalTime = tflTimeToLocal(utcTime, apiDate);
                                    const arrivalDate = parseTimeToDate(localArrivalTime, apiDate);

                                    if (fromDate && toDate && arrivalDate >= fromDate && arrivalDate <= toDate) {
                                        found = true;
                                        const lineName = lineNames[sub.line] || sub.line;
                                        sendPush(subscription, {
                                            title: `[${today}] ${stationName} - ${lineName} ${monitoredSetNo} to ${attrs.Destination} - ${localArrivalTime}`,
                                            body: `[${today}] ${stationName} - ${lineName} ${monitoredSetNo} to ${attrs.Destination} - ${localArrivalTime}`,
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                        if (found) break;
                    }

                    if (!found) {
                        if (fromDate && toDate && apiDate >= fromDate && apiDate <= toDate) {
                            const whenCreatedTime = (whenCreatedRaw.split(' ').pop() || "").padStart(8, '0');
                            console.log(`Train ${monitoredSetNo} not found in JSON for ${key} within time window (API Time: ${whenCreatedTime}, Date: ${today}).`);
                            const lineName = lineNames[sub.line] || sub.line;
                            sendPush(subscription, {
                                title: `[${today}] ${lineName} ${monitoredSetNo} - No tube to work`,
                                body: `[${today}] ${lineName} ${monitoredSetNo} - No tube to work`,
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Error checking ${key}:`, err);
        }
    }
}

function sendPush(subscription, payload) {
    webpush.sendNotification(subscription, JSON.stringify(payload))
        .catch(err => {
            console.error("Error sending notification:", err);
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription has expired or is no longer valid
                subscriptions = subscriptions.filter(s => s.subscription.endpoint !== subscription.endpoint);
                saveSubscriptions();
            }
        });
}

// Test endpoint
app.post('/test-push', (req, res) => {
    const { subscription, title, body } = req.body;
    sendPush(subscription, { title, body });
    res.json({ message: "Test push sent." });
});

app.listen(PORT, () => {
    console.log(`TubeLive Server running on port ${PORT}`);
});
