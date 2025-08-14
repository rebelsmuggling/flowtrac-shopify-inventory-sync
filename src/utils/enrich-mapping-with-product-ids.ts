import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import axios from 'axios';
import qs from 'qs';
import { mappingService } from '../services/mapping';

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;



async function fetchAllFlowtracProducts(flowAuthCookie: string) {
  const productsRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
    headers: { Cookie: flowAuthCookie },
    withCredentials: true,
  });
  return productsRes.data;
}

async function getFlowtracAuthCookie() {
  const loginRes = await axios.post(
    `${FLOWTRAC_API_URL}/device-login/`,
    qs.stringify({ badge: FLOWTRAC_BADGE, pin: FLOWTRAC_PIN }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, withCredentials: true }
  );
  const cookies = loginRes.headers['set-cookie'];
  if (!cookies) throw new Error('No session cookie from Flowtrac login');
  const flowAuthCookie = cookies.find((c: string) => c.startsWith('flow_auth='));
  if (!flowAuthCookie) throw new Error('No flow_auth cookie from Flowtrac login');
  return flowAuthCookie;
}

function updateMappingWithProductIds(mapping: any, skuToProductId: Record<string, string>) {
  let updated = false;
  for (const product of mapping.products) {
    // Simple product
    if (product.flowtrac_sku) {
      const pid = skuToProductId[product.flowtrac_sku];
      if (pid && product.flowtrac_product_id !== pid) {
        product.flowtrac_product_id = pid;
        updated = true;
      }
    }
    // Bundle components
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        const pid = skuToProductId[comp.flowtrac_sku];
        if (pid && comp.flowtrac_product_id !== pid) {
          comp.flowtrac_product_id = pid;
          updated = true;
        }
      }
    }
  }
  return updated;
}

// New function for enriching mapping with Shopify variant and inventory item IDs
export async function enrichMappingWithShopifyVariantAndInventoryIds() {
  try {
    // Get current mapping using the mapping service
    const { mapping, source } = await mappingService.getMapping();
    console.log(`Enriching ${source} mapping data`);

    // Authenticate and fetch all Flowtrac products
    const flowAuthCookie = await getFlowtracAuthCookie();
    const products = await fetchAllFlowtracProducts(flowAuthCookie);

    // Build SKU to product_id map
    const skuToProductId: Record<string, string> = {};
    for (const p of products) {
      if (p.product) skuToProductId[p.product] = p.product_id;
      if (p.barcode) skuToProductId[p.barcode] = p.product_id;
    }

    // Update mapping in-memory
    const updated = updateMappingWithProductIds(mapping, skuToProductId);

    if (updated) {
      // Update mapping using the mapping service
      const result = await mappingService.updateMapping(mapping, 'enrich_product_ids');
      if (result.success) {
        console.log(`Mapping updated with Flowtrac product_ids in ${source}`);
      } else {
        console.error('Failed to update mapping:', result.error);
      }
    } else {
      console.log('No updates needed. All SKUs already have product_ids.');
    }
  } catch (error) {
    console.error('Error enriching mapping:', error);
    throw error;
  }
}

async function main() {
  // 1. Load mapping.json
  const { mapping, source } = await mappingService.getMapping();
    console.log(`Using ${source} mapping data`);

  // 2. Authenticate and fetch all Flowtrac products
  const flowAuthCookie = await getFlowtracAuthCookie();
  const products = await fetchAllFlowtracProducts(flowAuthCookie);

  // 3. Build SKU to product_id map
  const skuToProductId: Record<string, string> = {};
  for (const p of products) {
    if (p.product) skuToProductId[p.product] = p.product_id;
    if (p.barcode) skuToProductId[p.barcode] = p.product_id;
  }

  // 4. Update mapping.json in-memory
  const updated = updateMappingWithProductIds(mapping, skuToProductId);

  if (updated) {
    await mappingService.updateMapping(mapping, 'api_update');
    console.log('mapping.json updated with Flowtrac product_ids.');
  } else {
    console.log('No updates needed. All SKUs already have product_ids.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 