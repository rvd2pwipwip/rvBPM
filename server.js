const { getBPMs } = require('./bpmExtractor');
const https = require('https');
const fs = require('fs');


// Create HTTPS server options
const httpsOptions = {
  key: fs.readFileSync('./cert/private.key'),
  cert: fs.readFileSync('./cert/certificate.pem')
};

// FOR FEAR OF AI TRAINING ON THEIR DATA,
// SPOTIFY HAS DEPRECATED THE AUDIO-FEATURES AND AUDIO-ANALYSIS ENDPOINTS 
// AS OF NOVEMBER 2024.

/**
 * https://developer.spotify.com/
 * The Spotify app's id and secret are in the environment variable (.env). 
 * After running the node server with `node server.js`,
 * open http://localhost:8888 and log in to Spotify http://localhost:8888/login
 * to get an access token.
 * https://spotify.statuspage.io/
 * 
 * Then replace the playlist ID on both HTML and CSV endpoints
 */

require('dotenv').config();
const qs = require('qs');

// PKCE (Proof Key for Code Exchange) Authentication
const crypto = require('crypto'); // Built-in Node.js module

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

// Session Management
const session = require('express-session');

const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;

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

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
      secure: true,
      httpOnly: true,
      sameSite: 'strict'
  }
}));

// Setting Up a Basic Route
app.get('/', (req, res) => {
  res.send('Hello, Spotify!');
});

// Starting the Server
const server = https.createServer(httpsOptions, app);
server.listen(port, () => {
  console.log(`Server running at https://localhost:${port}`);
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

const redirectUri = 'https://localhost:8888/callback';
const scopes = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative';

// Login route
app.get('/login', (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  // Store the code verifier in session
  req.session.codeVerifier = codeVerifier;
  
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('scope', scopes);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  
  res.redirect(authUrl.toString());
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
  const codeVerifier = req.session.codeVerifier;

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

      const accessToken = response.data.access_token;
      req.session.accessToken = accessToken; // Store in session
      spotifyToken = accessToken; // Keep this for compatibility
      res.redirect('/playlist-details');
  } catch (error) {
      console.error('Error retrieving access token:', error.response ? error.response.data : error.message);
      res.redirect('/login');
  }
});

const { Parser } = require('json2csv');

// Fetch all playlist tracks (with pagination for 100+)
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

    // Add the current batch of tracks to our array
    tracks = tracks.concat(response.data.items);

    // Get the URL for the next batch of tracks, if any
    nextURL = response.data.next;
  }

  return tracks;
}

// https://open.spotify.com/playlist/7MU4kChv9nIF242QWv8DJz?si=30d1ba0b3c1741e4

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

    // Fetch all tracks
    const tracks = await getAllPlaylistTracks(playlistId, accessToken);

    // Extract track titles and artist names
    const trackDetails = tracks.map(item => ({
      title: item.track.name,
      artist: item.track.artists.map(artist => artist.name).join(', ')
    }));

    // Generate HTML response
    let html = `<h1>Playlist Name: ${playlistName}</h1><h2>Track Titles and Artists</h2><ul>`;
    trackDetails.forEach(track => {
      html += `<li>${track.title}: ${track.artist}</li>`;
    });
    html += '</ul>';

    // Generate JSON response
    const jsonResponse = {
      playlistName: playlistName,
      tracks: tracks
    };

    // Send both HTML and JSON
    res.format({
      'text/html': () => res.send(html),
      'application/json': () => res.json(jsonResponse)
    });

  } catch (error) {
    console.error('Error fetching playlist details:', error.response ? error.response.data : error.message);
    res.send('Error fetching playlist details');
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

    // Fetch all tracks using the same function
    const tracks = await getAllPlaylistTracks(playlistId, accessToken);

    // Extract track titles and artist names
    const trackDetails = tracks.map(item => ({
      title: item.track.name,
      artist: item.track.artists.map(artist => artist.name).join(', ')
    }));

    // Convert JSON to CSV
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(trackDetails);

    // Send CSV file with playlist name as filename
    const sanitizedPlaylistName = playlistName.replace(/[^a-z0-9]/gi, '_').toLowerCase(); // Sanitize filename
    res.header('Content-Type', 'text/csv');
    res.attachment(`${sanitizedPlaylistName}.csv`);
    res.send(csv);

  } catch (error) {
    console.error('Error fetching playlist details:', error.response ? error.response.data : error.message);
    res.send('Error fetching playlist details');
  }
});

// SPOTIFY HAS DEPRECATED THE AUDIO-FEATURES AND AUDIO-ANALYSIS ENDPOINTS AS OF NOVEMBER 2024.
//////////////////////////////////////////////////////////////////////////////////////////////

// Fetch BPM from a playlist
// app.get('/playlist-bpm', async (req, res) => {
//   const accessToken = spotifyToken; // Use the access token you obtained
//   const playlistId = '5YVM4PAejxwj8wc8gagFPQ'; // Replace with your playlist ID

//   try {
//     const trackBPMs = await getBPMs(accessToken, playlistId);

//     // Fetch track details to get track titles
//     const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
//       headers: { 'Authorization': 'Bearer ' + accessToken }
//     });

//     const trackDetails = tracksResponse.data.items.map(item => ({
//       title: item.track.name,
//       bpm: trackBPMs.find(bpm => bpm.id === item.track.id)?.bpm || 'N/A'
//     }));

//     // Generate HTML response
//     let html = '<h1>Playlist Tracks and BPM</h1><ul>';
//     trackDetails.forEach(track => {
//       html += `<li>${track.title}: ${track.bpm} BPM</li>`;
//       html += `<li>${track.title}</li>`;
//     });
//     html += '</ul>';

//     res.send(html);
//   } catch (error) {
//     console.error('Error fetching BPM data:', error.response ? error.response.data : error.message);
//     res.send('Error fetching da BPM data');
//   }
// });

// // Start the server `node server.js`
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });