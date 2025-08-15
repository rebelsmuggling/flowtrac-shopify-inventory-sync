import { NextRequest, NextResponse } from 'next/server';
import { getSyncSession, updateSyncSession } from '../../../lib/database';

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
        
        // Trigger the next session by calling the sync-session endpoint
        try {
          // Construct absolute URL for serverless environment
          const baseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : process.env.NEXT_PUBLIC_APP_URL || 'https://flowtrac-shopify-inventory-sync.vercel.app';
          
          const response = await fetch(`${baseUrl}/api/sync-session`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Cron-Auto-Continuation': 'true',
              'User-Agent': 'Vercel-Cron-Auto-Continue'
            },
            body: JSON.stringify({ 
              action: 'continue'
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('Auto-continuation successful:', data.success);
            
            return NextResponse.json({
              success: true,
              message: 'Auto-continuation triggered successfully',
              action_taken: true,
              session_id: session.session_id,
              next_batch: session.current_batch + 1,
              time_since_update_ms: timeSinceUpdate
            });
          } else {
            const errorText = await response.text();
            console.error('Auto-continuation failed:', response.status, errorText);
            
            return NextResponse.json({
              success: false,
              message: 'Auto-continuation failed',
              action_taken: false,
              error: `HTTP ${response.status}: ${errorText}`
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
