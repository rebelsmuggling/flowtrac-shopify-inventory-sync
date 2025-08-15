import { NextRequest, NextResponse } from 'next/server';
import { getSyncSession, updateSyncSession } from '../../../lib/database';
import { mappingService } from '../../../services/mapping';
import { updateShopifyInventory } from '../../../../services/shopify';
import { updateAmazonInventory } from '../../../../services/amazon';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';

// Helper functions for session processing (copied from sync-session route)
function getAllSkus(mapping: any): string[] {
  const skus = new Set<string>();
  for (const product of mapping.products) {
    // For products with bundle components, we need to track the bundle component SKUs
    // to calculate the finished good quantity, but we don't sync them directly
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
      }
    }
    
    // For simple products, add the flowtrac_sku if it exists
    if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
  }
  return Array.from(skus);
}

function getSkusForSession(allSkus: string[], sessionNumber: number, batchSize: number = 30): string[] {
  const startIndex = (sessionNumber - 1) * batchSize;
  const endIndex = Math.min(startIndex + batchSize, allSkus.length);
  return allSkus.slice(startIndex, endIndex);
}

async function processSessionDirectly(session: any, sessionNumber: number) {
  try {
    console.log(`Auto-continuation: Processing session ${sessionNumber} directly`);
    
    // Update session status
    session.current_batch = sessionNumber;
    session.last_updated = new Date();
    await updateSyncSession(session.session_id, session);
    
    // Load mapping using the mapping service (always fresh from database)
    const { mapping, source } = await mappingService.getMapping();
    console.log(`Auto-continuation: Using ${source} mapping data for session processing`);
    
    // Get SKUs for this session
    const allSkus = getAllSkus(mapping);
    const sessionSkus = getSkusForSession(allSkus, sessionNumber);
    
    console.log(`Auto-continuation: Session ${sessionNumber}: Processing ${sessionSkus.length} SKUs`);
    
    // Check database connection
    if (!process.env.POSTGRES_URL) {
      throw new Error('Database connection not configured');
    }
    
    // Process SKUs using database
    const { getFlowtracInventory } = await import('../../../lib/database');
    
    const startTime = Date.now();
    let successfulSkus = 0;
    let failedSkus = 0;
    let failedSkuList: string[] = [];
    
    try {
      // Get inventory from database with timeout
      const inventoryTimeoutMs = 30000; // 30 second timeout for database query
      const inventoryPromise = getFlowtracInventory(sessionSkus, 'Manteca');
      const inventoryTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), inventoryTimeoutMs)
      );
      
      const inventoryResult = await Promise.race([inventoryPromise, inventoryTimeoutPromise]);
      
      if (!inventoryResult.success) {
        throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
      }
      
      // Convert database records to expected format
      const batchInventory: Record<string, { quantity: number, bins: string[] }> = {};
      if (inventoryResult.data) {
        for (const record of inventoryResult.data) {
          batchInventory[record.sku] = {
            quantity: record.quantity,
            bins: record.bins || []
          };
        }
      }
      
      console.log(`Auto-continuation: Fetched inventory from database for session ${sessionNumber}:`, { 
        recordsFound: inventoryResult.data?.length || 0,
        totalSkus: sessionSkus.length 
      });
      
      // Count results
      for (const sku of sessionSkus) {
        if (batchInventory[sku] && batchInventory[sku].quantity !== undefined) {
          successfulSkus++;
        } else {
          failedSkus++;
          failedSkuList.push(sku);
        }
      }
      
      console.log(`Auto-continuation: Session ${sessionNumber} inventory processing completed: ${successfulSkus} successful, ${failedSkus} failed`);
      
      // Process platform syncs with correct logic
      console.log(`Auto-continuation: Session ${sessionNumber}: Starting platform syncs...`);
      
      // Get mapping to understand product structure
      const { mapping } = await mappingService.getMappingFresh();
      
      // Calculate finished good quantities and sync to platforms
      const finishedGoodsToSync = new Map<string, { shopify_sku?: string, amazon_sku?: string, quantity: number }>();
      
      // Process each product in the mapping
      for (const product of mapping.products) {
        let calculatedQuantity = 0;
        
        if (Array.isArray(product.bundle_components) && product.bundle_components.length > 0) {
          // Bundle product - calculate quantity from components
          console.log(`Auto-continuation: Session ${sessionNumber}: Calculating bundle quantity for ${product.shopify_sku || product.amazon_sku}`);
          
          let minBundleQuantity = Infinity;
          for (const component of product.bundle_components) {
            const componentInventory = batchInventory[component.flowtrac_sku];
            if (componentInventory && componentInventory.quantity !== undefined) {
              const possibleBundles = Math.floor(componentInventory.quantity / component.quantity);
              minBundleQuantity = Math.min(minBundleQuantity, possibleBundles);
            } else {
              minBundleQuantity = 0;
              break;
            }
          }
          
          calculatedQuantity = minBundleQuantity === Infinity ? 0 : minBundleQuantity;
          console.log(`Auto-continuation: Session ${sessionNumber}: Bundle ${product.shopify_sku || product.amazon_sku} calculated quantity: ${calculatedQuantity}`);
          
        } else if (product.flowtrac_sku) {
          // Simple product - use Flowtrac quantity directly
          const simpleInventory = batchInventory[product.flowtrac_sku];
          if (simpleInventory && simpleInventory.quantity !== undefined) {
            calculatedQuantity = simpleInventory.quantity;
            console.log(`Auto-continuation: Session ${sessionNumber}: Simple product ${product.flowtrac_sku} quantity: ${calculatedQuantity}`);
          }
        }
        
        // Add to sync list if we have a quantity and platform SKUs (only finished goods, not components)
        if (calculatedQuantity > 0 && (product.shopify_sku || product.amazon_sku)) {
          const syncKey = product.shopify_sku || product.amazon_sku;
          if (syncKey) {
            finishedGoodsToSync.set(syncKey, {
              shopify_sku: product.shopify_sku,
              amazon_sku: product.amazon_sku,
              quantity: calculatedQuantity
            });
          }
        }
      }
      
      // Sync finished goods to platforms
      for (const [syncKey, syncData] of finishedGoodsToSync) {
        try {
          // Sync to Shopify if we have a shopify_sku
          if (syncData.shopify_sku) {
            console.log(`Auto-continuation: Session ${sessionNumber}: Syncing to Shopify - ${syncData.shopify_sku} quantity ${syncData.quantity}`);
            try {
              await updateShopifyInventory(syncData.shopify_sku, syncData.quantity);
              console.log(`Auto-continuation: Session ${sessionNumber}: Shopify sync successful for ${syncData.shopify_sku}`);
            } catch (shopifyError) {
              console.warn(`Auto-continuation: Session ${sessionNumber}: Shopify update failed for ${syncData.shopify_sku}:`, (shopifyError as Error).message);
              failedSkus++;
              failedSkuList.push(syncData.shopify_sku);
            }
          }
          
          // Sync to Amazon if we have an amazon_sku
          if (syncData.amazon_sku) {
            console.log(`Auto-continuation: Session ${sessionNumber}: Syncing to Amazon - ${syncData.amazon_sku} quantity ${syncData.quantity}`);
            const amazonResult = await updateAmazonInventory(syncData.amazon_sku, syncData.quantity);
            if (!amazonResult.success) {
              const errorMessage = 'error' in amazonResult ? amazonResult.error : 'Unknown error';
              console.warn(`Auto-continuation: Session ${sessionNumber}: Amazon update failed for ${syncData.amazon_sku}:`, errorMessage);
              failedSkus++;
              failedSkuList.push(syncData.amazon_sku);
            } else {
              console.log(`Auto-continuation: Session ${sessionNumber}: Amazon sync successful for ${syncData.amazon_sku}`);
            }
          }
          
          // Update ShipStation warehouse location
          if (syncData.shopify_sku) {
            console.log(`Auto-continuation: Session ${sessionNumber}: Updating ShipStation for ${syncData.shopify_sku}`);
            try {
              await updateShipStationWarehouseLocation(syncData.shopify_sku, 'Manteca');
            } catch (shipstationError) {
              console.warn(`Auto-continuation: Session ${sessionNumber}: ShipStation update failed for ${syncData.shopify_sku}:`, (shipstationError as Error).message);
              // Don't count ShipStation failures as critical
            }
          }
        } catch (error) {
          console.error(`Auto-continuation: Session ${sessionNumber}: Error processing ${syncKey}:`, error);
          failedSkus++;
          failedSkuList.push(syncKey);
        }
      }
      
      // Update session with results
      session.processed_skus += successfulSkus;
      session.remaining_skus = Math.max(0, session.total_skus - session.processed_skus);
      session.last_updated = new Date();
      
      // Check if this was the last session
      if (sessionNumber >= session.total_batches) {
        session.status = 'completed';
        session.completed_at = new Date();
        console.log(`Auto-continuation: All sessions completed successfully`);
      }
      
      await updateSyncSession(session.session_id, session);
      
      const processingTime = Date.now() - startTime;
      console.log(`Auto-continuation: Session ${sessionNumber} completed in ${processingTime}ms`);
      
      return {
        success: true,
        sessionNumber,
        successfulSkus,
        failedSkus,
        failedSkuList,
        processingTime
      };
      
    } catch (error) {
      console.error(`Auto-continuation: Session ${sessionNumber} failed:`, error);
      session.status = 'failed';
      session.error_message = (error as Error).message;
      await updateSyncSession(session.session_id, session);
      
      return {
        success: false,
        sessionNumber,
        error: (error as Error).message
      };
    }
    
  } catch (error) {
    console.error(`Auto-continuation: Error in processSessionDirectly:`, error);
    return {
      success: false,
      sessionNumber,
      error: (error as Error).message
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('Auto-continuation cron job triggered');
    
    // Check if there's an active session
    const sessionResult = await getSyncSession();
    
    if (!sessionResult.success || !sessionResult.data) {
      console.log('No active session found');
      return NextResponse.json({
        success: true,
        message: 'No active session found',
        action_taken: false
      });
    }
    
    const session = sessionResult.data;
    
    // Check if session is in progress and has more batches
    if (session.status === 'in_progress' && session.current_batch < session.total_batches) {
      console.log(`Auto-continuation: Session ${session.session_id} needs continuation`);
      console.log(`Current batch: ${session.current_batch}/${session.total_batches}`);
      
      // Check if session is stuck (no updates in last 2 minutes)
      const now = new Date();
      const lastUpdated = new Date(session.last_updated);
      const timeSinceUpdate = now.getTime() - lastUpdated.getTime();
      const stuckThreshold = 2 * 60 * 1000; // 2 minutes
      
      if (timeSinceUpdate > stuckThreshold) {
        console.log(`Session appears stuck (${Math.round(timeSinceUpdate / 1000)}s since update), triggering continuation`);
        
        // Process the next session directly (no HTTP request needed)
        try {
          const nextSession = session.current_batch + 1;
          console.log(`Auto-continuation: Processing session ${nextSession} directly`);
          
          const result = await processSessionDirectly(session, nextSession);
          
          if (result.success) {
            console.log('Auto-continuation successful:', result);
            
            return NextResponse.json({
              success: true,
              message: 'Auto-continuation completed successfully',
              action_taken: true,
              session_id: session.session_id,
              session_processed: nextSession,
              successful_skus: result.successfulSkus,
              failed_skus: result.failedSkus,
              processing_time_ms: result.processingTime,
              time_since_update_ms: timeSinceUpdate
            });
          } else {
            console.error('Auto-continuation failed:', result.error);
            
            return NextResponse.json({
              success: false,
              message: 'Auto-continuation failed',
              action_taken: false,
              error: result.error,
              session_processed: nextSession
            });
          }
          
        } catch (error) {
          console.error('Auto-continuation error:', (error as Error).message);
          
          return NextResponse.json({
            success: false,
            message: 'Auto-continuation error',
            action_taken: false,
            error: (error as Error).message
          });
        }
      } else {
        console.log(`Session is healthy (${Math.round(timeSinceUpdate / 1000)}s since update), no action needed`);
        
        return NextResponse.json({
          success: true,
          message: 'Session is healthy, no action needed',
          action_taken: false,
          time_since_update_ms: timeSinceUpdate
        });
      }
    } else if (session.status === 'completed') {
      console.log('Session already completed');
      
      return NextResponse.json({
        success: true,
        message: 'Session already completed',
        action_taken: false
      });
    } else if (session.status === 'failed') {
      console.log('Session failed, cannot continue');
      
      return NextResponse.json({
        success: true,
        message: 'Session failed, cannot continue',
        action_taken: false
      });
    } else {
      console.log('Session does not need continuation');
      
      return NextResponse.json({
        success: true,
        message: 'Session does not need continuation',
        action_taken: false
      });
    }
    
  } catch (error) {
    console.error('Auto-continuation cron job error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
