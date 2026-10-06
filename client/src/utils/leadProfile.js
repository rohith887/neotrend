/**
 * Shared helpers for the editable student profile used across the Agent
 * Workspace — the profile panel, the disposition form (mandatory-field
 * validation) and the student summary strip.
 *
 * The Lead model stores:
 *   countryPreferred      — ObjectId ref (populated to { name, code })
 *   preferredCountries    — [{ order, country }]  (country = ObjectId)
 *   preferredUniversities — [{ order, university }]
 *   source                — ObjectId ref to LeadSource (populated to { name })
 *
 * fromLead flattens the API lead into the plain editable form shape, and
 * buildProfilePayload maps it back to the PATCH /leads/:id contract.
 */

// Normalize a populated ref to its raw id string ('' when empty).
const idOf = (v) => {
  if (v == null || v === '') return '';
  return typeof v === 'string' ? v : v._id ?? '';
};

export const fromLead = (lead) => {
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
  };
};

export const buildProfilePayload = (f) => ({
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
  preferredCountries: f.preferredCountries
    .map((p, i) => ({ order: i + 1, country: p.country }))
    .filter((p) => p.country),
  preferredUniversities: f.preferredUniversities
    .map((p, i) => ({ order: i + 1, university: p.university }))
    .filter((p) => p.university),
  referenceName:   f.referenceName.trim(),
  referenceMobile: f.referenceMobile.trim(),
});

/**
 * Mandatory student-profile fields. A lead may only be completed (a
 * disposition submitted) once every one of these is filled in. Everything
 * else in the profile stays optional.
 */
export const REQUIRED_PROFILE_FIELDS = [
  { key: 'studentName',      label: 'Student Name' },
  { key: 'countryPreferred', label: 'Country Preference' },
  { key: 'intake',           label: 'Intake' },
  { key: 'highestEducation', label: 'Highest Education' },
  { key: 'source',           label: 'Lead Type' },
];

/** True once every mandatory profile field is non-empty. */
export const profileCompleteOf = (form) => {
  if (!form) return false;
  return REQUIRED_PROFILE_FIELDS.every(({ key }) => {
    const v = form[key];
    return typeof v === 'string' ? v.trim() !== '' : !!v;
  });
};
