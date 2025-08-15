import { NextRequest, NextResponse } from 'next/server';
import { getSyncSession, deleteSyncSession } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    console.log('Stop main sync requested');
    
    // Get the current active session
    const sessionResult = await getSyncSession();
    
    if (!sessionResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to get sync session',
        details: sessionResult.error
      });
    }
    
    if (!sessionResult.data) {
      return NextResponse.json({
        success: true,
        message: 'No active sync session found to stop',
        stopped: false
      });
    }
    
    const session = sessionResult.data;
    
    // Check if the session is actually running
    if (session.status !== 'in_progress' && session.status !== 'pending') {
      return NextResponse.json({
        success: true,
        message: `Sync session is not running (status: ${session.status})`,
        session: session,
        stopped: false
      });
    }
    
    // Delete the session to stop it
    const deleteResult = await deleteSyncSession(session.session_id);
    
    if (!deleteResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to stop sync session',
        details: deleteResult.error
      });
    }
    
    console.log(`Main sync stopped: Session ${session.session_id} deleted`);
    
    return NextResponse.json({
      success: true,
      message: 'Main sync stopped successfully',
      session: {
        session_id: session.session_id,
        status: session.status,
        current_batch: session.current_batch,
        total_batches: session.total_batches,
        processed_skus: session.processed_skus,
        total_skus: session.total_skus
      },
      stopped: true
    });
    
  } catch (error) {
    console.error('Error stopping main sync:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
