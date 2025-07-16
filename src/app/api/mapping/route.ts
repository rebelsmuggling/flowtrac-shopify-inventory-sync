import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    
    return NextResponse.json({
      success: true,
      mapping,
      productCount: mapping.products.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to load mapping:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 