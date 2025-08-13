import { NextRequest, NextResponse } from 'next/server';
import { getSyncSession, getBatchResults, getActiveSyncSessions } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    console.log('Debug batch failures endpoint called');
    
    // Get recent active sessions
    const sessionsResult = await getActiveSyncSessions();
    const recentSessions = sessionsResult.success ? sessionsResult.data.slice(0, limit) : [];
    
    let currentSession = null;
    let batchResults = [];
    
    if (sessionId) {
      // Get specific session details
      const sessionResult = await getSyncSession(sessionId);
      if (sessionResult.success && sessionResult.data) {
        currentSession = sessionResult.data;
        
        // Get batch results for this session
        const batchResultsResult = await getBatchResults(sessionId);
        if (batchResultsResult.success) {
          batchResults = batchResultsResult.data;
        }
      }
    } else if (recentSessions.length > 0) {
      // Get details for the most recent session
      const latestSession = recentSessions[0];
      currentSession = latestSession;
      
      // Get batch results for the latest session
      const batchResultsResult = await getBatchResults(latestSession.session_id);
      if (batchResultsResult.success) {
        batchResults = batchResultsResult.data;
      }
    }
    
    // Analyze batch results for patterns
    const analysis = {
      totalBatches: batchResults.length,
      successfulBatches: batchResults.filter(b => b.successful > 0).length,
      failedBatches: batchResults.filter(b => b.failed > 0).length,
      totalSuccessful: batchResults.reduce((sum, b) => sum + b.successful, 0),
      totalFailed: batchResults.reduce((sum, b) => sum + b.failed, 0),
      averageProcessingTime: batchResults.length > 0 ? 
        batchResults.reduce((sum, b) => sum + b.processing_time_ms, 0) / batchResults.length : 0,
      commonFailedSkus: [] as string[],
      errorMessages: [] as string[]
    };
    
    // Extract common failed SKUs and error messages
    const failedSkusCount: Record<string, number> = {};
    const errorMessageCount: Record<string, number> = {};
    
    for (const batch of batchResults) {
      if (batch.failed_skus && batch.failed_skus.length > 0) {
        for (const sku of batch.failed_skus) {
          failedSkusCount[sku] = (failedSkusCount[sku] || 0) + 1;
        }
      }
      
      if (batch.error_message) {
        errorMessageCount[batch.error_message] = (errorMessageCount[batch.error_message] || 0) + 1;
      }
    }
    
    // Get top failed SKUs
    analysis.commonFailedSkus = Object.entries(failedSkusCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([sku, count]) => `${sku} (${count} times)`);
    
    // Get top error messages
    analysis.errorMessages = Object.entries(errorMessageCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([error, count]) => `${error} (${count} times)`);
    
    return NextResponse.json({
      success: true,
      debug: {
        currentSession,
        recentSessions: recentSessions.slice(0, 5),
        batchResults: batchResults.slice(0, 10), // Limit to first 10 batches
        analysis,
        recommendations: generateRecommendations(analysis, currentSession)
      }
    });
    
  } catch (error) {
    console.error('Debug batch failures error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

function generateRecommendations(analysis: any, session: any): string[] {
  const recommendations = [];
  
  if (analysis.totalFailed > analysis.totalSuccessful) {
    recommendations.push('High failure rate detected - check Flowtrac API connectivity and credentials');
  }
  
  if (analysis.averageProcessingTime > 30000) {
    recommendations.push('Slow processing detected - consider reducing batch size or adding delays');
  }
  
  if (analysis.failedBatches > 0 && analysis.successfulBatches === 0) {
    recommendations.push('All batches failing - likely a systemic issue with Flowtrac API or authentication');
  }
  
  if (analysis.commonFailedSkus.length > 0) {
    recommendations.push(`Specific SKUs failing repeatedly: ${analysis.commonFailedSkus.slice(0, 3).join(', ')}`);
  }
  
  if (session && session.status === 'failed') {
    recommendations.push('Session marked as failed - check session error_message for details');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('No obvious issues detected - check individual batch error messages');
  }
  
  return recommendations;
}
