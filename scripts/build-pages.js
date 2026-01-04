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
  const winAsset = findAssetByPatterns(assets, [/\.exe$/, /\.msi$/, /win/]);
  const macAsset = findAssetByPatterns(assets, [/\.dmg$/, /\.pkg$/, /mac|osx|darwin/]);
  return {
    windows: winAsset ? winAsset.browser_download_url : null,
    macos: macAsset ? macAsset.browser_download_url : null,
  };
}

function normalizeVersionLabel(tag) {
  if (!tag) return '';
  const raw = String(tag).trim();
  if (!raw) return '';
  return /^v/i.test(raw) ? raw : `v${raw}`;
}

function buildHtml(latest) {
  const links = resolveDownloadLinks(latest);
  const versionLabel = normalizeVersionLabel(latest && (latest.tag_name || latest.name));
  const versionText = versionLabel ? `${versionLabel} • Latest Release` : 'Релиз не найден';
  const winClass = links.windows ? '' : ' disabled';
  const macClass = links.macos ? '' : ' disabled';
  const winHref = links.windows || '#';
  const macHref = links.macos || '#';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GMAccess - Download</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --bg-primary: #1a1625;
            --bg-secondary: #221d2e;
            --accent-blue: #7dd3fc;
            --accent-purple: #a78bfa;
            --accent-pink: #e879f9;
            --text-primary: #ffffff;
            --text-secondary: #a1a1aa;
        }

        body {
            min-height: 100vh;
            background: var(--bg-primary);
            font-family: 'Outfit', sans-serif;
            color: var(--text-primary);
            overflow-x: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Animated background */
        .bg-gradient {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            overflow: hidden;
            background: linear-gradient(135deg, 
                rgba(125, 211, 252, 0.1) 0%, 
                rgba(167, 139, 250, 0.15) 50%, 
                rgba(232, 121, 249, 0.1) 100%);
        }

        .bg-gradient::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: 
                radial-gradient(ellipse at 20% 30%, rgba(167, 139, 250, 0.2) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 70%, rgba(125, 211, 252, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(232, 121, 249, 0.1) 0%, transparent 60%);
            animation: bgPulse 15s ease-in-out infinite;
        }

        @keyframes bgPulse {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            33% { transform: translate(2%, 3%) rotate(1deg); }
            66% { transform: translate(-2%, -1%) rotate(-1deg); }
        }

        /* Grid pattern */
        .grid-pattern {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(167, 139, 250, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(167, 139, 250, 0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            z-index: 1;
        }

        /* Floating orbs */
        .orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.6;
            z-index: 0;
            animation: float 20s ease-in-out infinite;
        }

        .orb-1 {
            width: 400px;
            height: 400px;
            background: var(--accent-purple);
            top: -100px;
            right: -100px;
            animation-delay: 0s;
        }

        .orb-2 {
            width: 300px;
            height: 300px;
            background: var(--accent-blue);
            bottom: -80px;
            left: -80px;
            animation-delay: -5s;
        }

        .orb-3 {
            width: 200px;
            height: 200px;
            background: var(--accent-pink);
            top: 50%;
            left: 50%;
            animation-delay: -10s;
        }

        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(30px, -30px) scale(1.05); }
            50% { transform: translate(-20px, 20px) scale(0.95); }
            75% { transform: translate(20px, 10px) scale(1.02); }
        }

        /* Main container */
        .container {
            position: relative;
            z-index: 10;
            text-align: center;
            padding: 40px;
        }

        /* Logo */
        .logo-container {
            margin-bottom: 20px;
            animation: fadeInDown 1s ease-out;
        }

        .logo {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100px;
            height: 100px;
            background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple), var(--accent-pink));
            border-radius: 24px;
            font-family: 'Space Mono', monospace;
            font-size: 32px;
            font-weight: 700;
            color: white;
            box-shadow: 
                0 0 60px rgba(167, 139, 250, 0.4),
                0 0 100px rgba(232, 121, 249, 0.2);
            position: relative;
            overflow: hidden;
        }

        .logo::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(
                45deg,
                transparent,
                rgba(255, 255, 255, 0.15),
                transparent
            );
            animation: shine 3s ease-in-out infinite;
        }

        @keyframes shine {
            0% { transform: translateX(-100%) rotate(45deg); }
            100% { transform: translateX(100%) rotate(45deg); }
        }

        /* Title */
        .title {
            font-size: clamp(3rem, 10vw, 5rem);
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 16px;
            background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: fadeInUp 1s ease-out 0.2s both;
        }

        .title span {
            background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
            -webkit-background-clip: text;
            background-clip: text;
        }

        /* Subtitle */
        .subtitle {
            font-size: 1.25rem;
            color: var(--text-secondary);
            margin-bottom: 60px;
            font-weight: 300;
            letter-spacing: 0.05em;
            animation: fadeInUp 1s ease-out 0.4s both;
        }

        /* Buttons container */
        .buttons {
            display: flex;
            gap: 24px;
            justify-content: center;
            flex-wrap: wrap;
            animation: fadeInUp 1s ease-out 0.6s both;
        }

        /* Download button */
        .btn {
            position: relative;
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 20px 40px;
            font-family: 'Outfit', sans-serif;
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 999px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            overflow: hidden;
            backdrop-filter: blur(10px);
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, transparent, rgba(255,255,255,0.05), transparent);
            transform: translateX(-100%);
            transition: transform 0.6s ease;
        }

        .btn:hover::before {
            transform: translateX(100%);
        }

        .btn:hover {
            transform: translateY(-4px);
            border-color: rgba(255, 255, 255, 0.2);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .btn.disabled {
            opacity: 0.5;
            pointer-events: none;
        }

        /* Windows button */
        .btn-win {
            --btn-accent: var(--accent-blue);
        }

        .btn-win:hover {
            background: linear-gradient(135deg, rgba(125, 211, 252, 0.2), rgba(125, 211, 252, 0.05));
            border-color: var(--accent-blue);
            box-shadow: 
                0 20px 40px rgba(0, 0, 0, 0.3),
                0 0 30px rgba(125, 211, 252, 0.3);
        }

        /* Mac button */
        .btn-mac {
            --btn-accent: var(--accent-pink);
        }

        .btn-mac:hover {
            background: linear-gradient(135deg, rgba(232, 121, 249, 0.2), rgba(232, 121, 249, 0.05));
            border-color: var(--accent-pink);
            box-shadow: 
                0 20px 40px rgba(0, 0, 0, 0.3),
                0 0 30px rgba(232, 121, 249, 0.3);
        }

        /* Icons */
        .btn-icon {
            width: 28px;
            height: 28px;
            transition: transform 0.3s ease;
        }

        .btn:hover .btn-icon {
            transform: scale(1.15);
        }

        /* Button text */
        .btn-text {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            line-height: 1.2;
        }

        .btn-label {
            font-size: 0.75rem;
            font-weight: 400;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .btn-platform {
            font-size: 1.2rem;
            font-weight: 600;
        }

        /* Version badge */
        .version {
            margin-top: 40px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 100px;
            font-family: 'Space Mono', monospace;
            font-size: 0.85rem;
            color: var(--text-secondary);
            animation: fadeInUp 1s ease-out 0.8s both;
        }

        .version-dot {
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* Animations */
        @keyframes fadeInDown {
            from {
                opacity: 0;
                transform: translateY(-30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Responsive */
        @media (max-width: 600px) {
            .buttons {
                flex-direction: column;
                align-items: center;
            }

            .btn {
                width: 100%;
                max-width: 280px;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>
    <div class="grid-pattern"></div>
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>

    <div class="container">
        <div class="logo-container">
            <div class="logo">GM</div>
        </div>
        
        <h1 class="title">Gm<span>Access</span></h1>
        <p class="subtitle">Загрузите приложение для вашей платформы</p>

        <div class="buttons">
            <a href="${escapeHtml(winHref)}" class="btn btn-win${winClass}" aria-disabled="${links.windows ? 'false' : 'true'}">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                </svg>
                <div class="btn-text">
                    <span class="btn-label">Скачать для</span>
                    <span class="btn-platform">Windows</span>
                </div>
            </a>

            <a href="${escapeHtml(macHref)}" class="btn btn-mac${macClass}" aria-disabled="${links.macos ? 'false' : 'true'}">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div class="btn-text">
                    <span class="btn-label">Скачать для</span>
                    <span class="btn-platform">macOS</span>
                </div>
            </a>
        </div>

        <div class="version">
            <span class="version-dot"></span>
            ${escapeHtml(versionText)}
        </div>
    </div>
</body>
</html>`;
}

async function main() {
  const releases = await fetchReleases();
  const latest = pickLatestRelease(releases);
  const html = buildHtml(latest);
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
