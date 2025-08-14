import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { createSyncSession, updateSyncSession, getSyncSession, deleteSyncSession, SyncSession } from '../../../lib/database';

const BATCH_SIZE = 120; // Conservative batch size based on testing (150 failed, 120 should be safe)

// Extended interface for session results that aren't in the database
interface ExtendedSyncSession extends SyncSession {
  session_results: Record<string, {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    skus_processed: number;
    successful: number;
    failed: number;
    failed_skus: string[];
    error_message?: string;
  }>;
}

async function loadSession(): Promise<ExtendedSyncSession | null> {
  try {
    const result = await getSyncSession();
    if (result.success && result.data) {
      // Convert database session to extended session
      const dbSession = result.data as SyncSession;
      return {
        ...dbSession,
        session_results: {} // Initialize empty session results
      } as ExtendedSyncSession;
    }
  } catch (error) {
    console.error('Error loading session:', error);
  }
  return null;
}

async function saveSession(session: ExtendedSyncSession): Promise<void> {
  try {
    if (session.session_id) {
      // Convert to database session format (exclude session_results)
      const { session_results, ...dbSession } = session;
      const result = await updateSyncSession(session.session_id, dbSession);
      if (!result.success) {
        console.error('Error updating session:', result.error);
      }
    }
  } catch (error) {
    console.error('Error saving session:', error);
  }
}

async function clearSession(): Promise<void> {
  try {
    const session = await loadSession();
    if (session?.session_id) {
      await deleteSyncSession(session.session_id);
    }
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

function getAllSkus(mapping: any): string[] {
  const skus = new Set<string>();
  for (const product of mapping.products) {
    if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
      }
    }
  }
  return Array.from(skus);
}

function getSkusForSession(allSkus: string[], sessionNumber: number): string[] {
  const startIndex = (sessionNumber - 1) * BATCH_SIZE;
  const endIndex = Math.min(startIndex + BATCH_SIZE, allSkus.length);
  return allSkus.slice(startIndex, endIndex);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    
    console.log(`Sync session action: ${action}`);
    
    switch (action) {
      case 'status':
        const session = await loadSession();
        return NextResponse.json({
          success: true,
          session: session,
          has_active_session: session !== null && session.status === 'in_progress'
        });
        
      case 'clear':
        await clearSession();
        return NextResponse.json({
          success: true,
          message: 'Session cleared'
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        });
    }
    
  } catch (error) {
    console.error('Sync session error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'start';
    
    console.log(`Sync session POST action: ${action}`);
    
    switch (action) {
      case 'start':
        return await startNewSession();
        
      case 'continue':
        return await continueSession();
        
      case 'clear':
        await clearSession();
        return NextResponse.json({
          success: true,
          message: 'Session cleared'
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        });
    }
    
  } catch (error) {
    console.error('Sync session POST error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

async function startNewSession() {
  // Load mapping using the mapping service (fresh data, no cache)
  const { mapping, source } = await mappingService.getMappingFresh();
  console.log(`Using ${source} mapping data for sync session`);
  
  // Get all SKUs
  const allSkus = getAllSkus(mapping);
  const totalSkus = allSkus.length;
  const totalSessions = Math.ceil(totalSkus / BATCH_SIZE);
  
  // Create new session
  const session: ExtendedSyncSession = {
    session_id: `sync-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    status: 'in_progress',
    total_skus: totalSkus,
    current_batch: 1,
    total_batches: totalSessions,
    processed_skus: 0,
    remaining_skus: totalSkus,
    batch_size: BATCH_SIZE,
    started_at: new Date(),
    last_updated: new Date(),
    session_results: {}
  };
  
  // Initialize session results
  for (let i = 1; i <= totalSessions; i++) {
    session.session_results[`session_${i}`] = {
      status: 'pending',
      skus_processed: 0,
      successful: 0,
      failed: 0,
      failed_skus: []
    };
  }
  
  // Save session to database
  const createResult = await createSyncSession({
    session_id: session.session_id,
    status: 'in_progress',
    total_skus: session.total_skus,
    current_batch: session.current_batch,
    total_batches: session.total_batches,
    processed_skus: session.processed_skus,
    remaining_skus: session.remaining_skus,
    batch_size: session.batch_size,
    started_at: session.started_at,
    last_updated: session.last_updated
  });
  
  if (!createResult.success) {
    throw new Error(`Failed to create session: ${createResult.error}`);
  }
  
  // Process first session
  return await processSession(session, 1);
}

async function continueSession() {
  const session = await loadSession();
  
  if (!session) {
    return NextResponse.json({
      success: false,
      error: 'No active session found'
    });
  }
  
  if (session.status === 'completed') {
    return NextResponse.json({
      success: true,
      message: 'Session already completed',
      session: session
    });
  }
  
  if (session.status === 'failed') {
    return NextResponse.json({
      success: false,
      error: 'Session failed and cannot be continued'
    });
  }
  
  // Process next session
  const nextSession = session.current_batch + 1;
  return await processSession(session, nextSession);
}

async function processSession(session: ExtendedSyncSession, sessionNumber: number) {
  try {
    console.log(`Processing session ${sessionNumber} of ${session.total_batches}`);
    
    // Update session status
    session.current_batch = sessionNumber;
    session.last_updated = new Date();
    session.session_results[`session_${sessionNumber}`].status = 'in_progress';
    await saveSession(session);
    
    // Load mapping using the mapping service (fresh data, no cache)
    const { mapping, source } = await mappingService.getMappingFresh();
    console.log(`Using ${source} mapping data for session processing`);
    
    // Get SKUs for this session
    const allSkus = getAllSkus(mapping);
    const sessionSkus = getSkusForSession(allSkus, sessionNumber);
    
    console.log(`Session ${sessionNumber}: Processing ${sessionSkus.length} SKUs`);
    
    // Check database connection (Flowtrac credentials not needed since we're using database)
    if (!process.env.POSTGRES_URL) {
      throw new Error('Database connection not configured');
    }
    
    // Process SKUs using database instead of Flowtrac API
    const { getFlowtracInventory } = await import('../../../lib/database');
    
    const startTime = Date.now();
    let successfulSkus = 0;
    let failedSkus = 0;
    let failedSkuList: string[] = [];
    
    try {
      // Get inventory from database
      const inventoryResult = await getFlowtracInventory(sessionSkus, 'Manteca');
      
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
      
      console.log(`Fetched inventory from database for session ${sessionNumber}:`, { 
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
      
      console.log(`Session ${sessionNumber} completed: ${successfulSkus} successful, ${failedSkus} failed`);
      
      // Now perform the actual sync to Shopify/Amazon/ShipStation
      console.log(`Starting sync to platforms for session ${sessionNumber}...`);
      
      try {
        // Build shopifyInventory map (simple and bundle SKUs)
        const shopifyInventory: Record<string, number> = {};
        for (const product of mapping.products) {
          if (Array.isArray(product.bundle_components) && product.shopify_sku) {
            const quantities = product.bundle_components.map((comp: any) => {
              const available = batchInventory[comp.flowtrac_sku]?.quantity || 0;
              return Math.floor(available / comp.quantity);
            });
            shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
          } else if (product.shopify_sku && product.flowtrac_sku) {
            shopifyInventory[product.shopify_sku] = batchInventory[product.flowtrac_sku]?.quantity || 0;
          }
        }
        
        console.log(`Built shopifyInventory map with ${Object.keys(shopifyInventory).length} SKUs`);
        
        // Import sync services
        const { enrichMappingWithShopifyVariantAndInventoryIds, updateShopifyInventoryBulk } = await import('../../../../services/shopify');
        const { updateAmazonInventory } = await import('../../../../services/amazon');
        const { updateShipStationWarehouseLocation } = await import('../../../../services/shipstation');
        
        // Self-heal: Enrich mapping with missing Shopify variant and inventory item IDs
        await enrichMappingWithShopifyVariantAndInventoryIds();
        
        // Reload mapping after enrichment
        const { mapping: updatedMapping } = await mappingService.getMappingFresh();
        
        // Prepare Shopify bulk updates
        const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
        
        // Collect all Shopify updates
        for (const [sku, quantity] of Object.entries(shopifyInventory)) {
          const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
          const inventoryItemId = product?.shopify_inventory_item_id;
          
          if (!inventoryItemId) {
            console.error(`No shopify_inventory_item_id for SKU ${sku}`);
          } else {
            shopifyUpdates.push({ inventoryItemId, quantity, sku });
          }
        }
        
        // Bulk Shopify sync
        if (shopifyUpdates.length > 0) {
          console.log(`Starting bulk Shopify update for ${shopifyUpdates.length} items...`);
          const bulkResult = await updateShopifyInventoryBulk(shopifyUpdates);
          console.log(`Bulk Shopify update completed: ${bulkResult.success} successful, ${bulkResult.failed} failed`);
        }
        
        // Amazon sync for products in shopifyInventory
        for (const [sku, quantity] of Object.entries(shopifyInventory)) {
          const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
          
          if (product?.amazon_sku && typeof product.amazon_sku === 'string' && product.amazon_sku.trim() !== '') {
            try {
              const amazonResult = await updateAmazonInventory(product.amazon_sku, quantity);
              console.log(`Amazon sync for SKU ${product.amazon_sku}:`, amazonResult);
            } catch (err: any) {
              console.error(`Failed to update Amazon inventory for SKU ${product.amazon_sku}: ${err.message}`);
            }
          }
        }
        
        // ShipStation sync for all unique flowtrac SKUs
        for (const sku of sessionSkus) {
          const bins = batchInventory[sku]?.bins || [];
          let warehouseLocation;
          if (!bins.length) {
            warehouseLocation = 'OutofStock';
          } else {
            warehouseLocation = bins.join(',');
            if (warehouseLocation.length > 100) {
              let truncated = '';
              for (const bin of bins) {
                if (truncated.length + bin.length + (truncated ? 1 : 0) > 100) break;
                if (truncated) truncated += ',';
                truncated += bin;
              }
              warehouseLocation = truncated;
            }
          }
          
          try {
            await updateShipStationWarehouseLocation(sku, warehouseLocation);
          } catch (err: any) {
            console.error(`Failed to update ShipStation for SKU ${sku}: ${err.message}`);
          }
        }
        
        console.log(`Platform sync completed for session ${sessionNumber}`);
        
      } catch (syncError) {
        console.error(`Platform sync failed for session ${sessionNumber}:`, (syncError as Error).message);
        // Don't fail the session for sync errors, just log them
      }
      
    } catch (batchError) {
      console.error(`Session ${sessionNumber} failed:`, (batchError as Error).message);
      
      // All SKUs failed if database query failed
      failedSkus = sessionSkus.length;
      failedSkuList = [...sessionSkus];
      
      console.log(`Session ${sessionNumber} failed: ${successfulSkus} successful, ${failedSkus} failed`);
      
      // Update session with error
      session.session_results[`session_${sessionNumber}`].error_message = `Database query failed: ${(batchError as Error).message}`;
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Update session results
    session.session_results[`session_${sessionNumber}`] = {
      status: failedSkus === sessionSkus.length ? 'failed' : 'completed',
      skus_processed: sessionSkus.length,
      successful: successfulSkus,
      failed: failedSkus,
      failed_skus: failedSkuList,
      error_message: session.session_results[`session_${sessionNumber}`].error_message
    };
    
    // Update overall session progress
    session.processed_skus += sessionSkus.length;
    session.remaining_skus = session.total_skus - session.processed_skus;
    
    // Check if all sessions are complete
    if (sessionNumber === session.total_batches) {
      session.status = 'completed';
      console.log('All sessions completed');
    } else if (session.session_results[`session_${sessionNumber}`].status === 'failed') {
      session.status = 'failed';
      console.log('Session failed, stopping');
    }
    
    session.last_updated = new Date();
    await saveSession(session);
    
    // Check if we should continue to the next session automatically
    const shouldContinue = sessionNumber < session.total_batches && 
                          session.session_results[`session_${sessionNumber}`].status !== 'failed';
    
    if (shouldContinue) {
      console.log(`Session ${sessionNumber} completed successfully, continuing to session ${sessionNumber + 1}`);
      // Continue to next session automatically
      return await processSession(session, sessionNumber + 1);
    } else {
      console.log(`Session ${sessionNumber} completed. All sessions finished or session failed.`);
      return NextResponse.json({
        success: true,
        session: session,
        current_session: sessionNumber,
        session_completed: sessionNumber === session.total_batches,
        session_failed: session.session_results[`session_${sessionNumber}`].status === 'failed',
        next_session_available: false,
        processing_time_ms: duration,
        results: {
          skus_processed: sessionSkus.length,
          successful: successfulSkus,
          failed: failedSkus,
          failed_skus: failedSkuList
        }
      });
    }
    
  } catch (error) {
    console.error(`Error processing session ${sessionNumber}:`, error);
    
    // Update session with error
    session.session_results[`session_${sessionNumber}`] = {
      status: 'failed',
      skus_processed: 0,
      successful: 0,
      failed: 0,
      failed_skus: [],
      error_message: (error as Error).message
    };
    
    session.status = 'failed';
    session.last_updated = new Date();
    await saveSession(session);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      session: session
    });
  }
} 