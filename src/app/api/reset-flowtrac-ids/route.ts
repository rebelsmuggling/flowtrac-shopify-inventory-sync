import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting Flowtrac product IDs reset...');
    
    // Clear all Flowtrac product IDs
    const result = await sql`
      DELETE FROM flowtrac_product_ids
    `;
    
    console.log(`✅ Cleared ${result.rowCount} Flowtrac product IDs from database`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully cleared ${result.rowCount} Flowtrac product IDs. The system will now fetch fresh product IDs from Flowtrac on the next sync.`,
      clearedCount: result.rowCount
    });

  } catch (error) {
    console.error('Error resetting Flowtrac product IDs:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
