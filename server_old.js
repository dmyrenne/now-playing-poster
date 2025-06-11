// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('qs');
const os = require('os');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
const localIp = getLocalIp();
const app = express();
const port = 3000;

app.use(cors());
// app.use(express.static('public'));

let accessToken = null;
let refreshToken = null;

const fs = require('fs');
app.get('/', (req, res) => {
  let html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
  html = html.replace('{{IP}}', localIp).replace('{{PORT}}', port);
  res.send(html);
});


// Step 1: Redirect user to Spotify login
// app.get('/login', (req, res) => {
//   const scope = 'user-read-playback-state user-read-currently-playing';
//   const redirectUri = process.env.REDIRECT_URI;
//   const query = qs.stringify({
//     response_type: 'code',
//     client_id: process.env.CLIENT_ID,
//     scope: scope,
//     redirect_uri: redirectUri,
//   });
//   res.redirect(`https://accounts.spotify.com/authorize?${query}`);
// });

// Step 1: Redirect user to Spotify login
app.get('/login', (req, res) => {
  // Hole Protokoll & Host aus dem aktuellen Request
  const protocol = req.protocol;
  const host = req.headers.host; // z.B. 192.168.178.22:3000

  // Baue die korrekte redirect_uri
  const redirectUri = `${protocol}://${host}/callback`;

  // Erzeuge den Spotify-Login-Link mit redirect_uri
  const scope = 'user-read-playback-state user-read-currently-playing user-read-email user-read-private';
  const query = qs.stringify({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    scope: scope,
    redirect_uri: redirectUri,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${query}`);
});


// Step 2: Spotify redirects back with code → exchange for token
app.get('/callback', async (req, res) => {
  const protocol = req.protocol;
  const host = req.headers.host;
  const redirectUri = `${protocol}://${host}/callback`;

  const authOptions = {
    method: 'post',
    url: 'https://accounts.spotify.com/api/token',
    data: qs.stringify({
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(
          process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET
        ).toString('base64'),
    },
  };

  try {
    const response = await axios(authOptions);
    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
    res.redirect('/');
  } catch (error) {
    res.send('Error authenticating with Spotify');
  }
});

// Refresh Token logic (optional)
async function refreshAccessToken() {
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET
          ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  accessToken = response.data.access_token;
}

// API endpoint to fetch currently playing song
app.get('/now-playing', async (req, res) => {
  if (!accessToken) return res.status(401).send('Not authenticated');

  try {
    const result = await axios.get(
      'https://api.spotify.com/v1/me/player/currently-playing',
      {
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
      }
    );
    res.json(result.data);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      await refreshAccessToken();
      res.redirect('/now-playing');
    } else {
      res.status(500).json({ error: 'Error fetching track' });
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
});
