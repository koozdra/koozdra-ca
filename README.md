# Site

Personal website contents.

[koozdra.ca](https://koozdra.ca "Personal Website")

## Structure

Plain static HTML with no build step. Every page links `/css/site.css`, which holds
the design tokens (light and dark), layout and components. It also has a small
compatibility section for the Bootstrap 3 class names the older demos still use.

- New pages: copy `public_html/template.html` or `public_html/projects/template.html`.
- Blog posts with Chart.js: load `/js/chart-theme.js` right after Chart.js so the
  charts follow the light or dark theme.

## Setup

Create a `deploy/config.json` with ftp information.

`npm install`

## Running locally

Uses express static routing.

`node server/http_server.js`

## Deploy

`npm run deploy`
