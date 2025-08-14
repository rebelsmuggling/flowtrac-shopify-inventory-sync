import { NextRequest, NextResponse } from 'next/server';
import { getFlowtracInventory } from '../../../lib/database';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    console.log('Checking inventory quantities in database...');
    
    // First, let's check what database we're connecting to
    const dbInfo = await sql`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        inet_server_addr() as server_address
    `;
    
    // Check for IC-HCPK-0096 specifically
    const specificSku = await sql`
      SELECT * FROM flowtrac_inventory 
      WHERE sku = 'IC-HCPK-0096'
      ORDER BY last_updated DESC
    `;
    
    // Get all inventory from database (no SKU filter, no warehouse filter)
    const inventoryResult = await getFlowtracInventory(undefined, undefined);
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory: ${inventoryResult.error}`
      });
    }
    
    const inventoryData = inventoryResult.data || [];
    
    // Analyze inventory quantities
    const analysis = {
      totalRecords: inventoryData.length,
      recordsWithZeroQuantity: 0,
      recordsWithPositiveQuantity: 0,
      totalQuantity: 0,
      averageQuantity: 0,
      maxQuantity: 0,
      minQuantity: 0
    };
    
    let totalQuantity = 0;
    let maxQuantity = 0;
    let minQuantity = Infinity;
    
    for (const record of inventoryData) {
      const quantity = record.quantity || 0;
      totalQuantity += quantity;
      
      if (quantity === 0) {
        analysis.recordsWithZeroQuantity++;
      } else {
        analysis.recordsWithPositiveQuantity++;
      }
      
      if (quantity > maxQuantity) {
        maxQuantity = quantity;
      }
      
      if (quantity < minQuantity) {
        minQuantity = quantity;
      }
    }
    
    analysis.totalQuantity = totalQuantity;
    analysis.averageQuantity = inventoryData.length > 0 ? totalQuantity / inventoryData.length : 0;
    analysis.maxQuantity = maxQuantity;
    analysis.minQuantity = minQuantity === Infinity ? 0 : minQuantity;
    
    // Get sample records
    const sampleRecords = inventoryData.slice(0, limit);
    const positiveQuantityRecords = inventoryData
      .filter(record => (record.quantity || 0) > 0)
      .slice(0, limit);
    const zeroQuantityRecords = inventoryData
      .filter(record => (record.quantity || 0) === 0)
      .slice(0, limit);
    
    // Check specific SKUs that should be working
    const workingSkus = [
      'IC-KOOL-004', 'IC-HCPK-005', 'IC-MILI-0028', 'IC-MILI-0056', 
      'RS-KEWS-000', 'IC-HCPK-004', 'IC-FURI-0008', 'IC-DAVI-012', 'RS-KOOL-009'
    ];
    
    const workingSkuInventory = workingSkus.map(sku => {
      const record = inventoryData.find(r => r.sku === sku);
      return {
        sku,
        found: !!record,
        quantity: record?.quantity || 0,
        warehouse: record?.warehouse,
        bins: record?.bins
      };
    });
    
    return NextResponse.json({
      success: true,
      databaseInfo: dbInfo.rows[0],
      specificSkuCheck: {
        sku: 'IC-HCPK-0096',
        found: specificSku.rows.length > 0,
        records: specificSku.rows
      },
      analysis,
      sampleRecords,
      positiveQuantityRecords,
      zeroQuantityRecords,
      workingSkuInventory,
      summary: {
        percentageWithZeroQuantity: inventoryData.length > 0 ? (analysis.recordsWithZeroQuantity / inventoryData.length) * 100 : 0,
        percentageWithPositiveQuantity: inventoryData.length > 0 ? (analysis.recordsWithPositiveQuantity / inventoryData.length) * 100 : 0
      }
    });
    
  } catch (error) {
    console.error('Error checking inventory quantities:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
