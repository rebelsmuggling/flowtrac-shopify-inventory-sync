import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { fetchFlowtracInventory } from '../../services/flowtrac';
import { mappingService } from '../services/mapping';

async function test() {
  // 1. Load mapping using the mapping service
  const { mapping, source } = await mappingService.getMapping();
  console.log(`Using ${source} mapping data`);

  // 2. Collect all SKUs (simple and bundle components)
  const skus = new Set<string>();
  for (const product of mapping.products) {
    if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
      }
    }
  }

  // 3. Fetch inventory data from Flowtrac
  const flowtracInventory = await fetchFlowtracInventory(Array.from(skus));

  // 4. Calculate bundle inventory and build shopify_sku inventory map
  const shopifyInventory: Record<string, number> = {};
  for (const product of mapping.products) {
    if (Array.isArray(product.bundle_components) && product.shopify_sku) {
      const quantities = product.bundle_components.map((comp: any) => {
        const available = flowtracInventory[comp.flowtrac_sku] || 0;
        return Math.floor(available / comp.quantity);
      });
      shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
    } else if (product.shopify_sku && product.flowtrac_sku) {
      shopifyInventory[product.shopify_sku] = flowtracInventory[product.flowtrac_sku] || 0;
    }
  }

  console.log('Shopify SKU Inventory:', shopifyInventory);
}

test(); 