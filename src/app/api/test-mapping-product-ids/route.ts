import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing mapping product IDs...');
    
    // Load mapping
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
    
    // Analyze mapping for product IDs
    const analysis = {
      totalProducts: mapping.products.length,
      productsWithFlowtracSku: 0,
      productsWithProductId: 0,
      productsMissingProductId: 0,
      bundleComponentsWithFlowtracSku: 0,
      bundleComponentsWithProductId: 0,
      bundleComponentsMissingProductId: 0,
      sampleMissingProductIds: [] as string[]
    };
    
    for (const product of mapping.products) {
      // Check main product
      if (product.flowtrac_sku) {
        analysis.productsWithFlowtracSku++;
        if (product.flowtrac_product_id) {
          analysis.productsWithProductId++;
        } else {
          analysis.productsMissingProductId++;
          if (analysis.sampleMissingProductIds.length < 10) {
            analysis.sampleMissingProductIds.push(product.flowtrac_sku);
          }
        }
      }
      
      // Check bundle components
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) {
            analysis.bundleComponentsWithFlowtracSku++;
            if (comp.flowtrac_product_id) {
              analysis.bundleComponentsWithProductId++;
            } else {
              analysis.bundleComponentsMissingProductId++;
              if (analysis.sampleMissingProductIds.length < 10) {
                analysis.sampleMissingProductIds.push(comp.flowtrac_sku);
              }
            }
          }
        }
      }
    }
    
    // Calculate percentages
    const totalFlowtracSkus = analysis.productsWithFlowtracSku + analysis.bundleComponentsWithFlowtracSku;
    const totalWithProductId = analysis.productsWithProductId + analysis.bundleComponentsWithProductId;
    const totalMissingProductId = analysis.productsMissingProductId + analysis.bundleComponentsMissingProductId;
    
    const summary = {
      totalFlowtracSkus,
      totalWithProductId,
      totalMissingProductId,
      percentageWithProductId: totalFlowtracSkus > 0 ? Math.round((totalWithProductId / totalFlowtracSkus) * 100) : 0,
      percentageMissingProductId: totalFlowtracSkus > 0 ? Math.round((totalMissingProductId / totalFlowtracSkus) * 100) : 0
    };
    
    return NextResponse.json({
      success: true,
      analysis,
      summary,
      recommendation: summary.percentageMissingProductId > 50 ? 
        'Many SKUs are missing product IDs. This will cause batch processing to fail.' : 
        'Most SKUs have product IDs. The issue may be elsewhere.'
    });
    
  } catch (error) {
    console.error('Mapping product ID test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
}
