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

function renderReleaseCard(release, index, isLatest) {
  const tag = release.tag_name || release.name || 'без тега';
  const title = release.name || release.tag_name || 'Релиз';
  const url = release.html_url || '#';
  const published = formatDate(release.published_at || release.created_at);
  const prerelease = release.prerelease ? '<span class="badge subtle">Предрелиз</span>' : '';
  const latest = isLatest ? '<span class="badge">Последний</span>' : '';
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const assetsHtml = assets.length
    ? assets.map((asset) => {
      const assetName = escapeHtml(asset.name || 'asset');
      const assetUrl = escapeHtml(asset.browser_download_url || '#');
      const assetSize = formatBytes(asset.size || 0);
      const dlCount = Number.isFinite(asset.download_count) ? asset.download_count : null;
      const dlLabel = dlCount !== null ? `${dlCount} скачиваний` : 'скачиваний';
      return `<li><a href="${assetUrl}">${assetName}</a><span>${assetSize} · ${dlLabel}</span></li>`;
    }).join('')
    : '<li class="muted">Файлы не добавлены.</li>';
  const notes = escapeHtml(release.body || '').replace(/\n/g, '<br>');
  const notesBlock = notes
    ? `<details><summary>Описание релиза</summary><div class="notes">${notes}</div></details>`
    : '';
  return `
    <article class="card" style="--i:${index}">
      <div class="card-head">
        <div class="title-block">
          <h2>${escapeHtml(title)}</h2>
          <div class="meta">
            <span class="tag">${escapeHtml(tag)}</span>
            ${published ? `<span>${escapeHtml(published)}</span>` : ''}
          </div>
        </div>
        <div class="badges">
          ${latest}
          ${prerelease}
        </div>
      </div>
      <div class="actions">
        <a class="primary" href="${escapeHtml(url)}">Открыть релиз</a>
      </div>
      <div class="assets">
        <div class="section-title">Файлы</div>
        <ul>${assetsHtml}</ul>
      </div>
      ${notesBlock}
    </article>
  `;
}

function buildHtml(releases) {
  const sorted = releases
    .filter((r) => r && !r.draft)
    .sort((a, b) => {
      const aDate = Date.parse(a.published_at || a.created_at || 0);
      const bDate = Date.parse(b.published_at || b.created_at || 0);
      return bDate - aDate;
    });
  const cards = sorted.length
    ? sorted.map((r, i) => renderReleaseCard(r, i, i === 0)).join('')
    : '<div class="empty">Релизов пока нет.</div>';
  const updated = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GmAccess Релизы</title>
    <meta name="description" content="Ссылки на загрузку и история релизов GmAccess." />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');
      :root {
        --bg-1: #f4efe6;
        --bg-2: #d7ece2;
        --bg-3: #f8f4fb;
        --ink: #1b1b1b;
        --muted: #5f6b6a;
        --accent: #0f766e;
        --accent-2: #f97316;
        --card: rgba(255, 255, 255, 0.9);
        --shadow: 0 24px 60px rgba(16, 24, 40, 0.12);
        --border: rgba(15, 23, 42, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Manrope", "IBM Plex Sans", sans-serif;
        color: var(--ink);
        background: radial-gradient(circle at 10% 20%, var(--bg-2), transparent 55%),
                    radial-gradient(circle at 90% 0%, var(--bg-3), transparent 45%),
                    linear-gradient(160deg, var(--bg-1), #ffffff);
        min-height: 100vh;
      }
      header {
        padding: 56px 10vw 24px;
        display: grid;
        gap: 12px;
      }
      header h1 {
        margin: 0;
        font-size: clamp(2rem, 3vw, 3.3rem);
        letter-spacing: -0.02em;
      }
      header p {
        margin: 0;
        font-size: 1.05rem;
        color: var(--muted);
        max-width: 720px;
      }
      main {
        padding: 0 10vw 64px;
      }
      .grid {
        display: grid;
        gap: 24px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 24px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
        animation: rise 600ms ease both;
        animation-delay: calc(var(--i) * 60ms);
      }
      .card-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0 0 6px 0;
        font-size: 1.6rem;
      }
      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .tag {
        padding: 2px 10px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--accent);
        font-weight: 600;
      }
      .badges {
        display: flex;
        gap: 8px;
      }
      .badge {
        background: var(--accent);
        color: #fff;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .badge.subtle {
        background: rgba(249, 115, 22, 0.16);
        color: var(--accent-2);
      }
      .actions {
        margin: 18px 0 10px;
      }
      .primary {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--accent);
        color: #fff;
        padding: 10px 16px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 600;
        box-shadow: 0 12px 24px rgba(15, 118, 110, 0.2);
      }
      .assets {
        margin-top: 8px;
      }
      .section-title {
        font-weight: 600;
        margin-bottom: 8px;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }
      li {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 8px 12px;
        background: rgba(15, 23, 42, 0.04);
        border-radius: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      li a {
        color: var(--ink);
        text-decoration: none;
        font-weight: 600;
      }
      .notes {
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.5;
      }
      details summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--accent);
      }
      .muted {
        color: var(--muted);
      }
      footer {
        padding: 24px 10vw 48px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .empty {
        padding: 32px;
        background: var(--card);
        border-radius: 18px;
        border: 1px dashed var(--border);
      }
      @keyframes rise {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 720px) {
        header, main, footer { padding-left: 6vw; padding-right: 6vw; }
        li { flex-direction: column; align-items: flex-start; }
        .card-head { flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>GmAccess Релизы</h1>
      <p>Актуальные сборки, заметки об изменениях и прямые ссылки на загрузку по каждому релизу.</p>
    </header>
    <main>
      <div class="grid">
        ${cards}
      </div>
    </main>
    <footer>
      Обновлено ${escapeHtml(updated)} · Источник: GitHub Releases
    </footer>
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
