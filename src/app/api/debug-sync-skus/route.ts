import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';

function getAllSkus(mapping: any): string[] {
  const skus = new Set<string>();
  for (const product of mapping.products) {
    if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
      }
    }
  }
  return Array.from(skus);
}

function getSkusForSession(allSkus: string[], sessionNumber: number, batchSize: number = 60): string[] {
  const startIndex = (sessionNumber - 1) * batchSize;
  const endIndex = Math.min(startIndex + batchSize, allSkus.length);
  return allSkus.slice(startIndex, endIndex);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionNumber = parseInt(url.searchParams.get('session') || '1');
    
    console.log(`Debugging SKU selection for session ${sessionNumber}`);
    
    // Load mapping using the mapping service (fresh data, no cache)
    const { mapping, source } = await mappingService.getMappingFresh();
    console.log(`Using ${source} mapping data`);
    
    // Get all SKUs
    const allSkus = getAllSkus(mapping);
    const totalSkus = allSkus.length;
    const batchSize = 60;
    const totalSessions = Math.ceil(totalSkus / batchSize);
    
    // Get SKUs for this session
    const sessionSkus = getSkusForSession(allSkus, sessionNumber, batchSize);
    
    // Analyze the mapping data
    const analysis = {
      totalProducts: mapping.products.length,
      productsWithFlowtracSku: 0,
      productsWithShopifySku: 0,
      productsWithShopifyInventoryItemId: 0,
      productsWithBundleComponents: 0,
      sampleProducts: [] as any[]
    };
    
    for (const product of mapping.products) {
      if (product.flowtrac_sku) analysis.productsWithFlowtracSku++;
      if (product.shopify_sku) analysis.productsWithShopifySku++;
      if (product.shopify_inventory_item_id) analysis.productsWithShopifyInventoryItemId++;
      if (Array.isArray(product.bundle_components)) analysis.productsWithBundleComponents++;
      
      // Add sample products for inspection
      if (analysis.sampleProducts.length < 10) {
        analysis.sampleProducts.push({
          flowtrac_sku: product.flowtrac_sku,
          shopify_sku: product.shopify_sku,
          has_shopify_inventory_item_id: !!(product.shopify_inventory_item_id),
          has_bundle_components: Array.isArray(product.bundle_components),
          bundle_component_count: Array.isArray(product.bundle_components) ? product.bundle_components.length : 0
        });
      }
    }
    
    // Check specific SKUs that are working
    const workingSkus = [
      'IC-KOOL-004', 'IC-HCPK-005', 'IC-MILI-0028', 'IC-MILI-0056', 
      'RS-KEWS-000', 'IC-HCPK-004', 'IC-FURI-0008', 'IC-DAVI-012', 'RS-KOOL-009'
    ];
    
    const workingSkuAnalysis = workingSkus.map(sku => {
      const product = mapping.products.find((p: any) => p.flowtrac_sku === sku);
      return {
        sku,
        found: !!product,
        has_shopify_sku: !!(product?.shopify_sku),
        has_shopify_inventory_item_id: !!(product?.shopify_inventory_item_id),
        shopify_sku: product?.shopify_sku,
        shopify_inventory_item_id: product?.shopify_inventory_item_id
      };
    });
    
    return NextResponse.json({
      success: true,
      sessionInfo: {
        sessionNumber,
        totalSessions,
        batchSize,
        totalSkus,
        sessionSkus,
        sessionSkusCount: sessionSkus.length
      },
      analysis,
      workingSkuAnalysis,
      allSkusSample: allSkus.slice(0, 20), // First 20 SKUs
      sessionSkusSample: sessionSkus.slice(0, 10) // First 10 SKUs in this session
    });
    
  } catch (error) {
    console.error('Error debugging SKU selection:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
