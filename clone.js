import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const START_URLS = [
  'https://www.emissionimpossible.net',
  'https://www.emissionimpossible.net/it',
  'https://www.emissionimpossible.net/pt',
  'https://www.emissionimpossible.net/es'
];

const BASE_HOST = 'www.emissionimpossible.net';
const SITE_DIR = './site';
const IMG_DIR = './site/images';
fs.mkdirSync(IMG_DIR, { recursive: true });

const visited = new Set();
const queue = [...START_URLS];
const imageUrlToLocalPath = new Map(); // URL completo immagine -> percorso relativo
const imageIdToLocalPath = new Map();   // ID immagine -> percorso relativo

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox']
});

function urlToLocalPath(urlString) {
  const url = new URL(urlString);
  let pathname = url.pathname;
  
  if (pathname === '/' || pathname === '') {
    return 'index.html';
  }
  
  pathname = pathname.replace(/\/$/, '');
  return path.join(pathname.slice(1), 'index.html');
}

function getImageRelativePath(pageUrl, imageFilename) {
  const pageLocalPath = urlToLocalPath(pageUrl);
  const pageDir = path.dirname(pageLocalPath);
  
  // Calcola quanti livelli di profondità ha la pagina
  const depth = pageDir === '.' ? 0 : pageDir.split(path.sep).length;
  
  // Costruisci il percorso relativo alle immagini
  const relativePath = '../'.repeat(depth) + 'images/' + imageFilename;
  
  return relativePath;
}

async function scrapePage(pageUrl) {
  if (visited.has(pageUrl)) return;
  visited.add(pageUrl);
  console.log('Visiting:', pageUrl);

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  const pageImageMap = new Map(); // URL originale -> { buffer, filename }

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('wixstatic.com/media')) {
      try {
        const buffer = await response.buffer();
        if (buffer.length > 1000) {
          // Estrai l'ID completo dell'immagine (es. b96263_84f7b769451144edbd5dc3dc67d17611)
          const match = url.match(/\/media\/([a-f0-9]+_[a-f0-9]+)/);
          if (match) {
            const imageId = match[1];
            const filename = `${imageId}.png`;
            
            // Salva se non esiste già o se questa versione è più grande
            if (!pageImageMap.has(url) || buffer.length > pageImageMap.get(url).buffer.length) {
              pageImageMap.set(url, { buffer, filename, imageId });
              
              // Salva fisicamente l'immagine
              const dest = path.join(IMG_DIR, filename);
              if (!fs.existsSync(dest)) {
                fs.writeFileSync(dest, buffer);
                console.log(`  Saved image: ${filename}`);
              }
            }
          }
        }
      } catch (_) {}
    }
  });

  await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Scroll per caricare lazy loading
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  await new Promise(r => setTimeout(r, 3000));

  // Raccogli link interni
  const links = await page.evaluate((host) => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(href => {
        try {
          const u = new URL(href);
          return u.host === host && 
                 !href.includes('#') && 
                 !href.includes('?') &&
                 u.pathname !== '/_api/';
        } catch (_) { return false; }
      });
  }, BASE_HOST);

  for (const link of links) {
    const clean = link.replace(/\/$/, '');
    if (!visited.has(clean)) {
      queue.push(clean);
    }
  }

  // Prepara mappa URL immagine -> percorso relativo per questa pagina
  const localImageMap = new Map();
  for (const [imageUrl, { filename, imageId }] of pageImageMap) {
    const relativePath = getImageRelativePath(pageUrl, filename);
    localImageMap.set(imageUrl, relativePath);
    imageUrlToLocalPath.set(imageUrl, relativePath);
    imageIdToLocalPath.set(imageId, relativePath);
  }

  // Ottieni HTML
  let html = await page.content();
  
  // SOSTITUZIONI IMMAGINI - Ordine importante!
  
  // 1. Sostituisci URL completi nelle immagini (src, srcset, data-src, ecc.)
  for (const [imageUrl, localPath] of localImageMap) {
    // Escaping per regex
    const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Sostituisci in src
    const srcRegex = new RegExp(`src=["']${escapedUrl}["']`, 'g');
    html = html.replace(srcRegex, `src="${localPath}"`);
    
    // Sostituisci in srcset (pattern più complesso)
    const srcsetRegex = new RegExp(`${escapedUrl}\\s+[0-9]+w`, 'g');
    html = html.replace(srcsetRegex, `${localPath}`);
    
    // Sostituisci in data-src (lazy loading)
    const dataSrcRegex = new RegExp(`data-src=["']${escapedUrl}["']`, 'g');
    html = html.replace(dataSrcRegex, `data-src="${localPath}"`);
    
    // Sostituisci in data-image-url
    const dataImageRegex = new RegExp(`data-image-url=["']${escapedUrl}["']`, 'g');
    html = html.replace(dataImageRegex, `data-image-url="${localPath}"`);
    
    // Sostituisci in href (se usato come link a immagine)
    const hrefRegex = new RegExp(`href=["']${escapedUrl}["']`, 'g');
    html = html.replace(hrefRegex, `href="${localPath}"`);
    
    // Sostituisci in background-image: url(...)
    const bgRegex = new RegExp(`url\\(["']?${escapedUrl}["']?\\)`, 'g');
    html = html.replace(bgRegex, `url("${localPath}")`);
  }
  
  // 2. Sostituisci pattern generici di Wix static URLs (per quelle non catturate)
  // Pattern per URL Wix statiche
  const wixStaticPatterns = [
    /https?:\/\/static\.wixstatic\.com\/media\/[a-f0-9]+_[a-f0-9]+[^"')\s]*/g,
    /https?:\/\/static\.parastorage\.com\/services\/[^"')\s]+\.(png|jpg|jpeg|gif|webp|svg)/gi,
    /https?:\/\/static\.parastorage\.com\/media\/[^"')\s]+\.(png|jpg|jpeg|gif|webp|svg)/gi
  ];
  
  for (const pattern of wixStaticPatterns) {
    html = html.replace(pattern, (match) => {
      // Prova a trovare un mapping per questo URL
      if (imageUrlToLocalPath.has(match)) {
        return imageUrlToLocalPath.get(match);
      }
      
      // Prova a estrarre l'ID e cercare per ID
      const idMatch = match.match(/[a-f0-9]+_[a-f0-9]+/);
      if (idMatch && imageIdToLocalPath.has(idMatch[0])) {
        return imageIdToLocalPath.get(idMatch[0]);
      }
      
      // Se non trovato, lascia l'URL originale (potrebbe essere un'icona o risorsa esterna)
      return match;
    });
  }
  
  // 3. Modifica link interni delle anchor
  const allLinks = await page.evaluate((host) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors.map(a => a.href)
      .filter(href => {
        try {
          const u = new URL(href);
          return u.host === host;
        } catch { return false; }
      });
  }, BASE_HOST);

  // Rimuovi duplicati dai link
  const uniqueLinks = [...new Set(allLinks)];
  
  for (const targetUrl of uniqueLinks) {
    if (targetUrl && targetUrl !== pageUrl) {
      const targetClean = targetUrl.replace(/\/$/, '');
      const targetLocalPath = urlToLocalPath(targetClean);
      const currentLocalPath = urlToLocalPath(pageUrl);
      
      // Calcola percorso relativo
      const currentDir = path.dirname(currentLocalPath);
      let relativePath = path.relative(currentDir, targetLocalPath);
      
      // Assicura che inizi con ./
      if (!relativePath.startsWith('.')) {
        relativePath = './' + relativePath;
      }
      
      // Sostituisci nella stringa HTML (gestisci sia href che data-href)
      const escapedUrl = targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hrefRegex = new RegExp(`href=["']${escapedUrl}["']`, 'g');
      html = html.replace(hrefRegex, `href="${relativePath}"`);
      
      const dataHrefRegex = new RegExp(`data-href=["']${escapedUrl}["']`, 'g');
      html = html.replace(dataHrefRegex, `data-href="${relativePath}"`);
    }
  }

  // 4. Fix per CSS inline con background-image
  // Pattern per background-image con URL Wix
  const bgImageRegex = /background-image:\s*url\(["']?https?:\/\/[^"')]+\.(png|jpg|jpeg|gif|webp|svg)(?:\?[^"')]*)?["']?\)/gi;
  html = html.replace(bgImageRegex, (match) => {
    // Estrai l'URL
    const urlMatch = match.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch && imageUrlToLocalPath.has(urlMatch[1])) {
      return `background-image: url("${imageUrlToLocalPath.get(urlMatch[1])}")`;
    }
    return match;
  });

  // Salva HTML
  const localPath = urlToLocalPath(pageUrl);
  const pageDir = path.join(SITE_DIR, path.dirname(localPath));
  fs.mkdirSync(pageDir, { recursive: true });
  
  const finalPath = path.join(SITE_DIR, localPath);
  fs.writeFileSync(finalPath, html, 'utf8');
  console.log('Saved:', finalPath);
  console.log('  Images replaced:', localImageMap.size);

  await page.close();
}

// Processa la coda
while (queue.length > 0) {
  const url = queue.shift();
  if (!visited.has(url)) {
    try {
      await scrapePage(url);
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
    }
  }
}

await browser.close();
console.log('Done. Pages scraped:', visited.size);