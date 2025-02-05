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

// https://developer.spotify.com/
require('dotenv').config();
const clientSecret = process.env.CLIENT_SECRET;
const clientId = process.env.CLIENT_ID;

const redirectUri = 'http://localhost:8888/callback';
const scopes = 'user-read-private user-read-email';

app.get('/login', (req, res) => {
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
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
    url: '<https://accounts.spotify.com/api/token>',
    form: {
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + (Buffer.from(clientId + ':' + clientSecret).toString('base64'))
    },
    json: true
  };

  try {
    const response = await axios.post(authOptions.url, authOptions.form, { headers: authOptions.headers });
    const accessToken = response.data.access_token;
    res.send(`Access Token: ${accessToken}`);
  } catch (error) {
    res.send('Error retrieving access token');
  }
});