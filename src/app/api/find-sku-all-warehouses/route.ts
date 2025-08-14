import { NextRequest, NextResponse } from 'next/server';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-FRSO-00C';
    
    console.log(`Searching for SKU across all warehouses: ${sku}`);
    
    // List of warehouses to check
    const warehouses = ['Manteca', 'Sacramento', 'Fresno', 'Stockton', 'Oakland'];
    
    const results = {
      sku,
      searchResults: [] as any[],
      foundInAnyWarehouse: false,
      totalQuantity: 0,
      warehousesWithSku: [] as string[]
    };
    
    // Search in each warehouse
    for (const warehouse of warehouses) {
      try {
        const inventoryResult = await getFlowtracInventory([sku], warehouse);
        const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
        
        if (inventoryRecord) {
          results.foundInAnyWarehouse = true;
          results.totalQuantity += inventoryRecord.quantity || 0;
          results.warehousesWithSku.push(warehouse);
          
          results.searchResults.push({
            warehouse,
            found: true,
            record: {
              sku: inventoryRecord.sku,
              quantity: inventoryRecord.quantity,
              warehouse: inventoryRecord.warehouse,
              bins: inventoryRecord.bins,
              last_updated: inventoryRecord.last_updated
            }
          });
        } else {
          results.searchResults.push({
            warehouse,
            found: false,
            record: null
          });
        }
      } catch (error) {
        results.searchResults.push({
          warehouse,
          found: false,
          error: (error as Error).message,
          record: null
        });
      }
    }
    
    // Also try searching with slight variations
    const skuVariations = [
      sku,
      sku.replace('00C', '000C'),
      sku.replace('00C', '00C0'),
      sku.replace('00C', '0002'), // Based on the similar SKU found
      sku.replace('IC-FRSO-00C', 'IC-FRSO-0002')
    ];
    
    const variationResults = {
      variations: [] as any[]
    };
    
    for (const variation of skuVariations) {
      if (variation === sku) continue; // Skip the original
      
      try {
        const inventoryResult = await getFlowtracInventory([variation], 'Manteca');
        const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === variation);
        
        if (inventoryRecord) {
          variationResults.variations.push({
            variation,
            found: true,
            record: {
              sku: inventoryRecord.sku,
              quantity: inventoryRecord.quantity,
              warehouse: inventoryRecord.warehouse
            }
          });
        }
      } catch (error) {
        // Ignore errors for variations
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
      variationResults,
      summary: {
        sku,
        foundInAnyWarehouse: results.foundInAnyWarehouse,
        totalQuantity: results.totalQuantity,
        warehousesWithSku: results.warehousesWithSku,
        variationsFound: variationResults.variations.length
      }
    });
    
  } catch (error) {
    console.error('Error searching for SKU across warehouses:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
