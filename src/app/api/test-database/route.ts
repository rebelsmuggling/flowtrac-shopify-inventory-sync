import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase, getDatabaseStats } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing database connection...');
    
    // Initialize database
    const initResult = await initializeDatabase();
    if (!initResult.success) {
      return NextResponse.json({
        success: false,
        error: `Database initialization failed: ${initResult.error}`
      });
    }
    
    // Get database stats
    const statsResult = await getDatabaseStats();
    if (!statsResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get database stats: ${statsResult.error}`
      });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      stats: statsResult
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
} 