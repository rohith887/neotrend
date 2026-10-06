import AppCard from '../ui/mui/AppCard.jsx';
import DispositionForm from './DispositionForm.jsx';
import RemarkHistory from './RemarkHistory.jsx';

/* ==========================================================================
   DISPOSITION PANEL — LEFT 35% workspace.
   A Disposition & Notes workspace:
     DISPOSITION     → Disposition select + Priority (etc.) via DispositionForm
     REMARKS / CALL NOTES → notes text area (inside DispositionForm)
     REMARK HISTORY  → compact chronological list of past remarks
   Discard / Submit Disposition live at the bottom-right of the Student
   (right) panel, not here.
   Presentation only — all behaviour reuses the existing disposition form.
   ========================================================================== */

export default function DispositionPanel({
  profileForm,
  profileDirty,
  onSaveProfile,
  onDispositionChange,
  dispoFormRef,
  onDispoStateChange,
  interactions = [],
}) {
  return (
    <AppCard
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'none', borderRadius: 0, overflow: 'hidden' }}
      contentSx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}
    >
      <DispositionForm
        ref={dispoFormRef}
        profileForm={profileForm}
        profileDirty={profileDirty}
        onSaveProfile={onSaveProfile}
        onDispositionChange={onDispositionChange}
        onFormStateChange={onDispoStateChange}
      >
        <RemarkHistory interactions={interactions} fill />
      </DispositionForm>
    </AppCard>
  );
}
