import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import { createSyncSession, updateSyncSession, getSyncSession, deleteSyncSession } from '../../../lib/database';

const BATCH_SIZE = 120; // Conservative batch size based on testing (150 failed, 120 should be safe)

interface SyncSession {
  session_id: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  total_skus: number;
  current_session: number;
  total_sessions: number;
  processed_skus: number;
  remaining_skus: number;
  batch_size: number;
  started_at: string;
  last_updated: string;
  session_results: Record<string, {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    skus_processed: number;
    successful: number;
    failed: number;
    failed_skus: string[];
    error_message?: string;
  }>;
}

async function loadSession(): Promise<SyncSession | null> {
  try {
    const result = await getSyncSession();
    if (result.success && result.data) {
      return result.data as SyncSession;
    }
  } catch (error) {
    console.error('Error loading session:', error);
  }
  return null;
}

async function saveSession(session: SyncSession): Promise<void> {
  try {
    if (session.session_id) {
      const result = await updateSyncSession(session.session_id, session);
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
  // Load mapping
  let mapping;
  const importedMapping = getImportedMapping();
  
  if (importedMapping) {
    mapping = importedMapping;
  } else {
    // For now, we'll require imported mapping in session mode
    throw new Error('Session mode requires imported mapping data');
  }
  
  // Get all SKUs
  const allSkus = getAllSkus(mapping);
  const totalSkus = allSkus.length;
  const totalSessions = Math.ceil(totalSkus / BATCH_SIZE);
  
  // Create new session
  const session: SyncSession = {
    session_id: `sync-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    status: 'in_progress',
    total_skus: totalSkus,
    current_session: 1,
    total_sessions: totalSessions,
    processed_skus: 0,
    remaining_skus: totalSkus,
    batch_size: BATCH_SIZE,
    started_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
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
    current_batch: session.current_session,
    total_batches: session.total_sessions,
    processed_skus: session.processed_skus,
    remaining_skus: session.remaining_skus,
    batch_size: session.batch_size,
    started_at: new Date(session.started_at),
    last_updated: new Date(session.last_updated)
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
  const nextSession = session.current_session + 1;
  return await processSession(session, nextSession);
}

async function processSession(session: SyncSession, sessionNumber: number) {
  try {
    console.log(`Processing session ${sessionNumber} of ${session.total_sessions}`);
    
    // Update session status
    session.current_session = sessionNumber;
    session.last_updated = new Date().toISOString();
    session.session_results[`session_${sessionNumber}`].status = 'in_progress';
    await saveSession(session);
    
    // Load mapping
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      // For now, we'll require imported mapping in session mode
      throw new Error('Session mode requires imported mapping data');
    }
    
    // Get SKUs for this session
    const allSkus = getAllSkus(mapping);
    const sessionSkus = getSkusForSession(allSkus, sessionNumber);
    
    console.log(`Session ${sessionNumber}: Processing ${sessionSkus.length} SKUs`);
    
    // Check Flowtrac credentials
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (!hasFlowtracCredentials) {
      throw new Error('Flowtrac credentials not configured');
    }
    
    // Process SKUs
    const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
    
    const startTime = Date.now();
    let successfulSkus = 0;
    let failedSkus = 0;
    let failedSkuList: string[] = [];
    
    try {
      // Process batch
      const batchInventory = await fetchFlowtracInventoryWithBins(sessionSkus);
      
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
      
    } catch (batchError) {
      console.error(`Session ${sessionNumber} failed, trying individual SKUs:`, (batchError as Error).message);
      
      // Try individual SKUs as fallback
      const individualInventory: Record<string, any> = {};
      
      for (const sku of sessionSkus) {
        try {
          console.log(`Processing individual SKU: ${sku}`);
          const singleSkuInventory = await fetchFlowtracInventoryWithBins([sku]);
          
          if (singleSkuInventory[sku] && singleSkuInventory[sku].quantity !== undefined) {
            individualInventory[sku] = singleSkuInventory[sku];
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
        }
      }
      
      console.log(`Session ${sessionNumber} individual fallback completed: ${successfulSkus} successful, ${failedSkus} failed`);
      
      // Update session with error
      session.session_results[`session_${sessionNumber}`].error_message = `Batch failed, used individual fallback: ${(batchError as Error).message}`;
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
    if (sessionNumber === session.total_sessions) {
      session.status = 'completed';
      console.log('All sessions completed');
    } else if (session.session_results[`session_${sessionNumber}`].status === 'failed') {
      session.status = 'failed';
      console.log('Session failed, stopping');
    }
    
    session.last_updated = new Date().toISOString();
    await saveSession(session);
    
    return NextResponse.json({
      success: true,
      session: session,
      current_session: sessionNumber,
      session_completed: sessionNumber === session.total_sessions,
      session_failed: session.session_results[`session_${sessionNumber}`].status === 'failed',
      next_session_available: sessionNumber < session.total_sessions && 
                              session.session_results[`session_${sessionNumber}`].status !== 'failed',
      processing_time_ms: duration,
      results: {
        skus_processed: sessionSkus.length,
        successful: successfulSkus,
        failed: failedSkus,
        failed_skus: failedSkuList
      }
    });
    
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
    session.last_updated = new Date().toISOString();
    await saveSession(session);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      session: session
    });
  }
} 