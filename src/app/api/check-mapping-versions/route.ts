import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getMappingHistory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    console.log('Checking mapping versions...');
    
    // Get mapping history
    const historyResult = await getMappingHistory(10);
    const versions = historyResult.success ? historyResult.data : [];
    
    // Get current mapping from service (with cache)
    const { mapping: cachedMapping, source: cacheSource } = await mappingService.getMapping();
    
    // Get fresh mapping (bypass cache)
    const { mapping: freshMapping, source: freshSource } = await mappingService.getMappingFresh();
    
    // Get latest version from database directly
    const { mapping: latestVersion, source: latestSource } = await mappingService.getMapping();
    
    // Compare versions
    const analysis = {
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        last_updated: v.last_updated,
        updated_by: v.updated_by,
        product_count: v.products?.length || 0,
        has_shopify_ids: v.products?.filter((p: any) => p.shopify_inventory_item_id)?.length || 0
      })),
      latestVersion: versions[0] ? {
        version: versions[0].version,
        last_updated: versions[0].last_updated,
        product_count: versions[0].products?.length || 0,
        has_shopify_ids: versions[0].products?.filter((p: any) => p.shopify_inventory_item_id)?.length || 0
      } : null,
      cacheAnalysis: {
        cacheSource,
        freshSource,
        cacheProductCount: cachedMapping?.products?.length || 0,
        freshProductCount: freshMapping?.products?.length || 0,
        cacheShopifyIdsCount: cachedMapping?.products?.filter(p => p.shopify_inventory_item_id)?.length || 0,
        freshShopifyIdsCount: freshMapping?.products?.filter(p => p.shopify_inventory_item_id)?.length || 0,
        cacheMatchesLatest: JSON.stringify(cachedMapping) === JSON.stringify(freshMapping)
      },
      recommendations: [] as string[]
    };
    
    // Add recommendations
    if (!analysis.cacheAnalysis.cacheMatchesLatest) {
      analysis.recommendations.push('Cache is outdated - sync process should use getMappingFresh()');
    }
    
    if (analysis.latestVersion && analysis.latestVersion.has_shopify_ids < analysis.latestVersion.product_count * 0.8) {
      analysis.recommendations.push('Many products missing Shopify IDs - consider running enrichment');
    }
    
    if (versions.length > 1) {
      analysis.recommendations.push(`Multiple versions found (${versions.length}) - ensure using latest version ${versions[0].version}`);
    }
    
    return NextResponse.json({
      success: true,
      analysis,
      summary: {
        totalVersions: versions.length,
        latestVersionNumber: versions[0]?.version || 0,
        cacheIsCurrent: analysis.cacheAnalysis.cacheMatchesLatest,
        productsWithShopifyIds: analysis.latestVersion?.has_shopify_ids || 0,
        totalProducts: analysis.latestVersion?.product_count || 0
      }
    });
    
  } catch (error) {
    console.error('Error checking mapping versions:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
