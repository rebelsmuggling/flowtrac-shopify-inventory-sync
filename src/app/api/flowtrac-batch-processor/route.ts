import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import { 
  initializeDatabase, 
  createSyncSession, 
  updateSyncSession, 
  createBatchResult,
  upsertFlowtracInventory,
  getSyncSession,
  getBatchResults,
  FlowtracInventoryRecord,
  clearOldInventoryRecords
} from '../../../lib/database';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';

const BATCH_SIZE = 50; // Reduced batch size to avoid Flowtrac API timeouts

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    const sessionId = url.searchParams.get('sessionId');
    
    switch (action) {
      case 'status':
        if (sessionId) {
          // Get specific session status
          const { getSyncSession } = await import('../../../lib/database');
          const sessionResult = await getSyncSession(sessionId);
          return NextResponse.json({
            success: true,
            session: sessionResult.data
          });
        } else {
          // Get general database stats
          const { getDatabaseStats } = await import('../../../lib/database');
          const stats = await getDatabaseStats();
          return NextResponse.json(stats);
        }
        
      case 'sessions':
        const { getActiveSyncSessions } = await import('../../../lib/database');
        const sessions = await getActiveSyncSessions();
        return NextResponse.json(sessions);
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        });
    }
  } catch (error) {
    console.error('Flowtrac batch processor error:', error);
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
    
    console.log(`Flowtrac batch processor action: ${action}`);
    
    switch (action) {
      case 'start':
        return await startBatchProcessing();
        
      case 'continue':
        const sessionId = body.sessionId;
        if (!sessionId) {
          return NextResponse.json({
            success: false,
            error: 'Session ID required'
          });
        }
        return await continueBatchProcessing(sessionId);
        
      case 'refresh':
        return await refreshDatabase();
        
      case 'initialize':
        console.log('Manual database initialization requested');
        const initResult = await initializeDatabase();
        console.log('Database initialization result:', initResult);
        return NextResponse.json(initResult);
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        });
    }
    
  } catch (error) {
    console.error('Flowtrac batch processor POST error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

async function startBatchProcessing() {
  try {
    // Initialize database if needed
    console.log('Initializing database...');
    const initResult = await initializeDatabase();
    if (!initResult.success) {
      console.error('Database initialization failed:', initResult.error);
      throw new Error(`Database initialization failed: ${initResult.error}`);
    }
    console.log('Database initialized successfully');
    
    // Load mapping
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      const mappingPath = require('path').join(process.cwd(), 'mapping.json');
      mapping = JSON.parse(require('fs').readFileSync(mappingPath, 'utf-8'));
    }
    
    // Get all SKUs from current mapping
    const allSkus = getAllSkus(mapping);
    const totalSkus = allSkus.length;
    const totalBatches = Math.ceil(totalSkus / BATCH_SIZE);
    
    // Clear old inventory records that are no longer in the mapping
    console.log('Clearing old inventory records...');
    const clearResult = await clearOldInventoryRecords(allSkus);
    if (clearResult.success) {
      console.log(`Cleared ${clearResult.deletedCount} old inventory records`);
    } else {
      console.error('Failed to clear old inventory records:', clearResult.error);
    }
    
    // Create session
    const sessionId = `flowtrac-batch-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const session = {
      session_id: sessionId,
      status: 'in_progress' as const,
      total_skus: totalSkus,
      current_batch: 1,
      total_batches: totalBatches,
      processed_skus: 0,
      remaining_skus: totalSkus,
      batch_size: BATCH_SIZE,
      started_at: new Date(),
      last_updated: new Date()
    };
    
    console.log('Creating sync session...');
    const sessionResult = await createSyncSession(session);
    if (!sessionResult.success) {
      console.error('Failed to create session:', sessionResult.error);
      throw new Error(`Failed to create session: ${sessionResult.error}`);
    }
    console.log('Sync session created successfully:', sessionResult.data);
    
    console.log(`Started batch processing: ${totalSkus} SKUs in ${totalBatches} batches`);
    
    // Process first batch only and return immediately
    return await processBatch(sessionId, 1, allSkus);
    
  } catch (error) {
    console.error('Error starting batch processing:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}

async function continueBatchProcessing(sessionId: string) {
  try {
    // Get current session
    const sessionResult = await getSyncSession(sessionId);
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({
        success: false,
        error: 'Session not found'
      });
    }
    
    const session = sessionResult.data;
    
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
    
    // Load mapping for SKU list
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      const mappingPath = require('path').join(process.cwd(), 'mapping.json');
      mapping = JSON.parse(require('fs').readFileSync(mappingPath, 'utf-8'));
    }
    
    const allSkus = getAllSkus(mapping);
    const nextBatch = session.current_batch + 1;
    
    return await processBatch(sessionId, nextBatch, allSkus);
    
  } catch (error) {
    console.error('Error continuing batch processing:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}

async function processBatch(sessionId: string, batchNumber: number, allSkus: string[]) {
  try {
    console.log(`Processing batch ${batchNumber} for session ${sessionId}`);
    
    // Update session status
    await updateSyncSession(sessionId, {
      current_batch: batchNumber,
      last_updated: new Date()
    });
    
    // Get SKUs for this batch
    const startIndex = (batchNumber - 1) * BATCH_SIZE;
    const endIndex = Math.min(startIndex + BATCH_SIZE, allSkus.length);
    const batchSkus = allSkus.slice(startIndex, endIndex);
    
    console.log(`Batch ${batchNumber}: Processing ${batchSkus.length} SKUs`);
    
    // Check Flowtrac credentials
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (!hasFlowtracCredentials) {
      throw new Error('Flowtrac credentials not configured');
    }
    
    const startTime = Date.now();
    let successfulSkus = 0;
    let failedSkus = 0;
    let failedSkuList: string[] = [];
    let inventoryRecords: FlowtracInventoryRecord[] = [];
    
    try {
      // Process batch
      console.log(`Attempting batch request for ${batchSkus.length} SKUs:`, batchSkus.slice(0, 5).join(', ') + (batchSkus.length > 5 ? '...' : ''));
      const batchInventory = await fetchFlowtracInventoryWithBins(batchSkus);
      console.log(`Batch request successful, got data for ${Object.keys(batchInventory).length} SKUs`);
      
      // Convert to database records
      for (const sku of batchSkus) {
        if (batchInventory[sku] && batchInventory[sku].quantity !== undefined) {
          inventoryRecords.push({
            sku: sku,
            quantity: batchInventory[sku].quantity,
            warehouse: 'Manteca', // Focus on Manteca warehouse
            bins: batchInventory[sku].bins || [],
            bin_breakdown: batchInventory[sku].binBreakdown || {},
            last_updated: new Date(),
            source: 'flowtrac_api' as const,
            batch_id: sessionId
          });
          successfulSkus++;
        } else {
          failedSkus++;
          failedSkuList.push(sku);
        }
      }
      
      console.log(`Batch ${batchNumber} completed: ${successfulSkus} successful, ${failedSkus} failed`);
      
    } catch (batchError) {
      console.error(`Batch ${batchNumber} failed with error:`, {
        message: (batchError as Error).message,
        stack: (batchError as Error).stack,
        batchSize: batchSkus.length,
        firstFewSkus: batchSkus.slice(0, 3)
      });
      console.log(`Trying individual SKUs as fallback...`);
      
      // Try individual SKUs as fallback
      for (const sku of batchSkus) {
        try {
          console.log(`Processing individual SKU: ${sku}`);
          const singleSkuInventory = await fetchFlowtracInventoryWithBins([sku]);
          
          if (singleSkuInventory[sku] && singleSkuInventory[sku].quantity !== undefined) {
            inventoryRecords.push({
              sku: sku,
              quantity: singleSkuInventory[sku].quantity,
              warehouse: 'Manteca',
              bins: singleSkuInventory[sku].bins || [],
              bin_breakdown: singleSkuInventory[sku].binBreakdown || {},
              last_updated: new Date(),
              source: 'flowtrac_api' as const,
              batch_id: sessionId
            });
            successfulSkus++;
            console.log(`✓ SKU ${sku} successful`);
          } else {
            failedSkus++;
            failedSkuList.push(sku);
            console.log(`✗ SKU ${sku} failed - not found`);
          }
          
          // Small delay between individual SKUs
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (skuError) {
          failedSkus++;
          failedSkuList.push(sku);
          console.log(`✗ SKU ${sku} failed - error: ${(skuError as Error).message}`);
          console.error(`Individual SKU error details for ${sku}:`, {
            message: (skuError as Error).message,
            stack: (skuError as Error).stack
          });
        }
      }
      
      console.log(`Batch ${batchNumber} individual fallback completed: ${successfulSkus} successful, ${failedSkus} failed`);
    }
    
    // Save inventory records to database
    if (inventoryRecords.length > 0) {
      const upsertResult = await upsertFlowtracInventory(inventoryRecords);
      if (!upsertResult.success) {
        console.error('Failed to save inventory records:', upsertResult.error);
      } else {
        console.log(`Saved ${upsertResult.recordsUpdated} inventory records to database`);
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Save batch result
    await createBatchResult({
      session_id: sessionId,
      batch_number: batchNumber,
      skus_processed: batchSkus.length,
      successful: successfulSkus,
      failed: failedSkus,
      failed_skus: failedSkuList,
      processing_time_ms: duration,
      completed_at: new Date(),
      error_message: failedSkus === batchSkus.length ? 'All SKUs failed' : undefined
    });
    
    // Update session progress
    const sessionResult = await getSyncSession(sessionId);
    if (sessionResult.success && sessionResult.data) {
      const session = sessionResult.data;
      const newProcessedSkus = session.processed_skus + batchSkus.length;
      const newRemainingSkus = session.total_skus - newProcessedSkus;
      
      const sessionUpdates: any = {
        processed_skus: newProcessedSkus,
        remaining_skus: newRemainingSkus,
        last_updated: new Date()
      };
      
      // Check if this batch failed completely
      if (failedSkus === batchSkus.length) {
        sessionUpdates.status = 'failed';
        sessionUpdates.error_message = 'Batch failed - all SKUs failed';
        console.log('Batch failed, stopping');
        await updateSyncSession(sessionId, sessionUpdates);
        
        return NextResponse.json({
          success: false,
          error: 'Batch failed - all SKUs failed',
          session_id: sessionId,
          batch_number: batchNumber,
          session_failed: true,
          results: {
            skus_processed: batchSkus.length,
            successful: successfulSkus,
            failed: failedSkus,
            failed_skus: failedSkuList,
            records_saved: inventoryRecords.length
          }
        });
      }
      
      // Check if all batches are complete
      if (batchNumber === session.total_batches) {
        sessionUpdates.status = 'completed';
        sessionUpdates.completed_at = new Date();
        console.log('All batches completed');
        await updateSyncSession(sessionId, sessionUpdates);
        
        return NextResponse.json({
          success: true,
          session_id: sessionId,
          batch_number: batchNumber,
          batch_completed: true,
          session_completed: true,
          processing_time_ms: duration,
          results: {
            skus_processed: batchSkus.length,
            successful: successfulSkus,
            failed: failedSkus,
            failed_skus: failedSkuList,
            records_saved: inventoryRecords.length
          }
        });
      }
      
      // Update session
      await updateSyncSession(sessionId, sessionUpdates);
      
      // Return with next batch available (frontend will handle continuation)
      if (batchNumber < session.total_batches) {
        console.log(`Batch ${batchNumber} completed, next batch ${batchNumber + 1} available`);
        
        return NextResponse.json({
          success: true,
          session_id: sessionId,
          batch_number: batchNumber,
          batch_completed: true,
          next_batch_available: true,
          auto_continue: true,
          processing_time_ms: duration,
          results: {
            skus_processed: batchSkus.length,
            successful: successfulSkus,
            failed: failedSkus,
            failed_skus: failedSkuList,
            records_saved: inventoryRecords.length
          }
        });
      }
      
      return NextResponse.json({
        success: true,
        session_id: sessionId,
        batch_number: batchNumber,
        batch_completed: true,
        next_batch_available: false,
        processing_time_ms: duration,
        results: {
          skus_processed: batchSkus.length,
          successful: successfulSkus,
          failed: failedSkus,
          failed_skus: failedSkuList,
          records_saved: inventoryRecords.length
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      session_id: sessionId,
      batch_number: batchNumber,
      batch_completed: true,
      processing_time_ms: duration,
      results: {
        skus_processed: batchSkus.length,
        successful: successfulSkus,
        failed: failedSkus,
        failed_skus: failedSkuList,
        records_saved: inventoryRecords.length
      }
    });
    
  } catch (error) {
    console.error(`Error processing batch ${batchNumber}:`, error);
    
    // Update session with error
    await updateSyncSession(sessionId, {
      status: 'failed',
      error_message: (error as Error).message,
      last_updated: new Date()
    });
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      session_id: sessionId,
      batch_number: batchNumber
    });
  }
}

async function refreshDatabase() {
  try {
    console.log('Refreshing database...');
    const initResult = await initializeDatabase();
    if (!initResult.success) {
      console.error('Database refresh failed:', initResult.error);
      return NextResponse.json({
        success: false,
        error: `Database refresh failed: ${initResult.error}`
      }, { status: 500 });
    }
    console.log('Database refreshed successfully');

    // Reload mapping
    let mapping;
    const importedMapping = getImportedMapping();
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      const mappingPath = require('path').join(process.cwd(), 'mapping.json');
      mapping = JSON.parse(require('fs').readFileSync(mappingPath, 'utf-8'));
    }

    // Get all SKUs from mapping
    const allSkus = getAllSkus(mapping);
    const totalSkus = allSkus.length;
    const totalBatches = Math.ceil(totalSkus / BATCH_SIZE);

    // Clear old inventory records that are no longer in the mapping
    console.log('Clearing old inventory records...');
    const clearResult = await clearOldInventoryRecords(allSkus);
    if (clearResult.success) {
      console.log(`Cleared ${clearResult.deletedCount} old inventory records`);
    } else {
      console.error('Failed to clear old inventory records:', clearResult.error);
    }

    // Create a new session for the refresh process
    const sessionId = `flowtrac-refresh-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const session = {
      session_id: sessionId,
      status: 'in_progress' as const,
      total_skus: totalSkus,
      current_batch: 1,
      total_batches: totalBatches,
      processed_skus: 0,
      remaining_skus: totalSkus,
      batch_size: BATCH_SIZE,
      started_at: new Date(),
      last_updated: new Date()
    };

    console.log('Creating refresh session...');
    const sessionResult = await createSyncSession(session);
    if (!sessionResult.success) {
      console.error('Failed to create refresh session:', sessionResult.error);
      return NextResponse.json({
        success: false,
        error: `Failed to create refresh session: ${sessionResult.error}`
      }, { status: 500 });
    }
    console.log('Refresh session created successfully:', sessionResult.data);

    console.log(`Started refresh process: ${totalSkus} SKUs in ${totalBatches} batches`);

    // Process first batch only and return immediately
    return await processBatch(sessionId, 1, allSkus);

  } catch (error) {
    console.error('Error during database refresh:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
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