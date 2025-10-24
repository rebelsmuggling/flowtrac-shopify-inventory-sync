import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting Shopify product IDs reset...');
    
    // Clear all Shopify product IDs from the mapping table
    // We need to update the mapping table to remove shopify_variant_id and shopify_inventory_item_id
    const result = await sql`
      UPDATE mapping 
      SET products = jsonb_set(
        jsonb_set(
          products, 
          '{products}', 
          (
            SELECT jsonb_agg(
              jsonb_set(
                jsonb_set(
                  product, 
                  '{shopify_variant_id}', 
                  '""'
                ),
                '{shopify_inventory_item_id}', 
                '""'
              )
            )
            FROM jsonb_array_elements(products->'products') AS product
          )
        ),
        '{last_updated}', 
        to_jsonb(NOW())
      )
      WHERE id = (SELECT MAX(id) FROM mapping)
    `;
    
    console.log(`✅ Cleared Shopify IDs from mapping table`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully cleared Shopify product IDs from mapping. The system will now fetch fresh Shopify IDs on the next sync.`,
      clearedCount: result.rowCount
    });

  } catch (error) {
    console.error('Error resetting Shopify product IDs:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
