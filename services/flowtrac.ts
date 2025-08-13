import axios from 'axios';
import qs from 'qs';
import fs from 'fs';
import path from 'path';
import type { MappingFile } from '../src/types/mapping';
import { Parser as CsvParser } from 'json2csv';
import { getImportedMapping } from '../src/utils/imported-mapping-store';

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

async function searchFlowtracProductBySku(sku: string, flowAuthCookie: string) {
  try {
    // Try searching by product name (SKU)
    const params = { product: sku };
    const searchRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
      headers: { Cookie: flowAuthCookie },
      params,
      withCredentials: true,
    });
    
    if (searchRes.data && searchRes.data.length > 0) {
      return searchRes.data[0];
    }
    
    // Try searching by barcode
    const barcodeParams = { barcode: sku };
    const barcodeRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
      headers: { Cookie: flowAuthCookie },
      params: barcodeParams,
      withCredentials: true,
    });
    
    if (barcodeRes.data && barcodeRes.data.length > 0) {
      return barcodeRes.data[0];
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching for SKU ${sku}:`, (error as Error).message);
    return null;
  }
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

  // 2. Load mapping (try imported mapping first, then fallback to file)
  let mapping: MappingFile;
  const importedMapping = getImportedMapping();
  
  if (importedMapping) {
    console.log('Using imported mapping data for fetchFlowtracInventory');
    mapping = importedMapping;
  } else {
    console.log('Using file mapping data for fetchFlowtracInventory');
    mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }

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
    let pid = await getProductIdForSku(sku, mapping);
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
    console.log('Mapping updated with missing Flowtrac product_ids, attempting to persist to GitHub...');
    
    // Try to update GitHub mapping if token is available
    if (process.env.GITHUB_TOKEN) {
      try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const githubResponse = await fetch(`${baseUrl}/api/github-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping })
        });
        
        if (githubResponse.ok) {
          const result = await githubResponse.json();
          console.log('Successfully updated GitHub mapping with product IDs:', result.message);
        } else {
          console.warn('Failed to update GitHub mapping, but continuing with current session');
        }
      } catch (error) {
        console.warn('Error updating GitHub mapping:', error);
      }
    } else {
      console.log('GitHub token not available, mapping changes will not be persisted');
    }
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
  // Load mapping (try imported mapping first, then fallback to file)
  let mapping: MappingFile;
  const importedMapping = getImportedMapping();
  
  if (importedMapping) {
    mapping = importedMapping;
  } else {
    const mappingPath = path.resolve(__dirname, '../../../mapping.json');
    mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }

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

export async function fetchFlowtracInventoryWithBins(skus: string[]): Promise<Record<string, { quantity: number, bins: string[], binBreakdown: Record<string, number> }>> {
  // 1. Authenticate to get session cookie
  const flowAuthCookie = await getFlowtracAuthCookie();

  // 2. Load mapping (try imported mapping first, then fallback to file)
  let mapping: MappingFile;
  const importedMapping = getImportedMapping();
  
  if (importedMapping) {
    console.log('Using imported mapping data for fetchFlowtracInventoryWithBins');
    mapping = importedMapping;
  } else {
    console.log('Using file mapping data for fetchFlowtracInventoryWithBins');
    mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }

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
  const missingSkus: string[] = [];
  
  for (const sku of skus) {
    let pid = getProductIdForSku(sku, mapping);
    if (!pid) {
      // Try to find in the products list first
      pid = skuToProductId[sku];
      if (!pid) {
        // If still not found, try direct search by SKU
        console.log(`SKU '${sku}' not found in products list, trying direct search...`);
        const product = await searchFlowtracProductBySku(sku, flowAuthCookie);
        if (product && product.product_id) {
          pid = product.product_id;
          if (pid && setProductIdForSku(sku, pid, mapping)) mappingUpdated = true;
          console.log(`Found SKU '${sku}' with product_id '${pid}' via direct search`);
        } else {
          console.warn(`SKU '${sku}' not found in Flowtrac products. Skipping.`);
          missingSkus.push(sku);
          continue;
        }
      } else {
        if (setProductIdForSku(sku, pid, mapping)) mappingUpdated = true;
      }
    }
    
    // Always verify the product_id is valid by checking if it exists in Flowtrac
    if (pid && !skuToProductId[sku]) {
      // Double-check that this product_id actually exists in Flowtrac
      const product = await searchFlowtracProductBySku(sku, flowAuthCookie);
      if (product && product.product_id === pid) {
        console.log(`Verified SKU '${sku}' with product_id '${pid}'`);
      } else {
        console.warn(`Product ID '${pid}' for SKU '${sku}' not found in Flowtrac, trying direct search...`);
        const directProduct = await searchFlowtracProductBySku(sku, flowAuthCookie);
        if (directProduct && directProduct.product_id) {
          pid = directProduct.product_id;
          if (pid && setProductIdForSku(sku, pid, mapping)) mappingUpdated = true;
          console.log(`Updated SKU '${sku}' with correct product_id '${pid}'`);
        } else {
          console.warn(`SKU '${sku}' not found in Flowtrac products. Skipping.`);
          missingSkus.push(sku);
          continue;
        }
      }
    }
    
    if (pid) {
      skuToPidForQuery[sku] = pid;
    }
  }
  
  if (mappingUpdated) {
    console.log('Mapping updated with missing Flowtrac product_ids, attempting to persist to GitHub...');
    
    // Try to update GitHub mapping if token is available
    if (process.env.GITHUB_TOKEN) {
      try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const githubResponse = await fetch(`${baseUrl}/api/github-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping })
        });
        
        if (githubResponse.ok) {
          const result = await githubResponse.json();
          console.log('Successfully updated GitHub mapping with product IDs:', result.message);
        } else {
          console.warn('Failed to update GitHub mapping, but continuing with current session');
        }
      } catch (error) {
        console.warn('Error updating GitHub mapping:', error);
      }
    } else {
      console.log('GitHub token not available, mapping changes will not be persisted');
    }
  }
  
  if (missingSkus.length > 0) {
    console.log(`Skipped ${missingSkus.length} SKUs not found in Flowtrac:`, missingSkus);
  }

  // 4. Query Flowtrac using product_id for each SKU with delays
  const inventory: Record<string, { quantity: number, bins: string[], binBreakdown: Record<string, number> }> = {};
  const today = new Date();
  
  for (const [sku, product_id] of Object.entries(skuToPidForQuery)) {
    try {
      console.log(`Fetching inventory for SKU ${sku} with product_id ${product_id}...`);
      
      // Query all bins for the product_id
      const params = { product_id };
      const binsRes = await axios.get(`${FLOWTRAC_API_URL}/product-warehouse-bins`, {
        headers: { Cookie: flowAuthCookie },
        params,
        withCredentials: true,
        timeout: 10000, // 10 second timeout
      });
      
      const bins = binsRes.data;
      console.log(`SKU ${sku}: Found ${bins.length} total bin records`);
      
      // Use the same filter as fetchFlowtracInventory
      const validBins = bins.filter((b: any) => {
        if (b.include_in_available !== 'Yes') return false;
        if (b.warehouse !== 'Manteca') return false;
        if (b.expiration_date) {
          const exp = new Date(b.expiration_date);
          if (exp < today) return false;
        }
        return true;
      });
      
      console.log(`SKU ${sku}: ${validBins.length} valid bin records after filtering`);
      
      // Sum total quantity and also sum by bin
      const binQuantities: Record<string, number> = {};
      for (const b of validBins) {
        const binName = b.bin || 'UNKNOWN';
        const quantity = Number(b.quantity) || 0;
        binQuantities[binName] = (binQuantities[binName] || 0) + quantity;
        console.log(`SKU ${sku}: Bin ${binName} has ${quantity} units`);
      }
      
      // Remove bins with 0 quantity after summing
      const filteredBinQuantities: Record<string, number> = {};
      for (const [bin, qty] of Object.entries(binQuantities)) {
        if (qty !== 0) filteredBinQuantities[bin] = qty;
      }
      
      const totalQuantity = Object.values(filteredBinQuantities).reduce((sum, q) => sum + q, 0);
      console.log(`SKU ${sku}: Total quantity = ${totalQuantity}, Bins: ${Object.keys(filteredBinQuantities).join(', ')}`);
      
      inventory[sku] = {
        quantity: totalQuantity,
        bins: Object.keys(filteredBinQuantities),
        binBreakdown: filteredBinQuantities,
      };
      
      // Add delay between requests to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`Error fetching inventory for SKU ${sku}:`, (error as Error).message);
      console.error(`Full error details:`, error);
      // Don't throw error, just skip this SKU
      continue;
    }
  }
  
  return inventory;
}

export async function exportRawFlowtracBinsToCsv(skus: string[]): Promise<void> {
  const flowAuthCookie = await getFlowtracAuthCookie();
  
  // Load mapping (try imported mapping first, then fallback to file)
  let mapping: MappingFile;
  const importedMapping = getImportedMapping();
  
  if (importedMapping) {
    mapping = importedMapping;
  } else {
    mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }
  const products = await fetchAllFlowtracProducts(flowAuthCookie);
  const skuToProductId: Record<string, string> = {};
  for (const p of products) {
    if (p.product) skuToProductId[p.product] = p.product_id;
    if (p.barcode) skuToProductId[p.barcode] = p.product_id;
  }
  let mappingUpdated = false;
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
    console.log('Mapping updated with missing Flowtrac product_ids, attempting to persist to GitHub...');
    
    // Try to update GitHub mapping if token is available
    if (process.env.GITHUB_TOKEN) {
      try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const githubResponse = await fetch(`${baseUrl}/api/github-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapping })
        });
        
        if (githubResponse.ok) {
          const result = await githubResponse.json();
          console.log('Successfully updated GitHub mapping with product IDs:', result.message);
        } else {
          console.warn('Failed to update GitHub mapping, but continuing with current session');
        }
      } catch (error) {
        console.warn('Error updating GitHub mapping:', error);
      }
    } else {
      console.log('GitHub token not available, mapping changes will not be persisted');
    }
  }
  const allBins: any[] = [];
  for (const [sku, product_id] of Object.entries(skuToPidForQuery)) {
    const params = { product_id };
    const binsRes = await axios.get(`${FLOWTRAC_API_URL}/product-warehouse-bins`, {
      headers: { Cookie: flowAuthCookie },
      params,
      withCredentials: true,
    });
    const bins = binsRes.data;
    for (const bin of bins) {
      allBins.push({ sku, ...bin });
    }
  }
  const csvParser = new CsvParser();
  const csv = csvParser.parse(allBins);
  console.log('CSV data generated but cannot write to file system in Vercel environment');
  console.log('CSV content length:', csv.length);
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

export async function getProductDescriptions(skus: string[]): Promise<Record<string, { description: string, product_name: string }>> {
  try {
    const flowAuthCookie = await getFlowtracAuthCookie();
    const products = await fetchAllFlowtracProducts(flowAuthCookie);
    
    const productMap = new Map();
    for (const product of products) {
      if (product.product) {
        productMap.set(product.product, product);
      }
      if (product.barcode) {
        productMap.set(product.barcode, product);
      }
    }

    const results: Record<string, { description: string, product_name: string }> = {};
    
    for (const sku of skus) {
      const product = productMap.get(sku);
      if (product) {
        results[sku] = {
          description: product.description || '',
          product_name: product.product || sku
        };
      }
    }
    
    return results;
  } catch (error) {
    console.error('Failed to get product descriptions:', error);
    return {};
  }
}

if (require.main === module) {
  // Example usage: node services/flowtrac.js
  (async () => {
    try {
      const skus = ['IC-KOOL-0045']; // Add more SKUs as needed
      await exportRawFlowtracBinsToCsv(skus);
      console.log('Export complete.');
    } catch (err) {
      console.error('Error exporting Flowtrac bins to CSV:', err);
      process.exit(1);
    }
  })();
} 