#!/usr/bin/env node
/**
 * Seed MongoDB with GhostOffice sample data.
 *
 *   npm run seed
 *   # or
 *   MONGO_URI=mongodb+srv://... npm run seed
 *
 * Populates: civic_events (5k), scam_reports (500), ghost_offices (45),
 * ward_metrics (15). Creates 2dsphere + text indexes used by the geo and
 * full-text search routes.
 */

import { MongoClient } from 'mongodb';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });
dotenv.config({ path: join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'ghostoffice';

// ──────────────────────────────────────────────────────────────────────────────
// Reference data
// ──────────────────────────────────────────────────────────────────────────────
const WARDS = [
  { id: 'ward_001', name: 'Mahadevapura', zone: 'East', lat: 12.9698, lng: 77.6970 },
  { id: 'ward_002', name: 'Whitefield', zone: 'East', lat: 12.9698, lng: 77.7500 },
  { id: 'ward_003', name: 'HSR Layout', zone: 'South', lat: 12.9116, lng: 77.6389 },
  { id: 'ward_004', name: 'Koramangala', zone: 'South', lat: 12.9279, lng: 77.6271 },
  { id: 'ward_005', name: 'Indiranagar', zone: 'East', lat: 12.9784, lng: 77.6408 },
  { id: 'ward_006', name: 'Jayanagar', zone: 'South', lat: 12.9250, lng: 77.5938 },
  { id: 'ward_007', name: 'Malleshwaram', zone: 'West', lat: 13.0035, lng: 77.5710 },
  { id: 'ward_008', name: 'Rajajinagar', zone: 'West', lat: 12.9910, lng: 77.5550 },
  { id: 'ward_009', name: 'Yelahanka', zone: 'North', lat: 13.1007, lng: 77.5963 },
  { id: 'ward_010', name: 'Hebbal', zone: 'North', lat: 13.0358, lng: 77.5970 },
  { id: 'ward_011', name: 'BTM Layout', zone: 'South', lat: 12.9166, lng: 77.6101 },
  { id: 'ward_012', name: 'JP Nagar', zone: 'South', lat: 12.9063, lng: 77.5857 },
  { id: 'ward_013', name: 'Banashankari', zone: 'South', lat: 12.9255, lng: 77.5468 },
  { id: 'ward_014', name: 'Electronic City', zone: 'South', lat: 12.8399, lng: 77.6770 },
  { id: 'ward_015', name: 'KR Puram', zone: 'East', lat: 13.0072, lng: 77.6965 },
];

const DEPARTMENTS = ['BBMP', 'BWSSB', 'BESCOM', 'BDA', 'BMTC'];
const CATEGORIES = ['Water Supply', 'Roads', 'Street Lights', 'Sanitation', 'Sewage', 'Property Tax', 'Building Permit'];
const STATUSES = ['open', 'pending', 'in_progress', 'resolved', 'closed'];
const GHOST_WARDS = ['ward_001', 'ward_002', 'ward_003'];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function randomDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, daysBack));
  return d.toISOString();
}

/** Adds the GeoJSON sidecar the 2dsphere index needs. */
function withGeo(geoLocation) {
  return {
    ...geoLocation,
    _geo: { type: 'Point', coordinates: [geoLocation.lon, geoLocation.lat] },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Document generators
// ──────────────────────────────────────────────────────────────────────────────
function generateComplaint(index) {
  const ward = pick(WARDS);
  const isGhostWard = GHOST_WARDS.includes(ward.id);
  const department = pick(DEPARTMENTS);
  const category = pick(CATEGORIES);

  const status = isGhostWard
    ? (Math.random() < 0.7 ? pick(['open', 'pending']) : pick(STATUSES))
    : (Math.random() < 0.6 ? pick(['resolved', 'closed', 'in_progress']) : pick(STATUSES));

  const daysOpen = isGhostWard ? randInt(10, 60) : randInt(1, 25);
  const escalationCount = isGhostWard ? randInt(1, 5) : randInt(0, 2);
  const transferCount = isGhostWard ? randInt(0, 3) : randInt(0, 1);
  const id = `CMP-2024-${String(index).padStart(5, '0')}`;

  return {
    _id: id,
    event_id: id,
    event_type: 'complaint',
    title: `${category} issue in ${ward.name}`,
    description: `Civic complaint regarding ${category.toLowerCase()} problems in ${ward.name} area.`,
    category,
    department,
    ward_id: ward.id,
    ward_name: ward.name,
    zone: ward.zone,
    geo_location: withGeo({
      lat: ward.lat + (Math.random() - 0.5) * 0.01,
      lon: ward.lng + (Math.random() - 0.5) * 0.01,
    }),
    status,
    priority: pick(['low', 'medium', 'high', 'critical']),
    days_open: daysOpen,
    is_overdue: daysOpen > 14,
    escalation_count: escalationCount,
    transfer_count: transferCount,
    created_at: randomDate(90),
    updated_at: randomDate(30),
    citizen_id: `CIT_${randInt(1000, 9999)}`,
  };
}

function generateScamReport(index) {
  const ward = pick(WARDS);
  const department = pick(['BESCOM', 'BWSSB', 'BBMP']);

  const templates = [
    `${department} URGENT: Your connection will be disconnected in 2 hours. Pay Rs. ${randInt(500, 3000)} at bit.ly/pay-now`,
    `Dear Customer, ${department} bill overdue. Clear Rs. ${randInt(1000, 5000)} immediately via UPI: ${randInt(7e9, 9e9)}@paytm`,
    `ALERT: ${department} detected irregularity in your account. Call ${randInt(7e9, 9e9)} to avoid penalty`,
    `${department} Notice: 50% waiver on pending dues if paid today. Contact ${randInt(8e9, 9e9)}`,
  ];

  const riskLevel = pick(['critical', 'high', 'medium', 'low']);
  const trustScore = riskLevel === 'critical' ? randInt(5, 20)
    : riskLevel === 'high' ? randInt(20, 40)
    : riskLevel === 'medium' ? randInt(40, 60) : randInt(60, 85);
  const id = `SCM-2024-${String(index).padStart(4, '0')}`;

  return {
    _id: id,
    report_id: id,
    content: pick(templates),
    source_type: pick(['sms', 'whatsapp', 'email', 'call']),
    spoofed_department: department,
    scam_type: pick(['phishing', 'impersonation', 'payment_fraud', 'data_theft']),
    risk_level: riskLevel,
    trust_score: trustScore,
    scam_probability: 1 - trustScore / 100,
    ward_id: ward.id,
    zone: ward.zone,
    reported_at: randomDate(30),
    victim_reports: riskLevel === 'critical' ? randInt(5, 30) : randInt(0, 10),
    related_outage: {
      is_correlated: Math.random() < 0.3,
      outage_id: `OUT_${randInt(1000, 9999)}`,
    },
    indicators: {
      urgency_language: Math.random() < 0.8,
      payment_request: Math.random() < 0.9,
      suspicious_url: Math.random() < 0.7,
      phone_number: Math.random() < 0.6,
    },
  };
}

function generateGhostOffice(ward, department) {
  const ghostScore = GHOST_WARDS.includes(ward.id) ? randInt(70, 95) : randInt(20, 60);
  const id = `${department}_${ward.id}`;
  return {
    _id: id,
    office_id: id,
    department,
    ward_id: ward.id,
    ward_name: ward.name,
    zone: ward.zone,
    ghost_score: ghostScore,
    ghost_probability: ghostScore / 100,
    alert_level: ghostScore >= 85 ? 'critical' : ghostScore >= 70 ? 'high' : ghostScore >= 50 ? 'medium' : 'low',
    factors: {
      stagnation_rate: randInt(20, 80),
      escalation_loop_frequency: randInt(10, 60),
      avg_resolution_days: randInt(5, 45),
      overdue_percentage: randInt(15, 70),
      transfer_ratio: randInt(5, 40),
    },
    complaint_stats: {
      total: randInt(50, 300),
      open: randInt(20, 150),
      resolved: randInt(20, 150),
      overdue: randInt(10, 80),
    },
    calculated_at: new Date().toISOString(),
    rank: 0,
  };
}

function generateWardMetric(ward, index) {
  return {
    _id: ward.id,
    ward_id: ward.id,
    ward_name: ward.name,
    ward_number: index + 1,
    zone: ward.zone,
    centroid: withGeo({ lat: ward.lat, lon: ward.lng }),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n🌱 Seeding GhostOffice MongoDB\n');

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    console.log(`✅ Connected to ${MONGO_URI.replace(/:\/\/[^@]+@/, '://***:***@')}\n`);
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    process.exit(1);
  }

  const db = client.db(MONGO_DB);

  // ── Indexes ───────────────────────────────────────────────────────────────
  console.log('🗂  Ensuring indexes...');
  await Promise.all([
    db.collection('civic_events').createIndex({ 'geo_location._geo': '2dsphere' }),
    db.collection('civic_events').createIndex({ status: 1 }),
    db.collection('civic_events').createIndex({ department: 1 }),
    db.collection('civic_events').createIndex({ ward_id: 1 }),
    db.collection('civic_events').createIndex({ zone: 1 }),
    db.collection('civic_events').createIndex({ created_at: -1 }),
    db.collection('civic_events').createIndex({ title: 'text', description: 'text', category: 'text' }),
    db.collection('scam_reports').createIndex({ risk_level: 1 }),
    db.collection('scam_reports').createIndex({ reported_at: -1 }),
    db.collection('scam_reports').createIndex({ spoofed_department: 1 }),
    db.collection('ghost_offices').createIndex({ ghost_score: -1 }),
    db.collection('ghost_offices').createIndex({ department: 1, ward_id: 1 }),
    db.collection('ward_metrics').createIndex({ 'centroid._geo': '2dsphere' }),
    db.collection('ward_metrics').createIndex({ ward_number: 1 }),
  ]);
  console.log('   ✅ Indexes ready\n');

  // ── Complaints ────────────────────────────────────────────────────────────
  console.log('📝 Generating 5000 complaints...');
  const complaints = [];
  for (let i = 1; i <= 5000; i++) complaints.push(generateComplaint(i));
  await db.collection('civic_events').deleteMany({});
  await bulkInsert(db.collection('civic_events'), complaints);
  console.log(`   ✅ Inserted ${complaints.length} complaints\n`);

  // ── Scam reports ──────────────────────────────────────────────────────────
  console.log('🚨 Generating 500 scam reports...');
  const reports = [];
  for (let i = 1; i <= 500; i++) reports.push(generateScamReport(i));
  await db.collection('scam_reports').deleteMany({});
  await bulkInsert(db.collection('scam_reports'), reports);
  console.log(`   ✅ Inserted ${reports.length} scam reports\n`);

  // ── Ghost offices ─────────────────────────────────────────────────────────
  console.log('👻 Generating ghost office scores...');
  const offices = [];
  for (const ward of WARDS) {
    for (const dept of DEPARTMENTS.slice(0, 3)) offices.push(generateGhostOffice(ward, dept));
  }
  offices.sort((a, b) => b.ghost_score - a.ghost_score);
  offices.forEach((o, i) => (o.rank = i + 1));
  await db.collection('ghost_offices').deleteMany({});
  await bulkInsert(db.collection('ghost_offices'), offices);
  console.log(`   ✅ Inserted ${offices.length} ghost office scores\n`);

  // ── Wards ─────────────────────────────────────────────────────────────────
  console.log('🗺  Generating ward metrics...');
  const wardDocs = WARDS.map((w, i) => generateWardMetric(w, i));
  await db.collection('ward_metrics').deleteMany({});
  await bulkInsert(db.collection('ward_metrics'), wardDocs);
  console.log(`   ✅ Inserted ${wardDocs.length} ward metrics\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    db.collection('civic_events').countDocuments(),
    db.collection('scam_reports').countDocuments(),
    db.collection('ghost_offices').countDocuments(),
    db.collection('ward_metrics').countDocuments(),
  ]);

  console.log('📊 Collection counts:');
  console.log(`   - civic_events:  ${counts[0]}`);
  console.log(`   - scam_reports:  ${counts[1]}`);
  console.log(`   - ghost_offices: ${counts[2]}`);
  console.log(`   - ward_metrics:  ${counts[3]}`);
  console.log('\n✅ Seeding complete!\n');
  console.log('Next: npm run dev → http://localhost:3000\n');

  await client.close();
}

async function bulkInsert(collection, docs) {
  if (!docs.length) return;
  await collection.bulkWrite(
    docs.map(doc => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    })),
    { ordered: false },
  );
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
