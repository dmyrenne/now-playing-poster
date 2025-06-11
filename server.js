require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('qs');
const fs = require('fs');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;


// Holt die (vermutete) lokale IP zum Anzeigen
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

// CORS und statische Files
app.use(cors());

// NICHT als static für / ausliefern! (index.html wird dynamisch gerendert)
app.use(express.static('public', { index: false }));

let accessToken = null;
let refreshToken = null;

// Liefert index.html und ersetzt {{IP}} und {{PORT}}
app.get('/', (req, res) => {
  let html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
  html = html.replace('{{IP}}', localIp).replace('{{PORT}}', port);
  res.send(html);
});

// === SPOTIFY LOGIN ===

// Step 1: Redirect user to Spotify login
app.get('/login', (req, res) => {
  const protocol = req.protocol;
  const host = req.headers.host; // Z.B. 192.168.178.22:3000 oder domain:80
  const redirectUri = `${protocol}://${host}/callback`;

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
  const code = req.query.code;

  const authOptions = {
    method: 'post',
    url: 'https://accounts.spotify.com/api/token',
    data: qs.stringify({
      code: code,
      redirect_uri: redirectUri, // <-- DAS IST ENTSCHEIDEND!
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
    console.error("Spotify Auth Error:", error?.response?.data || error.message);
    res.send('Error authenticating with Spotify');
  }
});

// Token-Refresh
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

// Aktueller Song
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
  console.log(`Server running at http://${localIp}:${port}`);
});
