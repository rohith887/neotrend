// /**
//  * Idempotent bootstrap seed for TASA CRM.
//  * Run: npm run seed
//  * Creates roles, demo users, master data, and demo leads.
//  */
// const mongoose = require('mongoose');
// const { connectDB } = require('../config/database');
// const Role = require('../models/Role');
// const User = require('../models/User');
// const Country = require('../models/Country');
// const University = require('../models/University');
// const LeadSource = require('../models/LeadSource');
// const Disposition = require('../models/Disposition');
// const Setting = require('../models/Setting');
// const Report = require('../models/Report');
// const Lead = require('../models/Lead');
// const Interaction = require('../models/Interaction');
// const Activity = require('../models/Activity');
// const Counter = require('../models/Counter');
// 
// const ROLES = [
//   {
//     name: 'AGENT',
//     code: 'agent',
//     description: 'Handles calls and updates leads',
//     permissions: [
//       'lead:fetch',
//       'lead:read-own',
//       'lead:update-own',
//       'lead:disposition',
//       'lead:remark',
//       'lead:callback',
//       'lead:submit',
//       'activity:status',
//     ],
//   },
//   {
//     name: 'SUPERVISOR',
//     code: 'supervisor',
//     description: 'Manages agents, assigns and reviews leads',
//     permissions: [
//       'lead:fetch',
//       'lead:read-own',
//       'lead:update-own',
//       'lead:disposition',
//       'lead:remark',
//       'lead:callback',
//       'lead:submit',
//       'activity:status',
//       'lead:read-all',
//       'lead:assign',
//       'lead:create',
//       'user:read',
//       'user:manage',
//       'report:read',
//       'report:export',
//       'activity:read',
//       'referral:read',
//       'referral:manage',
//     ],
//   },
//   {
//     name: 'COUNSELOR',
//     code: 'counselor',
//     description: 'Manages the student journey after the agent stage (registration onwards)',
//     permissions: [
//       'lead:fetch',
//       'lead:read-own',
//       'lead:update-own',
//       'lead:disposition',
//       'lead:remark',
//       'lead:callback',
//       'lead:submit',
//       'activity:status',
//     ],
//   },
// ];
// 
// const USERS = [
//   {
//     firstName: 'TASA',
//     lastName: 'Supervisor',
//     email: 'supervisor@tasacrm.com',
//     password: 'Supervisor@123',
//     role: 'supervisor',
//     mobile: '+91 90000 00001',
//   },
//   {
//     firstName: 'Rohith',
//     lastName: 'Menon',
//     email: 'agent@tasacrm.com',
//     password: 'Agent@123',
//     role: 'agent',
//     mobile: '+91 90000 00002',
//   },
//   {
//     firstName: 'TASA',
//     lastName: 'Counselor',
//     email: 'counselor@tasacrm.com',
//     password: 'Counselor@123',
//     role: 'counselor',
//     mobile: '+91 90000 00003',
//   },
// ];
// 
// const COUNTRIES = [
//   { name: 'Canada', code: 'CA' },
//   { name: 'United States', code: 'US' },
//   { name: 'United Kingdom', code: 'GB' },
//   { name: 'Australia', code: 'AU' },
//   { name: 'Germany', code: 'DE' },
//   { name: 'Ireland', code: 'IE' },
//   { name: 'New Zealand', code: 'NZ' },
//   { name: 'UAE', code: 'AE' },
//   { name: 'Singapore', code: 'SG' },
// ];
// 
// const UNIVERSITIES = [
//   { name: 'University of Toronto', country: 'Canada' },
//   { name: 'University of British Columbia', country: 'Canada' },
//   { name: 'McGill University', country: 'Canada' },
//   { name: 'University of Waterloo', country: 'Canada' },
//   { name: 'Harvard University', country: 'United States' },
//   { name: 'Stanford University', country: 'United States' },
//   { name: 'New York University', country: 'United States' },
//   { name: 'University of Oxford', country: 'United Kingdom' },
//   { name: 'University College London', country: 'United Kingdom' },
//   { name: 'Imperial College London', country: 'United Kingdom' },
//   { name: 'University of Melbourne', country: 'Australia' },
//   { name: 'University of Sydney', country: 'Australia' },
//   { name: 'Monash University', country: 'Australia' },
//   { name: 'Technical University of Munich', country: 'Germany' },
//   { name: 'Trinity College Dublin', country: 'Ireland' },
//   { name: 'University of Auckland', country: 'New Zealand' },
//   { name: 'University of Wollongong in Dubai', country: 'UAE' },
//   { name: 'National University of Singapore', country: 'Singapore' },
// ];
// 
// const LEAD_SOURCES = [
//   { name: 'Website', description: 'Organic website form' },
//   { name: 'Landing Page', description: 'Campaign landing pages' },
//   { name: 'LinkedIn', description: 'LinkedIn campaigns / outreach' },
//   { name: 'Instagram', description: 'Instagram marketing' },
//   { name: 'Kerala', description: 'Kerala market' },
//   { name: 'KK Upcountry', description: 'Kakinada / upcountry region' },
//   { name: 'Vijayawada', description: 'Vijayawada market' },
//   { name: 'Vizag', description: 'Visakhapatnam market' },
//   { name: 'Meta Lead Generation', description: 'Facebook / Meta leads' },
//   { name: 'WhatsApp', description: 'Enquiries captured via WhatsApp (Meta Cloud API)' },
//   { name: 'Sales Leads', description: 'Direct sales generated' },
//   { name: 'Referral Leads', description: 'Referred by existing students' },
//   { name: 'Organic Website', description: 'Non-paid website traffic' },
// ];
// 
// const DISPOSITIONS = [
//   { name: 'RNR',            type: 'normal',   priority: null, label: 'RNR',           color: '#64748b', requiresCallback: false, requiresProfile: false },
//   { name: 'Callback',       type: 'normal',   priority: null, label: 'Callback',      color: '#f59e0b', requiresCallback: true,  requiresProfile: false },
//   { name: 'Interested',     type: 'normal',   priority: null, label: 'Interested',    color: '#10b981', requiresCallback: false, requiresProfile: true  },
//   { name: 'Not Interested', type: 'normal',   priority: null, label: 'Not Interested',color: '#6b7280', requiresCallback: false, requiresProfile: false },
//   { name: 'P1 - Interested',               type: 'priority', priority: 'P1', label: 'Hot Lead',  color: '#ef4444', requiresCallback: false },
//   { name: 'P1 - Registration Required',    type: 'priority', priority: 'P1', label: 'Hot Lead',  color: '#ef4444', requiresCallback: false },
//   { name: 'P2 - Needs Parent Discussion',  type: 'priority', priority: 'P2', label: 'Warm Lead', color: '#f59e0b', requiresCallback: true  },
//   { name: 'P3 - Exploring',                type: 'priority', priority: 'P3', label: 'Cold Lead', color: '#64748b', requiresCallback: false },
//   // Counselor-specific dispositions
//   { name: 'Registration Started',       type: 'counselor', priority: null, label: 'Registration',   color: '#8b5cf6', requiresCallback: false, requiresProfile: false },
//   { name: 'Documents Collected',        type: 'counselor', priority: null, label: 'Documents',      color: '#06b6d4', requiresCallback: false, requiresProfile: false },
//   { name: 'Application Submitted',      type: 'counselor', priority: null, label: 'Application',    color: '#3b82f6', requiresCallback: false, requiresProfile: false },
//   { name: 'Offer Received',             type: 'counselor', priority: null, label: 'Offer',          color: '#22c55e', requiresCallback: false, requiresProfile: false },
//   { name: 'Visa Filed',                 type: 'counselor', priority: null, label: 'Visa',           color: '#f97316', requiresCallback: false, requiresProfile: false },
//   { name: 'Enrollment Complete',        type: 'counselor', priority: null, label: 'Enrolled',       color: '#10b981', requiresCallback: false, requiresProfile: false },
// ];
// 
// const SETTINGS = [
//   { key: 'leadPool.order',          value: 'fifo',   label: 'Lead pool order',             group: 'leads'   },
//   { key: 'agent.maxActiveLeads',    value: 1,        label: 'Max active leads per agent',  group: 'leads'   },
//   { key: 'lead.referencePrefix',    value: 'TASA',   label: 'Reference ID prefix',         group: 'leads'   },
//   { key: 'app.name',                value: 'TASA CRM', label: 'Application name',          group: 'general' },
// ];
// 
// const REPORTS = [
//   { name: 'Leads Overview',       key: 'overview',          description: 'Summary funnel of all leads',               isActive: true },
//   { name: 'Leads by Source',      key: 'by-source',         description: 'Lead counts per marketing source',           isActive: true },
//   { name: 'Leads by Country',     key: 'by-country',        description: 'Lead counts per preferred country',          isActive: true },
//   { name: 'Leads by Disposition', key: 'by-disposition',    description: 'Lead counts per disposition',                isActive: true },
//   { name: 'Agent Performance',    key: 'agent-performance', description: 'Per-agent call and disposition metrics',      isActive: true },
// ];
// 
// // ── Demo leads (20 unassigned new leads) ────────────────────────
// const DEMO_LEADS = [
//   { studentName: 'Aarav Menon',      mobile: '+91 98470 12345', email: 'aarav.menon@example.com',      intake: 'Fall 2026',   highestEducation: "Bachelor's Degree", gender: 'Male',   collegeName: "St. Joseph's College",    passingYear: '2024', workExperience: 'Fresher',   gpa: '8.2 / 10', countryName: 'Canada',        universityName: 'University of Toronto',           source: 'Website' },
//   { studentName: 'Sneha Pillai',     mobile: '+91 97650 23456', email: 'sneha.pillai@example.com',     intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'SRM Institute',           passingYear: '2025', workExperience: 'Fresher',   gpa: '7.8 / 10', countryName: 'Australia',      universityName: 'University of Melbourne',         source: 'Instagram' },
//   { studentName: 'Karthik Nair',     mobile: '+91 96540 34567', email: 'karthik.nair@example.com',     intake: 'Fall 2026',   highestEducation: "Master's Degree",   gender: 'Male',   collegeName: 'Amrita University',       passingYear: '2023', workExperience: '1 year',    gpa: '8.5 / 10', countryName: 'United Kingdom', universityName: 'University of Oxford',            source: 'LinkedIn' },
//   { studentName: 'Divya Suresh',     mobile: '+91 95430 45678', email: 'divya.suresh@example.com',     intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'VIT Vellore',             passingYear: '2025', workExperience: 'Fresher',   gpa: '9.1 / 10', countryName: 'Canada',        universityName: 'University of British Columbia',  source: 'Website' },
//   { studentName: 'Rahul Krishnan',   mobile: '+91 94320 56789', email: 'rahul.krishnan@example.com',   intake: 'Fall 2026',   highestEducation: "Bachelor's Degree", gender: 'Male',   collegeName: 'NIT Trichy',              passingYear: '2024', workExperience: 'Fresher',   gpa: '8.0 / 10', countryName: 'Germany',       universityName: 'Technical University of Munich',  source: 'Meta Lead Generation' },
//   { studentName: 'Anjali Menon',     mobile: '+91 93210 67890', email: 'anjali.menon@example.com',     intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Manipal Institute',       passingYear: '2025', workExperience: 'Fresher',   gpa: '7.5 / 10', countryName: 'Ireland',       universityName: 'Trinity College Dublin',           source: 'Landing Page' },
//   { studentName: 'Arun Sharma',      mobile: '+91 92100 78901', email: 'arun.sharma@example.com',      intake: 'Fall 2026',   highestEducation: "Bachelor's Degree", gender: 'Male',   collegeName: 'BITS Pilani',             passingYear: '2024', workExperience: '6 months',  gpa: '8.7 / 10', countryName: 'United States',  universityName: 'Stanford University',             source: 'Referral Leads' },
//   { studentName: 'Priya Nambiar',    mobile: '+91 91000 89012', email: 'priya.nambiar@example.com',    intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Christ University',       passingYear: '2025', workExperience: 'Fresher',   gpa: '8.3 / 10', countryName: 'Singapore',     universityName: 'National University of Singapore', source: 'Instagram' },
//   { studentName: 'Vikram Iyer',      mobile: '+91 90000 90123', email: 'vikram.iyer@example.com',      intake: 'Fall 2026',   highestEducation: "Master's Degree",   gender: 'Male',   collegeName: 'IIT Madras',              passingYear: '2022', workExperience: '2 years',   gpa: '9.4 / 10', countryName: 'United Kingdom', universityName: 'Imperial College London',          source: 'LinkedIn' },
//   { studentName: 'Lakshmi Patel',    mobile: '+91 89900 01234', email: 'lakshmi.patel@example.com',    intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Gujarat University',      passingYear: '2025', workExperience: 'Fresher',   gpa: '7.2 / 10', countryName: 'New Zealand',   universityName: 'University of Auckland',           source: 'Website' },
//   { studentName: 'Siddharth Rao',    mobile: '+91 88800 12345', email: 'siddharth.rao@example.com',    intake: 'Fall 2026',   highestEducation: "Bachelor's Degree", gender: 'Male',   collegeName: 'Osmania University',      passingYear: '2024', workExperience: 'Fresher',   gpa: '7.9 / 10', countryName: 'Australia',     universityName: 'University of Sydney',            source: 'Vizag' },
//   { studentName: 'Meera Krishnan',   mobile: '+91 87700 23456', email: 'meera.krishnan@example.com',   intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Kerala University',       passingYear: '2025', workExperience: 'Fresher',   gpa: '8.6 / 10', countryName: 'Canada',        universityName: 'McGill University',               source: 'Kerala' },
//   { studentName: 'Arjun Pillai',     mobile: '+91 86600 34567', email: 'arjun.pillai@example.com',     intake: 'Fall 2026',   highestEducation: "Master's Degree",   gender: 'Male',   collegeName: 'Cochin Uni of Sci & Tech',passingYear: '2023', workExperience: '1 year',    gpa: '8.1 / 10', countryName: 'UAE',           universityName: 'University of Wollongong in Dubai', source: 'Sales Leads' },
//   { studentName: 'Nisha Thomas',     mobile: '+91 85500 45678', email: 'nisha.thomas@example.com',     intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Mahatma Gandhi University',passingYear: '2025',workExperience: 'Fresher',   gpa: '8.0 / 10', countryName: 'United States',  universityName: 'New York University',             source: 'Meta Lead Generation' },
//   { studentName: 'Rohan Varma',      mobile: '+91 84400 56789', email: 'rohan.varma@example.com',      intake: 'Fall 2026',   highestEducation: "Bachelor's Degree", gender: 'Male',   collegeName: 'Andhra University',       passingYear: '2024', workExperience: 'Fresher',   gpa: '7.7 / 10', countryName: 'Australia',     universityName: 'Monash University',               source: 'KK Upcountry' },
//   { studentName: 'Pooja Menon',      mobile: '+91 83300 67890', email: 'pooja.menon@example.com',      intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'NSS College',             passingYear: '2025', workExperience: 'Fresher',   gpa: '8.4 / 10', countryName: 'Ireland',       universityName: 'Trinity College Dublin',           source: 'Organic Website' },
//   { studentName: 'Suresh Kumar',     mobile: '+91 82200 78901', email: 'suresh.kumar@example.com',     intake: 'Fall 2026',   highestEducation: "Master's Degree",   gender: 'Male',   collegeName: 'IIT Bombay',              passingYear: '2022', workExperience: '2 years',   gpa: '9.0 / 10', countryName: 'United Kingdom', universityName: 'University College London',        source: 'LinkedIn' },
//   { studentName: 'Ananya Gopalan',   mobile: '+91 81100 89012', email: 'ananya.gopalan@example.com',   intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Calicut University',      passingYear: '2025', workExperience: 'Fresher',   gpa: '7.6 / 10', countryName: 'Singapore',     universityName: 'National University of Singapore', source: 'Instagram' },
//   { studentName: 'Deepak Nair',      mobile: '+91 80000 90123', email: 'deepak.nair@example.com',      intake: 'Fall 2026',   highestEducation: "Bachelor's Degree", gender: 'Male',   collegeName: 'MG University',           passingYear: '2024', workExperience: '6 months',  gpa: '8.2 / 10', countryName: 'Germany',       universityName: 'Technical University of Munich',  source: 'Website' },
//   { studentName: 'Kavya Rajan',      mobile: '+91 79900 01234', email: 'kavya.rajan@example.com',      intake: 'Spring 2027', highestEducation: "Bachelor's Degree", gender: 'Female', collegeName: 'Bangalore University',    passingYear: '2025', workExperience: 'Fresher',   gpa: '7.9 / 10', countryName: 'Canada',        universityName: 'University of Waterloo',          source: 'Landing Page' },
// ];
// 
// // ── Helpers ──────────────────────────────────────────────────────
// const upsertRole = async (role) => {
//   await Role.findOneAndUpdate({ code: role.code }, role, { upsert: true, new: true, setDefaultsOnInsert: true });
// };
// 
// const upsertUser = async (user, roleByCode) => {
//   const existing = await User.findOne({ email: user.email });
//   if (existing) return existing;
//   return User.create({ ...user, role: roleByCode[user.role]._id });
// };
// 
// const upsertCountry = async (country) => {
//   return Country.findOneAndUpdate({ name: country.name }, country, { upsert: true, new: true, setDefaultsOnInsert: true });
// };
// 
// const upsertUniversity = async (uni, countryByName) => {
//   await University.findOneAndUpdate(
//     { name: uni.name },
//     { name: uni.name, country: countryByName[uni.country]?._id },
//     { upsert: true, new: true, setDefaultsOnInsert: true }
//   );
// };
// 
// const upsertBy = (Model, matchKey) => async (doc) => {
//   await Model.findOneAndUpdate({ [matchKey]: doc[matchKey] }, doc, { upsert: true, new: true, setDefaultsOnInsert: true });
// };
// 
// /**
//  * Generate a sequential reference ID using the Counter model.
//  * Counter model is expected to have { name, seq } schema.
//  */
// const nextRefId = async (prefix = 'TASA') => {
//   const counter = await Counter.findByIdAndUpdate(
//     'lead',
//     { $inc: { seq: 1 } },
//     { upsert: true, new: true }
//   );
//   return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
// };
// 
// const upsertLead = async (lead, sourceByName, countryByName, universityByName) => {
//   const existing = await Lead.findOne({ mobile: lead.mobile });
//   if (existing) return existing;
// 
//   const referenceId = await nextRefId();
// 
//   return Lead.create({
//     referenceId,
//     studentName:    lead.studentName,
//     mobile:         lead.mobile,
//     email:          lead.email,
//     intake:         lead.intake,
//     highestEducation: lead.highestEducation,
//     gender:         lead.gender,
//     collegeName:    lead.collegeName,
//     passingYear:    lead.passingYear,
//     workExperience: lead.workExperience,
//     gpa:            lead.gpa,
//     countryPreferred: countryByName[lead.countryName]?._id,
//     source:         sourceByName[lead.source]?._id,
//     status:         'new',
//   });
// };
// 
// // ── Main ─────────────────────────────────────────────────────────
// const seed = async () => {
//   await connectDB();
// 
//   // Roles
//   for (const role of ROLES) await upsertRole(role);
//   const roles = await Role.find({});
//   const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r]));
// 
//   // Users
//   const users = [];
//   for (const user of USERS) users.push(await upsertUser(user, roleByCode));
// 
//   // Countries
//   const countryDocs = [];
//   for (const c of COUNTRIES) countryDocs.push(await upsertCountry(c));
//   const countryByName = Object.fromEntries(countryDocs.map((c) => [c.name, c]));
// 
//   // Universities
//   for (const u of UNIVERSITIES) await upsertUniversity(u, countryByName);
//   const universityDocs = await University.find({}).lean();
//   const universityByName = Object.fromEntries(universityDocs.map((u) => [u.name, u]));
// 
//   // Lead Sources
//   for (const s of LEAD_SOURCES) await upsertBy(LeadSource, 'name')(s);
//   const sourceDocs = await LeadSource.find({}).lean();
//   const sourceByName = Object.fromEntries(sourceDocs.map((s) => [s.name, s]));
// 
//   // Dispositions
//   for (const d of DISPOSITIONS) await upsertBy(Disposition, 'name')(d);
// 
//   // Settings
//   for (const s of SETTINGS) await upsertBy(Setting, 'key')(s);
// 
//   // Reports
//   for (const r of REPORTS) await upsertBy(Report, 'key')(r);
// 
//   // Demo Leads
//   const leadDocs = [];
//   for (const lead of DEMO_LEADS) {
//     leadDocs.push(await upsertLead(lead, sourceByName, countryByName, universityByName));
//   }
// 
//   // ── Assign demo leads to users ───────────────────────────────────
//   // Counselor gets 8 leads across the lifecycle so their portal has real data.
//   // Agent gets 8 leads. The remaining 4 stay unassigned (agent fetch pool).
//   const counselorUser = users.find((u) => u.email === 'counselor@tasacrm.com');
//   const agentUser     = users.find((u) => u.email === 'agent@tasacrm.com');
//   const counselorId   = counselorUser?._id;
//   const agentId       = agentUser?._id;
// 
//   const dispositionsByName = {};
//   for (const d of await Disposition.find({}).lean()) {
//     dispositionsByName[d.name] = d._id;
//   }
// 
//   const assignLead = async (leadDoc, { userId, status, disposition, counselorFields, assignedAt } = {}) => {
//     const now = assignedAt || new Date();
//     await Lead.updateOne(
//       { _id: leadDoc._id },
//       {
//         $set: {
//           ...(userId ? { assignedTo: userId, assignedAt: now } : {}),
//           ...(status ? { status } : {}),
//           ...(disposition ? { currentDisposition: disposition } : {}),
//           ...(counselorFields || {}),
//         },
//       }
//     );
//   };
// 
//   // Counselor leads (indices 0–7) — spread across the lifecycle
//   if (counselorId) {
//     await assignLead(leadDocs[0], {
//       userId: counselorId,
//       status: 'completed',
//       assignedAt: new Date('2026-07-10'),
//       counselorFields: {
//         registrationStatus: 'in-progress',
//         lastCallAt: new Date('2026-08-10'),
//       },
//     });
//     await assignLead(leadDocs[1], {
//       userId: counselorId,
//       status: 'completed',
//       assignedAt: new Date('2026-07-12'),
//       counselorFields: {
//         registrationStatus: 'completed',
//         documentStatus: 'gathering',
//         lastCallAt: new Date('2026-08-12'),
//       },
//     });
//     await assignLead(leadDocs[2], {
//       userId: counselorId,
//       status: 'completed',
//       assignedAt: new Date('2026-07-14'),
//       counselorFields: {
//         documentStatus: 'submitted',
//         applicationStatus: 'draft',
//         lastCallAt: new Date('2026-08-14'),
//       },
//     });
//     await assignLead(leadDocs[3], {
//       userId: counselorId,
//       status: 'completed',
//       assignedAt: new Date('2026-07-16'),
//       counselorFields: {
//         applicationStatus: 'submitted',
//         lastCallAt: new Date('2026-08-13'),
//       },
//     });
//     await assignLead(leadDocs[4], {
//       userId: counselorId,
//       status: 'completed',
//       assignedAt: new Date('2026-07-18'),
//       counselorFields: {
//         registrationStatus: 'completed',
//         documentStatus: 'verified',
//         applicationStatus: 'offer-received',
//         lastCallAt: new Date('2026-08-15'),
//       },
//     });
//     await assignLead(leadDocs[5], {
//       userId: counselorId,
//       status: 'documents-pending',
//       assignedAt: new Date('2026-07-20'),
//       counselorFields: {
//         documentStatus: 'pending',
//         lastCallAt: new Date('2026-08-08'),
//       },
//     });
//     await assignLead(leadDocs[6], {
//       userId: counselorId,
//       status: 'offer-received',
//       assignedAt: new Date('2026-07-22'),
//       counselorFields: {
//         registrationStatus: 'completed',
//         documentStatus: 'verified',
//         applicationStatus: 'accepted',
//         lastCallAt: new Date('2026-08-16'),
//       },
//     });
//     await assignLead(leadDocs[7], {
//       userId: counselorId,
//       status: 'visa-process',
//       assignedAt: new Date('2026-07-24'),
//       counselorFields: {
//         registrationStatus: 'completed',
//         documentStatus: 'verified',
//         applicationStatus: 'accepted',
//         visaStatus: 'filed',
//         lastCallAt: new Date('2026-08-17'),
//       },
//     });
// 
//     // Counselor leads with scheduled callbacks (for follow-ups page)
//     await Interaction.create({
//       lead: leadDocs[0]._id,
//       agent: counselorId,
//       disposition: dispositionsByName['Registration Started'] || dispositionsByName['Interested'],
//       dispositionName: 'Registration Started',
//       dispositionType: 'normal',
//       remarks: 'Started registration process, awaiting documents',
//       callbackDate: '2026-08-18',
//       callbackTime: '10:00',
//       callbackDateTime: new Date('2026-08-18T10:00:00'),
//       calledAt: new Date('2026-08-10'),
//     });
//     await Interaction.create({
//       lead: leadDocs[1]._id,
//       agent: counselorId,
//       disposition: dispositionsByName['Documents Collected'] || dispositionsByName['Interested'],
//       dispositionName: 'Documents Collected',
//       dispositionType: 'normal',
//       remarks: 'Passport and transcript received, waiting for LOR',
//       callbackDate: '2026-08-17',
//       callbackTime: '14:00',
//       callbackDateTime: new Date('2026-08-17T14:00:00'),
//       calledAt: new Date('2026-08-12'),
//     });
//     await Interaction.create({
//       lead: leadDocs[5]._id,
//       agent: counselorId,
//       disposition: dispositionsByName['Callback'],
//       dispositionName: 'Callback',
//       dispositionType: 'normal',
//       remarks: 'Documents pending — need to follow up on transcripts',
//       callbackDate: '2026-08-18',
//       callbackTime: '11:30',
//       callbackDateTime: new Date('2026-08-18T11:30:00'),
//       calledAt: new Date('2026-08-08'),
//     });
// 
//     // Activity log entries for counselor
//     for (const ld of [leadDocs[0], leadDocs[1], leadDocs[2], leadDocs[6], leadDocs[7]]) {
//       await Activity.create({
//         user: counselorId,
//         type: 'LEAD_FETCHED',
//         lead: ld._id,
//         metadata: new Map([
//           ['leadRef', ld.referenceId],
//           ['leadStatus', 'completed'],
//         ]),
//         createdAt: new Date('2026-07-15'),
//       });
//     }
//   }
// 
//   // Agent leads (indices 8–15) — realistic agent workload
//   if (agentId) {
//     await assignLead(leadDocs[8],  { userId: agentId, status: 'assigned', assignedAt: new Date('2026-08-01') });
//     await assignLead(leadDocs[9],  { userId: agentId, status: 'fetched', assignedAt: new Date('2026-08-02') });
//     await assignLead(leadDocs[10], { userId: agentId, status: 'in-progress', assignedAt: new Date('2026-08-03') });
//     await assignLead(leadDocs[11], { userId: agentId, status: 'callback', assignedAt: new Date('2026-08-04') });
//     await assignLead(leadDocs[12], { userId: agentId, status: 'follow-up', assignedAt: new Date('2026-08-05') });
//     await assignLead(leadDocs[13], { userId: agentId, status: 'completed', assignedAt: new Date('2026-08-06') });
//     await assignLead(leadDocs[14], { userId: agentId, status: 'lost', assignedAt: new Date('2026-08-07') });
//     await assignLead(leadDocs[15], { userId: agentId, status: 'new', assignedAt: new Date('2026-08-08') });
//   }
//   // leads[16..19] stay unassigned — the shared fetch pool for agents.
// 
//   // eslint-disable-next-line no-console
//   console.log(`
// Seed complete.
//   Roles:         ${roles.length}
//   Users:         ${users.length}
//   Countries:     ${countryDocs.length}
//   Universities:  ${UNIVERSITIES.length}
//   Lead Sources:  ${LEAD_SOURCES.length}
//   Dispositions:  ${DISPOSITIONS.length}
//   Settings:      ${SETTINGS.length}
//   Reports:       ${REPORTS.length}
//   Demo Leads:    ${leadDocs.length}
//   Counselor leads assigned: ${counselorId ? 8 : 0}
//   Agent leads assigned:     ${agentId ? 8 : 0}
//   Unassigned (fetch pool):  4
// 
//   Demo accounts:
//     Supervisor  -> supervisor@tasacrm.com / Supervisor@123
//     Agent       -> agent@tasacrm.com     / Agent@123
//     Counselor   -> counselor@tasacrm.com / Counselor@123`);
// 
//   await mongoose.disconnect();
// };
// 
// seed().catch(async (err) => {
//   // eslint-disable-next-line no-console
//   console.error('Seed failed:', err.message);
//   await mongoose.disconnect();
//   process.exit(1);
// });
// 