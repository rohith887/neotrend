/**
 * Counselor-specific profile helpers.
 * Mirrors the Agent's fromLead/buildProfilePayload but extends them with
 * all counselor-only fields (address, passport, background, contacts,
 * education history, test scores, applications, visa, documents).
 *
 * The Agent's leadProfile.js is NOT modified — Agent workspace remains unchanged.
 */

// Normalize a populated ref to its raw id string ('' when empty).
const idOf = (v) => {
  if (v == null || v === '') return '';
  return typeof v === 'string' ? v : v._id ?? '';
};

const emptyAddress = () => ({ address1: '', address2: '', country: '', state: '', city: '', pincode: '' });
const emptyPassport = () => ({ passportNumber: '', issueDate: '', expiryDate: '', issueCountry: '', cityOfBirth: '', countryOfBirth: '', nationality: '', citizenship: '', dualCitizen: '', livingAbroad: '' });
const emptyBackground = () => ({ immigrationApplied: '', seriousMedicalCondition: '', visaRefusal: '', criminalOffence: '' });
const emptyVisa = () => ({ country: '', type: '', stage: 'not-started', documentReadiness: '', appointment: '', biometrics: '', interview: '', decision: '', outcome: '', remarks: '' });
const emptyTestScores = () => ({ GRE: '', GMAT: '', TOEFL: '', IELTS: '', PTE: '', DET: '', SAT: '', ACT: '' });

export const fromLeadCounselor = (lead) => {
  if (!lead) return null;

  const countries = Array.from({ length: 3 }, (_, i) => {
    const slot = (lead.preferredCountries ?? []).find((p) => p.order === i + 1)
      ?? (lead.preferredCountries ?? [])[i];
    return { country: idOf(slot?.country) };
  });
  const universities = Array.from({ length: 3 }, (_, i) => {
    const slot = (lead.preferredUniversities ?? []).find((p) => p.order === i + 1)
      ?? (lead.preferredUniversities ?? [])[i];
    return { university: idOf(slot?.university) };
  });

  return {
    // ── Base fields (same as Agent) ────────────────────────
    studentName:       lead.studentName ?? '',
    countryPreferred:  idOf(lead.countryPreferred),
    intake:            lead.intake ?? '',
    highestEducation:  lead.highestEducation ?? '',
    gender:            lead.gender ?? '',
    source:            idOf(lead.source),
    collegeName:       lead.collegeName ?? '',
    passingYear:       lead.passingYear ?? '',
    workExperience:    lead.workExperience ?? '',
    gpa:               lead.gpa ?? '',
    preferredCountries: countries,
    preferredUniversities: universities,
    referenceName:     lead.referenceName ?? '',
    referenceMobile:   lead.referenceMobile ?? '',

    // ── Counselor-specific fields ──────────────────────────
    middleName:        lead.middleName ?? '',
    dateOfBirth:       lead.dateOfBirth ?? '',
    maritalStatus:     lead.maritalStatus ?? '',
    mailingAddress:    { ...emptyAddress(), ...(lead.mailingAddress || {}) },
    permanentAddress:  { ...emptyAddress(), ...(lead.permanentAddress || {}) },
    sameAsMailing:     lead.sameAsMailing ?? false,
    passport:          { ...emptyPassport(), ...(lead.passport || {}) },
    background:        { ...emptyBackground(), ...(lead.background || {}) },
    emergencyContacts: (lead.emergencyContacts ?? []).length > 0
      ? lead.emergencyContacts.map((c) => ({ name: c.name ?? '', phone: c.phone ?? '', relation: c.relation ?? '', email: c.email ?? '' }))
      : [{ name: '', phone: '', relation: '', email: '' }],
    countryOfEducation: lead.countryOfEducation ?? '',
    workQualifications: lead.workQualifications ?? '',
    educationHistory:  (lead.educationHistory ?? []).length > 0
      ? lead.educationHistory.map((e) => ({
          country: e.country ?? '', organisation: e.organisation ?? '', address: e.address ?? '',
          position: e.position ?? '', jobProfile: e.jobProfile ?? '', modeOfSalary: e.modeOfSalary ?? '',
          workingFrom: e.workingFrom ?? '', workingUpto: e.workingUpto ?? '',
        }))
      : [],
    testScores:        { ...emptyTestScores(), ...(lead.testScores || {}) },
    applications:      (lead.applications ?? []).map((a) => ({
      university: a.university ?? '', country: a.country ?? '', course: a.course ?? '',
      status: a.status ?? 'not-started', applicationDate: a.applicationDate ?? '',
      offerStatus: a.offerStatus ?? '', importantDates: a.importantDates ?? '', remarks: a.remarks ?? '',
    })),
    visaDetails:       { ...emptyVisa(), ...(lead.visaDetails || {}) },
    documents:         (lead.documents ?? []).map((d) => ({
      type: d.type ?? '', name: d.name ?? '', status: d.status ?? 'pending', notes: d.notes ?? '',
    })),
  };
};

export const buildCounselorPayload = (f) => {
  if (!f) return {};

  // ── Base fields ────────────────────────────────────────
  const payload = {
    studentName:      f.studentName.trim(),
    countryPreferred: f.countryPreferred || null,
    intake:           f.intake,
    highestEducation: f.highestEducation,
    gender:           f.gender,
    source:           f.source || null,
    collegeName:      f.collegeName.trim(),
    passingYear:      f.passingYear.trim(),
    workExperience:   f.workExperience.trim(),
    gpa:              f.gpa.trim(),
    preferredCountries: (f.preferredCountries || [])
      .map((p, i) => ({ order: i + 1, country: p.country }))
      .filter((p) => p.country),
    preferredUniversities: (f.preferredUniversities || [])
      .map((p, i) => ({ order: i + 1, university: p.university }))
      .filter((p) => p.university),
    referenceName:   f.referenceName.trim(),
    referenceMobile: f.referenceMobile.trim(),

    // ── Counselor-specific fields ──────────────────────────
    middleName:       f.middleName?.trim() ?? '',
    dateOfBirth:      f.dateOfBirth?.trim() ?? '',
    maritalStatus:    f.maritalStatus?.trim() ?? '',
    countryOfEducation: f.countryOfEducation?.trim() ?? '',
    workQualifications: f.workQualifications?.trim() ?? '',
  };

  // Subdocs — send full objects
  if (f.mailingAddress) payload.mailingAddress = f.mailingAddress;
  if (f.permanentAddress) payload.permanentAddress = f.permanentAddress;
  if (f.sameAsMailing !== undefined) payload.sameAsMailing = f.sameAsMailing;
  if (f.passport) payload.passport = f.passport;
  if (f.background) payload.background = f.background;
  if (f.testScores) payload.testScores = f.testScores;
  if (f.visaDetails) payload.visaDetails = f.visaDetails;

  // Arrays
  if (f.emergencyContacts) payload.emergencyContacts = f.emergencyContacts;
  if (f.educationHistory) payload.educationHistory = f.educationHistory;
  if (f.applications) payload.applications = f.applications;
  if (f.documents) payload.documents = f.documents;

  return payload;
};

/**
 * Check if the counselor form has any unsaved changes compared to the lead.
 */
export const counselorFormDirty = (form, lead) => {
  if (!form || !lead) return false;
  const current = fromLeadCounselor(lead);
  return JSON.stringify(form) !== JSON.stringify(current);
};
