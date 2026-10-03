'use strict';
// Where the screens send their requests.
//  - On this computer (start.bat): the local server, at /api.
//  - On the internet (GitHub Pages): the Supabase Edge Function "api" of the project.
// This address is not a secret. To move to another Supabase project, change SUPABASE_PROJECT and the address in index.html.
const SUPABASE_PROJECT = 'yvbwefogjbvgijevfjcz';
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const API_URL = IS_LOCAL ? location.origin + '/api' : `https://${SUPABASE_PROJECT}.supabase.co/functions/v1/api`;
