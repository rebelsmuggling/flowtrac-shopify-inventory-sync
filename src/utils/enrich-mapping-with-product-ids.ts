import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import axios from 'axios';
import qs from 'qs';
import fs from 'fs';
import path from 'path';
import { getImportedMapping, setImportedMapping } from './imported-mapping-store';

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;

const mappingPath = path.resolve(__dirname, '../../../mapping.json');

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
    // Get current mapping (imported or file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Enriching imported mapping data');
      mapping = importedMapping;
    } else {
      console.log('Enriching file mapping data');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }

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
      // Update the imported mapping store if we're using imported data
      if (importedMapping) {
        setImportedMapping(mapping);
        console.log('Imported mapping updated with Flowtrac product_ids.');
      } else {
        // Write to file if using file-based mapping
        try {
          fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
          console.log('mapping.json updated with Flowtrac product_ids.');
        } catch (fileError) {
          console.log('Could not write to file system (expected in Vercel):', fileError);
        }
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
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

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
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log('mapping.json updated with Flowtrac product_ids.');
  } else {
    console.log('No updates needed. All SKUs already have product_ids.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 