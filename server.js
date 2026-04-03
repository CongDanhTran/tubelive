require('dotenv').config();
const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const fetch = require('node-fetch'); // Use for TfL API calls
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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

// 3. API Endpoints
app.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/subscribe', (req, res) => {
    const { subscription, monitoredSetNo, timeFrom, timeTo } = req.body;

    // Check if subscription already exists
    const idx = subscriptions.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    if (idx > -1) {
        subscriptions[idx] = { subscription, monitoredSetNo, timeFrom, timeTo };
    } else {
        subscriptions.push({ subscription, monitoredSetNo, timeFrom, timeTo });
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

// 4. TfL Monitoring Logic (Cron Job)
// Runs every 5 minutes from 5:00 AM to 5:40 AM daily
cron.schedule('*/5 5 * * *', async () => {
    console.log(`[${new Date().toLocaleTimeString()}] Running scheduled TfL Arrival Check...`);
    await performGlobalCheck();
});

async function performGlobalCheck() {
    if (subscriptions.length === 0) return;

    try {
        const url = `https://api.tfl.gov.uk/trackernet/PredictionDetailed/H/STG?app_key=${process.env.TFL_APP_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`TfL Status: ${response.status}`);

        const xmlString = await response.text();
        const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

        for (const sub of subscriptions) {
            const { subscription, monitoredSetNo, timeFrom, timeTo } = sub;
            const setNoPattern = new RegExp(`SetNo="${monitoredSetNo}" arrivalTime="([^"]+)"`, 'g');
            // This is a naive regex-based search for minimal server footprint
            let found = false;
            let match;

            while ((match = setNoPattern.exec(xmlString)) !== null) {
                const arrivalTime = match[1];
                if (arrivalTime >= timeFrom && arrivalTime <= timeTo) {
                    found = true;
                    sendPush(subscription, {
                        title: `[${today}] Tàu Circle ${monitoredSetNo} đến lúc ${arrivalTime}`,
                        body: `Thông báo tự động từ TubeLive Server.`
                    });
                    break;
                }
            }

            if (!found) {
                // If the check window is almost closing and we haven't found it yet...
                // (Optional: send not found logic per user request if needed).
                console.log(`Train ${monitoredSetNo} not found for subscriber ${subscription.endpoint.slice(-10)}`);
            }
        }
    } catch (err) {
        console.error("Global Check Error:", err);
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
