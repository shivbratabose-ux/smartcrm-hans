# SmartCRM — Hans Infomatic Pvt. Ltd.

Internal CRM for aviation/logistics software business development.

## Stack
- React 18 + Vite 5
- Recharts
- Google Fonts: Outfit + DM Sans

## Local Development

```bash
npm install
npm run dev
# Opens at http://localhost:5173
# Local network access: http://<your-ip>:5173
```

## Build for Production

```bash
npm run build
npm run preview   # test the production build locally
```

## Deploy Options

### Option A — Vercel (recommended)
1. Push repo to GitHub
2. Go to vercel.com → New Project → Import repo
3. Framework: Vite (auto-detected)
4. Click Deploy
5. Auto-deploys on every `git push`

### Option B — Render
1. Push repo to GitHub
2. Go to render.com → New Static Site
3. Connect repo, build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Auto-deploys on every `git push`

### Option C — GitHub Pages
```bash
npm install --save-dev gh-pages
# Add to package.json scripts: "deploy": "gh-pages -d dist"
npm run build && npm run deploy
```

## File Structure

```
smartcrm-hans/
├── index.html
├── vite.config.js
├── package.json
├── vercel.json          # Vercel SPA routing
├── render.yaml          # Render deploy config
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx         # React entry point
    └── SmartCRM.jsx     # Full application (copy from delivery)
```

## Adding SmartCRM.jsx
Copy the delivered SmartCRM.jsx into the `src/` folder.
