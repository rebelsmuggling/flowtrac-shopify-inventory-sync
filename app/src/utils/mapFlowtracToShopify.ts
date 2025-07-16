import type { ProductMapping } from '@/types/mapping';

export interface ShopifyInventoryUpdate {
  shopify_product_id: string;
  shopify_variant_id: string;
  quantity: number;
}

export function mapFlowtracToShopify(
  mapping: ProductMapping,
  inventoryBySku: Record<string, number>
): ShopifyInventoryUpdate {
  if ('flowtrac_sku' in mapping) {
    // Simple product
    const quantity = inventoryBySku[mapping.flowtrac_sku] ?? 0;
    return {
      shopify_product_id: mapping.shopify_product_id,
      shopify_variant_id: mapping.shopify_variant_id,
      quantity,
    };
  } else if ('bundle_components' in mapping) {
    // Bundle product
    let minBundles = Infinity;
    for (const comp of mapping.bundle_components) {
      const available = inventoryBySku[comp.flowtrac_sku] ?? 0;
      const possibleBundles = Math.floor(available / comp.quantity);
      minBundles = Math.min(minBundles, possibleBundles);
    }
    return {
      shopify_product_id: mapping.shopify_product_id,
      shopify_variant_id: mapping.shopify_variant_id,
      quantity: isFinite(minBundles) ? minBundles : 0,
    };
  } else {
    throw new Error('Unknown mapping type');
  }
} 