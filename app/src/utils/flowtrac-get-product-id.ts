import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import axios from 'axios';
import qs from 'qs';

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;

async function main() {
  const sku = 'IC-BIGS-009';
  // 1. Authenticate
  const loginRes = await axios.post(
    `${FLOWTRAC_API_URL}/device-login/`,
    qs.stringify({ badge: FLOWTRAC_BADGE, pin: FLOWTRAC_PIN }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, withCredentials: true }
  );
  const cookies = loginRes.headers['set-cookie'];
  if (!cookies) throw new Error('No session cookie from Flowtrac login');
  const flowAuthCookie = cookies.find((c: string) => c.startsWith('flow_auth='));
  if (!flowAuthCookie) throw new Error('No flow_auth cookie from Flowtrac login');

  // 2. Fetch all products
  const productsRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
    headers: { Cookie: flowAuthCookie },
    withCredentials: true,
  });
  const products = productsRes.data;

  // 3. Find the product with the given SKU
  const match = products.find((p: any) => p.product === sku || p.barcode === sku);
  if (match) {
    console.log('Found product:', match);
    console.log('Product ID:', match.product_id);
  } else {
    console.log(`No product found with SKU or barcode '${sku}'.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 