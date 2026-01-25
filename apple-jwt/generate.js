const jwt = require('jsonwebtoken');
const fs = require('fs');

const TEAM_ID = '👉여기에_Apple_Team_ID';
const CLIENT_ID = 'com.jeomlee.breath.service';
const KEY_ID = 'RX8LJMS3D6';

const PRIVATE_KEY = fs.readFileSync('./AuthKey_RX8LJMS3D6.p8');

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180, // 6개월
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  },
  PRIVATE_KEY,
  {
    algorithm: 'ES256',
    keyid: KEY_ID,
  }
);

console.log(token);
