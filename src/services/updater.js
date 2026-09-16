/**
 * Digital Bestie — Update Service
 * Checks GitHub Releases API for new versions, parses release assets,
 * and performs semantic version comparisons with support for both public
 * and private GitHub repositories.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { execSync } from 'node:child_process';

const GITHUB_REPO = 'hawkeyeip/digital-bestie';

/**
 * Compare two semantic version strings (e.g., '2.1.0' vs '2.0.0').
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1, v2) {
  const clean = (v) => {
    if (!v) return [0, 0, 0];
    const stripped = String(v).replace(/^v/i, '').split('-')[0];
    return stripped.split('.').map((n) => parseInt(n, 10) || 0);
  };

  const [maj1, min1, pat1] = clean(v1);
  const [maj2, min2, pat2] = clean(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

/**
 * Attempt to acquire a GitHub token from environment, user settings, or local `gh` CLI.
 */
function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();

  try {
    const settingsPath = path.join(os.homedir(), '.digital-bestie', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(raw);
      if (settings && settings.github_token) {
        return String(settings.github_token).trim();
      }
    }
  } catch {
    // Ignore settings read errors
  }

  try {
    const token = execSync('gh auth token 2>/dev/null', { encoding: 'utf8', timeout: 2000 }).trim();
    if (token) return token;
  } catch {
    // gh not available or not logged in
  }

  return null;
}

/**
 * Fetch latest release information from GitHub Releases API.
 */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const token = getGitHubToken();
    const headers = {
      'User-Agent': 'Digital-Bestie-App',
      'Accept': 'application/vnd.github.v3+json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Failed to parse release JSON: ${err.message}`));
          }
        } else if (res.statusCode === 404) {
          if (!token) {
            reject(new Error('Repository release not found or repository is private. Set GITHUB_TOKEN or run "gh auth login" to enable updates.'));
          } else {
            resolve(null);
          }
        } else {
          reject(new Error(`GitHub API responded with status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Connection timed out while checking for updates'));
    });

    req.end();
  });
}

/**
 * Pick the most suitable installer or distributable asset for the current OS/architecture.
 */
function selectAssetForPlatform(assets) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const platform = process.platform; // 'darwin', 'win32', 'linux'
  const arch = process.arch;         // 'arm64', 'x64'

  // macOS
  if (platform === 'darwin') {
    // Look for DMG first, then arm64 zip, then general zip
    const dmg = assets.find((a) => a.name.endsWith('.dmg'));
    if (dmg) return dmg;

    if (arch === 'arm64') {
      const armZip = assets.find((a) => a.name.toLowerCase().includes('arm64') && a.name.endsWith('.zip'));
      if (armZip) return armZip;
    }

    const macZip = assets.find((a) => (a.name.toLowerCase().includes('mac') || a.name.toLowerCase().includes('darwin')) && a.name.endsWith('.zip'));
    if (macZip) return macZip;

    return assets.find((a) => a.name.endsWith('.zip')) || assets[0];
  }

  // Windows
  if (platform === 'win32') {
    const exe = assets.find((a) => a.name.endsWith('.exe'));
    if (exe) return exe;
    return assets.find((a) => a.name.endsWith('.zip')) || assets[0];
  }

  // Linux
  if (platform === 'linux') {
    const deb = assets.find((a) => a.name.endsWith('.deb'));
    if (deb) return deb;
    const rpm = assets.find((a) => a.name.endsWith('.rpm'));
    if (rpm) return rpm;
    return assets.find((a) => a.name.endsWith('.AppImage')) || assets[0];
  }

  return assets[0];
}

/**
 * Check for updates by comparing currentVersion against latest GitHub Release.
 *
 * @param {string} currentVersion - e.g. '2.0.0'
 * @returns {Promise<Object>}
 */
export async function checkForUpdates(currentVersion) {
  try {
    const release = await fetchLatestRelease();

    if (!release) {
      return {
        success: true,
        updateAvailable: false,
        currentVersion,
        message: 'No published releases found.',
      };
    }

    const latestTag = release.tag_name || '';
    const latestClean = latestTag.replace(/^v/i, '');
    const isNewer = compareSemver(latestClean, currentVersion) > 0;
    const asset = selectAssetForPlatform(release.assets);

    return {
      success: true,
      updateAvailable: isNewer,
      currentVersion,
      latestVersion: latestTag,
      name: release.name || latestTag,
      releaseNotes: release.body || '',
      releaseUrl: release.html_url,
      downloadUrl: asset?.browser_download_url || release.html_url,
      assetName: asset?.name || null,
      publishedAt: release.published_at,
    };
  } catch (error) {
    return {
      success: false,
      updateAvailable: false,
      currentVersion,
      error: error.message || 'Unknown network error',
    };
  }
}
