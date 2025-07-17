import fetch from 'node-fetch';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY!;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET!;
const SHIPSTATION_API_BASE = 'https://ssapi.shipstation.com';

function getAuthHeader() {
  const creds = Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64');
  return `Basic ${creds}`;
}

// Helper to fetch a product by SKU
async function getShipStationProductBySku(sku: string) {
  const url = `${SHIPSTATION_API_BASE}/products?sku=${encodeURIComponent(sku)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ShipStation API error (get product): ${res.status} ${res.statusText} - ${errorText}`);
  }
  const data = await res.json();
  if (!data.products || !data.products.length) {
    throw new Error(`No ShipStation product found for SKU: ${sku}`);
  }
  return data.products[0];
}

export async function updateShipStationWarehouseLocation(sku: string, bin: string) {
  // 1. Fetch product by SKU to get productId and full product object
  const product = await getShipStationProductBySku(sku);
  const productId = product.productId;
  // 2. Update warehouseLocation in the product object
  const updatedProduct = { ...product, warehouseLocation: bin };
  // 3. PUT to /products/{productId} with the full product object
  const url = `${SHIPSTATION_API_BASE}/products/${productId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(updatedProduct),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ShipStation API error (update product): ${res.status} ${res.statusText} - ${errorText}`);
  }
  return await res.json();
} 