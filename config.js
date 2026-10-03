'use strict';
// Where the screens send their requests.
//  - On this computer (start.bat), or a phone on the same Wi-Fi opening this computer's address: the local server, at /api.
//  - On the internet (GitHub Pages): the Supabase Edge Function "api" of the project.
// This address is not a secret. To move to another Supabase project, change SUPABASE_PROJECT and the address in index.html.
const SUPABASE_PROJECT = 'yvbwefogjbvgijevfjcz';
// "Local" = this computer itself, or its address inside the home/office network (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
const IS_LOCAL = /^(localhost$|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
const API_URL = IS_LOCAL ? location.origin + '/api' : `https://${SUPABASE_PROJECT}.supabase.co/functions/v1/api`;
