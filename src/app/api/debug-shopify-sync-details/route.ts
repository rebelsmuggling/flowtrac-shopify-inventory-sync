import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionNumber = parseInt(url.searchParams.get('session') || '1');
    const batchSize = parseInt(url.searchParams.get('batchSize') || '60');
    
    console.log(`Debugging Shopify sync details for session ${sessionNumber}`);
    
    // Get fresh mapping data
    const { mapping, source } = await mappingService.getMappingFresh();
    
    // Get all mapped SKUs
    const mappedSkus = await mappingService.getMappedSkus();
    const skuArray = Array.from(mappedSkus);
    
    // Calculate session SKUs
    const startIndex = (sessionNumber - 1) * batchSize;
    const endIndex = startIndex + batchSize;
    const sessionSkus = skuArray.slice(startIndex, endIndex);
    
    // Get inventory for session SKUs
    const inventoryResult = await getFlowtracInventory(sessionSkus, 'Manteca');
    const inventoryData = inventoryResult.data || [];
    
    // Build Shopify updates array (same logic as sync-session)
    const shopifyUpdates = [];
    const analysis = {
      totalSessionSkus: sessionSkus.length,
      skusWithInventory: 0,
      skusWithShopifyIds: 0,
      skusWithPositiveQuantity: 0,
      skusReadyForShopify: 0,
      sampleUpdates: [] as any[]
    };
    
    for (const sku of sessionSkus) {
      const inventoryRecord = inventoryData.find((record: any) => record.sku === sku);
      const product = mapping.products.find(p => p.flowtrac_sku === sku);
      
      if (inventoryRecord) {
        analysis.skusWithInventory++;
        
        if (inventoryRecord.quantity > 0) {
          analysis.skusWithPositiveQuantity++;
        }
        
        if (product?.shopify_inventory_item_id) {
          analysis.skusWithShopifyIds++;
          
          // This SKU is ready for Shopify update
          analysis.skusReadyForShopify++;
          
          shopifyUpdates.push({
            inventoryItemId: product.shopify_inventory_item_id,
            locationId: 'gid://shopify/Location/123456789', // Default location
            quantity: inventoryRecord.quantity
          });
          
          // Add to sample updates (first 10)
          if (analysis.sampleUpdates.length < 10) {
            analysis.sampleUpdates.push({
              sku,
              shopify_inventory_item_id: product.shopify_inventory_item_id,
              quantity: inventoryRecord.quantity,
              product_name: product.product_name || 'N/A'
            });
          }
        }
      }
    }
    
    // Check for bundle products that might be missing
    const bundleProducts = mapping.products.filter(p => 
      !p.flowtrac_sku && p.shopify_inventory_item_id && p.bundle_components
    );
    
    const bundleAnalysis = {
      totalBundleProducts: bundleProducts.length,
      bundleProductsInSession: 0,
      bundleProductsWithShopifyIds: 0,
      sampleBundleProducts: [] as any[]
    };
    
    for (const bundleProduct of bundleProducts) {
      if (sessionSkus.includes(bundleProduct.shopify_sku)) {
        bundleAnalysis.bundleProductsInSession++;
        
        if (bundleProduct.shopify_inventory_item_id) {
          bundleAnalysis.bundleProductsWithShopifyIds++;
          
          if (bundleAnalysis.sampleBundleProducts.length < 5) {
            bundleAnalysis.sampleBundleProducts.push({
              shopify_sku: bundleProduct.shopify_sku,
              shopify_inventory_item_id: bundleProduct.shopify_inventory_item_id,
              bundle_components: bundleProduct.bundle_components?.length || 0
            });
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      sessionInfo: {
        sessionNumber,
        batchSize,
        totalSkus: skuArray.length,
        sessionSkus: sessionSkus.length,
        sessionSkusSample: sessionSkus.slice(0, 10)
      },
      analysis,
      bundleAnalysis,
      shopifyUpdates: {
        totalUpdates: shopifyUpdates.length,
        sampleUpdates: shopifyUpdates.slice(0, 5),
        allUpdates: shopifyUpdates
      },
      mappingInfo: {
        source,
        totalProducts: mapping.products.length,
        productsWithShopifyIds: mapping.products.filter(p => p.shopify_inventory_item_id).length,
        productsWithFlowtracSku: mapping.products.filter(p => p.flowtrac_sku).length
      },
      recommendations: [] as string[]
    });
    
  } catch (error) {
    console.error('Error debugging Shopify sync details:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
