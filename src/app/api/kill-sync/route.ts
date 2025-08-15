import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    console.log('Kill sync requested');
    
    // Directly delete the active session
    const result = await sql`
      DELETE FROM sync_sessions 
      WHERE status IN ('pending', 'in_progress')
    `;
    
    console.log(`Killed ${result.rowCount} active sync sessions`);
    
    return NextResponse.json({
      success: true,
      message: `Killed ${result.rowCount} active sync session(s)`,
      deletedCount: result.rowCount
    });
    
  } catch (error) {
    console.error('Error killing sync:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
