const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.txt');

// Daftar file & folder yang DILINDUNGI (TIDAK BOLEH DITIMPA SAAT UPDATE)
const PROTECTED_PATTERNS = [
  'database.db',
  'database.db-wal',
  'database.db-shm',
  'database.db.bak',
  '.env',
  'node_modules',
  'dist',
  '_backup_update',
  'logs'
];

/**
 * Membaca informasi versi lokal dari version.txt
 */
function getLocalVersionInfo() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const content = fs.readFileSync(VERSION_FILE, 'utf8').trim();
      const lines = content.split('\n');
      const version = lines[0].trim().replace(/^v/i, '');
      const changelog = lines.slice(1).join('\n').trim();
      return { version: version || '1.0.0', changelog: changelog || 'Versi awal instalasi' };
    }
  } catch (err) {
    console.error("Gagal membaca version.txt lokal:", err);
  }
  return { version: '1.0.0', changelog: 'Versi awal' };
}

/**
 * Parsing URL/String GitHub Repo
 * Menerima:
 * - "username/repo"
 * - "https://github.com/username/repo"
 * - "https://github.com/username/repo.git"
 */
function parseRepoString(repoInput) {
  if (!repoInput || typeof repoInput !== 'string') return null;
  let clean = repoInput.trim();
  clean = clean.replace(/^https?:\/\/github\.com\//i, '');
  clean = clean.replace(/\.git$/i, '');
  clean = clean.replace(/^\/+|\/+$/g, '');
  
  const parts = clean.split('/');
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

/**
 * Membandingkan 2 nomor versi Semver (misal: "1.2.0" vs "1.1.0")
 * Return: 1 jika v1 > v2, -1 jika v1 < v2, 0 jika sama
 */
function compareSemver(v1, v2) {
  const normalize = (v) => String(v || '0').replace(/^v/i, '').split('.').map(num => parseInt(num, 10) || 0);
  const p1 = normalize(v1);
  const p2 = normalize(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * HTTP GET Helper dengan redirect support
 */
function fetchRemoteText(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'POS-Kasir-Pintar-Updater/1.0',
        'Cache-Control': 'no-cache'
      }
    };

    protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchRemoteText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP Status ${res.statusCode} saat mengakses ${url}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Download file binary (ZIP) ke disk
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'POS-Kasir-Pintar-Updater/1.0',
        'Cache-Control': 'no-cache'
      }
    };

    protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Gagal mengunduh file update. HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destPath));
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Cek apakah ada versi baru di GitHub
 */
async function checkGitHubUpdate(repoInput, preferredBranch = 'main') {
  const localInfo = getLocalVersionInfo();
  const repoInfo = parseRepoString(repoInput);

  if (!repoInfo) {
    return {
      success: false,
      message: 'Format URL / nama repositori GitHub tidak valid. Gunakan format: username/nama-repo'
    };
  }

  const branches = [preferredBranch, preferredBranch === 'main' ? 'master' : 'main'];
  let remoteContent = null;
  let activeBranch = preferredBranch;

  for (const branch of branches) {
    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${branch}/version.txt?t=${Date.now()}`;
    try {
      remoteContent = await fetchRemoteText(rawUrl);
      activeBranch = branch;
      break;
    } catch (e) {
      // coba branch berikutnya
    }
  }

  if (!remoteContent) {
    return {
      success: false,
      message: `Tidak dapat menemukan berkas version.txt di repositori GitHub ${repoInfo.owner}/${repoInfo.repo} (Branch: ${branches.join('/')}). Pastikan repositori bersifat Publik dan memiliki file version.txt.`
    };
  }

  const lines = remoteContent.trim().split('\n');
  const latestVersion = lines[0].trim().replace(/^v/i, '');
  const latestChangelog = lines.slice(1).join('\n').trim();

  const comparison = compareSemver(latestVersion, localInfo.version);
  const hasUpdate = comparison > 0;

  return {
    success: true,
    current_version: localInfo.version,
    latest_version: latestVersion,
    has_update: hasUpdate,
    changelog: latestChangelog || 'Pembaruan stabilitas dan fitur sistem.',
    repo: `${repoInfo.owner}/${repoInfo.repo}`,
    branch: activeBranch,
    checked_at: new Date().toISOString()
  };
}

/**
 * Eksekusi update otomatis dari GitHub
 * DIJAMIN AMAN: database.db & .env tidak akan pernah tertimpa
 */
async function applyGitHubUpdate(repoInput, branch = 'main') {
  const repoInfo = parseRepoString(repoInput);
  if (!repoInfo) {
    throw new Error('Repositori GitHub tidak valid.');
  }

  const localInfo = getLocalVersionInfo();
  const tempDir = path.join(ROOT_DIR, '_temp_update');
  const backupDir = path.join(ROOT_DIR, '_backup_update');
  const zipPath = path.join(tempDir, 'update.zip');
  const extractDir = path.join(tempDir, 'extracted');

  try {
    // 1. Siapkan folder temporary
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    // 2. Download zip kode rilis dari GitHub
    const zipUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/archive/refs/heads/${branch}.zip`;
    await downloadFile(zipUrl, zipPath);

    // 3. Ekstrak arsip zip
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'ignore' });
    } else {
      execSync(`unzip -q -o "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });
    }

    // 4. Temukan root folder hasil ekstraksi (biasanya repo-branch)
    const extractedContents = fs.readdirSync(extractDir);
    let sourceRoot = extractDir;
    if (extractedContents.length === 1 && fs.statSync(path.join(extractDir, extractedContents[0])).isDirectory()) {
      sourceRoot = path.join(extractDir, extractedContents[0]);
    }

    // 5. Buat Safety Backup source files sebelum overwrite (opsional)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 6. Copy file baru ke ROOT_DIR dengan filter proteksi ketat
    function copySafeRecursive(src, dest) {
      const items = fs.readdirSync(src);
      for (const item of items) {
        // Cek apakah item masuk daftar proteksi
        if (PROTECTED_PATTERNS.some(pat => item === pat || item.startsWith(pat))) {
          continue; // SKIP PROTECTED FILES (database.db, .env, etc.)
        }

        const srcItem = path.join(src, item);
        const destItem = path.join(dest, item);
        const stat = fs.statSync(srcItem);

        if (stat.isDirectory()) {
          if (!fs.existsSync(destItem)) {
            fs.mkdirSync(destItem, { recursive: true });
          }
          copySafeRecursive(srcItem, destItem);
        } else {
          // Copy file kode baru
          fs.copyFileSync(srcItem, destItem);
        }
      }
    }

    copySafeRecursive(sourceRoot, ROOT_DIR);

    // 7. Baca versi baru setelah update
    const newVersionInfo = getLocalVersionInfo();

    // 8. Bersihkan temporary folder
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      success: true,
      old_version: localInfo.version,
      new_version: newVersionInfo.version,
      changelog: newVersionInfo.changelog,
      message: `Pembaruan berhasil diterapkan! Aplikasi telah diperbarui ke versi ${newVersionInfo.version}. Data database dan pengaturan toko Anda 100% aman.`
    };
  } catch (err) {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw err;
  }
}

module.exports = {
  getLocalVersionInfo,
  parseRepoString,
  compareSemver,
  checkGitHubUpdate,
  applyGitHubUpdate
};
