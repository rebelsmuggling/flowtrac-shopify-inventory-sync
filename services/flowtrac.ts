import axios from 'axios';
import qs from 'qs';
import fs from 'fs';
import path from 'path';
import type { MappingFile } from '@/types/mapping';

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;

const mappingPath = path.join(process.cwd(), 'mapping.json');

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

async function fetchAllFlowtracProducts(flowAuthCookie: string) {
  const productsRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
    headers: { Cookie: flowAuthCookie },
    withCredentials: true,
  });
  return productsRes.data;
}

function getProductIdForSku(sku: string, mapping: any): string | undefined {
  for (const product of mapping.products) {
    if (product.flowtrac_sku === sku && product.flowtrac_product_id) return product.flowtrac_product_id;
    if (product.bundle_components) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku === sku && comp.flowtrac_product_id) return comp.flowtrac_product_id;
      }
    }
  }
  return undefined;
}

function setProductIdForSku(sku: string, product_id: string, mapping: any): boolean {
  let updated = false;
  for (const product of mapping.products) {
    if (product.flowtrac_sku === sku) {
      if (product.flowtrac_product_id !== product_id) {
        product.flowtrac_product_id = product_id;
        updated = true;
      }
    }
    if (product.bundle_components) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku === sku) {
          if (comp.flowtrac_product_id !== product_id) {
            comp.flowtrac_product_id = product_id;
            updated = true;
          }
        }
      }
    }
  }
  return updated;
}

export async function fetchFlowtracInventory(skus: string[]): Promise<Record<string, number>> {
  // 1. Authenticate to get session cookie
  const flowAuthCookie = await getFlowtracAuthCookie();

  // 2. Load mapping.json
  const mapping: MappingFile = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

  // 3. Fetch all Flowtrac products once (for self-healing)
  const products = await fetchAllFlowtracProducts(flowAuthCookie);
  const skuToProductId: Record<string, string> = {};
  for (const p of products) {
    if (p.product) skuToProductId[p.product] = p.product_id;
    if (p.barcode) skuToProductId[p.barcode] = p.product_id;
  }

  let mappingUpdated = false;
  // 4. Ensure all SKUs have product_id, self-heal if missing
  const skuToPidForQuery: Record<string, string> = {};
  for (const sku of skus) {
    let pid = getProductIdForSku(sku, mapping);
    if (!pid) {
      pid = skuToProductId[sku];
      if (pid) {
        if (setProductIdForSku(sku, pid, mapping)) mappingUpdated = true;
      } else {
        throw new Error(`SKU '${sku}' not found in Flowtrac products.`);
      }
    }
    skuToPidForQuery[sku] = pid;
  }
  if (mappingUpdated) {
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    console.log('mapping.json updated with missing Flowtrac product_ids during sync.');
  }

  // 5. Query Flowtrac using product_id for each SKU
  const inventory: Record<string, number> = {};
  const today = new Date();
  for (const [sku, product_id] of Object.entries(skuToPidForQuery)) {
    // Query all bins for the product_id
    const params = { product_id };
    const binsRes = await axios.get(`${FLOWTRAC_API_URL}/product-warehouse-bins`, {
      headers: { Cookie: flowAuthCookie },
      params,
      withCredentials: true,
    });
    const bins = binsRes.data;
    // Sum 'quantity' where include_in_available is 'Yes', warehouse is 'Manteca', and not expired
    inventory[sku] = bins
      .filter((b: any) => {
        if (b.include_in_available !== 'Yes') return false;
        if (b.warehouse !== 'Manteca') return false;
        if (b.expiration_date) {
          const exp = new Date(b.expiration_date);
          if (exp < today) return false;
        }
        return true;
      })
      .reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0);
  }
  return inventory;
}

/**
 * Filters Flowtrac products to only those that are mapped for syncing (by SKU), and optionally active.
 * @param flowtracProducts Array of Flowtrac product objects
 * @param onlyActive If true, only include products with active === 'Active'
 */
export function filterProductsToSync(flowtracProducts: any[], onlyActive = true): any[] {
  // Load mapping.json (assume project root)
  const mappingPath = path.resolve(__dirname, '../../../mapping.json');
  const mapping: MappingFile = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

  // Collect all mapped SKUs from simple and bundle products
  const mappedSkus = new Set<string>();
  for (const product of mapping.products) {
    if ('flowtrac_sku' in product && product.flowtrac_sku) {
      mappedSkus.add(product.flowtrac_sku);
    }
    if ('bundle_components' in product && Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku) mappedSkus.add(comp.flowtrac_sku);
      }
    }
  }

  // Filter Flowtrac products by SKU and (optionally) active status
  return flowtracProducts.filter(p =>
    mappedSkus.has(p.product) && (!onlyActive || p.active === 'Active')
  );
}

// Test function to verify Flowtrac API connectivity using /device-login/
export async function testFlowtracConnection(): Promise<any> {
  try {
    // 1. Login to get session cookie
    const loginRes = await axios.post(
      `${FLOWTRAC_API_URL}/device-login/`,
      qs.stringify({ badge: FLOWTRAC_BADGE, pin: FLOWTRAC_PIN }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        withCredentials: true,
      }
    );
    // Log the full response for troubleshooting
    console.log('Flowtrac loginRes.headers:', loginRes.headers);
    console.log('Flowtrac loginRes.data:', loginRes.data);
    const cookies = loginRes.headers['set-cookie'];
    if (!cookies || !cookies.length) {
      return { error: 'No session cookie returned from device-login.', headers: loginRes.headers, data: loginRes.data };
    }
    const flowAuthCookie = cookies.find((c: string) => c.startsWith('flow_auth='));
    if (!flowAuthCookie) {
      return { error: 'No flow_auth session cookie found.', headers: loginRes.headers, data: loginRes.data };
    }
    // 2. Use flow_auth cookie to fetch products (no limit param)
    try {
      const productsRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': flowAuthCookie.split(';')[0],
        },
      });
      return productsRes.data;
    } catch (productsError: any) {
      // Log the full error response
      console.log('Flowtrac productsError.response?.data:', productsError.response?.data);
      console.log('Flowtrac productsError.response?.headers:', productsError.response?.headers);
      return {
        error: productsError.message,
        data: productsError.response?.data,
        headers: productsError.response?.headers,
      };
    }
  } catch (error) {
    return { error: (error as Error).message };
  }
} 