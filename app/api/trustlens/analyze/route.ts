import { NextRequest, NextResponse } from 'next/server';
import { trustLensAnalyzer } from '@/lib/server/services/trustlens/analyzer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { content, url, store = false, source_type, ward_id } = await req.json();

    if (!content) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 });
    }

    const result = store
      ? await trustLensAnalyzer.storeReport(content, source_type || 'api', url, ward_id)
      : await trustLensAnalyzer.analyzeContent(content, url);

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error analyzing content:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
