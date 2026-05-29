import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const {
      complaint_id,
      ghost_office_id,
      custom_query,
      requester_name = '[YOUR NAME]',
      requester_address = '[YOUR ADDRESS]',
      requester_phone = '[YOUR PHONE]',
    } = await req.json();

    let subject = '';
    let department = '';
    let details = '';
    let evidencePoints: string[] = [];

    if (complaint_id) {
      const complaint = await esService.get<any>(ES_INDICES.CIVIC_EVENTS, complaint_id);
      if (!complaint) {
        return NextResponse.json({ success: false, error: 'Complaint not found' }, { status: 404 });
      }
      subject = `Request for Information regarding complaint ${complaint_id}`;
      department = complaint.department;
      details = `
1. Current status of complaint ID: ${complaint_id} filed on ${complaint.created_at?.split('T')[0]}
2. Name and designation of officer(s) assigned to this complaint
3. Copies of all file notings and internal communications
4. Reason for delay (complaint pending for ${complaint.days_open} days)
5. Timeline for resolution and action taken report
6. Details of any escalations and their outcomes
      `.trim();
      evidencePoints = [
        `Original complaint dated ${complaint.created_at?.split('T')[0]}`,
        `Category: ${complaint.category}`,
        `Days open: ${complaint.days_open}`,
        `Escalation count: ${complaint.escalation_count}`,
      ];
    } else if (ghost_office_id) {
      const office = await ghostOfficeDetector.getGhostOfficeById(ghost_office_id);
      if (!office) {
        return NextResponse.json({ success: false, error: 'Ghost office not found' }, { status: 404 });
      }
      subject = `Request for Information regarding ${office.department} office performance in ${office.ward_name}`;
      department = office.department;
      details = `
1. Total number of complaints received by ${office.department} office in ${office.ward_name} in last 6 months
2. Number of complaints resolved, pending, and overdue
3. Average resolution time and comparison with department SLA
4. Reasons for ${Math.round(office.factors.overdue_percentage)}% overdue complaints
5. Names of officers responsible and action taken for delays
6. Measures being implemented to improve response times
      `.trim();
      evidencePoints = [
        `Ghost Score: ${office.ghost_score}/100`,
        `Overdue Rate: ${office.factors.overdue_percentage}%`,
        `Stagnation Rate: ${office.factors.stagnation_rate}%`,
        `Total complaints: ${office.complaint_stats.total}`,
      ];
    } else if (custom_query) {
      subject = custom_query.subject || 'Request for Civic Information';
      department = custom_query.department || '[DEPARTMENT]';
      details = custom_query.details || '[SPECIFY YOUR INFORMATION REQUEST]';
    } else {
      return NextResponse.json(
        { success: false, error: 'Either complaint_id, ghost_office_id, or custom_query is required' },
        { status: 400 },
      );
    }

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const rtiApplication = {
      type: 'RTI_APPLICATION',
      reference_id: complaint_id || ghost_office_id || `RTI_${Date.now()}`,
      generated_at: new Date().toISOString(),
      format: 'text',
      content: `
═══════════════════════════════════════════════════════════════════════════════
                    RIGHT TO INFORMATION APPLICATION
                  Under Section 6(1) of RTI Act, 2005
═══════════════════════════════════════════════════════════════════════════════

Date: ${today}

To,
The Public Information Officer,
${department},
Government of Karnataka,
Bengaluru - 560001

Subject: ${subject}

Respected Sir/Madam,

I, ${requester_name}, a citizen of India, resident of ${requester_address}, hereby submit this application under the Right to Information Act, 2005, seeking the following information:

INFORMATION REQUESTED:
─────────────────────
${details}

SUPPORTING EVIDENCE:
───────────────────
${evidencePoints.length > 0 ? evidencePoints.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'N/A'}

I am ready to pay the requisite fee of Rs. 10/- as applicable under the RTI Act. Please provide the information within 30 days as stipulated under Section 7(1) of the Act.

I declare that:
1. I am a citizen of India
2. The information is being sought for lawful purposes
3. The information does not relate to any third party

Contact Details:
- Name: ${requester_name}
- Address: ${requester_address}
- Phone: ${requester_phone}

Thanking you,

Yours faithfully,

[Signature]
${requester_name}

Enclosures:
1. Application fee - Rs. 10/- (IPO/DD/Court Fee Stamp)
2. Copy of ID proof (Aadhaar/Voter ID)

═══════════════════════════════════════════════════════════════════════════════
Generated by GhostOffice Platform | https://ghostoffice.civic.in
For assistance, visit: https://rtionline.gov.in
═══════════════════════════════════════════════════════════════════════════════
      `.trim(),
      metadata: {
        department,
        subject,
        evidence_points: evidencePoints,
        fee_required: 10,
        response_deadline_days: 30,
      },
    };

    return NextResponse.json({ success: true, data: rtiApplication });
  } catch (error: any) {
    console.error('Error generating RTI:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
