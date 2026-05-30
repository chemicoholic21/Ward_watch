import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { complaint_id, ghost_office_id, platform = 'twitter' } = await req.json();

    let content = '';
    const hashtags = ['#BengaluruCitizen', '#CivicRights', '#WardWatch'];

    if (complaint_id) {
      const complaint = await esService.get<any>(ES_INDICES.CIVIC_EVENTS, complaint_id);
      if (!complaint) {
        return NextResponse.json({ success: false, error: 'Complaint not found' }, { status: 404 });
      }
      hashtags.push(`#${complaint.department.replace(/\s+/g, '')}`);

      content =
        platform === 'twitter'
          ? `⚠️ Complaint ${complaint_id} pending for ${complaint.days_open} days with @${complaint.department}!\n\n📍 ${complaint.ward_name}\n📋 ${complaint.category}\n⏳ Status: ${complaint.status}\n\nDear @ABORINGDYSTOPIA, please act! ${hashtags.join(' ')}`
          : `🚨 ATTENTION @${complaint.department}\n\nComplaint ID: ${complaint_id}\nPending: ${complaint.days_open} days\nWard: ${complaint.ward_name}\nCategory: ${complaint.category}\n\nCitizens deserve better! When will this be resolved?\n\n${hashtags.join(' ')}`;
    } else if (ghost_office_id) {
      const office = await ghostOfficeDetector.getGhostOfficeById(ghost_office_id);
      if (!office) {
        return NextResponse.json({ success: false, error: 'Ghost office not found' }, { status: 404 });
      }
      hashtags.push(`#${office.department.replace(/\s+/g, '')}`);

      content =
        platform === 'twitter'
          ? `👻 GHOST OFFICE ALERT!\n\n${office.department} in ${office.ward_name} has a Ghost Score of ${office.ghost_score}/100\n\n📊 ${office.factors.overdue_percentage}% complaints overdue\n🔄 ${office.factors.stagnation_rate}% stagnation rate\n\n@CMofKarnataka please investigate! ${hashtags.join(' ')}`
          : `👻 Is anyone working at ${office.department} ${office.ward_name}?\n\nOur analysis shows:\n- Ghost Score: ${office.ghost_score}/100 (Alert Level: ${office.alert_level})\n- Overdue: ${office.factors.overdue_percentage}%\n- Avg Resolution: ${office.factors.avg_resolution_days} days\n\nCitizens are suffering! ${hashtags.join(' ')}`;
    } else {
      return NextResponse.json(
        { success: false, error: 'Either complaint_id or ghost_office_id is required' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        platform,
        content,
        character_count: content.length,
        hashtags,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating social post:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
