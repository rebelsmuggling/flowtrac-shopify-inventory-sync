import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';
export async function GET(request: NextRequest) {
  try {
    console.log('Testing small batch processing...');
    
    // Load mapping
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
    
    // Get just 3 SKUs for testing
    const testSkus = [];
    for (const product of mapping.products.slice(0, 5)) {
      if (product.flowtrac_sku && testSkus.length < 3) {
        testSkus.push({
          sku: product.flowtrac_sku,
          hasProductId: !!product.flowtrac_product_id,
          productId: product.flowtrac_product_id
        });
      }
    }
    
    const skuList = testSkus.map(item => item.sku);
    console.log(`Testing with SKUs: ${skuList.join(', ')}`);
    
    // Test the actual Flowtrac inventory fetch
    let inventoryResult = null;
    let inventoryError = null;
    
    try {
      console.log('Calling fetchFlowtracInventoryWithBins...');
      inventoryResult = await fetchFlowtracInventoryWithBins(skuList);
      console.log('Inventory fetch completed:', inventoryResult);
    } catch (error) {
      inventoryError = {
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 5)
      };
      console.error('Inventory fetch failed:', inventoryError);
    }
    
    // Analyze results
    const analysis = {
      requestedSkus: skuList,
      returnedSkus: inventoryResult ? Object.keys(inventoryResult) : [],
      successfulSkus: inventoryResult ? Object.keys(inventoryResult).filter(sku => 
        inventoryResult[sku] && inventoryResult[sku].quantity !== undefined
      ) : [],
      failedSkus: inventoryResult ? skuList.filter(sku => 
        !inventoryResult[sku] || inventoryResult[sku].quantity === undefined
      ) : skuList,
      inventoryData: inventoryResult
    };
    
    return NextResponse.json({
      success: !inventoryError,
      test_skus: testSkus,
      analysis,
      inventory_error: inventoryError,
      recommendation: analysis.failedSkus.length === skuList.length ? 
        'All SKUs failed. Check Flowtrac credentials and product IDs.' :
        analysis.failedSkus.length > 0 ? 
        'Some SKUs failed. Check missing product IDs.' :
        'All SKUs succeeded. The issue may be with larger batches.'
    });
    
  } catch (error) {
    console.error('Small batch test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
}
