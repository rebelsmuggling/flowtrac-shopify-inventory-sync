import { NextRequest, NextResponse } from 'next/server';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';

export async function POST(request: NextRequest) {
  try {
    console.log('ShipStation-only sync started');
    
    // 1. Fetch all inventory data from database (includes bin information)
    const { getFlowtracInventory } = await import('../../../lib/database');
    const inventoryResult = await getFlowtracInventory(undefined, 'Manteca'); // Get all SKUs
    
    if (!inventoryResult.success) {
      throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
    }
    
    console.log('Fetched inventory from database', { 
      recordsFound: inventoryResult.data?.length || 0
    });
    
    // 2. Build ShipStation updates directly from Flowtrac inventory data
    const shipstationUpdates: Array<{ flowtracSku: string, binLocation: string, quantity: number }> = [];
    
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        if (record.quantity > 0) {
          if (record.bins && record.bins.length > 0) {
            // Has inventory with specific bins - use the first bin as the primary location
            const primaryBin = record.bins[0];
            shipstationUpdates.push({
              flowtracSku: record.sku,
              binLocation: primaryBin,
              quantity: record.quantity
            });
          } else {
            // Has inventory but no specific bins, use default location
            shipstationUpdates.push({
              flowtracSku: record.sku,
              binLocation: 'Manteca',
              quantity: record.quantity
            });
          }
        } else {
          // Out of stock - set to OOS
          shipstationUpdates.push({
            flowtracSku: record.sku,
            binLocation: 'OOS',
            quantity: 0
          });
        }
      }
    }
    
    console.log(`Prepared ${shipstationUpdates.length} ShipStation updates based on Flowtrac inventory data`);
    
    // 3. Update ShipStation warehouse locations for each Flowtrac SKU
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[]
    };
    
    for (const update of shipstationUpdates) {
      results.total++;
      
      try {
        // Use Flowtrac SKU to update ShipStation
        await updateShipStationWarehouseLocation(update.flowtracSku, update.binLocation);
        
        results.successful++;
        results.updates.push({
          flowtrac_sku: update.flowtracSku,
          bin_location: update.binLocation,
          quantity: update.quantity
        });
        
        if (update.quantity > 0) {
          console.log(`✅ ShipStation update successful: ${update.flowtracSku} → ${update.binLocation} (qty: ${update.quantity})`);
        } else {
          console.log(`📦 ShipStation update successful: ${update.flowtracSku} → OOS (out of stock)`);
        }
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ShipStation for ${update.flowtracSku}: ${(error as Error).message}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      }
    }
    
    console.log(`ShipStation sync completed: ${results.successful}/${results.total} successful`);
    
    return NextResponse.json({
      success: true,
      message: `ShipStation sync completed: ${results.successful}/${results.total} products updated successfully`,
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        successRate: Math.round((results.successful / results.total) * 100),
        errors: results.errors,
        updates: results.updates
      }
    });
    
  } catch (error) {
    console.error('ShipStation sync failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
