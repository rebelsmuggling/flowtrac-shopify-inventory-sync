import { NextRequest, NextResponse } from 'next/server';
import { updateShipStationWarehouseLocationBulk } from '../../../../services/shipstation';

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
    const shipstationUpdates: Array<{ sku: string, binLocation: string, quantity: number }> = [];
    
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        if (record.quantity > 0) {
          if (record.bins && record.bins.length > 0) {
            // Has inventory with specific bins - use the first bin as the primary location
            const primaryBin = record.bins[0];
            shipstationUpdates.push({
              sku: record.sku,
              binLocation: primaryBin,
              quantity: record.quantity
            });
          } else {
            // Has inventory but no specific bins, use default location
            shipstationUpdates.push({
              sku: record.sku,
              binLocation: 'Manteca',
              quantity: record.quantity
            });
          }
        } else {
          // Out of stock - set to OOS
          shipstationUpdates.push({
            sku: record.sku,
            binLocation: 'OOS',
            quantity: 0
          });
        }
      }
    }
    
    console.log(`Prepared ${shipstationUpdates.length} ShipStation updates based on Flowtrac inventory data`);
    
    // 3. Submit all updates in a single bulk operation
    const results = {
      total: shipstationUpdates.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[],
      bulkResult: null as any
    };
    
    try {
      // Prepare bulk update data (only need sku and binLocation for the API call)
      const bulkUpdates = shipstationUpdates.map(update => ({
        sku: update.sku,
        binLocation: update.binLocation
      }));
      
      const bulkResult = await updateShipStationWarehouseLocationBulk(bulkUpdates);
      results.bulkResult = bulkResult;
      
      // The bulk function always returns success: true, but may have failed items
      results.successful = bulkResult.successful;
      results.failed = bulkResult.failed;
      
      // Add successful updates to results
      for (const successResult of bulkResult.results.successful) {
        const originalUpdate = shipstationUpdates.find(u => u.sku === successResult.sku);
        results.updates.push({
          flowtrac_sku: successResult.sku,
          bin_location: successResult.binLocation,
          quantity: originalUpdate?.quantity || 0
        });
      }
      
      // Add failed updates to errors
      for (const failedResult of bulkResult.results.failed) {
        const errorMessage = `Failed to update ShipStation for ${failedResult.sku}: ${failedResult.error}`;
        results.errors.push(errorMessage);
      }
      
      console.log(`✅ Bulk ShipStation update completed: ${results.successful}/${results.total} successful`);
      
    } catch (error) {
      results.failed = results.total;
      const errorMessage = `Bulk ShipStation update failed: ${(error as Error).message}`;
      results.errors.push(errorMessage);
      console.error(`❌ ${errorMessage}`);
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
        updates: results.updates,
        bulkResult: results.bulkResult
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
