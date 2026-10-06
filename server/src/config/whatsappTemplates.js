// GR Study Abroad WhatsApp template catalogue — the ONLY approved template
// names and parameter positions for the WhatsApp Template API. Do NOT invent
// templates outside this list; `metaName` = the name sent to the API as the
// `template` field. `variables` is the ordered param list ([0]=student …).
//
// `body` is the APPROVED message content exactly as it appears in the source
// PDF ("Whatsapp templates - Utility"). It is the source of truth for preview
// rendering only — the GR provider API sends just { template, phone, params }.
// Do NOT rewrite, reword, re-punctuate or restyle this text. Placeholders are
// positional: {{1}} = variables[0], {{2}} = variables[1], {{3}} = variables[2].
const TEMPLATE_CATALOG = [
  {
    key: 'initial_introduction',
    title: 'Initial Introduction',
    metaName: 'initial_introduction',
    languageCode: 'en_US',
    description: 'First contact to introduce TASA and begin the counselling journey.',
    variables: ['student', 'counsellor'],
    body: `Hi {{1}}, this is {{2}} from GR Study Abroad.

We received your enquiry regarding studying abroad and would like to understand your study plans, preferred country and course requirements.

Please reply here when convenient, and our counsellor will assist you.`,
  },
  {
    key: 'rnr_followup_1',
    title: 'RNR Follow-up 1',
    metaName: 'rnr_followup_1',
    languageCode: 'en_US',
    description: 'First follow-up after the student did not answer a call.',
    variables: ['student', 'counsellor'],
    body: `Hi {{1}}, this is {{2}} from GR Study Abroad.

I tried reaching you regarding your study abroad enquiry.

If you are still planning to study abroad, simply reply to this message and we can continue from there.`,
  },
  {
    key: 'rnr_followup_2',
    title: 'RNR Follow-up 2',
    metaName: 'rnr_followup_2',
    languageCode: 'en_US',
    description: 'Second follow-up after the student did not answer a call.',
    variables: ['student'],
    body: `Hi {{1}}, following up regarding your study abroad enquiry with GR Study Abroad.

We haven't been able to connect with you yet. If you would still like assistance with your study plans, please reply here and we'll take it forward.`,
  },
  {
    key: 'rnr_final_followup',
    title: 'RNR Final Follow-up',
    metaName: 'rnr_final_followup',
    languageCode: 'en_US',
    description: 'Final follow-up attempt after repeated unanswered calls.',
    variables: ['student'],
    body: `Hi {{1}}, this is a final follow-up regarding your enquiry with GR Study Abroad.

If you are still planning to study abroad, you can reply to this message anytime and we'll be happy to assist you.`,
  },
  {
    key: 'call_unreachable',
    title: 'Call Unreachable',
    metaName: 'call_unreachable',
    languageCode: 'en_US',
    description: 'Informs the student we could not reach them and invites them to call back.',
    variables: ['student', 'counsellor'],
    body: `Hi {{1}}, this is {{2}} from GR Study Abroad.

We tried contacting you regarding your study abroad enquiry, but were unable to reach you.

Please reply here with a convenient time to connect, and we'll contact you accordingly.`,
  },
  {
    key: 'callback_reminder',
    title: 'Callback Reminder',
    metaName: 'callback_reminder',
    languageCode: 'en_US',
    description: 'Reminds the student of a scheduled call-back with their counsellor.',
    variables: ['student', 'requested_time'],
    body: `Hi {{1}}, a quick reminder from GR Study Abroad regarding our discussion on your study abroad plans.

You had requested a call back around {{2}}.

Please reply here if you'd like us to call you at a different time.`,
  },
  {
    key: 'documents_pending',
    title: 'Documents Pending',
    metaName: 'documents_pending',
    languageCode: 'en_US',
    description: 'Asks the student to submit the documents still needed for their application.',
    variables: ['student', 'document_list'],
    body: `Hi {{1}}, we are currently working on your application with GR Study Abroad.

We still require the following document(s) from you:
{{2}}

Please share them with your counsellor so we can proceed with the next step.`,
  },
  {
    key: 'documents_received',
    title: 'Documents Received',
    metaName: 'documents_received',
    languageCode: 'en_US',
    description: 'Confirms the student’s documents have been received.',
    variables: ['student'],
    body: `Hi {{1}}, we have received the documents shared for your application with GR Study Abroad.

Our team will review them and update you on the next step.`,
  },
  {
    key: 'application_submitted',
    title: 'Application Submitted',
    metaName: 'application_submitted',
    languageCode: 'en_US',
    description: 'Confirms the student’s university application has been submitted.',
    variables: ['student', 'course', 'university'],
    body: `Hi {{1}}, your application for {{2}} at {{3}} has been submitted successfully.

Our team will keep you updated when there is an update from the university.`,
  },
  {
    key: 'application_update',
    title: 'Application Update',
    metaName: 'application_update',
    languageCode: 'en_US',
    description: 'Sends a status update on the student’s university application.',
    variables: ['student', 'course', 'university'],
    body: `Hi {{1}}, there is an update regarding your application for {{2}} at {{3}}.

Please reply to this message or connect with your GR Study Abroad counsellor for the next steps.`,
  },
  {
    key: 'offer_received',
    title: 'Offer Received',
    metaName: 'offer_received',
    languageCode: 'en_US',
    description: 'Celebrates and confirms an offer letter received from a university.',
    variables: ['student', 'course', 'university'],
    body: `Hi {{1}}, good news! We have received an update on your application for {{2}} at {{3}}.

Your offer letter is now available.

Please reply here and our counsellor will guide you through the next steps.`,
  },
  {
    key: 'offer_acceptance',
    title: 'Offer Acceptance',
    metaName: 'offer_acceptance',
    languageCode: 'en_US',
    description: 'Confirms the student’s acceptance of a university offer.',
    variables: ['student', 'university'],
    body: `Hi {{1}}, your offer from {{2}} requires the next step to secure your place.

Please connect with your GR Study Abroad counsellor to review the offer acceptance and payment requirements.`,
  },
  {
    key: 'visa_process_started',
    title: 'Visa Process Started',
    metaName: 'visa_process_started',
    languageCode: 'en_US',
    description: 'Informs the student their visa process has been started.',
    variables: ['student', 'country'],
    body: `Hi {{1}}, your visa process for {{2}} has now been initiated with GR Study Abroad.

Please connect with your counsellor to complete the required documentation and next steps.`,
  },
  {
    key: 'visa_documents_pending',
    title: 'Visa Documents Pending',
    metaName: 'visa_documents_pending',
    languageCode: 'en_US',
    description: 'Asks the student for the documents needed for their visa process.',
    variables: ['student', 'document_list'],
    body: `Hi {{1}}, we are preparing for the next stage of your visa process.

We still require the following document(s):
{{2}}

Please share them with your GR Study Abroad counsellor so we can proceed.`,
  },
  {
    key: 'whatsapp_optout',
    title: 'WhatsApp Opt-out',
    metaName: 'whatsapp_optout',
    languageCode: 'en_US',
    description: 'Acknowledges the student opted out of WhatsApp messages.',
    variables: ['student'],
    body: `Hi {{1}}, if you no longer wish to receive WhatsApp updates from GR Study Abroad, please reply STOP. We will update your communication preference accordingly.`,
  },
  {
    key: 'student_referral_request',
    title: 'Student Referral Request',
    metaName: 'student_referral_request',
    languageCode: 'en_US',
    description: 'Asks the student to refer friends who may be interested.',
    variables: ['student'],
    body: `Hi {{1}}, we hope your experience with GR Study Abroad has been helpful so far.

If you know a friend or family member who is planning to study abroad, you can share our contact with them.

They can connect with our team for guidance on courses, universities, applications and visa processes.`,
  },
];

// Every variable a template may reference, with a human label and a short
// hint. Actual values are resolved from real Lead/User/Callback data at
// runtime: requested_time comes from the lead's pending Callback.scheduledAt
// (blank when none exists so the agent supplies it — never fabricated),
// document_list comes from the lead's document checklist.
const VARIABLE_DEFINITIONS = {
  student:        { key: 'student',        label: 'Student',        hint: 'Student’s full name' },
  counsellor:     { key: 'counsellor',     label: 'Counsellor',     hint: 'Handling counsellor’s name' },
  requested_time: { key: 'requested_time', label: 'Requested Time', hint: 'Requested callback time (e.g. 5 PM today)' },
  document_list:  { key: 'document_list',  label: 'Documents',      hint: 'Comma-separated list of pending documents' },
  course:         { key: 'course',         label: 'Course',         hint: 'Applied / target course name' },
  university:     { key: 'university',     label: 'University',     hint: 'Target or applied university' },
  country:        { key: 'country',        label: 'Country',        hint: 'Preferred or application country' },
  // Retained so any legacy references still resolve cleanly.
  student_name:   { key: 'student_name',   label: 'Student Name',   hint: 'Student’s full name' },
  agent_name:     { key: 'agent_name',     label: 'Agent Name',     hint: 'Handling agent’s name' },
  company_name:   { key: 'company_name',   label: 'Company Name',   hint: 'Company / brand name' },
  intake:         { key: 'intake',         label: 'Intake',         hint: 'Intake term (e.g. Fall 2026)' },
  application_id: { key: 'application_id', label: 'Application ID', hint: 'Application / reference ID' },
};

module.exports = { TEMPLATE_CATALOG, VARIABLE_DEFINITIONS };
