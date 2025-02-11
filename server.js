const { getBPMs } = require('./bpmExtractor'); 

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
const scopes = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative';

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
    res.redirect('/playlist-details'); // Redirect to the playlist BPM endpoint
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

const { Parser } = require('json2csv');

// Fetch all playlist tracks (with pagination for 100+)
async function getAllPlaylistTracks(playlistId, accessToken) {
  let tracks = [];
  let nextURL = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

  while (nextURL) {
    const response = await axios.get(nextURL, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    // Add the current batch of tracks to our array
    tracks = tracks.concat(response.data.items);

    // Get the URL for the next batch of tracks, if any
    nextURL = response.data.next;
  }

  return tracks;
}

// https://open.spotify.com/playlist/4aVwn1fC0Gai4HOLbHVo9U?si=56f7a0d44b5d4b32

app.get('/playlist-details', async (req, res) => {
  const playlistId = '4aVwn1fC0Gai4HOLbHVo9U'; // Updated playlist ID
  const accessToken = spotifyToken; // Use the access token you obtained
  try {
    // Fetch playlist details to get the name
    const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
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
  const playlistId = '4aVwn1fC0Gai4HOLbHVo9U'; // Updated playlist ID
  const accessToken = spotifyToken; // Use the access token you obtained
  try {
    // Fetch playlist details to get the name
    const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
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
    const csv = json2csvParser.parse(tracks);

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