const axios = require('axios');

async function getBPMs(accessToken, playlistId) {
  try {
    // Fetch playlist tracks
    const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    const trackIds = tracksResponse.data.items.map(item => item.track.id);

    // Fetch audio features for each track
    const audioFeaturesResponse = await axios.get(`https://api.spotify.com/v1/audio-features`, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      params: { ids: trackIds.join(',') }
    });

    return audioFeaturesResponse.data.audio_features.map(feature => ({
      id: feature.id,
      bpm: feature.tempo
    }));
  } catch (error) {
    console.error('Error fetching BPM data:', error.response ? error.response.data : error.message);
    throw new Error('Error fetching BPM data');
  }
}

module.exports = { getBPMs };