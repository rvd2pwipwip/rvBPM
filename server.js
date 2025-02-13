/**
 * Spotify Playlist Track Extractor
 * 
 * This application fetches track details from Spotify playlists and provides
 * the data in HTML, JSON, and CSV formats.
 * 
 * Setup:
 * 1. Create a .env file with CLIENT_ID, CLIENT_SECRET, and SESSION_SECRET
 * 2. Start the server with `node server.js`
 * 3. Visit https://localhost:8888 and log in with Spotify
 * 4. Access playlist details at /playlist-details or /playlist-details/csv
 */

// Core Dependencies
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { Parser } = require('json2csv');

// Configuration
const port = 8888;
const clientId = process.env.CLIENT_ID;
const redirectUri = 'https://localhost:8888/callback';
const scopes = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative';

// Initialize Express App
const app = express();

// Configure Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: true,
    saveUninitialized: true,
    cookie: { 
        secure: true,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// PKCE Authentication Helper Functions
function generateCodeVerifier() {
    const length = 64;
    return crypto.randomBytes(length)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
        .slice(0, length);
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// Spotify API Helper Function
async function getAllPlaylistTracks(playlistId, accessToken) {
    let tracks = [];
    let nextURL = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

    while (nextURL) {
        const response = await axios.get(nextURL, {
            headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        tracks = tracks.concat(response.data.items);
        nextURL = response.data.next;
    }
    return tracks;
}

// Routes
app.get('/', (req, res) => {
    res.send('Welcome to Spotify Playlist Track Extractor. <a href="/login">Login with Spotify</a>');
});

app.get('/login', (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    
    req.session.codeVerifier = codeVerifier;
    console.log('Code verifier stored in session:', codeVerifier);
    
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', scopes);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);
    
    res.redirect(authUrl.toString());
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const codeVerifier = req.session.codeVerifier;
    console.log('Code verifier from session:', codeVerifier);

    if (!codeVerifier) {
        console.error('No code verifier found in session');
        return res.redirect('/login');
    }

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        req.session.accessToken = response.data.access_token;
        res.redirect('/playlist-details');
    } catch (error) {
        console.error('Error retrieving access token:', error.response ? error.response.data : error.message);
        res.redirect('/login');
    }
});

app.get('/playlist-details', async (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/login');
    }

    const playlistId = '7MU4kChv9nIF242QWv8DJz';
    try {
        const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 
                'Authorization': `Bearer ${req.session.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const playlistName = playlistResponse.data.name;
        const tracks = await getAllPlaylistTracks(playlistId, req.session.accessToken);

        const trackDetails = tracks.map(item => ({
            title: item.track.name,
            artist: item.track.artists.map(artist => artist.name).join(', ')
        }));

        res.format({
            'text/html': () => {
                let html = `<h1>Playlist Name: ${playlistName}</h1><h2>Track Titles and Artists</h2><ul>`;
                trackDetails.forEach(track => {
                    html += `<li>${track.title}: ${track.artist}</li>`;
                });
                html += '</ul>';
                res.send(html);
            },
            'application/json': () => res.json({
                playlistName: playlistName,
                tracks: trackDetails
            })
        });
    } catch (error) {
        console.error('Error fetching playlist details:', error.response ? error.response.data : error.message);
        if (error.response?.status === 401) {
            return res.redirect('/login');
        }
        res.status(500).send('Error fetching playlist details');
    }
});

app.get('/playlist-details/csv', async (req, res) => {
    if (!req.session.accessToken) {
        return res.redirect('/login');
    }

    const playlistId = '7MU4kChv9nIF242QWv8DJz';
    try {
        const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 
                'Authorization': `Bearer ${req.session.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const playlistName = playlistResponse.data.name;
        const tracks = await getAllPlaylistTracks(playlistId, req.session.accessToken);

        const trackDetails = tracks.map(item => ({
            title: item.track.name,
            artist: item.track.artists.map(artist => artist.name).join(', ')
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(trackDetails);

        const sanitizedPlaylistName = playlistName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.header('Content-Type', 'text/csv');
        res.attachment(`${sanitizedPlaylistName}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error fetching playlist details:', error.response ? error.response.data : error.message);
        if (error.response?.status === 401) {
            return res.redirect('/login');
        }
        res.status(500).send('Error fetching playlist details');
    }
});

// Start HTTPS Server
const httpsOptions = {
    key: fs.readFileSync('./cert/private.key'),
    cert: fs.readFileSync('./cert/certificate.pem')
};

https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`Server running at https://localhost:${port}`);
});