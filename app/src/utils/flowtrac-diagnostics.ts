import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { testFlowtracConnection, filterProductsToSync, fetchFlowtracInventory } from '../services/flowtrac';
import { mapFlowtracToShopify } from './mapFlowtracToShopify';
import type { MappingFile, ProductMapping } from '../types/mapping';

async function main() {
  console.log('Starting Flowtrac diagnostics with inventory mapping...');

  // 1. Load mapping.json and extract all mapped SKUs
  const mappingPath = path.resolve(__dirname, '../../../mapping.json');
  const mapping: MappingFile = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  const mappedSkus = new Set<string>();
  for (const entry of mapping.products) {
    if ('flowtrac_sku' in entry) mappedSkus.add(entry.flowtrac_sku);
    if ('bundle_components' in entry) {
      for (const comp of entry.bundle_components) mappedSkus.add(comp.flowtrac_sku);
    }
  }
  const skuList = Array.from(mappedSkus);
  console.log('Mapped SKUs:', skuList);

  // 2. Fetch inventory for those SKUs from Flowtrac (Manteca only)
  // --- REMOVED direct raw bins logging, now handled in fetchFlowtracInventory ---
  const inventory = await fetchFlowtracInventory(skuList);
  console.log('Fetched inventory for mapped SKUs (Manteca only):', inventory);

  // 3. Map to Shopify update payloads
  console.log('\n--- Shopify Inventory Update Payloads ---');
  for (const entry of mapping.products) {
    const update = mapFlowtracToShopify(entry, inventory);
    console.log(update);
  }

  // 4. Filtered products for completeness
  const allProducts = await testFlowtracConnection();
  const filtered = filterProductsToSync(Array.isArray(allProducts) ? allProducts : allProducts.data || []);
  console.log('Filtered products to sync (by mapping):', filtered.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 