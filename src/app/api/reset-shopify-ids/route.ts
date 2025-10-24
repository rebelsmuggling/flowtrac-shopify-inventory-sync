import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting Shopify product IDs reset...');
    
    // First, get the current mapping data
    const currentMapping = await sql`
      SELECT products FROM mapping 
      WHERE id = (SELECT MAX(id) FROM mapping)
    `;
    
    if (currentMapping.rows.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No mapping data found to reset' 
      }, { status: 404 });
    }
    
    const mappingData = currentMapping.rows[0].products;
    console.log('Mapping data structure:', JSON.stringify(mappingData, null, 2));
    
    // Check if products array exists
    if (!mappingData.products || !Array.isArray(mappingData.products)) {
      return NextResponse.json({ 
        success: false, 
        error: 'No products array found in mapping data' 
      }, { status: 400 });
    }
    
    console.log(`Found mapping with ${mappingData.products.length} products`);
    
    // Clear Shopify IDs from each product
    const updatedProducts = mappingData.products.map((product: any) => {
      const updatedProduct = { ...product };
      delete updatedProduct.shopify_variant_id;
      delete updatedProduct.shopify_inventory_item_id;
      return updatedProduct;
    });
    
    // Update the mapping with cleared Shopify IDs
    const result = await sql`
      UPDATE mapping 
      SET products = jsonb_set(
        products, 
        '{products}', 
        ${JSON.stringify(updatedProducts)}::jsonb
      ),
      last_updated = NOW()
      WHERE id = (SELECT MAX(id) FROM mapping)
    `;
    
    console.log(`✅ Cleared Shopify IDs from ${updatedProducts.length} products`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully cleared Shopify product IDs from ${updatedProducts.length} products. The system will now fetch fresh Shopify IDs on the next sync.`,
      clearedCount: updatedProducts.length
    });

  } catch (error) {
    console.error('Error resetting Shopify product IDs:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
