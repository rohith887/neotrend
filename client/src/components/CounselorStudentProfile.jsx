import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Divider, Grid, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import BadgeIcon from '@mui/icons-material/Badge';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import HomeIcon from '@mui/icons-material/Home';
import LocalLibraryIcon from '@mui/icons-material/LocalLibrary';
import FlightIcon from '@mui/icons-material/Flight';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import ContactsIcon from '@mui/icons-material/Contacts';
import SchoolIcon from '@mui/icons-material/School';
import ScoreIcon from '@mui/icons-material/Score';
import PersonIcon from '@mui/icons-material/Person';
import PublicIcon from '@mui/icons-material/Public';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import client from '../api/client.js';
import { useLookups } from '../api/useLookups.js';
import { fromLeadCounselor, buildCounselorPayload, counselorFormDirty } from '../utils/counselorProfile.js';
import AppTabs from '../ui/mui/AppTabs.jsx';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import StudentSummaryStrip from './StudentSummaryStrip.jsx';

/* ==========================================================================
   COUNSELOR STUDENT PROFILE — full student data-entry form (center column).
   Replaces StudentProfileForm in the counselor workspace with all fields
   needed for the external partner application lifecycle.

   Tabs: Personal · Address · Passport · Background · Contacts ·
         Education · Test Scores · Reference
   ========================================================================== */

const EDUCATION_LEVELS = ['High School', "Bachelor's Degree", "Master's Degree", "Doctorate / PhD", 'Diploma', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL = ['Married', 'Unmarried', 'Other'];
const YES_NO = ['Yes', 'No'];
const YES_NO_NA = ['Yes', 'No', 'N/A'];

const buildIntakeOptions = () => {
  const year = new Date().getFullYear();
  const options = [];
  for (let y = year; y <= year + 2; y += 1) {
    options.push(`Fall ${y}`);
    options.push(`Spring ${y + 1}`);
  }
  return options;
};
const INTAKE_OPTIONS = buildIntakeOptions();

const TABS = [
  { id: 'personal',    label: 'Personal',    icon: <PersonIcon sx={{ fontSize: 15 }} /> },
  { id: 'address',     label: 'Address',     icon: <HomeIcon sx={{ fontSize: 15 }} /> },
  { id: 'passport',    label: 'Passport',    icon: <BadgeIcon sx={{ fontSize: 15 }} /> },
  { id: 'background',  label: 'Background',  icon: <HealthAndSafetyIcon sx={{ fontSize: 15 }} /> },
  { id: 'contacts',    label: 'Contacts',    icon: <ContactsIcon sx={{ fontSize: 15 }} /> },
  { id: 'education',   label: 'Education',   icon: <SchoolIcon sx={{ fontSize: 15 }} /> },
  { id: 'testscores',  label: 'Tests',       icon: <ScoreIcon sx={{ fontSize: 15 }} /> },
  { id: 'reference',   label: 'Reference',   icon: <PublicIcon sx={{ fontSize: 15 }} /> },
];

// ── Section title helper ────────────────────────────────────
function SectionTitle({ icon, title }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary', mb: 1 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }}>{icon}</Box>
      {title}
      <Box sx={{ flex: 1, height: 1, bgcolor: 'divider', ml: 0.5 }} />
    </Box>
  );
}

// ── Sub-section heading ─────────────────────────────────────
function SubHeading({ children }) {
  return (
    <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 2, mb: 1 }}>{children}</Typography>
  );
}

export default function CounselorStudentProfile({
  lead,
  interactions = [],
  callStatus,
  saving,
  onSave,
}) {
  const { countries, universities, loadingCountries, loadingUniversities } = useLookups('');
  const [form, setForm] = useState(null);
  const [leadSources, setLeadSources] = useState([]);
  const [activeTab, setActiveTab] = useState('personal');
  const [prefCount, setPrefCount] = useState(1);

  useEffect(() => {
    let cancelled = false;
    client.get('/lookups/lead-sources').then(({ data }) => { if (!cancelled) setLeadSources(data.data ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (lead) { const f = fromLeadCounselor(lead); setForm(f); setPrefCount(Math.max(1, Math.min(3, Math.max((lead.preferredCountries ?? []).filter((p) => p.country).length, (lead.preferredUniversities ?? []).filter((p) => p.university).length)))); } }, [lead]);

  const dirty = useMemo(() => counselorFormDirty(form, lead), [form, lead]);

  if (!lead || !form) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>Loading student profile…</Typography>
      </Box>
    );
  }

  const setField = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const setNested = (parent, key) => (e) => setForm((p) => ({ ...p, [parent]: { ...p[parent], [key]: e.target.value } }));
  const setContact = (idx, key) => (e) => {
    setForm((p) => {
      const list = [...p.emergencyContacts];
      list[idx] = { ...list[idx], [key]: e.target.value };
      return { ...p, emergencyContacts: list };
    });
  };
  const addContact = () => setForm((p) => ({ ...p, emergencyContacts: [...p.emergencyContacts, { name: '', phone: '', relation: '', email: '' }] }));
  const removeContact = (idx) => setForm((p) => { const list = [...p.emergencyContacts]; list.splice(idx, 1); return { ...p, emergencyContacts: list.length > 0 ? list : [{ name: '', phone: '', relation: '', email: '' }] }; });
  const setEdu = (idx, key) => (e) => {
    setForm((p) => { const list = [...p.educationHistory]; list[idx] = { ...list[idx], [key]: e.target.value }; return { ...p, educationHistory: list }; });
  };
  const addEdu = () => setForm((p) => ({ ...p, educationHistory: [...p.educationHistory, { country: '', organisation: '', address: '', position: '', jobProfile: '', modeOfSalary: '', workingFrom: '', workingUpto: '' }] }));
  const removeEdu = (idx) => setForm((p) => { const list = [...p.educationHistory]; list.splice(idx, 1); return { ...p, educationHistory: list }; });
  const setApp = (idx, key) => (e) => {
    setForm((p) => { const list = [...p.applications]; list[idx] = { ...list[idx], [key]: e.target.value }; return { ...p, applications: list }; });
  };
  const addApp = () => setForm((p) => ({ ...p, applications: [...p.applications, { university: '', country: '', course: '', status: 'not-started', applicationDate: '', offerStatus: '', importantDates: '', remarks: '' }] }));
  const removeApp = (idx) => setForm((p) => { const list = [...p.applications]; list.splice(idx, 1); return { ...p, applications: list }; });

  const universitiesForSlot = (slotCountryId) => {
    const country = countries.find((c) => c.id === slotCountryId);
    return country ? universities.filter((u) => u.country === country.name) : universities;
  };
  const addPref = () => setPrefCount((c) => Math.min(3, c + 1));
  const removePref = (idx) => {
    setForm((p) => {
      const pc = [...p.preferredCountries]; const pu = [...p.preferredUniversities];
      pc.splice(idx, 1); pu.splice(idx, 1); pc.push({ country: '' }); pu.push({ university: '' });
      return { ...p, preferredCountries: pc, preferredUniversities: pu };
    });
    setPrefCount((c) => Math.max(1, c - 1));
  };
  const setSlot = (listKey, idx, field) => (e) => {
    const value = e.target.value;
    setForm((p) => { const list = p[listKey].map((slot, i) => (i === idx ? { ...slot, [field]: value } : slot)); return { ...p, [listKey]: list }; });
  };

  const handleSave = async () => { await onSave?.(buildCounselorPayload(form)); };

  // ── Tab: Personal ────────────────────────────────────────
  const renderPersonal = () => (
    <Box>
      <SectionTitle icon={<PersonIcon sx={{ fontSize: 14 }} />} title="Personal Information" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="First Name" required value={form.studentName} onChange={setField('studentName')} disabled={saving} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Middle Name" value={form.middleName} onChange={setField('middleName')} disabled={saving} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Mobile" value={lead.mobile ?? ''} disabled fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Email" value={lead.email ?? ''} disabled fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField label="Date of Birth" type="date" value={form.dateOfBirth} onChange={setField('dateOfBirth')} disabled={saving} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField select label="Gender" value={form.gender} onChange={setField('gender')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {GENDERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField select label="Marital Status" value={form.maritalStatus} onChange={setField('maritalStatus')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {MARITAL.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField select label="Country Preferred" required value={form.countryPreferred} onChange={setField('countryPreferred')} disabled={saving || loadingCountries} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField select label="Intake" required value={form.intake} onChange={setField('intake')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {INTAKE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField select label="Highest Education" required value={form.highestEducation} onChange={setField('highestEducation')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {EDUCATION_LEVELS.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 4 }}>
          <TextField select label="Lead Type" required value={form.source} onChange={setField('source')} disabled={saving || leadSources.length === 0} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </TextField>
        </Grid>
      </Grid>

      {/* Study Preferences */}
      <SubHeading>Study Preferences</SubHeading>
      {Array.from({ length: prefCount }, (_, i) => {
        const slotCountry = form.preferredCountries[i]?.country;
        const uniOptions = universitiesForSlot(slotCountry);
        return (
          <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'action.hover', px: 1.5, py: 1.25, mb: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Preference {i + 1}</Typography>
              {prefCount > 1 && <IconButton size="small" onClick={() => removePref(i)} disabled={saving}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>}
            </Box>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select label={`Country ${i + 1}`} value={slotCountry} onChange={setSlot('preferredCountries', i, 'country')} disabled={saving || loadingCountries} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
                  <option value="">— Select —</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select label={`University ${i + 1}`} value={form.preferredUniversities[i]?.university} onChange={setSlot('preferredUniversities', i, 'university')} disabled={saving || loadingUniversities} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
                  <option value="">— Select —</option>
                  {uniOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </TextField>
              </Grid>
            </Grid>
          </Box>
        );
      })}
      {prefCount < 3 && (
        <Button type="button" variant="outlined" startIcon={<AddCircleIcon sx={{ fontSize: 15 }} />} onClick={addPref} disabled={saving} sx={{ borderStyle: 'dashed', py: 0.75, color: 'text.secondary', mb: 1.5 }}>
          Add Preference {prefCount + 1}
        </Button>
      )}
    </Box>
  );

  // ── Tab: Address ─────────────────────────────────────────
  const renderAddress = () => (
    <Box>
      <SectionTitle icon={<HomeIcon sx={{ fontSize: 14 }} />} title="Mailing Address" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12 }}><TextField label="Address Line 1" value={form.mailingAddress.address1} onChange={setNested('mailingAddress', 'address1')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12 }}><TextField label="Address Line 2" value={form.mailingAddress.address2} onChange={setNested('mailingAddress', 'address2')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Country" value={form.mailingAddress.country} onChange={setNested('mailingAddress', 'country')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="State" value={form.mailingAddress.state} onChange={setNested('mailingAddress', 'state')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="City" value={form.mailingAddress.city} onChange={setNested('mailingAddress', 'city')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Pincode" value={form.mailingAddress.pincode} onChange={setNested('mailingAddress', 'pincode')} disabled={saving} fullWidth /></Grid>
      </Grid>

      <Box sx={{ my: 2 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={form.sameAsMailing} onChange={(e) => setForm((p) => ({ ...p, sameAsMailing: e.target.checked, ...(e.target.checked ? { permanentAddress: { ...p.mailingAddress } } : {}) }))} disabled={saving} />
          Same as mailing address
        </label>
      </Box>

      <SectionTitle icon={<HomeIcon sx={{ fontSize: 14 }} />} title="Permanent Address" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12 }}><TextField label="Address Line 1" value={form.permanentAddress.address1} onChange={setNested('permanentAddress', 'address1')} disabled={saving || form.sameAsMailing} fullWidth /></Grid>
        <Grid size={{ xs: 12 }}><TextField label="Address Line 2" value={form.permanentAddress.address2} onChange={setNested('permanentAddress', 'address2')} disabled={saving || form.sameAsMailing} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Country" value={form.permanentAddress.country} onChange={setNested('permanentAddress', 'country')} disabled={saving || form.sameAsMailing} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="State" value={form.permanentAddress.state} onChange={setNested('permanentAddress', 'state')} disabled={saving || form.sameAsMailing} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="City" value={form.permanentAddress.city} onChange={setNested('permanentAddress', 'city')} disabled={saving || form.sameAsMailing} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Pincode" value={form.permanentAddress.pincode} onChange={setNested('permanentAddress', 'pincode')} disabled={saving || form.sameAsMailing} fullWidth /></Grid>
      </Grid>
    </Box>
  );

  // ── Tab: Passport ────────────────────────────────────────
  const renderPassport = () => (
    <Box>
      <SectionTitle icon={<BadgeIcon sx={{ fontSize: 14 }} />} title="Passport Information" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Passport Number" value={form.passport.passportNumber} onChange={setNested('passport', 'passportNumber')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Issue Country" value={form.passport.issueCountry} onChange={setNested('passport', 'issueCountry')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Issue Date" type="date" value={form.passport.issueDate} onChange={setNested('passport', 'issueDate')} disabled={saving} fullWidth slotProps={{ inputLabel: { shrink: true } }} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Expiry Date" type="date" value={form.passport.expiryDate} onChange={setNested('passport', 'expiryDate')} disabled={saving} fullWidth slotProps={{ inputLabel: { shrink: true } }} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="City of Birth" value={form.passport.cityOfBirth} onChange={setNested('passport', 'cityOfBirth')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Country of Birth" value={form.passport.countryOfBirth} onChange={setNested('passport', 'countryOfBirth')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Nationality" value={form.passport.nationality} onChange={setNested('passport', 'nationality')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Citizenship" value={form.passport.citizenship} onChange={setNested('passport', 'citizenship')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField select label="Dual Citizen?" value={form.passport.dualCitizen} onChange={setNested('passport', 'dualCitizen')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {YES_NO.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField select label="Living/Study in Other Country?" value={form.passport.livingAbroad} onChange={setNested('passport', 'livingAbroad')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {YES_NO.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
      </Grid>
    </Box>
  );

  // ── Tab: Background ──────────────────────────────────────
  const renderBackground = () => (
    <Box>
      <SectionTitle icon={<HealthAndSafetyIcon sx={{ fontSize: 14 }} />} title="Background Information" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12 }}>
          <TextField select label="Applied for immigration?" value={form.background.immigrationApplied} onChange={setNested('background', 'immigrationApplied')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {YES_NO.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField select label="Serious medical condition?" value={form.background.seriousMedicalCondition} onChange={setNested('background', 'seriousMedicalCondition')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {YES_NO.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField select label="Visa refusal for any country?" value={form.background.visaRefusal} onChange={setNested('background', 'visaRefusal')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {YES_NO.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField select label="Criminal offence conviction?" value={form.background.criminalOffence} onChange={setNested('background', 'criminalOffence')} disabled={saving} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
            <option value="">— Select —</option>
            {YES_NO.map((o) => <option key={o} value={o}>{o}</option>)}
          </TextField>
        </Grid>
      </Grid>
    </Box>
  );

  // ── Tab: Contacts ────────────────────────────────────────
  const renderContacts = () => (
    <Box>
      <SectionTitle icon={<ContactsIcon sx={{ fontSize: 14 }} />} title="Important Contacts" />
      {form.emergencyContacts.map((contact, idx) => (
        <Box key={idx} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, mb: 1.5, bgcolor: idx === 0 ? 'transparent' : 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Contact {idx + 1}</Typography>
            {form.emergencyContacts.length > 1 && <IconButton size="small" onClick={() => removeContact(idx)} disabled={saving}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>}
          </Box>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Name" value={contact.name} onChange={setContact(idx, 'name')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Phone" value={contact.phone} onChange={setContact(idx, 'phone')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Relation with Applicant" value={contact.relation} onChange={setContact(idx, 'relation')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Email" value={contact.email} onChange={setContact(idx, 'email')} disabled={saving} fullWidth /></Grid>
          </Grid>
        </Box>
      ))}
      <Button type="button" variant="outlined" startIcon={<AddCircleIcon sx={{ fontSize: 15 }} />} onClick={addContact} disabled={saving} sx={{ borderStyle: 'dashed', py: 0.75, color: 'text.secondary' }}>
        Add Contact
      </Button>
    </Box>
  );

  // ── Tab: Education ───────────────────────────────────────
  const renderEducation = () => (
    <Box>
      <SectionTitle icon={<SchoolIcon sx={{ fontSize: 14 }} />} title="Education Summary" />
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Country of Education" value={form.countryOfEducation} onChange={setField('countryOfEducation')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Work Qualifications" value={form.workQualifications} onChange={setField('workQualifications')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="College Name" value={form.collegeName} onChange={setField('collegeName')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Year of Passing" value={form.passingYear} onChange={setField('passingYear')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Work Experience" value={form.workExperience} onChange={setField('workExperience')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="GPA / Percentage" value={form.gpa} onChange={setField('gpa')} disabled={saving} fullWidth /></Grid>
      </Grid>

      <Divider sx={{ my: 2 }} />
      <SectionTitle icon={<LocalLibraryIcon sx={{ fontSize: 14 }} />} title="Work / Employment History" />
      {form.educationHistory.map((edu, idx) => (
        <Box key={idx} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Employment {idx + 1}</Typography>
            <IconButton size="small" onClick={() => removeEdu(idx)} disabled={saving}><CloseIcon sx={{ fontSize: 12 }} /></IconButton>
          </Box>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Organisation & Address" value={edu.organisation} onChange={setEdu(idx, 'organisation')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Position" value={edu.position} onChange={setEdu(idx, 'position')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Job Profile" value={edu.jobProfile} onChange={setEdu(idx, 'jobProfile')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Mode of Salary" value={edu.modeOfSalary} onChange={setEdu(idx, 'modeOfSalary')} disabled={saving} fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Working From" type="date" value={edu.workingFrom} onChange={setEdu(idx, 'workingFrom')} disabled={saving} fullWidth slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Working Upto" type="date" value={edu.workingUpto} onChange={setEdu(idx, 'workingUpto')} disabled={saving} fullWidth slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          </Grid>
        </Box>
      ))}
      <Button type="button" variant="outlined" startIcon={<AddCircleIcon sx={{ fontSize: 15 }} />} onClick={addEdu} disabled={saving} sx={{ borderStyle: 'dashed', py: 0.75, color: 'text.secondary' }}>
        Add Employment
      </Button>
    </Box>
  );

  // ── Tab: Test Scores ─────────────────────────────────────
  const renderTestScores = () => (
    <Box>
      <SectionTitle icon={<ScoreIcon sx={{ fontSize: 14 }} />} title="Test Scores" />
      <Grid container spacing={1.5}>
        {['GRE', 'GMAT', 'TOEFL', 'IELTS', 'PTE', 'DET', 'SAT', 'ACT'].map((test) => (
          <Grid key={test} size={{ xs: 12, md: 6, xl: 4 }}>
            <TextField label={test} value={form.testScores[test] ?? ''} onChange={(e) => setForm((p) => ({ ...p, testScores: { ...p.testScores, [test]: e.target.value } }))} disabled={saving} fullWidth placeholder={`Enter ${test} score`} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );

  // ── Tab: Reference ───────────────────────────────────────
  const renderReference = () => (
    <Box>
      <SectionTitle icon={<PublicIcon sx={{ fontSize: 14 }} />} title="Reference Details" />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Reference Name" value={form.referenceName} onChange={setField('referenceName')} disabled={saving} fullWidth /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField label="Reference Mobile" value={form.referenceMobile} onChange={setField('referenceMobile')} disabled={saving} fullWidth /></Grid>
      </Grid>
    </Box>
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'personal':   return renderPersonal();
      case 'address':    return renderAddress();
      case 'passport':   return renderPassport();
      case 'background': return renderBackground();
      case 'contacts':   return renderContacts();
      case 'education':  return renderEducation();
      case 'testscores': return renderTestScores();
      case 'reference':  return renderReference();
      default:           return null;
    }
  };

  return (
    <Box component="form" noValidate sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'transparent', overflow: 'hidden' }}>
      <StudentSummaryStrip lead={lead} interactions={interactions} callStatus={callStatus} />

      <AppTabs
        tabs={TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Counselor student profile sections"
        sx={{ flexShrink: 0, px: 1.5, borderBottom: 1, borderColor: 'divider', minHeight: 0, '& .MuiTab-root': { minHeight: 36, py: 0, fontSize: 11.5, transition: 'color 150ms ease, background-color 150ms ease', '&:hover': { color: 'text.primary', bgcolor: 'action.hover' } } }}
        TabIndicatorProps={{ sx: { height: 3 } }}
      />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.25, py: 1.25 }}>
        {renderTab()}
      </Box>

      <Box component="footer" sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.25, px: 2.25, py: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography component="span" sx={{ mr: 'auto', fontSize: 12, color: 'text.disabled' }}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </Typography>
        <PrimaryButton size="small" startIcon={<SaveIcon sx={{ fontSize: 13 }} />} onClick={handleSave} disabled={saving || !dirty} loading={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </PrimaryButton>
      </Box>
    </Box>
  );
}
