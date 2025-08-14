import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    console.log('Checking database connection...');

    // Test basic connection
    const connectionTest = await sql`SELECT 1 as test`;
    
    // Get database info
    const dbInfo = await sql`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as postgres_version,
        inet_server_addr() as server_address,
        inet_server_port() as server_port
    `;

    // Check if our tables exist
    const tablesExist = await sql`
      SELECT 
        table_name,
        table_schema
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('flowtrac_inventory', 'mapping', 'sync_sessions')
      ORDER BY table_name
    `;

    // Get total record count from flowtrac_inventory
    const recordCount = await sql`
      SELECT COUNT(*) as total_records FROM flowtrac_inventory
    `;

    // Check for IC-HCPK-0096 specifically
    const specificSku = await sql`
      SELECT * FROM flowtrac_inventory 
      WHERE sku = 'IC-HCPK-0096'
      ORDER BY last_updated DESC
    `;

    // Get environment variables (without exposing sensitive data)
    const envInfo = {
      hasPostgresUrl: !!process.env.POSTGRES_URL,
      hasPostgresHost: !!process.env.POSTGRES_HOST,
      hasPostgresDatabase: !!process.env.POSTGRES_DATABASE,
      hasPostgresUser: !!process.env.POSTGRES_USER,
      hasPostgresPassword: !!process.env.POSTGRES_PASSWORD,
      hasVercelUrl: !!process.env.VERCEL_URL,
      nodeEnv: process.env.NODE_ENV
    };

    return NextResponse.json({
      success: true,
      connectionTest: connectionTest.rows[0],
      databaseInfo: dbInfo.rows[0],
      tablesExist: tablesExist.rows,
      recordCount: recordCount.rows[0],
      specificSku: {
        found: specificSku.rows.length > 0,
        records: specificSku.rows
      },
      environmentInfo: envInfo
    });

  } catch (error) {
    console.error('Database connection test error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
