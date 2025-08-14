import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku');

    if (!sku) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: sku'
      });
    }

    console.log(`Checking database for SKU: ${sku}`);

    // Query the database directly for this SKU
    const result = await sql`
      SELECT * FROM flowtrac_inventory 
      WHERE sku = ${sku}
      ORDER BY last_updated DESC
    `;

    return NextResponse.json({
      success: true,
      sku,
      recordsFound: result.rows.length,
      records: result.rows,
      summary: {
        totalQuantity: result.rows.reduce((sum, record) => sum + (record.quantity || 0), 0),
        warehouses: [...new Set(result.rows.map(r => r.warehouse))],
        latestUpdate: result.rows.length > 0 ? result.rows[0].last_updated : null
      }
    });

  } catch (error) {
    console.error('Error checking specific SKU in database:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
