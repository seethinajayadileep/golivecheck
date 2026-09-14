import http from "node:http";

const PRODUCTS = [
  {
    id: "1",
    name: "Canvas tote",
    price: 24,
    alt: "Tan canvas tote bag",
    desc: "A sturdy everyday tote.",
  },
  {
    id: "2",
    name: "Wool beanie",
    price: 18,
    alt: "Navy wool beanie",
    desc: "Warm knit hat.",
  },
];

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

function svgDataUri(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect fill="#e8e0d4" width="240" height="160"/><text x="50%" y="50%" text-anchor="middle" fill="#4a4036" font-size="18" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Demo shop</title>
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 2rem auto; color: #222; }
    a { color: #116329; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .card { border: 1px solid #ddd; padding: 1rem; }
    img { width: 100%; height: auto; }
    button, .button { background: #116329; color: #fff; border: 0; padding: 0.6rem 1rem; cursor: pointer; text-decoration: none; display: inline-block; }
  </style>
</head>
<body>
  <header>
    <p><a href="/">Demo shop</a> · <a href="/cart">Cart</a></p>
    <h1>${title}</h1>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

function homePage() {
  const cards = PRODUCTS.map(
    (p) => `<article class="card">
      <a class="product-link" href="/product/${p.id}">
        <img src="${svgDataUri(p.name)}" alt="${p.alt}">
        <h2>${p.name}</h2>
      </a>
      <p>$${p.price}</p>
    </article>`,
  ).join("");
  return layout("Products", `<div class="grid">${cards}</div>`);
}

function productPage(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return null;
  return layout(
    p.name,
    `<img src="${svgDataUri(p.name)}" alt="${p.alt}">
     <p>${p.desc}</p>
     <p>$${p.price}</p>
     <p><a class="button" id="add-to-cart" href="/cart?add=${p.id}">Add to cart</a></p>`,
  );
}

function cartPage(ids) {
  const items = ids
    .map((id) => PRODUCTS.find((p) => p.id === id))
    .filter(Boolean);
  const list =
    items.length === 0
      ? "<p>Cart is empty.</p>"
      : `<ul id="cart-items">${items.map((p) => `<li>${p.name} — $${p.price}</li>`).join("")}</ul>`;
  return layout("Cart", list);
}

function applyHeaders(res, contentType) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader("Content-Type", contentType);
}

export function startDemoShop(port = 4173, host = "127.0.0.1") {
  const cart = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);
    const pathname = url.pathname;

    if (pathname === "/.env" || pathname === "/.git/HEAD") {
      applyHeaders(res, "text/plain");
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    if (pathname === "/api/products") {
      applyHeaders(res, "application/json; charset=utf-8");
      res.end(JSON.stringify({ products: PRODUCTS.map(({ id, name, price }) => ({ id, name, price })) }));
      return;
    }

    if (pathname === "/") {
      applyHeaders(res, "text/html; charset=utf-8");
      res.end(homePage());
      return;
    }

    const productMatch = pathname.match(/^\/product\/([^/]+)$/);
    if (productMatch) {
      const html = productPage(productMatch[1]);
      if (!html) {
        applyHeaders(res, "text/plain");
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      applyHeaders(res, "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    if (pathname === "/cart") {
      const add = url.searchParams.get("add");
      if (add && PRODUCTS.some((p) => p.id === add) && !cart.includes(add)) cart.push(add);
      applyHeaders(res, "text/html; charset=utf-8");
      res.end(cartPage(cart));
      return;
    }

    applyHeaders(res, "text/plain");
    res.statusCode = 404;
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("server.mjs");
if (isMain) {
  const port = Number(process.env.PORT || 4173);
  const shop = await startDemoShop(port);
  console.log(`Demo shop ${shop.url}`);
}
