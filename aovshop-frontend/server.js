import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Use an environment variable for the backend URL, with a fallback
// Strip trailing /api or /api/ if present - env var may include it
const RAW_BACKEND_URL = process.env.BACKEND_URL || 'https://aovshop-backend-qof4.onrender.com';
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/api\/?$/, '');
console.log(`[Config] BACKEND_URL resolved: ${BACKEND_URL} (from env: ${RAW_BACKEND_URL})`);

// Bot User-Agent patterns (Facebook, Zalo, Telegram, Twitter, Discord, etc.)
const BOT_USER_AGENTS = /facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|WhatsApp|Discordbot|ZaloBot|Zalo|bot|crawl|spider|preview/i;

// Resolve product image to absolute URL
// Accepts the full product object to check gallery images as fallback
function resolveProductImage(product) {
    // 1. Try main image field
    if (product.image) {
        if (product.image.startsWith('http')) return product.image;
        return `${BACKEND_URL}/uploads/${product.image}`;
    }
    // 2. Fallback: first gallery image
    if (product.images && product.images.length > 0) {
        const firstImg = product.images[0];
        const url = typeof firstImg === 'string' ? firstImg : firstImg.url;
        if (url) {
            if (url.startsWith('http')) return url;
            return `${BACKEND_URL}/uploads/${url}`;
        }
    }
    // 3. Default fallback
    return 'https://shopregaov.shop/images/hero-bg.png';
}

// Escape HTML special characters for safe injection into meta tags
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Fetch product data from backend API with retry for cold start resilience
async function fetchProduct(productId) {
    const maxRetries = 2;
    const timeoutMs = 8000; // 8s per attempt

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(
                `${BACKEND_URL}/api/shop/products/${productId}`,
                { signal: controller.signal }
            );
            clearTimeout(timer);

            if (!response.ok) {
                console.error(`[OG] Backend returned ${response.status} for product ${productId}`);
                return null;
            }

            const data = await response.json();
            console.log(`[OG] Fetched product #${productId}: image=${data.image || 'null'}, images=${(data.images || []).length}, desc=${data.description ? 'yes' : 'no'}`);
            return data;
        } catch (err) {
            console.error(`[OG] Attempt ${attempt}/${maxRetries} failed for product ${productId}: ${err.message}`);
            if (attempt < maxRetries) {
                // Wait before retry (1s, then 2s)
                await new Promise(r => setTimeout(r, attempt * 1000));
            }
        }
    }
    return null;
}

// Inject dynamic OG meta tags into HTML
function injectOgTags(html, product) {
    const title = escapeHtml(product.name) + ' - AOV Shop';
    // Use product description, strip to 200 chars for meta
    const rawDesc = product.description
        ? product.description.replace(/<[^>]*>/g, '').substring(0, 200)
        : `Mua ${product.name} tại AOV Shop - Uy tín, tự động 100%`;
    const description = escapeHtml(rawDesc);
    const image = resolveProductImage(product);
    const url = `https://shopregaov.shop/products/${product.id}`;
    const price = product.sale_price || product.price;

    // Replace existing OG tags with dynamic ones
    html = html.replace(
        /<meta property="og:title"[^>]*>/,
        `<meta property="og:title" content="${title}" />`
    );
    html = html.replace(
        /<meta property="og:description"[^>]*>/,
        `<meta property="og:description" content="${description}" />`
    );
    html = html.replace(
        /<meta property="og:image"[^>]*>/,
        `<meta property="og:image" content="${image}" />`
    );
    html = html.replace(
        /<meta property="og:url"[^>]*>/,
        `<meta property="og:url" content="${url}" />`
    );
    html = html.replace(
        /<meta property="og:type"[^>]*>/,
        `<meta property="og:type" content="product" />`
    );

    // Replace page title
    html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${title}</title>`
    );

    // Replace meta description
    html = html.replace(
        /<meta name="description"[^>]*>/,
        `<meta name="description" content="${description}" />`
    );

    // Add product price meta (for rich previews)
    const priceMetaTags = `
    <meta property="product:price:amount" content="${price}" />
    <meta property="product:price:currency" content="VND" />`;

    html = html.replace('</head>', `${priceMetaTags}\n</head>`);

    return html;
}

// Health check for cron job ping
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'frontend' });
});

// Proxy /api requests to the backend
app.use('/api', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '/api', // keep /api in the forwarded path
    },
}));

// Proxy /uploads requests to the backend
app.use('/uploads', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
}));

// Serve static files from dist folder with correct charset
app.use(express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        }
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        }
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        }
        // Security headers for in-app browsers (Zalo, Messenger)
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// Handle SPA routing - redirect all routes to index.html
// IMPORTANT: This must be AFTER the /api proxy routes
app.get('*', async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');

    const userAgent = req.headers['user-agent'] || '';
    const productMatch = req.path.match(/^\/products\/(\d+)$/);

    // If a bot is crawling a product page, inject dynamic OG tags
    if (productMatch && BOT_USER_AGENTS.test(userAgent)) {
        const productId = productMatch[1];
        console.log(`[OG] Bot detected: "${userAgent.substring(0, 80)}" requesting product #${productId}`);
        try {
            const product = await fetchProduct(productId);
            if (product) {
                let html = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
                html = injectOgTags(html, product);
                const ogImage = resolveProductImage(product);
                console.log(`[OG] ✅ Served dynamic meta for product #${productId}: image=${ogImage}, desc=${product.description ? 'custom' : 'fallback'}`);
                return res.send(html);
            } else {
                console.error(`[OG] ❌ Failed to fetch product #${productId} - serving static OG tags`);
            }
        } catch (err) {
            console.error(`[OG] ❌ Error serving dynamic meta for product #${productId}:`, err.message);
        }
    }

    // Default: serve static index.html
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend server running on port ${PORT}`);
    console.log(`Proxying /api to ${BACKEND_URL}`);
    console.log(`[OG] Dynamic meta tags enabled for product pages`);
});
