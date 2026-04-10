import fs from 'fs';
import path from 'path';
import https from 'https';
import { URL } from 'url';

const SITE_DIR = './site/www.emissionimpossible.net';
const IMG_DIR = './site/images';
fs.mkdirSync(IMG_DIR, { recursive: true });

function download(url, dest) {
  return new Promise((resolve) => {
    const f = fs.createWriteStream(dest);
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.emissionimpossible.net/'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        download(res.headers.location, dest).then(resolve);
        return;
      }
      res.pipe(f);
      f.on('finish', () => { f.close(); resolve(); });
    }).on('error', (e) => { console.error('Error:', e.message); resolve(); });
  });
}

function walkDir(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walkDir(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const htmlFiles = walkDir(SITE_DIR);
console.log(`Found ${htmlFiles.length} HTML files`);

const urlRegex = /https?:\/\/static\.wixstatic\.com\/media\/[^\s"'<>)]+/g;
const allUrls = new Set();

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(urlRegex) || [];
  for (const m of matches) allUrls.add(m);
}

console.log(`Found ${allUrls.size} unique wixstatic URLs`);

for (const url of allUrls) {
  const u = new URL(url);
  const filename = path.basename(u.pathname).replace(/[^a-zA-Z0-9._-]/g, '_') + '_' + Buffer.from(url).toString('base64').slice(0, 8);
  const dest = path.join(IMG_DIR, filename);
  if (!fs.existsSync(dest)) {
    console.log('Downloading:', url.slice(0, 80));
    await download(url, dest);
  }
  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(url)) {
      content = content.replaceAll(url, `/images/${filename}`);
      fs.writeFileSync(file, content, 'utf8');
    }
  }
}

console.log('Done.');