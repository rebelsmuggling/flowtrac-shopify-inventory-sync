import { NextRequest, NextResponse } from 'next/server';
import { getSyncSession, updateSyncSession } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'recover';
    
    console.log(`Session recovery action: ${action}`);
    
    switch (action) {
      case 'recover':
        return await recoverStuckSessions();
        
      case 'reset':
        return await resetFailedSessions();
        
      case 'status':
        return await getSessionStatus();
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        });
    }
    
  } catch (error) {
    console.error('Session recovery error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

async function recoverStuckSessions() {
  try {
    const sessionResult = await getSyncSession();
    
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({
        success: true,
        message: 'No active session found',
        recovered: false
      });
    }
    
    const session = sessionResult.data;
    const now = new Date();
    const lastUpdated = new Date(session.last_updated);
    const timeSinceUpdate = now.getTime() - lastUpdated.getTime();
    
    // Consider a session "stuck" if it hasn't been updated in the last 5 minutes
    const stuckThreshold = 5 * 60 * 1000; // 5 minutes
    
    if (session.status === 'in_progress' && timeSinceUpdate > stuckThreshold) {
      console.log(`Session ${session.session_id} appears to be stuck (${Math.round(timeSinceUpdate / 1000)}s since last update)`);
      
      // Reset the session to allow continuation
      const updateResult = await updateSyncSession(session.session_id, {
        ...session,
        last_updated: now,
        status: 'in_progress' // Ensure it's still in progress
      });
      
      if (updateResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Stuck session recovered',
          session: session,
          time_since_update_ms: timeSinceUpdate,
          recovered: true
        });
      } else {
        throw new Error(`Failed to update session: ${updateResult.error}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'No stuck sessions found',
      session: session,
      time_since_update_ms: timeSinceUpdate,
      recovered: false
    });
    
  } catch (error) {
    console.error('Error recovering stuck sessions:', error);
    throw error;
  }
}

async function resetFailedSessions() {
  try {
    const sessionResult = await getSyncSession();
    
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({
        success: true,
        message: 'No active session found',
        reset: false
      });
    }
    
    const session = sessionResult.data;
    
    if (session.status === 'failed') {
      console.log(`Resetting failed session ${session.session_id}`);
      
      // Reset the session to allow continuation
      const updateResult = await updateSyncSession(session.session_id, {
        ...session,
        status: 'in_progress',
        last_updated: new Date()
      });
      
      if (updateResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Failed session reset successfully',
          session: session,
          reset: true
        });
      } else {
        throw new Error(`Failed to reset session: ${updateResult.error}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'No failed sessions found',
      session: session,
      reset: false
    });
    
  } catch (error) {
    console.error('Error resetting failed sessions:', error);
    throw error;
  }
}

async function getSessionStatus() {
  try {
    const sessionResult = await getSyncSession();
    
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({
        success: true,
        has_session: false,
        session: null
      });
    }
    
    const session = sessionResult.data;
    const now = new Date();
    const lastUpdated = new Date(session.last_updated);
    const timeSinceUpdate = now.getTime() - lastUpdated.getTime();
    
    return NextResponse.json({
      success: true,
      has_session: true,
      session: session,
      time_since_update_ms: timeSinceUpdate,
      is_stuck: session.status === 'in_progress' && timeSinceUpdate > 5 * 60 * 1000,
      can_recover: session.status === 'failed' || (session.status === 'in_progress' && timeSinceUpdate > 5 * 60 * 1000)
    });
    
  } catch (error) {
    console.error('Error getting session status:', error);
    throw error;
  }
}
