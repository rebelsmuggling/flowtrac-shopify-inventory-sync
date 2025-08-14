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
    const workingSkus = [
      'IC-KOOL-004', 'IC-HCPK-005', 'IC-MILI-0028', 'IC-MILI-0056', 
      'RS-KEWS-000', 'IC-HCPK-004', 'IC-FURI-0008', 'IC-DAVI-012', 'RS-KOOL-009'
    ];
    
    console.log('Searching for working SKUs across all sessions...');
    
    // Load mapping using the mapping service (fresh data, no cache)
    const { mapping, source } = await mappingService.getMappingFresh();
    
    // Get all SKUs
    const allSkus = getAllSkus(mapping);
    const batchSize = 60;
    const totalSessions = Math.ceil(allSkus.length / batchSize);
    
    const results = {
      totalSessions,
      batchSize,
      totalSkus: allSkus.length,
      workingSkusFound: [] as any[],
      workingSkusNotFound: [] as string[],
      sessionBreakdown: [] as any[]
    };
    
    // Check each session for the working SKUs
    for (let sessionNum = 1; sessionNum <= totalSessions; sessionNum++) {
      const sessionSkus = getSkusForSession(allSkus, sessionNum, batchSize);
      
      const sessionResult = {
        sessionNumber: sessionNum,
        skusInSession: sessionSkus.length,
        workingSkusInSession: [] as string[],
        sampleSkus: sessionSkus.slice(0, 5)
      };
      
      // Check which working SKUs are in this session
      for (const workingSku of workingSkus) {
        if (sessionSkus.includes(workingSku)) {
          sessionResult.workingSkusInSession.push(workingSku);
        }
      }
      
      results.sessionBreakdown.push(sessionResult);
    }
    
    // Analyze each working SKU
    for (const sku of workingSkus) {
      const product = mapping.products.find((p: any) => p.flowtrac_sku === sku);
      
      if (product) {
        const sessionNumber = Math.floor(allSkus.indexOf(sku) / batchSize) + 1;
        results.workingSkusFound.push({
          sku,
          sessionNumber,
          has_shopify_sku: !!(product.shopify_sku),
          has_shopify_inventory_item_id: !!(product.shopify_inventory_item_id),
          shopify_sku: product.shopify_sku,
          shopify_inventory_item_id: product.shopify_inventory_item_id,
          product_name: product.product_name
        });
      } else {
        results.workingSkusNotFound.push(sku);
      }
    }
    
    // Also check for similar SKUs that might exist
    const similarSkus = [];
    for (const sku of workingSkus) {
      const baseSku = sku.split('-')[0] + '-' + sku.split('-')[1];
      const similar = mapping.products.filter((p: any) => 
        p.flowtrac_sku && p.flowtrac_sku.startsWith(baseSku)
      ).map(p => p.flowtrac_sku);
      
      if (similar.length > 0) {
        similarSkus.push({
          originalSku: sku,
          similarSkus: similar
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
      similarSkus,
      summary: {
        totalWorkingSkus: workingSkus.length,
        foundInMapping: results.workingSkusFound.length,
        notFoundInMapping: results.workingSkusNotFound.length,
        sessionsWithWorkingSkus: results.sessionBreakdown.filter(s => s.workingSkusInSession.length > 0).length
      }
    });
    
  } catch (error) {
    console.error('Error finding working SKUs:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
