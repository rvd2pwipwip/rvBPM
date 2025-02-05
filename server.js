const { getBPMs } = require('./bpmExtractor'); 

/**
 * https://developer.spotify.com/
 * The Spotify app's id and secret are in the environment variable (.env). 
 * After running the node server with `node server.js`,
 * open http://localhost:8888 and log in to Spotify http://localhost:8888/login
 * to get an access token.
 * https://spotify.statuspage.io/
 */

require('dotenv').config();
const qs = require('qs');
const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;
let spotifyToken = '';

///////////////////////////////////////
// Set Up Express Server
///////////////////////////////////////

/**
 * This basic setup creates a simple web server that listens on port 8888 and
 * responds with "Hello, Spotify!" when accessed at the root URL.
 * This is the foundation upon which more complex functionality can be built,
 * such as handling Spotify authentication and API requests.
 */

const express = require('express');
const axios = require('axios');
const app = express();
const port = 8888;

// Setting Up a Basic Route
app.get('/', (req, res) => {
  res.send('Hello, Spotify!');
});

// Starting the Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

///////////////////////////////////////
// Set Up Authentication Route
///////////////////////////////////////

/**
 * This code sets up the initial step of the OAuth 2.0 authorization flow,
 * allowing users to log in to Spotify and grant the application the requested permissions.
 * After authorization, Spotify will redirect the user to the specified Redirect URI
 * with an authorization code, which can then be exchanged for an access token.
 */

const redirectUri = 'http://localhost:8888/callback';
const scopes = 'user-read-private user-read-email';

app.get('/login', (req, res) => {
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(
    scopes
  )}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

///////////////////////////////////////
// Handle Callback
///////////////////////////////////////

/**
 * This code completes the OAuth 2.0 authorization flow by exchanging the authorization code
 * for an access token, which can then be used to access Spotify's API on behalf of the user.
 */

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    data: qs.stringify({
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    headers: {
      'Authorization': 'Basic ' + (Buffer.from(clientId + ':' + clientSecret).toString('base64')),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
  };

  try {
    const response = await axios.post(authOptions.url, authOptions.data, {
      headers: authOptions.headers,
    });
    const accessToken = response.data.access_token;
    spotifyToken = accessToken;
    res.send(`Access Token: ${accessToken}`);
  } catch (error) {
    console.error(
      'Error retrieving access token:',
      error.response ? error.response.data : error.message
    );
    if (!res.headersSent) {
      res.send('Error retrieving access token');
    }
  }
});

// Fetch BPM from a playlist
app.get('/playlist-bpm', async (req, res) => {
  const accessToken = spotifyToken; // Use the access token you obtained
  const playlistId = '5YVM4PAejxwj8wc8gagFPQ'; // Replace with your playlist ID

  try {
    const trackBPMs = await getBPMs(accessToken, playlistId);

    // Fetch track details to get track titles
    const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    const trackDetails = tracksResponse.data.items.map(item => ({
      title: item.track.name,
      bpm: trackBPMs.find(bpm => bpm.id === item.track.id)?.bpm || 'N/A'
    }));

    // Generate HTML response
    let html = '<h1>Playlist Tracks and BPM</h1><ul>';
    trackDetails.forEach(track => {
      html += `<li>${track.title}: ${track.bpm} BPM</li>`;
    });
    html += '</ul>';

    res.send(html);
  } catch (error) {
    console.error('Error fetching BPM data:', error.response ? error.response.data : error.message);
    res.send('Error fetching BPM data');
  }
});

// Start the server `node server.js`
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});