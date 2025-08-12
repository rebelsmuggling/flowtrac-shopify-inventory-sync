import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting product ID population process...');
    
    // Check Flowtrac credentials
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (!hasFlowtracCredentials) {
      return NextResponse.json({
        success: false,
        error: 'Flowtrac credentials not configured'
      });
    }

    // Check GitHub credentials
    const hasGitHubCredentials = process.env.GITHUB_TOKEN;
    
    if (!hasGitHubCredentials) {
      return NextResponse.json({
        success: false,
        error: 'GitHub token not configured'
      });
    }

    // Get current mapping
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      // Try to get from GitHub
      try {
        const githubRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/github-mapping`);
        if (githubRes.ok) {
          const githubData = await githubRes.json();
          if (githubData.success) {
            mapping = githubData.mapping;
          }
        }
      } catch (error) {
        console.error('Failed to get mapping from GitHub:', error);
      }
    }

    if (!mapping) {
      return NextResponse.json({
        success: false,
        error: 'No mapping data available'
      });
    }

    // Get a sample of SKUs to test the self-healing logic
    const testSkus = [];
    for (const product of mapping.products.slice(0, 10)) {
      if (product.flowtrac_sku) {
        testSkus.push({
          sku: product.flowtrac_sku,
          hasProductId: !!product.flowtrac_product_id,
          productId: product.flowtrac_product_id
        });
      }
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components.slice(0, 3)) {
          if (comp.flowtrac_sku) {
            testSkus.push({
              sku: comp.flowtrac_sku,
              hasProductId: !!comp.flowtrac_product_id,
              productId: comp.flowtrac_product_id
            });
          }
        }
      }
    }

    const skuList = testSkus.map(item => item.sku);
    
    // Test the self-healing logic
    let inventoryResult = null;
    let inventoryError = null;
    
    try {
      console.log('Testing self-healing logic with sample SKUs...');
      inventoryResult = await fetchFlowtracInventoryWithBins(skuList);
      console.log('Self-healing test completed');
    } catch (error) {
      inventoryError = {
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 5)
      };
      console.error('Self-healing test failed:', inventoryError);
    }

    // Analyze results
    const analysis = {
      testSkus: testSkus.length,
      successfulSkus: inventoryResult ? Object.keys(inventoryResult).length : 0,
      failedSkus: inventoryResult ? skuList.length - Object.keys(inventoryResult).length : skuList.length,
      sampleResults: inventoryResult ? Object.keys(inventoryResult).slice(0, 5) : []
    };

    return NextResponse.json({
      success: !inventoryError,
      analysis,
      inventory_error: inventoryError,
      recommendation: analysis.failedSkus === 0 ? 
        'Self-healing logic is working. The batch processor should now work correctly.' :
        'Some SKUs still failed. Check Flowtrac credentials and product availability.'
    });
    
  } catch (error) {
    console.error('Product ID population failed:', error);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
}
