const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();

let client;
let sourceGroup = 'Jay 1'; // Name of the group from which to receive messages
let targetGroups = ['2⃣ SSYM OFFICIAL', 'Jay 14', 'Jay 5']; // List of groups to which messages will be forwarded

// Store QR code and messages
let qrCodeData = '';
let messageLogs = [];

const initializeClient = () => {
    client = new Client({
        authStrategy: new LocalAuth({ clientId: "client-one" }),
        puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }
    });

    client.on('qr', (qr) => {
        // Generate QR code image
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error('Error generating QR code:', err);
                return;
            }
            qrCodeData = url;
            console.log('QR code received, URL generated');
        });
    });

    client.on('ready', async () => {
        console.log('Client is ready! Fetching chats...');

        try {
            const chats = await client.getChats();
            const sourceChat = chats.find(chat => chat.name === sourceGroup);

            if (!sourceChat) {
                console.error(`Source group "${sourceGroup}" not found`);
                return;
            }

            console.log(`Source group "${sourceGroup}" found. Waiting for messages...`);

            client.on('message', async msg => {
                const messageText = `Message received from ${msg.from}: ${msg.body}`;
                console.log(messageText);

                // Log message
                messageLogs.push(messageText);

                if (msg.from === sourceChat.id._serialized) {
                    console.log(`Message is from source group "${sourceGroup}". Forwarding to target groups...`);

                    for (const groupName of targetGroups) {
                        const targetChat = chats.find(chat => chat.name === groupName);
                        if (targetChat) {
                            try {
                                if (msg.hasMedia) {
                                    const media = await msg.downloadMedia();
                                    const mediaMessage = new MessageMedia(media.mimetype, media.data, media.filename);
                                    await client.sendMessage(targetChat.id._serialized, mediaMessage, { caption: msg.body });
                                    console.log(`Media message forwarded to "${groupName}"`);
                                } else {
                                    await client.sendMessage(targetChat.id._serialized, msg.body);
                                    console.log(`Text message forwarded to "${groupName}"`);
                                }
                            } catch (err) {
                                console.error(`Failed to send message to "${groupName}": ${err}`);
                            }
                        } else {
                            console.error(`Target group "${groupName}" not found`);
                        }
                    }
                } else {
                    console.log('Message is not from the source group, ignoring...');
                }
            });
        } catch (err) {
            console.error('Error fetching chats:', err);
        }
    });

    client.on('authenticated', () => {
        console.log('Client authenticated successfully');
    });

    client.on('auth_failure', msg => {
        console.error('Authentication failure:', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);
        client.destroy();
        initializeClient();
    });

    client.initialize();
};

// Initialize the client
initializeClient();

// Serve the QR code image and message logs
app.get('/qr', (req, res) => {
    res.send(`<img src="${qrCodeData}" alt="QR Code"/>`);
});

app.get('/messages', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Message Logs</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f9;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                    height: 100vh;
                }
                h1 {
                    color: #5d5c61;
                }
                ul {
                    list-style: none;
                    padding: 0;
                }
                li {
                    background: #fff;
                    margin: 10px 0;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }
                .button {
                    background-color: #5d5c61;
                    color: white;
                    padding: 10px 20px;
                    text-align: center;
                    text-decoration: none;
                    display: inline-block;
                    font-size: 16px;
                    margin: 20px 2px;
                    cursor: pointer;
                    border: none;
                    border-radius: 8px;
                }
                .button:hover {
                    background-color: #6b6a6e;
                }
            </style>
        </head>
        <body>
            <h1>Message Logs</h1>
            <ul>
                ${messageLogs.map(log => `<li>${log}</li>`).join('')}
            </ul>
            <button class="button" onclick="window.location.href='/restart'">Restart</button>
        </body>
        </html>
    `);
});

// Endpoint to restart the client
app.get('/restart', (req, res) => {
    if (client) {
        client.destroy();
    }
    messageLogs = []; // Clear the message logs on restart
    initializeClient();
    res.send('Client restarted successfully. <a href="/messages">Go back to messages</a>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
