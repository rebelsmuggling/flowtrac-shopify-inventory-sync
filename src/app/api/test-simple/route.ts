import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    success: true, 
    message: 'Simple test endpoint is working',
    timestamp: new Date().toISOString()
  });
} 