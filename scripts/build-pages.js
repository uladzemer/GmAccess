const fs = require('fs');
const path = require('path');

const repoSlug = process.env.GITHUB_REPOSITORY || 'uladzemer/GmAccess';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = num;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = v >= 100 ? v.toFixed(0) : (v >= 10 ? v.toFixed(1) : v.toFixed(2));
  return `${fixed} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return fmt.format(d);
}

function findAssetByPatterns(assets, patterns) {
  for (const pattern of patterns) {
    const match = assets.find((asset) => pattern.test(String(asset.name || '').toLowerCase()));
    if (match) return match;
  }
  return null;
}

async function fetchReleases() {
  const headers = {
    'User-Agent': 'release-page-generator',
    'Accept': 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const all = [];
  let page = 1;
  while (true) {
    const url = `${apiBase}/repos/${repoSlug}/releases?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < 100) break;
    page += 1;
  }
  return all;
}

function pickLatestRelease(releases) {
  const sorted = releases
    .filter((r) => r && !r.draft)
    .sort((a, b) => {
      const aDate = Date.parse(a.published_at || a.created_at || 0);
      const bDate = Date.parse(b.published_at || b.created_at || 0);
      return bDate - aDate;
    });
  if (!sorted.length) return null;
  const stable = sorted.find((r) => !r.prerelease);
  return stable || sorted[0] || null;
}

function resolveDownloadLinks(release) {
  if (!release) return { windows: null, macos: null };
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const winAsset = findAssetByPatterns(assets, [
    /\.exe$/,
    /\.msi$/,
    /win/,
  ]);
  const macAsset = findAssetByPatterns(assets, [
    /\.dmg$/,
    /\.pkg$/,
    /mac|osx|darwin/,
  ]);
  return {
    windows: winAsset ? winAsset.browser_download_url : null,
    macos: macAsset ? macAsset.browser_download_url : null,
  };
}

function buildHtml(releases) {
  const latest = pickLatestRelease(releases);
  const links = resolveDownloadLinks(latest);
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GmAccess</title>
    <meta name="description" content="Скачать GmAccess для Windows или macOS." />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
      :root {
        --bg: #f6f6f4;
        --ink: #151615;
        --muted: #5b615e;
        --accent: #0f766e;
        --card: #ffffff;
        --border: #e5e7eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Manrope", "Segoe UI", sans-serif;
        color: var(--ink);
        background: var(--bg);
        min-height: 100vh;
      }
      .wrap {
        max-width: 820px;
        margin: 0 auto;
        padding: 56px 16px 64px;
      }
      h1 {
        margin: 0 0 6px 0;
        font-size: clamp(2rem, 3vw, 2.8rem);
        letter-spacing: -0.02em;
      }
      .buttons {
        display: grid;
        gap: 12px;
        margin-top: 22px;
      }
      .btn {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        padding: 14px 18px;
        border-radius: 12px;
        background: var(--accent);
        color: #fff;
        text-decoration: none;
        font-weight: 600;
        border: 1px solid transparent;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
        box-shadow: 0 10px 20px rgba(15, 118, 110, 0.18);
      }
      .btn:hover {
        transform: translateY(-1px);
      }
      .btn.secondary {
        background: transparent;
        color: var(--accent);
        border-color: var(--border);
        box-shadow: none;
      }
      .btn.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      @media (max-width: 640px) {
        .wrap { padding: 40px 16px 48px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>GmAccess</h1>
      <div class="buttons">
        <a class="btn${links.windows ? '' : ' disabled'}" href="${escapeHtml(links.windows || '#')}" aria-disabled="${links.windows ? 'false' : 'true'}">Скачать для Windows</a>
        <a class="btn secondary${links.macos ? '' : ' disabled'}" href="${escapeHtml(links.macos || '#')}" aria-disabled="${links.macos ? 'false' : 'true'}">Скачать для macOS</a>
      </div>
    </div>
  </body>
</html>`;
}

async function main() {
  const releases = await fetchReleases();
  const html = buildHtml(releases);
  const outDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');
  console.log(`Generated ${path.join(outDir, 'index.html')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
